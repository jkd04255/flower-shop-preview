'use strict';
/*
 * G3-16 actual Chrome multi-tab and keyboard regression.
 * Source under test: real index.html + relative assets on a temporary localhost server.
 * Never submits a booking to published GitHub Pages; synthetic-only localStorage.
 * Run: CHROME_BIN=/usr/bin/google-chrome node tests/g3-16-browser-qa.cjs
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
 const file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(e,bytes)=>{if(e){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes)});
});
const successes=[];
const pass=(label)=>{successes.push(label);console.log('PASS '+label)};
async function focused(page){return page.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.id,connected:document.activeElement?.isConnected,request:document.activeElement?.dataset?.requestId,date:document.activeElement?.dataset?.date}))}
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
 const A=await context.newPage(), B=await context.newPage();
 const errors=[];A.on('pageerror',err=>errors.push('A:'+err.message));B.on('pageerror',err=>errors.push('B:'+err.message));
 await A.goto(base,{waitUntil:'domcontentloaded'});await A.evaluate(()=>location.hash='#/reserve/rosy-moment');
 await A.locator('#reserveForm').waitFor({state:'visible'});
 assert.equal((await focused(A)).id,'reservationHeading');
 await A.keyboard.press('Tab');
 assert.equal((await focused(A)).id,'rDate');
 pass('real Chrome: reservation heading Tab → date input');
 const date=await A.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+4);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);const pad=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())});
 await A.locator('#rDate').fill(date);
 await A.keyboard.press('Tab');
 assert.equal((await focused(A)).id,'rTime');
 pass('real Chrome: date Tab → enabled time select');
 const options=await A.locator('#rTime option').evaluateAll(xs=>xs.map(x=>x.value).filter(Boolean));
 assert.ok(options.length>0,'no available test time');
 const time=options[0];
 await A.locator('#rTime').selectOption(time);
 await B.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
 // Preserve an already selected time while a different tab fills its slot.
 await B.evaluate(({date,time})=>{
  const key='afternoon-garden-calendar-demo-v1';
  const current=JSON.parse(localStorage.getItem(key)||'{"version":1,"records":[],"sequence":5}');
  const used=new Set(current.records.map(x=>x.id));
  let n=501;
  for(let k=0;k<3;k++){
   let id;do{id='DEMO-'+String(n++).padStart(3,'0')}while(used.has(id));used.add(id);
   current.records.push({id,productIndex:0,date,time,status:'confirmed',paymentState:'verified',depositChecked:true});
  }
  current.sequence=Math.max(current.sequence||5,n);
  localStorage.setItem(key,JSON.stringify(current));
 },{date,time});
 await A.waitForFunction(()=>document.getElementById('rTime').value==='',{timeout:6000});
 assert.equal(await A.locator('#rTime').inputValue(),'');
 assert.ok(!await A.locator('#rTime option[value="'+time+'"]').count());
 assert.match(await A.locator('#rTimeHint').innerText(),/선택했던 시간/);
 pass('real Chrome: other-tab synthetic capacity change invalidates selected pickup slot');
 // Return storage to sample data using actual reset UI, then visit the admin list in A.
 await B.locator('#adminReset').click();
 await A.evaluate(()=>location.hash='#/admin-demo');
 await A.locator('#adminList .admin-request[data-request-id="DEMO-001"]').waitFor({state:'visible'});
 const card=A.locator('#adminList .admin-request[data-request-id="DEMO-001"]');
 await card.focus();
 assert.equal((await focused(A)).request,'DEMO-001');
 await B.locator('#adminReset').click();
 await A.waitForTimeout(150);
 assert.equal((await focused(A)).request,'DEMO-001','focused manager card should survive remote reset/rerender');
 assert.equal((await focused(A)).connected,true);
 pass('real Chrome: other-tab reset preserves manager card keyboard focus');
 // Calendar day summary should similarly survive a remote reset of sample bookings.
 const sampleDate=(await A.locator('#adminList .admin-request[data-request-id="DEMO-001"] .admin-request-meta').innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0];
 assert.ok(sampleDate);
 await A.evaluate(()=>location.hash='#/calendar-demo');
 await A.locator('#calMonthView').waitFor({state:'visible'});
 let day=A.locator('#calGrid .cal-day[aria-label^="'+sampleDate+' 예약 "]');
 for(let attempt=0;attempt<3&&await day.count()===0;attempt++)await A.locator('#calNext').click();
 assert.equal(await day.count(),1);
 await day.click();
 const summary=A.locator('#calEvents .cal-timeline-item[data-request-id="DEMO-001"] summary');
 await summary.focus();
 assert.equal((await focused(A)).tag,'SUMMARY');
 await B.locator('#adminReset').click();
 await A.waitForTimeout(150);
 assert.equal((await focused(A)).tag,'SUMMARY','calendar timeline summary must keep focus after remote update');
 assert.equal((await focused(A)).connected,true);
 pass('real Chrome: calendar timeline focus survives cross-tab status refresh');
 // Recheck keyboard order of calendar controls after opening an event day.
 await A.locator('#calBackMonth').click();
 await A.locator('#calMonth').waitFor();
 await A.locator('#calendarHeading').focus();
 await A.keyboard.press('Tab');
 assert.equal((await focused(A)).id,'calPrev');
 pass('real Chrome: calendar heading Tab → previous month control');
 assert.deepEqual(errors,[],'no unexpected JS errors');
 pass('real Chrome: two tabs remain free from JS runtime errors');
 await context.close();
 console.log('G3-16 real Chromium multi-tab and keyboard QA PASS: '+successes.length+' checks');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(err=>{console.error('FAIL '+(err.stack||err));server.close();process.exitCode=1});
