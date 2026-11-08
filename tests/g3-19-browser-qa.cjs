'use strict';
/**
 * G3-19 real Chromium mobile/empty calendar and prior accessibility regression.
 * Run against the checked-out static app only. No production or live Pages writes.
 * CHROME_BIN=/usr/bin/google-chrome node tests/g3-19-browser-qa.cjs
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

  // G3-18: the visible button text alone does not provide an independent
  // announced status of successful synthetic-calendar refresh.
  await A.locator('#calRefresh').focus();
  await A.locator('#calRefresh').click();
  assert.equal(await A.locator('#calRefreshStatus').getAttribute('role'),'status');
  assert.equal(await A.locator('#calRefreshStatus').getAttribute('aria-live'),'polite');
  assert.match(await A.locator('#calRefreshStatus').innerText(),/갱신|새로고침/);
  assert.equal((await active(A)).id,'calRefresh');
  pass('Chrome monthly refresh announces completion and keeps button focused');
  await A.locator('#calGrid .cal-day[aria-label^="'+date+' 예약 "]').click();
  await A.locator('#calDayRefresh').focus();
  await A.locator('#calDayRefresh').click();
  assert.equal(await A.locator('#calRefreshStatus').getAttribute('role'),'status');
  assert.match(await A.locator('#calRefreshStatus').innerText(),/갱신|새로고침/);
  assert.equal((await active(A)).id,'calDayRefresh');
  await A.keyboard.press('Shift+Tab');
  assert.equal((await active(A)).id,'calDayNext');
  await A.keyboard.press('Tab');
  assert.equal((await active(A)).id,'calDayRefresh');
  pass('Chrome daily refresh live announcement, Shift+Tab and Tab keyboard order');
  await A.evaluate(()=>location.hash='#/admin-demo');
  await A.locator('#adminReset').focus();
  await A.locator('#adminReset').click();
  assert.equal(await A.locator('#adminOperationStatus').getAttribute('role'),'status');
  assert.equal(await A.locator('#adminOperationStatus').getAttribute('aria-live'),'polite');
  assert.match(await A.locator('#adminOperationStatus').innerText(),/초기화|복원/);
  assert.equal((await active(A)).id,'adminReset');
  assert.equal(await A.locator('#adminList .admin-request').count(),4);
  pass('Chrome reset announces restored synthetic samples and retains keyboard focus');
  assert.equal(await A.locator('#adminDetail').getAttribute('aria-live'),'polite');
  assert.equal(await A.locator('#adminOperationStatus').count(),1);
  pass('Chrome manager detail live-region and reset status remain accessible without duplicate nodes');


  // G3-19: an earlier test may leave calendarMode='day'; return to month first.
  await A.evaluate(()=>location.hash='#/calendar-demo');
  if(await A.locator('#calDetails').isVisible())await A.locator('#calBackMonth').click();
  await A.locator('#calMonthView').waitFor({state:'visible'});
  for(const width of [320,390]){
    await A.setViewportSize({width,height:844});
    const sameDate=A.locator('#calGrid .cal-day[aria-label^="'+date+' 예약 "]');
    for(let i=0;i<3&&await sameDate.count()===0;i++)await A.locator('#calNext').click();
    assert.equal(await sameDate.count(),1);
    await sameDate.click();
    const state=A.locator('#calEvents .cal-timeline-state').first();
    assert.equal(await state.count(),1);
    const sizes=await A.evaluate(()=>{
      const status=document.querySelector('#calEvents .cal-timeline-state');
      const fold=document.querySelector('#calEvents .cal-fold-indicator');
      const bounds=status.getBoundingClientRect();
      const card=status.closest('.cal-timeline-item').getBoundingClientRect();
      return {state:parseFloat(getComputedStyle(status).fontSize),
       fold:parseFloat(getComputedStyle(fold).fontSize),
       statusRight:bounds.right,cardRight:card.right,
       over:document.documentElement.scrollWidth-innerWidth};
    });
    assert.ok(sizes.state>=11,'mobile status type unreadable at '+width+'px: '+JSON.stringify(sizes));
    assert.ok(sizes.fold>=11,'mobile detail affordance text too small '+width+'px: '+JSON.stringify(sizes));
    assert.ok(sizes.over<=2,'page horizontal overflow '+width+'px: '+JSON.stringify(sizes));
    assert.ok(sizes.statusRight<=sizes.cardRight+2,'badge clipped by card at '+width+'px');
    pass('Chrome '+width+'px calendar status/detail legible with no clipping or horizontal scroll');
    await A.locator('#calBackMonth').click();
  }
  await A.setViewportSize({width:320,height:844});
  // A genuinely empty month day must describe its state BEFORE ten empty hour rows.
  const zeroDay=A.locator('#calGrid .cal-day[aria-label$="예약 0건"]').first();
  assert.ok(await zeroDay.count()>0,'cannot find empty calendar day in synthetic month');
  await zeroDay.click();
  const note=A.locator('#calEmptyStatus');
  assert.equal(await note.getAttribute('role'),'status');
  assert.equal(await note.getAttribute('aria-live'),'polite');
  assert.match(await note.innerText(),/가상 예약이 없습니다/);
  const noteRect=await note.boundingBox();
  const firstHourRect=await A.locator('#calEvents .cal-hour-row').first().boundingBox();
  assert.ok(noteRect&&firstHourRect&&noteRect.y<firstHourRect.y,'empty notice should precede the 10 empty hour rows');
  assert.equal((await active(A)).id,'calSelectedTitle');
  pass('Chrome empty calendar date: accessible state message before hourly list and title focus');
  const confirmedEmpty=A.locator('#calStatusFilters button[data-cal-status="confirmed"]');
  await confirmedEmpty.click();
  assert.equal(await confirmedEmpty.getAttribute('aria-pressed'),'true');
  assert.match(await note.innerText(),/가상 예약이 없습니다/);
  assert.match(await A.locator('#calSelectedCount').innerText(),/0건/);
  pass('Chrome empty calendar filter: status persists and pressed/count semantics remain correct');
  await A.locator('#calDayRefresh').click();
  assert.match(await note.innerText(),/가상 예약이 없습니다/);
  assert.equal((await active(A)).id,'calDayRefresh');
  assert.match(await A.locator('#calRefreshStatus').innerText(),/새로고침/);
  pass('Chrome empty calendar refresh preserves empty announcement and button focus');
  await A.evaluate(()=>location.hash='#/admin-demo');
  await A.setViewportSize({width:320,height:844});
  const adminMobile=await A.evaluate(()=>{
    const filters=[...document.querySelectorAll('#adminDemo .admin-filter')];
    const items=[...document.querySelectorAll('#adminList .admin-request')];
    return {over:document.documentElement.scrollWidth-innerWidth,
       filterMin:Math.min(...filters.map(n=>parseFloat(getComputedStyle(n).fontSize))),
       requests:items.length,
       statusMin:Math.min(...items.map(n=>parseFloat(getComputedStyle(n.querySelector('.admin-status')).fontSize)))};
  });
  assert.ok(adminMobile.over<=2,'mobile admin scrolls sideways: '+JSON.stringify(adminMobile));
  assert.ok(adminMobile.filterMin>=11&&adminMobile.statusMin>=11,'admin filter/status text too small: '+JSON.stringify(adminMobile));
  assert.equal(adminMobile.requests,4);
  assert.equal(await A.locator('#adminOperationStatus').getAttribute('role'),'status');
  pass('Chrome 320px manager: filter/status readable, no sideways scrolling, reset announcement available');

  assert.deepEqual(errors,[],'JavaScript exceptions during G3-17 interactions');
  pass('Chrome browser tabs have no application JavaScript exceptions');
  await ctx.close();
  console.log('G3-19 (G3-18 + mobile/empty calendar) real Chromium QA PASS: '+passes.length+' checks');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(err=>{console.error('FAIL '+(err.stack||err));server.close();process.exitCode=1});
