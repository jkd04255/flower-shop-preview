'use strict';
/** G3-28 touch focus / iOS WebKit input-size regression in real Chromium.
 * Browser touch emulation ≠ physical iPhone Instagram/Safari. No real booking.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=process.cwd(),passed=[];
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let full;
 try{const requested=decodeURIComponent(new URL(req.url,'http://local').pathname);full=path.resolve(root,'.'+(requested==='/'?'/index.html':requested))}
 catch{res.writeHead(400);res.end();return}
 if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(full,(err,b)=>{if(err){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream'});res.end(b)});
});
function pass(label){passed.push(label);console.log('PASS G3-28 '+label)}
async function getPickup(page){
 return page.evaluate(()=>{
  const date=new Date();date.setHours(12,0,0,0);
  for(let i=3;i<14;i++){
   const candidate=new Date(date);candidate.setDate(date.getDate()+i);
   const d=localDateString(candidate),times=pickupSlots(0,d);
   if(times.length)return{date:d,time:times[0]};
  }return null;
 });
}
async function fill(page,{date,time}){
 await page.locator('#rDate').fill(date);
 await page.locator('#rTime').selectOption(time);
 await page.locator('#rName').fill('가상 고객');
 await page.locator('#rPhone').fill('01000000000');
}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const base='http://127.0.0.1:'+server.address().port+'/';
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#/flower/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#dReserve').tap();
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const stage=await page.evaluate(()=>({heading:document.getElementById('reservationHeading').textContent,active:document.activeElement?.id,scale:visualViewport.scale}));
  assert.notEqual(stage.active,'reservationHeading','touch navigation must not programmatically focus the static heading');
  assert.match(stage.heading,/꽃다발 예약 요청/);
  pass('touch navigation keeps reservation H1 unfocused but visible');
  const font=await page.locator('#reserveForm input,#reserveForm select,#reserveForm textarea').evaluateAll(elems=>elems.map(e=>({id:e.id,size:parseFloat(getComputedStyle(e).fontSize)})));
  assert.ok(font.length>=5&&font.every(x=>x.size>=16),JSON.stringify(font));
  pass('mobile form input/select/textarea computed size at least 16px to avoid iOS focus autozoom');
  const titleStyles=await page.evaluate(()=>{
   const ids=['reservationHeading','rReviewTitle','reserveResultTitle'];
   return ids.map(id=>{
    const el=document.getElementById(id);el.focus({preventScroll:true});
    return{id,outline:getComputedStyle(el).outlineStyle};
   });
  });
  assert.ok(titleStyles.every(x=>x.outline==='none'),JSON.stringify(titleStyles));
  pass('all three inert reservation headings suppress browser focus rectangles');
  await page.evaluate(()=>document.activeElement?.blur());
  const pickup=await getPickup(page);assert.ok(pickup);
  const before=await page.evaluate(()=>adminRequests.length);
  await fill(page,pickup);
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'rReviewTitle');
  assert.equal(await page.evaluate(()=>adminRequests.length),before);
  pass('touch submit opens review without persistent title focus or creating booking');
  await page.locator('#rReviewEdit').tap();
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'rDate');
  assert.equal(await page.locator('#rName').inputValue(),'가상 고객');
  pass('touch edit restores inputs without forcing date picker focus');
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  const mobile=await page.evaluate(()=>({
   active:document.activeElement?.id,scale:visualViewport.scale,width:visualViewport.width,
   overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
   stage:[...document.querySelectorAll('#reserveProgress [data-reservation-step]')].find(x=>x.getAttribute('aria-current')==='step')?.dataset.reservationStep,
   bookings:adminRequests.length
  }));
  assert.notEqual(mobile.active,'reserveResultTitle');
  assert.ok(Math.abs(mobile.scale-stage.scale)<.01,JSON.stringify({start:stage,mobile}));
  assert.equal(mobile.stage,'result');assert.equal(mobile.bookings,before+1);
  assert.ok(mobile.overflow<=2,JSON.stringify(mobile));
  pass('touch final confirmation preserves visual viewport scale and creates exactly one synthetic request');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const axe=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.equal(axe.violations.length,0,JSON.stringify(axe.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)}))));
  pass('mobile result axe-core WCAG A/AA automated violations zero');
  await ctx.close();

  const keyboardCtx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const kb=await keyboardCtx.newPage();kb.on('pageerror',e=>errors.push(e.message));
  await kb.goto(base+'#/flower/rosy-moment',{waitUntil:'domcontentloaded'});
  await kb.locator('#dReserve').focus();
  await kb.keyboard.press('Enter');
  await kb.locator('#reserveForm').waitFor({state:'visible'});
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'reservationHeading');
  pass('keyboard link activation still focuses new reservation heading for accessible navigation');
  await fill(kb,await getPickup(kb));
  await kb.locator('#reserveForm button[type="submit"]').focus();
  await kb.keyboard.press('Enter');
  await kb.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'rReviewTitle');
  await kb.keyboard.press('Tab');
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'rReviewEdit');
  await kb.keyboard.press('Tab');
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'rReviewConfirm');
  pass('keyboard review retains heading focus and sequentially reachable edit/confirm actions');
  await kb.keyboard.press('Enter');
  await kb.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await kb.evaluate(()=>document.activeElement?.id),'reserveResultTitle');
  await kb.keyboard.press('Tab');
  const focus=await kb.evaluate(()=>{
   const e=document.activeElement,s=getComputedStyle(e);
   return{id:e.id,visible:e.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth)};
  });
  assert.ok(focus.visible&&focus.style!=='none'&&focus.width>=2,JSON.stringify(focus));
  pass('keyboard final result retains heading focus and visible outline on next interactive control');
  await keyboardCtx.close();
  assert.deepEqual(errors,[]);
  pass('all tested navigation and booking routes without JavaScript errors');
  console.log('G3-28 CHROMIUM TOUCH/KEYBOARD QA PASS '+passed.length+' checks; physical iOS Instagram WebKit NOT tested');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(e=>{console.error('FAIL '+(e.stack||e));server.close();process.exitCode=1});
