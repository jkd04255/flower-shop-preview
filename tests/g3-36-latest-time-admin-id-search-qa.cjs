'use strict';
/** G3-36 Chromium + Linux WebKit: synthetic latest-hour and admin ID-only search.
 * Real iPhone Instagram WebView NOT verified; no real customer/payment integration.
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
async function slots(page){
 return page.evaluate(()=>{
  const b=pickupBounds(),now=dateFromLocalString(b.min),found=[];
  for(let day=now;localDateString(day)<=b.max;day.setDate(day.getDate()+1)){
   const date=localDateString(day),hours=pickupSlots(0,date);
   if(hours.length>=2)found.push({date,hours});
   if(found.length===2)break;
  }
  return found;
 });
}
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],where+' axe violations');
}
async function check(engine,label,base){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Historical shortcut regressions intentionally open the optional helper.
  // Customer-facing G3-48 QA separately asserts that it starts collapsed.
  await page.addInitScript(()=>{
    document.addEventListener('DOMContentLoaded',()=>{
      const details=document.getElementById('reserveQuickDetails');
      if(details)details.open=true;
    });
  });
  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const last=page.locator('#rLatestTime'),hint=page.locator('#rLatestTimeStatus');
  const days=await slots(page);
  assert.equal(days.length,2,'two weekdays with multiple available synthetic slots expected');
  assert.equal(await last.isDisabled(),true);
  assert.equal(await hint.textContent(),'');
  await page.locator('#rEarliestDate').tap();
  const quickDate=await page.locator('#rDate').inputValue();
  const initialSlots=await page.evaluate(date=>pickupSlots(0,date),quickDate);
  assert.ok(initialSlots.length>0,'quick-date chooses a valid day even if only one slot remains');
  /* An earliest valid day can have only one remaining hour. Test two-way hour choices on
     the first verified multi-slot day instead, without changing production behavior. */
  await page.locator('#rDate').fill(days[0].date);
  assert.equal(await page.locator('#rTime').inputValue(),'','date quick choice must not select a time');
  assert.equal(await last.isDisabled(),false);
  const before=await page.evaluate(()=>JSON.stringify(adminRequests));
  await last.tap();
  assert.equal(await page.locator('#rTime').inputValue(),days[0].hours.at(-1));
  assert.match(await hint.innerText(),new RegExp(days[0].hours.at(-1)));
  assert.match(await hint.innerText(),/예약 확정 전/);
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),before);
  console.log('PASS G3-36 '+label+' last available time selection is explicit and never creates bookings');

  await page.locator('#rEarliestTime').tap();
  assert.equal(await page.locator('#rTime').inputValue(),days[0].hours[0]);
  assert.equal(await hint.textContent(),'','earliest click clears stale last-time label');
  await last.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const focus=await last.evaluate(el=>({active:document.activeElement===el,visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle}));
  assert.ok(focus.active&&focus.visible&&focus.outline!=='none',JSON.stringify(focus));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#rTime').inputValue(),days[0].hours.at(-1));
  await page.locator('#rTime').selectOption(days[0].hours[0]);
  assert.equal(await hint.textContent(),'','manual time selection clears quick-label');
  await page.locator('#rDate').fill(days[1].date);
  assert.equal(await page.locator('#rTime').inputValue(),'','date change must clear previous hour');
  assert.equal(await hint.textContent(),'');
  await page.locator('#rDate').fill('');
  assert.equal(await last.isDisabled(),true);
  assert.equal(await hint.textContent(),'');
  await axePass(page,label+' customer input');
  console.log('PASS G3-36 '+label+' earliest/last buttons, keyboard, manual change and date reset, axe zero');

  await page.locator('#rDate').fill(days[0].date);
  await last.tap();
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  await page.locator('#rMemo').fill('가상 리본');
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#rReviewTime').textContent(),days[0].hours.at(-1));
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),before,'review must not create record');
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),5);
  assert.equal(await page.locator('#rMemoCount').textContent(),'0 / 120자 · 가상 시연용');
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!storage.includes('가상 리본')&&!storage.includes('01000000000'));
  console.log('PASS G3-36 '+label+' review confirmation creates exactly one synthetic request, no personal data saved');

  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  const query=page.locator('#adminRequestSearch'),list=page.locator('#adminList .admin-request');
  assert.equal(await query.inputValue(),'');
  assert.equal(await list.count(),5);
  const source=await page.evaluate(()=>JSON.stringify(adminRequests));
  const original=await list.evaluateAll(nodes=>nodes.map(n=>n.dataset.requestId));
  await query.fill('demo-003');
  assert.equal(await list.count(),1);
  assert.equal(await list.first().getAttribute('data-request-id'),'DEMO-003','case insensitive ID match');
  assert.match(await page.locator('#adminFilterSummary').innerText(),/1건 표시 \/ 전체 5건 · 가상 데이터 · 예약번호 검색 적용/);
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),source);
  await query.fill('NO-SUCH-ID');
  assert.equal(await list.count(),0);
  assert.match(await page.locator('#adminList .admin-empty').innerText(),/해당 상태의 가상 예약 요청이 없습니다/);
  assert.match(await page.locator('#adminFilterSummary').innerText(),/0건 표시/);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'adminRequestSearch','typing/filtering never destroys focused input');
  console.log('PASS G3-36 '+label+' case-insensitive synthetic ID search and zero-result keyboard input retention');

  await query.fill('DEMO-00');
  assert.equal(await list.count(),5);
  await page.locator('#adminSortOrder').selectOption('pickup-desc');
  const sorted=await list.evaluateAll(nodes=>nodes.map(n=>n.dataset.requestId));
  const expected=await page.evaluate(()=>[...adminRequests].sort((a,b)=>-(a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id))).map(x=>x.id));
  assert.deepEqual(sorted,expected);
  await query.fill('DEMO-001');
  assert.equal(await list.count(),1);
  await page.locator('.admin-filter[data-filter="confirmed"]').tap();
  assert.equal(await list.count(),0,'search intersects status filter');
  await page.locator('#adminShowAll').tap();
  assert.equal(await list.count(),1);
  assert.equal(await query.inputValue(),'DEMO-001','show-all preserves search text');
  await page.locator('#adminSortOrder').selectOption('request');
  await query.fill('');
  assert.deepEqual(await list.evaluateAll(nodes=>nodes.map(n=>n.dataset.requestId)),original);
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),source,'query and sort must never mutate records');
  await axePass(page,label+' admin');
  console.log('PASS G3-36 '+label+' ID search combines with status/sort/show-all without record mutation, axe zero');

  await query.fill('DEMO-003');
  await page.locator('#adminReset').tap();
  assert.equal(await query.inputValue(),'');
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'request');
  assert.equal(await list.count(),4,'reset seed records restored');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#adminList .admin-request').first().waitFor({state:'visible'});
  assert.equal(await query.inputValue(),'','search must not persist on reload');
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,JSON.stringify({width,overflow}));
  }
  assert.deepEqual(errors,[]);
  const footer=await page.locator('footer').innerText();
  const version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=36,'G3-36 or later static demo footer required: '+footer);
  console.log('PASS G3-36 '+label+' reset/reload privacy, mobile no overflow, no runtime errors');
  await ctx.close();
 }finally{await browser.close()}
}
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',base);await check(webkit,'WebKit',base);console.log('G3-36 Chromium/WebKit 12 groups PASS; real iPhone Instagram NOT verified');}
 finally{server.close()}
}
run().catch(e=>{console.error('FAIL G3-36 '+(e.stack||e));server.close();process.exitCode=1});
