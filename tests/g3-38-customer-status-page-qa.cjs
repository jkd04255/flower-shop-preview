'use strict';
/** G3-38 dedicated responsive customer status route & payment states.
 * Only synthetic reservations; real iPhone Instagram browser is untested.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let filename;
 try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);filename=path.resolve(root,'.'+(p==='/'?'/index.html':p));}
 catch{res.writeHead(400);res.end();return;}
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filename,(err,b)=>{if(err){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(b);});
});
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(audit.violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)})),[],where+' axe WCAG 2.1 A/AA');
}
async function bookable(page){
 return page.evaluate(()=>{
  const bounds=pickupBounds(),today=dateFromLocalString(bounds.min);
  for(let n=3;n<14;n++){
   const d=new Date(today);d.setDate(today.getDate()+n);
   const date=localDateString(d),times=pickupSlots(0,date);
   if(times.length)return {date,time:times[0]};
  }
  return null;
 });
}
async function lookup(page,code){
 await page.locator('#csLast4').fill(code);
 await page.locator('#csSubmit').tap();
}
async function runEngine(engine,label,base){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base+'#/booking-status',{waitUntil:'domcontentloaded'});
  await page.locator('#customerStatus').waitFor({state:'visible'});
  assert.equal(await page.locator('#home').isVisible(),false,'separate screen replaces homepage');
  assert.equal(await page.locator('#csResults .cs-card').count(),0,'direct URL never guesses a customer record');
  assert.match(await page.locator('#csStatusMessage').innerText(),/4자리를 입력/);
  assert.match(await page.locator('#csLookupHelp').innerText(),/실제 전화번호는 입력하지 마세요/);
  await axePass(page,label+' empty direct booking status page');
  console.log('PASS G3-38 '+label+' direct dedicated route has no guessed record and passes axe');

  await lookup(page,'1002');
  assert.equal(await page.locator('#csResults .cs-card').count(),1);
  let summary=await page.locator('#csResults .cs-card').innerText();
  const sampleDate=await page.evaluate(()=>adminRequests.find(x=>x.id==='DEMO-002').date);
  for(const required of ['DEMO-002','멜로우 선데이',sampleDate,'13:00','49,000 KRW','입금 전','계좌번호','000-0000-0000','실제 송금']){
   assert.ok(summary.includes(required),label+' missing '+required+' in pending screen:\n'+summary);
  }
  assert.equal(await page.locator('#csResults .cs-bank').count(),1);
  assert.equal(await page.locator('#csResults .cs-photo').count(),1);
  assert.equal(await page.locator('#csResults .cs-steps li').count(),4);
  assert.equal(await page.locator('#csResults .cs-steps li.is-done').count(),1);
  await axePass(page,label+' pending with bank card');
  const out=path.join(root,'qa-artifacts');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'g3-38-'+label.toLowerCase()+'-pending.png'),fullPage:true});
  console.log('PASS G3-38 '+label+' pending: bouquet/date/time/price + clearly invalid demo bank example, axe zero');

  await lookup(page,'1001');
  summary=await page.locator('#csResults').innerText();
  assert.match(summary,/입금 확인 대기/);
  assert.match(summary,/가상 송금 완료 표시/);
  assert.equal(await page.locator('#csResults .cs-bank').count(),0,'do not offer bank once payment reported');
  await lookup(page,'1003');
  summary=await page.locator('#csResults').innerText();
  assert.match(summary,/예약 확정/);
  assert.match(summary,/입금 확인 완료/);
  assert.equal(await page.locator('#csResults .cs-bank').count(),0);
  await page.screenshot({path:path.join(out,'g3-38-'+label.toLowerCase()+'-confirmed.png'),fullPage:true});
  await lookup(page,'1004');
  summary=await page.locator('#csResults').innerText();
  assert.match(summary,/예약 거절/);
  assert.match(summary,/결제 없음/);
  assert.equal(await page.locator('#csResults .cs-bank').count(),0);
  assert.ok(!summary.includes('입금 확인 완료'),'rejected request cannot claim a verified payment');
  console.log('PASS G3-38 '+label+' pending-reported, confirmed/paid, rejected have distinct accurate states');

  await lookup(page,'12');
  assert.match(await page.locator('#csStatusMessage').innerText(),/숫자 4자리를 입력/);
  await lookup(page,'9999');
  assert.equal(await page.locator('#csResults .cs-card').count(),0);
  assert.match(await page.locator('#csStatusMessage').innerText(),/일치하는 가상 예약이 없습니다/);
  assert.ok(!new URL(page.url()).hash.includes('9999'));
  await page.locator('.cs-nav a[href="#store"]').tap();
  await page.locator('#rStatusLookupForm').waitFor({state:'visible'});
  await page.locator('#rStatusLast4').fill('1003');
  await page.locator('#rStatusLookupSubmit').tap();
  await page.locator('#customerStatus').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).hash,'#/booking-status');
  assert.match(await page.locator('#csResults').innerText(),/예약 확정/);
  assert.equal(await page.locator('#rStatusLookupResult').textContent(),'','home no longer exposes summary-only lookup output');
  console.log('PASS G3-38 '+label+' home form navigates to dedicated screen, missing and invalid codes safe');

  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const slot=await bookable(page);assert.ok(slot);
  await page.locator('#rDate').fill(slot.date);
  await page.locator('#rTime').selectOption(slot.time);
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000001234');
  await page.locator('#rMemo').fill('비공개 가상 메모');
  const before=await page.evaluate(()=>adminRequests.length);
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),before);
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),before+1);
  await page.locator('#reserveResult a[href="#/booking-status"]').tap();
  await page.locator('#customerStatus').waitFor({state:'visible'});
  summary=await page.locator('#csResults').innerText();
  assert.match(summary,/DEMO-005/);
  assert.match(summary,/로지 모먼트/);
  assert.match(summary,/입금 전/);
  assert.ok(!summary.includes('01000001234')&&!summary.includes('비공개 가상 메모')&&!summary.includes('가상 고객'));
  assert.equal(await page.locator('#csResults .cs-bank').count(),1);
  let saved=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!saved.includes('1234')&&!saved.includes('01000001234')&&!saved.includes('비공개 가상 메모'));
  console.log('PASS G3-38 '+label+' after mock request, separate screen shows own status without leaking personal data');

  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  // The new route initializes a fresh form, but its demo payment button lives on the previous result.
  // Mark the existing synthetic request in memory, as the same UI action would do.
  assert.equal(await page.evaluate(()=>markDemoPayment('DEMO-005')),true);
  await page.goto(base+'#/booking-status',{waitUntil:'domcontentloaded'});
  summary=await page.locator('#csResults').innerText();
  assert.match(summary,/DEMO-005/);
  assert.match(summary,/입금 확인 대기/);
  assert.equal(await page.locator('#csResults .cs-bank').count(),0);
  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#adminList .admin-request[data-request-id="DEMO-005"]').tap();
  assert.match(await page.locator('#adminDetail').innerText(),/DEMO-005/,'the actual new synthetic request must be selected');
  await page.locator('#adminDetail .admin-verify input[type="checkbox"]').check();
  const approve=page.locator('#adminDetail .admin-action').filter({hasText:'입금 확인 · 예약 확정'});
  assert.equal(await approve.isDisabled(),false);
  await approve.tap();
  const stateAfterApproval=await page.evaluate(()=>{
   const item=adminRequests.find(x=>x.id==='DEMO-005');
   const saved=JSON.parse(localStorage.getItem(DEMO_BOOKINGS_KEY));
   return {current:item?.status,payment:item?.paymentState,
    saved:saved?.records?.find(x=>x.id==='DEMO-005')?.status,
    selected:adminSelectedId};
  });
  console.log('G3-38 '+label+' approval state '+JSON.stringify(stateAfterApproval));
  assert.equal(stateAfterApproval.current,'confirmed','actual selected synthetic record must be confirmed before navigation');
  assert.equal(stateAfterApproval.saved,'confirmed','approved synthetic record must persist before navigation');
  await page.goto(base+'#/booking-status',{waitUntil:'domcontentloaded'});
  summary=await page.locator('#csResults').innerText();
  assert.match(summary,/예약 확정/);
  assert.match(summary,/입금 확인 완료/);
  assert.equal(await page.locator('#csResults .cs-bank').count(),0);
  await axePass(page,label+' confirmed after synthetic admin');
  console.log('PASS G3-38 '+label+' same-tab payment report and admin approval update dedicated status view');

  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,JSON.stringify({width,overflow}));
   assert.equal(await page.locator('#csResults .cs-card').count(),1);
  }
  saved=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!saved.includes('1234')&&!saved.includes('01000001234'));
  assert.deepEqual(errors,[]);
  const footer=await page.locator('footer').innerText();
  const version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=38,'G3-38 or newer static-demo footer required: '+footer);
  console.log('PASS G3-38 '+label+' 320/390 responsive, axe zero, no JS errors, no persisted suffix');
  await context.close();
 }finally{await browser.close();}
}
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{await runEngine(chromium,'Chromium',base);await runEngine(webkit,'WebKit',base);console.log('G3-38 chromium/webkit PASS; actual iPhone Instagram untested');}
 finally{server.close();}
}
run().catch(err=>{console.error('FAIL G3-38 '+(err.stack||err));server.close();process.exitCode=1;});
