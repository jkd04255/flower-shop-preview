'use strict';
/** G3-32 Chromium + Linux WebKit; synthetic customer review privacy and
 * manager next-action labels. Not a physical iOS Instagram/Safari WebView test.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let file;try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);file=path.resolve(root,'.'+(p==='/'?'/index.html':p))}
 catch{res.writeHead(400);res.end();return}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(b)});
});
const fakeMemo='리본은 연두색 <img src=x onerror=alert(1)>';
async function pickup(page){
 return page.evaluate(()=>{
  const base=new Date();base.setHours(12,0,0,0);
  for(let i=3;i<14;i++){
   const day=new Date(base);day.setDate(base.getDate()+i);
   const date=localDateString(day),times=pickupSlots(0,date);
   if(times.length)return{date,time:times[0]};
  }
  return null;
 });
}
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const violations=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.equal(violations.violations.length,0,where+': '+JSON.stringify(violations.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)}))));
}
async function check(engine,label,base){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const slot=await pickup(page);assert.ok(slot);
  const startScale=await page.evaluate(()=>visualViewport?.scale??1);
  await page.locator('#rDate').fill(slot.date);
  await page.locator('#rTime').selectOption(slot.time);
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  const before=await page.evaluate(()=>adminRequests.length);
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#rReviewAmount').innerText(),'39,000 KRW');
  assert.equal(await page.locator('#rReviewMemo').innerText(),'없음');
  assert.equal(await page.evaluate(()=>adminRequests.length),before);
  console.log('PASS G3-32 '+label+' review shows current price and missing optional memo without saving');

  await page.locator('#rReviewEdit').tap();
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.equal(await page.locator('#rReviewMemo').textContent(),'');
  await page.locator('#rMemo').fill(fakeMemo);
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#rReviewMemo').textContent(),fakeMemo);
  assert.equal(await page.locator('#rReviewMemo').evaluate(el=>el.children.length),0);
  assert.equal(await page.evaluate(()=>adminRequests.length),before);
  await axePass(page,label+' review');
  console.log('PASS G3-32 '+label+' memo appears only as inert text and review axe WCAG 2.1 A/AA zero');

  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),before+1);
  assert.equal(await page.locator('#rReviewMemo').textContent(),'');
  assert.equal(await page.locator('#rReviewAmount').textContent(),'');
  assert.equal(await page.locator('#rMemo').inputValue(),'');
  const stored=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!stored.includes(fakeMemo)&&!stored.includes('가상 고객')&&!stored.includes('01000000000'));
  assert.ok(!(await page.locator('#reserveResult').innerText()).includes(fakeMemo));
  const finalScale=await page.evaluate(()=>visualViewport?.scale??1);
  assert.ok(Math.abs(finalScale-startScale)<.05,JSON.stringify({startScale,finalScale}));
  console.log('PASS G3-32 '+label+' final confirmation creates one fake request, clears memo and preserves scale');

  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  const select=async id=>{
   await page.locator('#adminList .admin-request[data-request-id="'+id+'"]').tap();
   return page.locator('#adminDetail .admin-next-action').innerText();
  };
  assert.match(await select('DEMO-002'),/가상 송금 완료 표시/);
  assert.match(await select('DEMO-001'),/가상 입금 내역 확인 항목/);
  assert.match(await select('DEMO-003'),/예약 확정 상태/);
  assert.match(await select('DEMO-004'),/거절된 가상 요청/);
  assert.match(await select('DEMO-005'),/가상 송금 완료 표시/);
  assert.ok(!(await page.locator('#adminDetail').innerText()).includes(fakeMemo));
  console.log('PASS G3-32 '+label+' admin next steps reflect pending, paid-report, confirmed, rejected and new request');

  await select('DEMO-001');
  const verify=page.locator('#adminDetail .admin-verify input[type="checkbox"]');
  await verify.check();
  assert.match(await page.locator('#adminDetail .admin-next-action').innerText(),/가상 입금 확인 조건을 충족/);
  const approval=page.locator('#adminDetail .admin-action').filter({hasText:'입금 확인 · 예약 확정'});
  assert.equal(await approval.isDisabled(),false);
  await approval.tap();
  assert.match(await page.locator('#adminDetail .admin-next-action').innerText(),/예약 확정 상태/);
  await axePass(page,label+' admin');
  console.log('PASS G3-32 '+label+' admin helper updates with actual existing verification/status transitions and axe zero');

  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,JSON.stringify({width,overflow}));
  }
  assert.deepEqual(errors,[]);
  const footer=await page.locator('footer').innerText();
  const version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=32,'G3-32 or later footer required: '+footer);
  console.log('PASS G3-32 '+label+' mobile no overflow, footer version and no JS errors');
  await ctx.close();
 }finally{await browser.close()}
}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{
  await check(chromium,'Chromium',base);
  await check(webkit,'WebKit',base);
  console.log('G3-32 CHROMIUM/WEBKIT PASS 12 groups (physical iPhone Instagram NOT tested)');
 }finally{server.close()}
}
run().catch(e=>{console.error('FAIL G3-32 '+(e.stack||e));server.close();process.exitCode=1});
