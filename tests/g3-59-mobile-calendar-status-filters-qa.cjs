'use strict';
/* G3-59: five calendar-day status filters in a native one-line scroll rail.
 * Chromium + Linux WebKit are automated browsers, not physical iOS Safari.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript'};
const server=http.createServer((req,res)=>{
 let file;try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function check(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/calendar-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#calGrid .cal-day').first().waitFor({state:'visible'});
  const pickDate=await page.evaluate(()=>calendarSelectedDate);
  await page.locator('#calGrid .cal-day[aria-label^="'+pickDate+' 예약 "]').click();
  await page.locator('#calDetails').waitFor({state:'visible'});
  const filters=page.locator('#calStatusFilters button');
  const originalRecords=await page.evaluate(()=>JSON.stringify(adminRequests));
  const originalStorage=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.deepEqual(await filters.evaluateAll(nodes=>nodes.map(el=>el.dataset.calStatus)),['all','pending','confirmed','ready','completed'],label+' original five statuses retained');
  assert.equal(await filters.count(),5);
  assert.equal(await page.locator('#calStatusFilters [aria-pressed="true"]').count(),1);
  const heading=await page.locator('#calSelectedTitle').innerText(),count=await page.locator('#calSelectedCount').innerText();
  assert.match(count,/건/,'selected day count present');

  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const m=await page.evaluate(()=>{
    const rail=document.querySelector('#calStatusFilters'),buttons=[...rail.querySelectorAll('button')],s=getComputedStyle(rail);
    const box=el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,height:r.height,width:r.width}};
    return{pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      rail:box(rail),width:rail.clientWidth,scrollWidth:rail.scrollWidth,wrap:s.flexWrap,overflowX:s.overflowX,
      buttons:buttons.map(box),fontSizes:buttons.map(b=>parseFloat(getComputedStyle(b).fontSize)),
      pressed:buttons.filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.calStatus),
      labels:buttons.map(b=>b.innerText),count:buttons.length};
   });
   assert.ok(m.pageOverflow<=2,label+' '+width+'px page overflow '+m.pageOverflow);
   assert.equal(m.count,5,label+' '+width+'px all filters present');
   assert.deepEqual(m.pressed,['all'],label+' '+width+'px initial pressed status');
   assert.ok(m.labels.every(t=>/\d+/.test(t)),label+' '+width+'px live counts preserved');
   if(width<=600){
    assert.equal(m.wrap,'nowrap',label+' '+width+'px calendar rail single line');
    assert.equal(m.overflowX,'auto',label+' '+width+'px calendar filter scroll native');
    assert.ok(m.buttons.every(b=>b.height>=44),label+' '+width+'px 44px touch targets');
    assert.ok(m.fontSizes.every(f=>f>=12),label+' '+width+'px legible chips');
    assert.ok(m.buttons.every(b=>Math.abs(b.top-m.buttons[0].top)<2),label+' '+width+'px shared row');
    assert.ok(m.rail.left>=-2&&m.rail.right<=width+2,label+' '+width+'px rail within screen');
    if(width<=390)assert.ok(m.scrollWidth>m.width+10,label+' '+width+'px true scrollable rail');
   }else{
    assert.equal(m.wrap,'wrap',label+' '+width+'px desktop wraps as before');
    assert.equal(m.overflowX,'visible',label+' '+width+'px desktop unchanged overflow');
   }
   console.log('PASS G3-59 '+label+' '+width+'px calendar filter layout, counts, and no page overflow');
  }
  await page.setViewportSize({width:320,height:900});
  const last=page.locator('#calStatusFilters button[data-cal-status="completed"]');
  await last.click();
  assert.equal(await last.getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>calendarStatusFilter),'completed');
  const scroll=await page.locator('#calStatusFilters').evaluate(el=>el.scrollLeft);
  assert.ok(scroll>0,label+' last filter was reachable by native horizontal scroll');
  assert.equal(await page.locator('#calStatusFilters [aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('#calSelectedTitle').innerText(),heading,label+' selected date unchanged');
  await page.locator('#calStatusFilters button[data-cal-status="all"]').click();
  assert.equal(await page.evaluate(()=>calendarStatusFilter),'all');
  assert.equal(await page.locator('#calSelectedCount').innerText(),count,label+' daily counts remain stable after filtering');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),originalRecords,label+' filtering never mutates requests');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),originalStorage,label+' filtering never writes local storage');
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG2.1 AA zero violations');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-59-calendar-status-'+label.toLowerCase()+'-390.png',fullPage:true});
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=59,label+' G3-59 or later static-demo version');
  assert.deepEqual(errors,[],label+' no runtime JS errors');
  console.log('PASS G3-59 '+label+' calendar state changes, keyboard-safe DOM, axe and synthetic persistence');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-59 Chromium/WebKit/axe, physical iPhone Safari and Instagram remain unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-59 '+(e.stack||e));server.close();process.exitCode=1;});
