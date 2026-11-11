'use strict';
/* G3-61: mobile calendar day navigation and refresh readability.
 * Chromium/Linux WebKit tests do not replace physical iPhone Safari QA.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let file;try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function verify(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/calendar-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#calGrid .cal-day').first().waitFor({state:'visible'});
  const initialDate=await page.evaluate(()=>calendarSelectedDate);
  await page.locator('#calGrid .cal-day[aria-label^="'+initialDate+' 예약 "]').click();
  await page.locator('#calDetails').waitFor({state:'visible'});
  const original=await page.evaluate(()=>JSON.stringify(adminRequests));
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  const initialHeading=await page.locator('#calSelectedTitle').innerText();

  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const data=await page.evaluate(()=>{
    const root=document.querySelector('#calendarDemo');
    const tools=root.querySelector('.cal-day-tools');
    const back=root.querySelector('#calBackMonth');
    const buttons=['calDayPrev','calDayNext','calDayRefresh'].map(id=>root.querySelector('#'+id));
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const size=e=>parseFloat(getComputedStyle(e).fontSize);
    return{
      pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      tools:rect(tools),display:getComputedStyle(tools).display,
      back:rect(back),backFont:size(back),
      buttons:buttons.map(rect),fonts:buttons.map(size),texts:buttons.map(e=>e.innerText),
      active:buttons.map(e=>e.disabled),selectedTitle:root.querySelector('#calSelectedTitle').textContent
    };
   });
   assert.ok(data.pageOverflow<=2,label+' '+width+'px document horizontal overflow: '+data.pageOverflow);
   assert.deepEqual(data.texts,['‹ 전날','다음날 ›','↻ 새로고침'],label+' day controls unchanged');
   assert.ok(data.active.every(x=>x===false),label+' day controls enabled');
   assert.equal(data.selectedTitle,initialHeading,label+' date unchanged by viewport resize');
   if(width<=440){
    assert.equal(data.display,'grid',label+' '+width+'px original three-column day controls');
    assert.ok(data.buttons.every(b=>b.height>=48),label+' '+width+'px 48px touch controls');
    assert.ok(data.fonts.every(n=>n>=13),label+' '+width+'px 13px readable day labels');
    assert.ok(data.back.height>=44&&data.backFont>=13,label+' '+width+'px readable back-to-month control');
    assert.ok(data.buttons.every(b=>Math.abs(b.top-data.buttons[0].top)<2),label+' '+width+'px one-row navigation');
    assert.ok(data.buttons.every(b=>b.left>=data.tools.left-2&&b.right<=data.tools.right+2),label+' '+width+'px bounded controls');
   }else{
    assert.equal(data.display,'flex',label+' '+width+'px original tablet/desktop flex controls');
    assert.ok(data.back.height>0,label+' back-to-month retained');
   }
   console.log('PASS G3-61 '+label+' '+width+'px day navigation targets, labels, layout and no overflow');
  }
  await page.setViewportSize({width:390,height:844});
  const nextExpected=await page.evaluate(()=>{
    const d=dateFromLocalString(calendarSelectedDate);
    d.setDate(d.getDate()+1);
    return localDateString(d);
  });
  await page.locator('#calDayNext').click();
  assert.equal(await page.evaluate(()=>calendarSelectedDate),nextExpected,label+' next day increments date');
  await page.locator('#calDayPrev').click();
  assert.equal(await page.evaluate(()=>calendarSelectedDate),initialDate,label+' previous day restores date');
  assert.equal(await page.locator('#calSelectedTitle').innerText(),initialHeading,label+' original day title restored');
  await page.locator('#calDayRefresh').click();
  assert.match(await page.locator('#calDayRefresh').innerText(),/갱신됨/,label+' refresh feedback');
  assert.match(await page.locator('#calRefreshStatus').innerText(),/가상 예약 일정을 새로고침/,label+' refresh status announcement');
  assert.equal(await page.evaluate(()=>calendarSelectedDate),initialDate,label+' refresh retains day');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),original,label+' navigation does not modify demo bookings');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),storage,label+' navigation never writes demo storage');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const report=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(report.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG 2.1 AA violations');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-61-calendar-day-controls-'+label.toLowerCase()+'-390.png',fullPage:true});
  await page.locator('#calBackMonth').click();
  assert.equal(await page.locator('#calDetails').isVisible(),false,label+' back-to-month navigation');
  assert.equal(await page.locator('#calGrid').isVisible(),true,label+' month grid visible');
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=61,label+' G3-61 or later footer');
  assert.deepEqual(errors,[],label+' no runtime JS errors');
  console.log('PASS G3-61 '+label+' day navigation, refresh, back, axe and synthetic data');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);
  console.log('PASS G3-61 Chromium/WebKit/axe; physical iPhone Safari and Instagram WebView unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-61 '+(e.stack||e));server.close();process.exitCode=1;});
