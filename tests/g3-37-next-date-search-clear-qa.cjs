'use strict';
/** G3-37 Chromium + Linux WebKit customer next-date and synthetic ID search clear.
 * No real iPhone/Instagram browser or production integrations are tested.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const types={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let file;
 try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);file=path.resolve(root,'.'+(p==='/'?'/index.html':p));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);});
});
async function availableDates(page){
 return page.evaluate(()=>{
  const bounds=pickupBounds(),first=dateFromLocalString(bounds.min),result=[];
  for(let day=first;localDateString(day)<=bounds.max;day.setDate(day.getDate()+1)){
   const date=localDateString(day),times=pickupSlots(0,date);
   if(times.length)result.push({date,times});
  }
  return result;
 });
}
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(audit.violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)})),[],where+' axe WCAG 2.1 A/AA');
}
async function check(engine,label,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const dates=await availableDates(page);assert.ok(dates.length>=3,'expect three dates in synthetic 14-day pickup window');
  const next=page.locator('#rNextDate'),msg=page.locator('#rNextDateStatus'),time=page.locator('#rTime');
  assert.equal(await next.isDisabled(),true);
  assert.equal(await msg.textContent(),'');
  const before=await page.evaluate(()=>JSON.stringify(adminRequests));
  await page.locator('#rEarliestDate').tap();
  assert.equal(await page.locator('#rDate').inputValue(),dates[0].date);
  assert.equal(await next.isDisabled(),false);
  await time.selectOption(dates[0].times[0]);
  await next.tap();
  assert.equal(await page.locator('#rDate').inputValue(),dates[1].date);
  assert.equal(await time.inputValue(),'','next date must reset the old hour');
  assert.match(await msg.innerText(),new RegExp(dates[1].date));
  assert.match(await msg.innerText(),/픽업 시간을 다시 선택/);
  assert.equal(await page.locator('#rEarliestStatus').textContent(),'');
  assert.ok((await page.locator('#rPickupPreview').innerText()).includes(dates[1].date));
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),before);
  console.log('PASS G3-37 '+label+' next valid date skips unavailable days and clears time without creating a booking');

  await next.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const focus=await next.evaluate(el=>({active:document.activeElement===el,visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle}));
  assert.ok(focus.active&&focus.visible&&focus.outline!=='none',JSON.stringify(focus));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#rDate').inputValue(),dates[2].date);
  assert.equal(await time.inputValue(),'');
  await page.locator('#rDate').fill(dates[0].date);
  assert.equal(await msg.textContent(),'','manual date change must dismiss stale quick guidance');
  await page.locator('#rDate').fill(dates.at(-1).date);
  await next.tap();
  assert.equal(await page.locator('#rDate').inputValue(),dates.at(-1).date);
  assert.match(await msg.innerText(),/14일 이내에 픽업 가능한 다른 날짜가 없습니다/);
  await page.locator('#rEarliestDate').tap();
  assert.equal(await page.locator('#rDate').inputValue(),dates[0].date);
  assert.equal(await msg.textContent(),'','G3-34 earliest-date button clears next-date guidance');
  await page.locator('#rDate').fill('');
  assert.equal(await next.isDisabled(),true);
  assert.equal(await msg.textContent(),'');
  await axePass(page,label+' booking input');
  console.log('PASS G3-37 '+label+' keyboard activation, final-day boundary, earliest-date and manual reset, axe zero');

  await page.locator('#rDate').fill(dates[1].date);
  await page.locator('#rLatestTime').tap();
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  await page.locator('#rMemo').fill('가상 요청');
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),before);
  assert.equal(await page.locator('#rReviewMemo').textContent(),'가상 요청');
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),5);
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!storage.includes('01000000000')&&!storage.includes('가상 요청')&&!storage.includes('가상 고객'));
  assert.equal(await page.locator('#rMemoCount').textContent(),'0 / 120자 · 가상 시연용');
  console.log('PASS G3-37 '+label+' original 3-step review, G3-33 memo and privacy gates preserved');

  /* Customer-facing synthetic status lookup, which cannot authenticate real customers. */
  await page.goto(url+'#store',{waitUntil:'domcontentloaded'});
  const lookup=page.locator('#rStatusLast4'),lookupResult=page.locator('#rStatusLookupResult');
  await page.locator('#rStatusLookupForm').waitFor({state:'visible'});
  await lookup.fill('12');
  await page.locator('#rStatusLookupSubmit').tap();
  assert.match(await lookupResult.innerText(),/숫자 4자리를 입력/);
  await lookup.fill('1003');
  await page.locator('#rStatusLookupSubmit').tap();
  await page.locator('#customerStatus').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).hash,'#/booking-status','valid lookup must navigate to full booking screen');
  assert.match(await page.locator('#csResults').innerText(),/DEMO-003/);
  assert.match(await page.locator('#csResults').innerText(),/예약 확정/);
  await page.locator('#csLast4').fill('1004');
  await page.locator('#csSubmit').tap();
  assert.match(await page.locator('#csResults').innerText(),/DEMO-004/);
  assert.match(await page.locator('#csResults').innerText(),/예약 거절/);
  await page.locator('#csLast4').fill('9999');
  await page.locator('#csSubmit').tap();
  assert.match(await page.locator('#csStatusMessage').innerText(),/일치하는 가상 예약이 없습니다/);
  await page.locator('#csLast4').fill('0000');
  await page.locator('#csSubmit').tap();
  const newLookup=await page.locator('#csResults').innerText();
  assert.match(newLookup,/DEMO-005/);
  assert.match(newLookup,/입금 전/);
  assert.ok(!newLookup.includes('01000000000')&&!newLookup.includes('가상 고객')&&!newLookup.includes('가상 요청'));
  const snapshot=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!snapshot.includes('0000')&&!snapshot.includes('01000000000'),'typed suffix and full phone must not persist');
  await axePass(page,label+' public booking status lookup');
  console.log('PASS G3-37 '+label+' lookup validates four digits, demo samples and same-tab new request; no private fields or axe violations');

  await page.goto(url+'#/admin-demo',{waitUntil:'domcontentloaded'});
  const input=page.locator('#adminRequestSearch'),clear=page.locator('#adminSearchClear');
  const list=page.locator('#adminList .admin-request');
  await list.first().waitFor({state:'visible'});
  assert.equal(await clear.isHidden(),true);
  await input.fill('demo-003');
  assert.equal(await list.count(),1);
  assert.equal(await clear.isVisible(),true);
  const data=await page.evaluate(()=>JSON.stringify(adminRequests));
  await clear.tap();
  assert.equal(await input.inputValue(),'');
  assert.equal(await clear.isHidden(),true);
  assert.equal(await list.count(),5);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'adminRequestSearch');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),data,'clear does not mutate records');
  console.log('PASS G3-37 '+label+' clear search removes only query and restores visible input focus');

  await page.locator('#adminSortOrder').selectOption('pickup-desc');
  await page.locator('.admin-filter[data-filter="pending"]').tap();
  await input.fill('DEMO-001');
  assert.equal(await list.count(),1);
  await clear.tap();
  assert.equal(await list.count(),3);
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'pickup-desc');
  assert.equal(await page.locator('.admin-filter[data-filter="pending"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#adminFilterSummary').innerText(),'입금 전 · 3건 표시 / 전체 5건 · 가상 데이터');
  await input.fill('no-such-id');
  assert.equal(await list.count(),0);
  assert.match(await page.locator('#adminFilterSummary').innerText(),/0건 표시/);
  await clear.tap();
  assert.equal(await list.count(),3);
  await page.locator('#adminShowAll').tap();
  assert.equal(await list.count(),5);
  assert.equal(await input.inputValue(),'');
  await axePass(page,label+' admin');
  console.log('PASS G3-37 '+label+' clear respects existing status, sort, show-all and empty-state behavior; axe zero');

  await input.fill('DEMO-004');
  await page.locator('#adminReset').tap();
  assert.equal(await input.inputValue(),'');
  assert.equal(await clear.isHidden(),true);
  assert.equal(await list.count(),4);
  await page.reload({waitUntil:'domcontentloaded'});
  await list.first().waitFor({state:'visible'});
  assert.equal(await input.inputValue(),'');
  assert.equal(await clear.isHidden(),true);
  await page.goto(url+'#store',{waitUntil:'domcontentloaded'});
  await page.locator('#rStatusLast4').fill('0000');
  await page.locator('#rStatusLookupSubmit').tap();
  await page.locator('#customerStatus').waitFor({state:'visible'});
  assert.match(await page.locator('#csStatusMessage').innerText(),/일치하는 가상 예약이 없습니다/);
  await page.goto(url+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await list.first().waitFor({state:'visible'});
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,JSON.stringify({width,overflow}));
  }
  assert.deepEqual(errors,[]);
  const footer=await page.locator('footer').innerText();
  const version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=37,'G3-37 or later footer required: '+footer);
  console.log('PASS G3-37 '+label+' reset/reload, 320/390px responsive and no JS runtime errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);console.log('G3-37 all Chromium/WebKit synthetic UX groups PASS; physical iPhone Instagram not tested');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-37 '+(e.stack||e));server.close();process.exitCode=1;});
