'use strict';
/** G3-30: real Chromium + Linux WebKit mobile wayfinding regression.
 * Synthetic reservations only. Linux WebKit != actual iPhone Instagram WebView.
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
  const base=new Date();base.setHours(12,0,0,0);
  const found=[];
  for(let i=3;i<14;i++){
   const candidate=new Date(base);candidate.setDate(base.getDate()+i);
   const date=localDateString(candidate),times=pickupSlots(0,date);
   if(times.length)found.push({date,time:times[0]});
   if(found.length===2)break;
  }
  return found;
 });
}
async function checkEngine(engine,label,base){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:undefined;
 const browser=await engine.launch({headless:true,...launch});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.equal(await page.locator('#rPickupPreview').isVisible(),false);
  assert.equal(await page.locator('.heroText .call').textContent(),'오늘의 꽃 만나기 ↗');
  const slots=await sampleSlots(page);assert.equal(slots.length,2);
  await page.locator('#rDate').fill(slots[0].date);
  let preview=await page.locator('#rPickupPreview').innerText();
  assert.ok(preview.includes(slots[0].date)&&preview.includes('시간을 선택'),preview);
  await page.locator('#rTime').selectOption(slots[0].time);
  preview=await page.locator('#rPickupPreview').innerText();
  assert.ok(preview.includes(slots[0].date+' '+slots[0].time)&&preview.includes('예약 확정 전'),preview);
  console.log('PASS G3-30 '+label+' date and time selection preview; explicitly not confirmed');

  await page.locator('#rDate').fill(slots[1].date);
  assert.equal(await page.locator('#rTime').inputValue(),'');
  preview=await page.locator('#rPickupPreview').innerText();
  assert.ok(preview.includes(slots[1].date)&&!preview.includes(slots[0].date+' '+slots[0].time)&&preview.includes('시간을 선택'),preview);
  await page.locator('#rTime').selectOption(slots[1].time);
  await page.locator('#rDate').fill('');
  assert.equal(await page.locator('#rPickupPreview').isVisible(),false);
  assert.equal(await page.locator('#rTime').isDisabled(),true);
  await page.locator('#rDate').fill(slots[0].date);
  await page.locator('#rTime').selectOption(slots[0].time);
  console.log('PASS G3-30 '+label+' changed/cleared date never leaves stale pickup preview');

  const before=await page.evaluate(()=>adminRequests.length);
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),before);
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),before+1);
  assert.equal(await page.locator('#reserveProgress [aria-current="step"]').getAttribute('data-reservation-step'),'result');
  console.log('PASS G3-30 '+label+' original two-step synthetic booking gates intact');

  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  const card=page.locator('#adminList .admin-request[data-request-id="DEMO-005"]');
  await card.waitFor({state:'visible'});
  await card.click();
  let jump=page.locator('#adminDetail .admin-calendar-day-jump');
  assert.equal(await jump.count(),1);
  const focus=await jump.evaluate(el=>{el.focus();const s=getComputedStyle(el);return{outline:s.outlineStyle,width:parseFloat(s.outlineWidth)}});
  assert.ok(focus.outline!=='none'&&focus.width>=2,JSON.stringify(focus));
  await jump.tap();
  await page.locator('#calDetails').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>calendarSelectedDate),slots[0].date);
  assert.equal(await page.evaluate(()=>calendarStatusFilter),'all');
  assert.equal(await page.locator('#calEvents .cal-timeline-item[data-request-id="DEMO-005"]').count(),1);
  console.log('PASS G3-30 '+label+' admin shortcut opens exact booking day and retains real keyboard focus');

  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#adminList .admin-request[data-request-id="DEMO-004"]').click();
  assert.equal(await page.locator('#adminDetail .admin-calendar-day-jump').count(),0,'rejected booking must not link to excluded calendar');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=2,JSON.stringify({overflow}));
  assert.deepEqual(errors,[]);
  console.log('PASS G3-30 '+label+' rejected booking has no calendar shortcut; mobile layout and JS errors clean');
  await ctx.close();
 }finally{await browser.close()}
}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{
  await checkEngine(chromium,'Chromium',base);
  await checkEngine(webkit,'WebKit',base);
  console.log('G3-30 CHROMIUM + WEBKIT UX QA PASS 10 checks; real iPhone Instagram untested');
 }finally{server.close()}
}
run().catch(e=>{console.error('FAIL G3-30 '+(e.stack||e));server.close();process.exitCode=1});
