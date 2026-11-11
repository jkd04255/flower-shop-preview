'use strict';
/* G3-64: current booking stage visual hierarchy (synthetic-only).
 * Chromium/Linux WebKit do not replace physical iOS Safari/Instagram QA. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let file;
 try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function check(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/booking-status',{waitUntil:'domcontentloaded'});
  await page.locator('#csLast4').waitFor({state:'visible'});
  const initial=await page.evaluate(()=>({bookings:JSON.stringify(adminRequests),storage:JSON.stringify(localStorage)}));
  const labels=['요청 접수','송금 표시','예약 확정','수령 완료'];
  async function lookup(code){
   await page.locator('#csLast4').fill(code);
   await page.locator('#csSubmit').click();
   await page.locator('#csResults .cs-card').first().waitFor({state:'visible'});
  }
  for(const entry of [{code:'1001',stage:2,level:'reported'},{code:'1002',stage:1,level:'pending'},{code:'1003',stage:3,level:'complete'},{code:'1004',stage:1,level:'rejected'}]){
   await lookup(entry.code);
   const data=await page.evaluate(()=>{
    const steps=[...document.querySelectorAll('#csResults .cs-card:first-child .cs-steps li')];
    const now=steps.findIndex(el=>el.getAttribute('aria-current')==='step');
    return {labels:steps.map(el=>el.innerText),done:steps.filter(el=>el.classList.contains('is-done')).length,
      current:now+1,markerCount:steps.filter(el=>el.getAttribute('aria-current')==='step').length,
      results:document.querySelectorAll('#csResults .cs-card').length,
      status:document.querySelector('#csResults .cs-badge')?.textContent};
   });
   assert.deepEqual(data.labels,labels,label+' original four stage labels for '+entry.code);
   assert.equal(data.done,entry.stage,label+' existing stage calculation unchanged for '+entry.code);
   assert.equal(data.current,entry.stage,label+' aria-current still derived from booking state for '+entry.code);
   assert.equal(data.markerCount,1,label+' single current step for '+entry.code);
   assert.equal(data.results,1,label+' one sample booking for '+entry.code);
   assert.ok(data.status,label+' unchanged result status badge for '+entry.code);
   if(entry.code==='1002') {
    for(const width of [320,390,440,600,768,1280]){
     await page.setViewportSize({width,height:900});
     const m=await page.evaluate(()=>{
      const group=document.querySelector('#csResults .cs-steps'),steps=[...group.querySelectorAll('li')];
      const active=steps.find(el=>el.getAttribute('aria-current')==='step');
      const box=el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}};
      const css=el=>getComputedStyle(el);
      return {documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        group:box(group),current:box(active),labels:steps.map(el=>el.textContent),
        cols:css(group).gridTemplateColumns.split(' ').length,
        background:css(active).backgroundColor,color:css(active).color,
        border:parseFloat(css(active).borderTopWidth),font:parseFloat(css(active).fontSize),
        inactiveBorders:steps.filter(x=>x!==active).map(x=>parseFloat(css(x).borderTopWidth)),
        markerCount:steps.filter(el=>el.getAttribute('aria-current')==='step').length};
     });
     assert.ok(m.documentOverflow<=2,label+' '+width+'px no horizontal document overflow '+m.documentOverflow);
     assert.deepEqual(m.labels,labels,label+' '+width+'px original progress content retained');
     assert.equal(m.markerCount,1,label+' '+width+'px unique active progress stage');
     assert.ok(m.current.left>=m.group.left-2&&m.current.right<=m.group.right+2,label+' '+width+'px active step fits progress grid');
     if(width<=600){
      assert.equal(m.cols,2,label+' '+width+'px existing two-column mobile progress layout');
      assert.equal(m.background,'rgb(234, 241, 232)',label+' '+width+'px current step subtle highlight');
      assert.ok(m.font>=13,label+' '+width+'px current step legible typography');
      assert.ok(m.border>=4,label+' '+width+'px distinct active progress rule');
      assert.ok(m.inactiveBorders.every(n=>n===3),label+' '+width+'px original prior and future stage markers');
     }else{
      assert.equal(m.cols,4,label+' '+width+'px original four-column desktop progress layout');
      assert.notEqual(m.background,'rgb(234, 241, 232)',label+' '+width+'px desktop appearance unchanged');
     }
     console.log('PASS G3-64 '+label+' '+width+'px booking status step, mobile emphasis, reflow');
    }
    await page.setViewportSize({width:390,height:844});
   }
   assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initial.bookings,label+' browsing never modifies synthetic bookings');
   assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initial.storage,label+' sample status lookup does not write localStorage');
   console.log('PASS G3-64 '+label+' sample '+entry.code+' stage '+entry.stage+' and original booking data');
  }
  await page.setViewportSize({width:390,height:844});
  const stepBefore=await page.locator('#csResults .cs-steps [aria-current="step"]').innerText();
  await page.locator('#csRefreshStatus').click();
  assert.equal(await page.locator('#csResults .cs-steps [aria-current="step"]').innerText(),stepBefore,label+' local refresh preserves current stage');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initial.bookings,label+' refresh uses same synthetic records');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG 2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-64-booking-current-step-'+label.toLowerCase()+'-390.png',fullPage:true});
  await page.locator('#csLookupAgain').click();
  assert.equal(await page.locator('#csResults .cs-card').count(),0,label+' reset still clears visible results');
  assert.equal(await page.locator('#csLast4').inputValue(),'',label+' sample code cleared');
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=64,label+' correct demo footer');
  assert.deepEqual(errors,[],label+' no JS errors');
  console.log('PASS G3-64 '+label+' stage status, refresh/reset, axe and no persisted private data');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-64 Chromium/WebKit/axe; actual iPhone Safari and Instagram remain unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-64 '+(e.stack||e));server.close();process.exitCode=1;});
