'use strict';
/**
 * G3-29: WebKit-engine mobile touch/keyboard regression for the static flower
 * booking demo. Linux Playwright WebKit is NOT an iPhone Instagram WebView.
 * All reservations use fabricated data and never reach a shop or bank.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {webkit}=require('playwright-core');
const root=process.cwd(),passed=[];
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let full;
 try{const name=decodeURIComponent(new URL(req.url,'http://local').pathname);full=path.resolve(root,'.'+(name==='/'?'/index.html':name))}
 catch{res.writeHead(400);res.end();return}
 if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream'});res.end(data)});
});
function pass(message){passed.push(message);console.log('PASS G3-29 '+message)}
async function pickup(page){
 return page.evaluate(()=>{
  const base=new Date();base.setHours(12,0,0,0);
  for(let i=3;i<=13;i++){
   const day=new Date(base);day.setDate(base.getDate()+i);
   const date=localDateString(day),slots=pickupSlots(0,date);
   if(slots.length)return{date,time:slots[0]};
  }
  return null;
 });
}
async function inputSample(page,slot){
 await page.locator('#rDate').fill(slot.date);
 await page.locator('#rTime').selectOption(slot.time);
 await page.locator('#rName').fill('테스트 고객');
 await page.locator('#rPhone').fill('01000000000');
}
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await webkit.launch({headless:true});
 try{
  const base='http://127.0.0.1:'+server.address().port+'/';
  const touch=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await touch.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#/flower/rosy-moment',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#dTitle').innerText(),'로지 모먼트');
  await page.locator('#dReserve').tap();
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'reservationHeading');
  pass('WebKit touch product→reservation navigation leaves inert heading unfocused');

  const sizes=await page.locator('#reserveForm input,#reserveForm select,#reserveForm textarea').evaluateAll(els=>els.map(e=>[e.id,parseFloat(getComputedStyle(e).fontSize)]));
  assert.ok(sizes.length>=5&&sizes.every(([,n])=>n>=16),JSON.stringify(sizes));
  const outlines=await page.evaluate(()=>{
   return ['reservationHeading','rReviewTitle','reserveResultTitle'].map(id=>{
    const el=document.getElementById(id);el.focus({preventScroll:true});
    return{id,outline:getComputedStyle(el).outlineStyle};
   });
  });
  assert.ok(outlines.every(x=>x.outline==='none'),JSON.stringify(outlines));
  await page.evaluate(()=>document.activeElement?.blur());
  pass('WebKit 16px controls and no outlined static booking headings');

  const before=await page.evaluate(()=>adminRequests.length);
  const slot=await pickup(page);assert.ok(slot,'synthetic weekday pickup must be available');
  const initial=await page.evaluate(()=>visualViewport?.scale??1);
  await inputSample(page,slot);
  await page.locator('#rPhone').tap();
  const focused=await page.evaluate(()=>visualViewport?.scale??1);
  assert.ok(Math.abs(focused-initial)<.05,JSON.stringify({initial,focused}));
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),before);
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'rReviewTitle');
  pass('WebKit date/name/contact input and touch review without auto scale or early booking');

  await page.locator('#rReviewEdit').tap();
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.equal(await page.locator('#rName').inputValue(),'테스트 고객');
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'rDate');
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  const done=await page.evaluate(()=>({
   scale:visualViewport?.scale??1,
   active:document.activeElement?.id,
   overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
   stage:[...document.querySelectorAll('#reserveProgress [data-reservation-step]')].find(n=>n.getAttribute('aria-current')==='step')?.dataset.reservationStep,
   count:adminRequests.length
  }));
  assert.ok(Math.abs(done.scale-initial)<.05,JSON.stringify({initial,done}));
  assert.ok(done.overflow<=2,JSON.stringify(done));
  assert.notEqual(done.active,'reserveResultTitle');
  assert.equal(done.stage,'result');assert.equal(done.count,before+1);
  pass('WebKit touch edit→confirm→result keeps scale, no horizontal overflow, one fake request');
  await touch.close();

  const keyboard=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const kb=await keyboard.newPage();kb.on('pageerror',e=>errors.push(e.message));
  await kb.goto(base+'#/flower/rosy-moment',{waitUntil:'domcontentloaded'});
  await kb.locator('#dReserve').focus();await kb.keyboard.press('Enter');
  await kb.locator('#reserveForm').waitFor({state:'visible'});
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'reservationHeading');
  await inputSample(kb,await pickup(kb));
  await kb.locator('#reserveForm button[type="submit"]').focus();await kb.keyboard.press('Enter');
  await kb.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'rReviewTitle');
  await kb.keyboard.press('Tab');
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'rReviewEdit');
  await kb.keyboard.press('Tab');
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'rReviewConfirm');
  pass('WebKit keyboard navigation retains accessible headings and edit/confirm tab order');
  await kb.keyboard.press('Enter');
  await kb.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'reserveResultTitle');
  await kb.keyboard.press('Tab');
  const focus=await kb.evaluate(()=>{
   const el=document.activeElement,css=getComputedStyle(el);
   return{visible:el.matches(':focus-visible'),outline:css.outlineStyle,width:parseFloat(css.outlineWidth)};
  });
  assert.ok(focus.visible&&focus.outline!=='none'&&focus.width>=2,JSON.stringify(focus));
  assert.deepEqual(errors,[]);
  pass('WebKit result retains visible keyboard focus and no JavaScript errors');
  await keyboard.close();
  console.log('G3-29 WEBKIT ENGINE QA PASS '+passed.length+' checks; NOT physical iPhone Instagram Safari');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(error=>{console.error('FAIL G3-29 '+(error.stack||error));server.close();process.exitCode=1});