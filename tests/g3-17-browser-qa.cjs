'use strict';
/**
 * G3-17 real Chromium keyboard, status filters, and reset/cross-tab accessibility QA.
 * Run against the checked-out static app only. No production or live Pages writes.
 * CHROME_BIN=/usr/bin/google-chrome node tests/g3-17-browser-qa.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let p;try{p=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end();return}
 const filename=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(filename,(e,bytes)=>{if(e){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(bytes)});
});
const passes=[];
function pass(msg){passes.push(msg);console.log('PASS '+msg)}
async function active(page){return page.evaluate(()=>({
 id:document.activeElement?.id,
 tag:document.activeElement?.tagName,
 request:document.activeElement?.dataset?.requestId,
 filter:document.activeElement?.dataset?.filter,
 calStatus:document.activeElement?.dataset?.calStatus,
 connected:document.activeElement?.isConnected
}))}
const card=(page,id)=>page.locator('#adminList .admin-request[data-request-id="'+id+'"]');
const filter=(page,status)=>page.locator('#adminDemo .admin-filter[data-filter="'+status+'"]');
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  const A=await ctx.newPage(),B=await ctx.newPage();const errors=[];
  A.on('pageerror',x=>errors.push('A:'+x.message));
  B.on('pageerror',x=>errors.push('B:'+x.message));
  await A.goto(base,{waitUntil:'domcontentloaded'});
  await A.evaluate(()=>location.hash='#/admin-demo');
  await card(A,'DEMO-001').waitFor({state:'visible'});
  assert.equal((await active(A)).id,'adminHeading');
  await B.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await card(B,'DEMO-001').waitFor({state:'visible'});
  assert.equal(await filter(A,'all').getAttribute('aria-pressed'),'true');
  await filter(A,'pending').click();
  assert.equal(await filter(A,'pending').getAttribute('aria-pressed'),'true');
  assert.equal(await filter(A,'all').getAttribute('aria-pressed'),'false');
  assert.equal(await A.locator('#adminList .admin-request').count(),2);
  assert.match(await A.locator('#adminDetail').innerText(),/입금|가상/);
  pass('Chrome admin filter pending: two synthetic bookings; pressed state and detail announcement');
  await filter(A,'pending').focus();
  await A.keyboard.press('Shift+Tab');
  assert.equal((await active(A)).filter,'all');
  await A.keyboard.press('Tab');
  assert.equal((await active(A)).filter,'pending');
  pass('Chrome admin filter Shift+Tab / Tab returns to the same filter');
  await card(A,'DEMO-001').focus();
  assert.equal((await active(A)).request,'DEMO-001');
  await card(B,'DEMO-001').click();
  await B.locator('#adminDetail .admin-verify input[type="checkbox"]').check();
  await B.locator('#adminDetail .admin-action').filter({hasText:'입금 확인 · 예약 확정'}).click();
  await A.waitForFunction(()=>document.querySelectorAll('#adminList .admin-request').length===1,{timeout:6000});
  assert.equal((await active(A)).request,'DEMO-002');
  assert.equal((await active(A)).connected,true);
  pass('Chrome remote confirmation removes focused filtered booking and focuses surviving card');
  await card(A,'DEMO-002').focus();
  // Synthetic metadata only. This mirrors a second tab confirming the remaining
  // booking (it cannot be marked paid from the admin view before the guest report).
  await B.evaluate(()=>{
   const key='afternoon-garden-calendar-demo-v1';
   const item=JSON.parse(localStorage.getItem(key));
   const record=item.records.find(r=>r.id==='DEMO-002');
   record.status='confirmed';record.paymentState='verified';record.depositChecked=true;
   localStorage.setItem(key,JSON.stringify(item));
  });
  await A.waitForFunction(()=>document.querySelector('#adminList .admin-empty')!==null,{timeout:6000});
  assert.equal(await A.locator('#adminList .admin-request').count(),0);
  assert.equal(await filter(A,'pending').getAttribute('aria-pressed'),'true');
  assert.equal((await active(A)).filter,'pending','focus must be moved to the active filter when no filtered cards remain');
  assert.equal((await active(A)).connected,true);
  pass('Chrome remote removal of last filtered booking focuses active filter, announces empty list');
  // Local reset should recover all synthetic samples and reset ARIA filter state.
  await A.locator('#adminReset').click();
  assert.equal(await filter(A,'all').getAttribute('aria-pressed'),'true');
  assert.equal(await filter(A,'pending').getAttribute('aria-pressed'),'false');
  assert.equal(await A.locator('#adminList .admin-request').count(),4);
  assert.equal((await active(A)).id,'adminReset');
  pass('Chrome local demo reset: original list, filter reset, keyboard focus retained');
  // Use the actual calendar with one confirmed sample and pending sample on other days.
  const date=(await card(A,'DEMO-003').locator('.admin-request-meta').innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  assert.ok(date);
  await A.evaluate(()=>location.hash='#/calendar-demo');
  await A.locator('#calMonthView').waitFor({state:'visible'});
  const gridDay=A.locator('#calGrid .cal-day[aria-label^="'+date+' 예약 "]');
  for(let i=0;i<3&&await gridDay.count()===0;i++)await A.locator('#calNext').click();
  assert.equal(await gridDay.count(),1);
  await gridDay.click();
  assert.equal(await A.locator('#calDetails').getAttribute('aria-live'),'polite');
  assert.equal(await A.locator('#calEvents').getAttribute('role'),'region');
  assert.equal(await A.locator('#calEvents').getAttribute('aria-labelledby'),'calSelectedTitle');
  const all=A.locator('#calStatusFilters button[data-cal-status="all"]');
  const pending=A.locator('#calStatusFilters button[data-cal-status="pending"]');
  const confirmed=A.locator('#calStatusFilters button[data-cal-status="confirmed"]');
  await confirmed.click();
  assert.equal(await confirmed.getAttribute('aria-pressed'),'true');
  assert.equal(await all.getAttribute('aria-pressed'),'false');
  assert.match(await A.locator('#calSelectedCount').innerText(),/(?:1건 표시|1건의 예약 일정)/);
  pass('Chrome calendar confirmed filter: count, aria-pressed and labeled live region');
  await confirmed.focus();
  await A.keyboard.press('Shift+Tab');
  assert.equal((await active(A)).calStatus,'pending');
  await A.keyboard.press('Tab');
  assert.equal((await active(A)).calStatus,'confirmed');
  pass('Chrome calendar status filter backward/forward Tab order');
  const selected=A.locator('#calEvents .cal-timeline-item[data-request-id="DEMO-003"] summary');
  await selected.focus();
  await card(B,'DEMO-003').click();
  await B.locator('#adminDetail .admin-action').filter({hasText:'수령 전으로 변경'}).click();
  await A.waitForFunction(()=>document.querySelector('#calSelectedCount')?.textContent?.includes('0건 표시'),{timeout:6000});
  assert.equal((await active(A)).id,'calSelectedTitle');
  assert.equal((await active(A)).connected,true);
  assert.equal(await confirmed.getAttribute('aria-pressed'),'true');
  pass('Chrome calendar cross-tab status changes remove filtered item and focus the selected date heading');
  await all.click();
  assert.equal(await all.getAttribute('aria-pressed'),'true');
  assert.ok(await A.locator('#calEvents .cal-timeline-item[data-request-id="DEMO-003"]').count());
  await A.locator('#calBackMonth').click();
  assert.equal(await A.locator('#calDetails').isHidden(),true);
  assert.equal((await active(A)).tag,'BUTTON');
  pass('Chrome calendar back to month: focus stays on visible interactive date');
  assert.deepEqual(errors,[],'JavaScript exceptions during G3-17 interactions');
  pass('Chrome browser tabs have no application JavaScript exceptions');
  await ctx.close();
  console.log('G3-17 real Chromium keyboard/filter/reset QA PASS: '+passes.length+' checks');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(err=>{console.error('FAIL '+(err.stack||err));server.close();process.exitCode=1});
