'use strict';
/* G3-24 browser-only final-review gate. No actual reservation, payment, or real customer data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=process.cwd(),checks=[];
function check(name){checks.push(name);console.log('PASS G3-24 '+name)}
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let file;try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);file=path.resolve(root,'.'+(p==='/'?'/index.html':p))}catch{res.writeHead(400);res.end();return}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(buf)});
});
async function stored(page){
 return page.evaluate(()=>{
  const raw=localStorage.getItem('afternoon-garden-calendar-demo-v1');
  /* G3 baseline seeds four synthetic requests in memory, not storage, until a change. */
  return raw?JSON.parse(raw).records:adminRequests.map(x=>({...x}));
 });
}
async function validDate(page){
 return page.evaluate(()=>{
  const now=new Date();now.setHours(12,0,0,0);
  for(let i=3;i<14;i++){
   const d=new Date(now);d.setDate(d.getDate()+i);
   const date=localDateString(d),slots=pickupSlots(0,date);
   if(slots.length)return {date,time:slots[0]};
  }
  return null;
 });
}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port+'/';
  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const {date,time}=await validDate(page)||{};
  assert.ok(date&&time,'need a future pickup slot');
  await page.locator('#rDate').fill(date);
  await page.locator('#rTime').selectOption(time);
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  const baseline=(await stored(page)).length;
  const storageBeforeReview=await page.evaluate(()=>localStorage.getItem('afternoon-garden-calendar-demo-v1'));
  assert.equal(baseline,4);
  await page.locator('#reserveForm button[type=submit]').click();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#reserveForm').isVisible(),false);
  assert.equal(await page.locator('#reserveResult').isVisible(),false);
  assert.equal((await stored(page)).length,baseline);
  assert.equal(await page.evaluate(()=>localStorage.getItem('afternoon-garden-calendar-demo-v1')),storageBeforeReview);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'rReviewTitle');
  check('review is mandatory; no synthetic booking written on first submit; heading focused');
  assert.equal(await page.locator('#rReviewProduct').innerText(),'로지 모먼트');
  assert.equal(await page.locator('#rReviewDate').innerText(),date);
  assert.equal(await page.locator('#rReviewTime').innerText(),time);
  assert.equal(await page.locator('#rReviewName').innerText(),'가상 고객');
  assert.equal(await page.locator('#rReviewPhone').innerText(),'01000000000');
  check('review displays correct flower, pickup date/time, name and example phone');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'rReviewEdit');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'rReviewConfirm');
  check('review edit and final confirm reachable by Tab after review heading');
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const pageOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(pageOverflow<=2,'review horizontal overflow '+width+': '+pageOverflow);
   assert.ok(await page.locator('#rReviewConfirm').isVisible());
   check('review at '+width+'px responsive with both controls visible and no sideways scroll');
  }
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const axe=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},rules:{'color-contrast':{enabled:true}},resultTypes:['violations']}));
  assert.equal(axe.violations.length,0,JSON.stringify(axe.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)}))));
  check('review 390px axe-core WCAG A/AA auto scan: 0 violations');
  await page.locator('#rReviewEdit').click();
  assert.equal(await page.locator('#reserveForm').isVisible(),true);
  assert.equal(await page.locator('#reserveReview').isVisible(),false);
  assert.equal(await page.locator('#rName').inputValue(),'가상 고객');
  assert.equal(await page.locator('#rTime').inputValue(),time);
  assert.equal((await stored(page)).length,baseline);
  check('edit restores full form and values without creating booking');
  await page.locator('#rPhone').fill('010-0000-0000');
  await page.locator('#reserveForm button[type=submit]').click();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#rReviewPhone').innerText(),'01000000000');
  assert.equal((await stored(page)).length,baseline);
  check('editing phone requires another explicit review and normalizes hyphens');
  // Test an unexpected hidden input mutation. Must safely return to form, not save anything.
  await page.evaluate(()=>{document.getElementById('rTime').value='';});
  await page.locator('#rReviewConfirm').click();
  assert.equal(await page.locator('#reserveForm').isVisible(),true);
  assert.equal(await page.locator('#reserveReview').isVisible(),false);
  assert.equal((await stored(page)).length,baseline);
  assert.match(await page.locator('#rError').innerText(),/변경/);
  check('changed hidden input invalidates prior review without a booking');
  await page.locator('#rTime').selectOption(time);
  await page.locator('#reserveForm button[type=submit]').click();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal((await stored(page)).length,baseline);
  await page.locator('#rReviewConfirm').click();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  const final=await stored(page);
  assert.equal(final.length,baseline+1);
  assert.equal(final[0].date,date);
  assert.equal(final[0].time,time);
  assert.equal(final[0].productIndex,0);
  assert.equal(final[0].status,'pending');
  assert.equal(final[0].paymentState,'waiting');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'reserveResultTitle');
  check('final explicit confirmation creates exactly one pending synthetic request and focuses result');
  const raw=await page.evaluate(()=>localStorage.getItem('afternoon-garden-calendar-demo-v1'));
  assert.ok(!raw.includes('01000000000')&&!raw.includes('가상 고객'));
  assert.equal(await page.locator('#rPhone').inputValue(),'');
  assert.equal(await page.locator('#rName').inputValue(),'');
  assert.equal(await page.locator('#rReviewName').innerText(),'');
  assert.equal(await page.locator('#rReviewPhone').innerText(),'');
  check('no contact in localStorage and form/review details cleared after final confirmation');
  await page.evaluate(()=>document.getElementById('rReviewConfirm').click());
  assert.equal((await stored(page)).length,baseline+1);
  check('double confirmation ignored after review closes');
  await page.locator('#rMarkPaid').click();
  const afterPaid=await stored(page);
  assert.equal(afterPaid[0].paymentState,'reported');
  check('existing fake payment status preserved after review gate');
  await page.evaluate(()=>{location.hash='#/admin-demo'});
  await page.locator('#adminList .admin-request').first().waitFor();
  assert.ok((await page.locator('#adminList .admin-request').count())>=5);
  await page.evaluate(()=>{location.hash='#/calendar-demo'});
  await page.locator('#calMonthView').waitFor({state:'visible'});
  check('existing manager and calendar flows still reachable');
  await page.evaluate(()=>{location.hash='#/reserve/rosy-moment'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.equal(await page.locator('#reserveReview').isVisible(),false);
  assert.equal(await page.locator('#rReviewName').innerText(),'');
  check('re-entering reservation starts with review closed and no stale contact');
  assert.deepEqual(errors,[],'unexpected browser JS errors');
  await ctx.close();
  console.log('G3-24 REAL CHROMIUM REVIEW QA PASS: '+checks.length+' checks');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(e=>{console.error('FAIL '+(e.stack||e));server.close();process.exitCode=1});
