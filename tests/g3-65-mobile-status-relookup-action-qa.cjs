'use strict';
/* G3-65: mobile customer status secondary relookup action; no actual booking or auth. */
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
async function check(engine,label,url){
 const options=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...options});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/booking-status',{waitUntil:'domcontentloaded'});
  await page.locator('#csLast4').waitFor({state:'visible'});
  const baseline=await page.evaluate(()=>({bookings:JSON.stringify(adminRequests),storage:JSON.stringify(localStorage)}));
  const again=page.locator('#csLookupAgain');
  assert.equal(await again.isVisible(),false,label+' lookup-again hidden before valid search');
  await page.locator('#csLast4').fill('1002');
  await page.locator('#csSubmit').click();
  await page.locator('#csResults .cs-card').first().waitFor({state:'visible'});
  assert.equal(await again.isVisible(),true,label+' lookup-again shown after finding synthetic booking');
  assert.equal(await again.innerText(),'다른 예약 조회 ↗',label+' exact approved secondary label');
  const cardTitle=await page.locator('#csResults .cs-card-heading h2').first().innerText();
  const bookingCount=await page.locator('#csResults .cs-card').count();
  assert.equal(bookingCount,1,label+' one expected synthetic booking');
  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const m=await page.evaluate(()=>{
    const action=document.querySelector('#csLookupAgain'),rect=action.getBoundingClientRect(),
      wrap=document.querySelector('#customerStatus .cs-wrap').getBoundingClientRect(),s=getComputedStyle(action);
    return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      rect:{left:rect.left,right:rect.right,width:rect.width,height:rect.height,top:rect.top},
      wrap:{left:wrap.left,right:wrap.right},display:s.display,minHeight:parseFloat(s.minHeight),
      font:parseFloat(s.fontSize),whiteSpace:s.whiteSpace,background:s.backgroundColor,
      borderBottom:s.borderBottomWidth,text:action.innerText,hidden:action.hidden};
   });
   assert.ok(m.overflow<=2,label+' '+width+'px no whole-page horizontal overflow '+m.overflow);
   assert.equal(m.text,'다른 예약 조회 ↗',label+' '+width+'px unchanged button label');
   assert.equal(m.hidden,false,label+' '+width+'px button remains shown');
   assert.ok(m.rect.left>=m.wrap.left-2&&m.rect.right<=m.wrap.right+2,label+' '+width+'px button fits narrow content width');
   if(width<=600){
    assert.equal(m.display,'inline-flex',label+' '+width+'px inline secondary action');
    assert.ok(m.rect.height>=48&&m.minHeight>=48,label+' '+width+'px 48px touch target');
    assert.ok(m.font>=14,label+' '+width+'px legible 14px secondary label');
    assert.equal(m.whiteSpace,'normal',label+' '+width+'px text zoom can wrap');
    assert.equal(m.background,'rgba(0, 0, 0, 0)',label+' '+width+'px no extra heavy button surface');
   }else{
    assert.equal(m.display,'inline-block',label+' '+width+'px approved desktop inline link');
    assert.equal(m.font,13,label+' '+width+'px original desktop font preserved');
   }
   console.log('PASS G3-65 '+label+' '+width+'px relookup visibility, target and reflow');
  }
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' axe WCAG2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-65-relookup-action-'+label.toLowerCase()+'-390.png',fullPage:true});

  await again.click();
  assert.equal(await again.isVisible(),false,label+' lookup-again hidden after reset');
  assert.equal(await page.locator('#csResults .cs-card').count(),0,label+' status result cleared');
  assert.equal(await page.locator('#csLast4').inputValue(),'',label+' sample code input reset');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'csLast4',label+' existing keyboard focus restoration retained');
  await page.locator('#csLast4').fill('1003');
  await page.locator('#csSubmit').click();
  await page.locator('#csResults .cs-card').first().waitFor({state:'visible'});
  assert.equal(await again.isVisible(),true,label+' subsequent sample lookup works');
  assert.notEqual(await page.locator('#csResults .cs-card-heading h2').first().innerText(),cardTitle,label+' another sample booking shown');
  await page.locator('#csRefreshStatus').click();
  assert.equal(await again.isVisible(),true,label+' local refresh keeps switch-lookup affordance');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),baseline.bookings,label+' sample records unchanged by both lookups and refresh');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),baseline.storage,label+' no stored record or PII writes');
  await again.click();
  await page.locator('#csLast4').fill('9999');
  await page.locator('#csSubmit').click();
  assert.equal(await page.locator('#csResults .cs-card').count(),0,label+' unknown sample has no details');
  assert.equal(await again.isVisible(),false,label+' relookup button hidden on no match');
  const footer=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(footer&&Number(footer[1])>=65,label+' version footer');
  assert.deepEqual(errors,[],label+' no browser JS errors');
  console.log('PASS G3-65 '+label+' multiple synthetic lookups, clear/refocus, refresh, axe, no storage writes');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-65 Chromium/WebKit/axe; physical iPhone Safari and Instagram WebView remain unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-65 '+(e.stack||e));server.close();process.exitCode=1;});
