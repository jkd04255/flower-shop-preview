'use strict';
/** G3-33 real Chromium + Linux WebKit responsive synthetic UX regression.
 * Linux WebKit does not substitute for a physical iPhone Instagram browser.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let filename;
 try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);filename=path.resolve(root,'.'+(p==='/'?'/index.html':p))}
 catch{res.writeHead(400);res.end();return}
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(filename,(e,bytes)=>{if(e){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(bytes)});
});
async function pickup(page){
 return page.evaluate(()=>{
  const today=new Date();today.setHours(12,0,0,0);
  for(let n=3;n<14;n++){
   const d=new Date(today);d.setDate(today.getDate()+n);
   const date=localDateString(d),slots=pickupSlots(0,date);
   if(slots.length)return {date,time:slots[0]};
  }
  return null;
 });
}
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],where+' axe violations');
}
async function check(engine,label,base){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const counter=page.locator('#rMemoCount'),memo=page.locator('#rMemo');
  assert.equal(await counter.textContent(),'0 / 120자 · 가상 시연용');
  assert.equal(await memo.getAttribute('aria-describedby'),'rMemoCount');
  await memo.fill('색상은 피치');
  assert.equal(await counter.textContent(),'6 / 120자 · 가상 시연용');
  const long='가'.repeat(120);
  await memo.fill(long);
  assert.equal(await memo.inputValue(),long);
  assert.equal(await counter.textContent(),'120 / 120자 · 가상 시연용');
  console.log('PASS G3-33 '+label+' memo counter updates 0, 6, 120/120 and label is accessible');

  await memo.fill('가상 리본');
  const slot=await pickup(page);assert.ok(slot);
  await page.locator('#rDate').fill(slot.date);
  await page.locator('#rTime').selectOption(slot.time);
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  const before=await page.evaluate(()=>adminRequests.length);
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#rReviewMemo').textContent(),'가상 리본');
  assert.equal(await page.evaluate(()=>adminRequests.length),before);
  await axePass(page,label+' review');
  await page.locator('#rReviewEdit').tap();
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.equal(await memo.inputValue(),'가상 리본');
  assert.equal(await counter.textContent(),'5 / 120자 · 가상 시연용');
  console.log('PASS G3-33 '+label+' review/edit maintains transient memo and no early booking, axe zero');

  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),before+1);
  assert.equal(await memo.inputValue(),'');
  assert.equal(await counter.textContent(),'0 / 120자 · 가상 시연용');
  assert.equal(await page.locator('#rReviewMemo').textContent(),'');
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!storage.includes('가상 리본')&&!storage.includes('01000000000'));
  console.log('PASS G3-33 '+label+' completion resets length and form; storage still synthetic metadata only');

  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  const select=async id=>{await page.locator('#adminList .admin-request[data-request-id="'+id+'"]').tap();return page.locator('#adminDetail .admin-slot-context');};
  let slotInfo=await select('DEMO-003');
  assert.match(await slotInfo.innerText(),/선택한 시간대 가상 확정 · 1 \/ 3건 · 실제 예약 아님/);
  slotInfo=await select('DEMO-001');
  assert.match(await slotInfo.innerText(),/선택한 시간대 가상 확정 · 0 \/ 3건 · 실제 예약 아님/);
  await select('DEMO-004');
  assert.equal(await page.locator('#adminDetail .admin-slot-context').count(),0);
  console.log('PASS G3-33 '+label+' admin confirmed/pending count and rejected hidden');

  await select('DEMO-001');
  await page.locator('#adminDetail .admin-verify input[type="checkbox"]').check();
  const approve=page.locator('#adminDetail .admin-action').filter({hasText:'입금 확인 · 예약 확정'});
  assert.equal(await approve.isDisabled(),false);
  await approve.tap();
  slotInfo=page.locator('#adminDetail .admin-slot-context');
  assert.match(await slotInfo.innerText(),/선택한 시간대 가상 확정 · 1 \/ 3건 · 실제 예약 아님/);
  await page.locator('#adminDetail .admin-calendar-day-jump').tap();
  await page.locator('#calDetails').waitFor({state:'visible'});
  assert.equal(await page.locator('#calEvents .cal-timeline-item[data-request-id="DEMO-001"]').count(),1);
  console.log('PASS G3-33 '+label+' existing confirm and selected-calendar shortcut remain functional');

  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await axePass(page,label+' admin');
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(horizontalOverflow<=2,JSON.stringify({width,horizontalOverflow}));
  }
  assert.deepEqual(errors,[]);
  const footer=await page.locator('footer').innerText();
  const version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=33,'G3-33 or later static demo footer required: '+footer);
  console.log('PASS G3-33 '+label+' axe zero, 320/390px without overflow, no page errors');
  await context.close();
 }finally{await browser.close()}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{
  await check(chromium,'Chromium',base);
  await check(webkit,'WebKit',base);
  console.log('G3-33 Chromium + WebKit PASS 12 groups; real iPhone Instagram remains untested');
 }finally{server.close()}
}
main().catch(err=>{console.error('FAIL G3-33 '+(err.stack||err));server.close();process.exitCode=1});
