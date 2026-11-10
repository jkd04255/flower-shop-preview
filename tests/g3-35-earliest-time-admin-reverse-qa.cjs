'use strict';
/** G3-35 Chromium + Linux WebKit opt-in pickup-hour and admin reverse-sort QA.
 * Static synthetic bookings only. Linux WebKit is not a physical iPhone WebView.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let full;
 try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);full=path.resolve(root,'.'+(p==='/'?'/index.html':p))}
 catch{res.writeHead(400);res.end();return}
 if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(full,(e,b)=>{if(e){res.writeHead(404);res.end();return}
  res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream'});res.end(b)});
});
async function sampleSlots(page){
 return page.evaluate(()=>{
  const bounds=pickupBounds(),today=dateFromLocalString(bounds.min),result=[];
  for(let day=today;localDateString(day)<=bounds.max;day.setDate(day.getDate()+1)){
   const date=localDateString(day),times=pickupSlots(0,date);
   if(times.length)result.push({date,times});
   if(result.length===2)break;
  }
  return result;
 });
}
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const audit=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],where+' axe WCAG A/AA');
}
async function check(engine,label,base){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const slots=await sampleSlots(page);
  assert.equal(slots.length,2,'two distinct valid dates');
  const initialCount=await page.evaluate(()=>adminRequests.length);
  assert.equal(await page.locator('#rTime').isDisabled(),true);
  await page.locator('#rDate').fill(slots[0].date);
  assert.equal(await page.locator('#rTime').inputValue(),'');
  await page.locator('#rTime').selectOption(slots[0].times[0]);
  assert.ok((await page.locator('#rPickupPreview').innerText()).includes(slots[0].date+' '+slots[0].times[0]));
  await page.locator('#rDate').fill(slots[1].date);
  assert.equal(await page.locator('#rTime').inputValue(),'','changing date resets time');
  await page.locator('#rTime').selectOption(slots[1].times[0]);
  assert.ok((await page.locator('#rPickupPreview').innerText()).includes(slots[1].date+' '+slots[1].times[0]));
  await page.locator('#rTime').selectOption('');
  assert.equal(await page.locator('#rTime').inputValue(),'','manually clearing hour is possible');
  await page.locator('#rDate').fill('');
  assert.equal(await page.locator('#rTime').isDisabled(),true);
  assert.equal(await page.evaluate(()=>adminRequests.length),initialCount);
  await axePass(page,label+' direct booking form');
  await page.locator('#rDate').fill(slots[0].date);
  await page.locator('#rTime').selectOption(slots[0].times[0]);
  console.log('PASS G3-35 '+label+' direct hour choice, date reset, preview, axe zero');

  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  await page.locator('#rMemo').fill('가상 리본');
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),initialCount);
  assert.equal(await page.locator('#rReviewTime').textContent(),slots[0].times[0]);
  assert.equal(await page.locator('#rReviewMemo').textContent(),'가상 리본');
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),initialCount+1);
  assert.equal(await page.locator('#rMemoCount').textContent(),'0 / 120자 · 가상 시연용');
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!storage.includes('01000000000')&&!storage.includes('가상 리본'));
  console.log('PASS G3-35 '+label+' unchanged final-review gate, one synthetic request, no personal-data persistence');

  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#adminList .admin-request[data-request-id="DEMO-005"]').waitFor({state:'visible'});
  const before=await page.evaluate(()=>JSON.stringify(adminRequests));
  const ids=await page.locator('#adminList .admin-request').evaluateAll(els=>els.map(e=>e.dataset.requestId));
  assert.deepEqual(ids,await page.evaluate(()=>adminRequests.map(x=>x.id)));
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'request');
  await page.locator('#adminList .admin-request[data-request-id="DEMO-002"]').tap();
  await page.locator('#adminSortOrder').selectOption('pickup-desc');
  let displayed=await page.locator('#adminList .admin-request').evaluateAll(els=>els.map(e=>e.dataset.requestId));
  let expected=await page.evaluate(()=>[...adminRequests].sort((a,b)=>-(a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id))).map(x=>x.id));
  assert.deepEqual(displayed,expected,'reverse sort must compare date, time and ID');
  assert.equal(await page.locator('#adminList .admin-request[data-request-id="DEMO-002"]').getAttribute('aria-current'),'true','selected request preserved');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),before,'no mutation from view sort');
  console.log('PASS G3-35 '+label+' descending pickup date/time/id order with selection and source data unchanged');

  await page.locator('.admin-filter[data-filter="pending"]').tap();
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'pickup-desc');
  displayed=await page.locator('#adminList .admin-request').evaluateAll(els=>els.map(e=>e.dataset.requestId));
  expected=await page.evaluate(()=>adminRequests.filter(x=>x.status==='pending').sort((a,b)=>-(a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id))).map(x=>x.id));
  assert.deepEqual(displayed,expected);
  assert.equal(await page.locator('#adminFilterSummary').innerText(),'입금 전 · 3건 표시 / 전체 5건 · 가상 데이터');
  await page.locator('#adminShowAll').tap();
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'pickup-desc');
  assert.equal(await page.locator('#adminList .admin-request').count(),5);
  await page.locator('#adminSortOrder').selectOption('pickup');
  displayed=await page.locator('#adminList .admin-request').evaluateAll(els=>els.map(e=>e.dataset.requestId));
  expected=await page.evaluate(()=>[...adminRequests].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id)).map(x=>x.id));
  assert.deepEqual(displayed,expected,'G3-34 ascending mode preserved');
  await page.locator('#adminSortOrder').selectOption('request');
  displayed=await page.locator('#adminList .admin-request').evaluateAll(els=>els.map(e=>e.dataset.requestId));
  assert.deepEqual(displayed,ids,'original request order preserved');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),before);
  await axePass(page,label+' admin');
  console.log('PASS G3-35 '+label+' descending filter/show-all, ascending and original modes preserve state; axe zero');

  await page.locator('#adminReset').tap();
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'request');
  assert.equal(await page.locator('#adminList .admin-request').count(),4);
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,JSON.stringify({width,overflow}));
  }
  assert.deepEqual(errors,[]);
  const footer=await page.locator('footer').innerText();
  const version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=35,'G3-35 or newer static demo footer required: '+footer);
  console.log('PASS G3-35 '+label+' reset, 320/390px responsive flow, no browser errors');
  await context.close();
 }finally{await browser.close()}
}
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{
  await check(chromium,'Chromium',url);
  await check(webkit,'WebKit',url);
  console.log('G3-35 Chromium/WebKit 12 groups PASS; physical iPhone Instagram still unverified');
 }finally{server.close()}
}
run().catch(e=>{console.error('FAIL G3-35 '+(e.stack||e));server.close();process.exitCode=1});
