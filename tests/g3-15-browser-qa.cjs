'use strict';
/**
 * G3-15 actual Chromium QA, run on the real checked-out index.html + assets.
 * Starts a local HTTP server, never writes personal data or touches a live booking backend.
 * GitHub Pages is only read for a basic public smoke test.
 *
 * npm install --no-save --no-package-lock playwright-core
 * CHROME_BIN=/usr/bin/google-chrome node tests/g3-15-browser-qa.cjs
 */
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const { chromium }=require('playwright-core');
const root=process.cwd();
const result=[];
function pass(name){result.push(name);process.stdout.write('PASS '+name+'\n')}
function urlPath(url){const raw=decodeURIComponent(new URL(url,'http://localhost').pathname);
 const absolute=path.resolve(root,'.'+(raw==='/'?'/index.html':raw));
 if(absolute!==root&&!absolute.startsWith(root+path.sep))return null;
 return absolute;
}
const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((request,response)=>{
 const file=urlPath(request.url);
 if(!file){response.writeHead(403);response.end();return;}
 fs.readFile(file,(error,buf)=>{
  if(error){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
  response.end(buf);
 });
});
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const width of [320,390,768,1280]){
   const context=await browser.newContext({viewport:{width,height:850},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
   await page.locator('#featured .card').first().waitFor({timeout:12000});
   assert.equal(await page.locator('#featured .card').count(),3);
   assert.equal(await page.locator('#regular .card').count(),2);
   const homeOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(homeOverflow<=2,'home horizontal overflow '+width+'px: '+homeOverflow);
   await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.locator('#reserveForm').waitFor({state:'visible',timeout:10000});
   const reserveOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(reserveOverflow<=2,'form horizontal overflow '+width+'px: '+reserveOverflow);
   assert.deepEqual(errors,[],'script errors at '+width+'px');
   pass('Chromium local site '+width+'px: home/form render, no sideways overflow, no JS error');
   await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  await page.locator('#reserveForm button[type="submit"]').click();
  assert.equal(await page.locator('#rDate').getAttribute('aria-invalid'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'rDate');
  pass('Chromium required-date error exposes invalid state and focuses the input');
  const dates=await page.evaluate(()=>{
   function business(offset){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+offset);
    while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);
    const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
   }
   return [business(3),business(8)];
  });
  assert.notEqual(dates[0],dates[1]);
  await page.locator('#rDate').fill(dates[0]);
  const pickupOptions=await page.locator('#rTime option').evaluateAll(els=>els.map(e=>e.value).filter(Boolean));
  assert.ok(pickupOptions.length>0,'a future business day has no times');
  await page.locator('#rTime').selectOption(pickupOptions[0]);
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  await page.locator('#rDate').fill(dates[1]);
  assert.equal(await page.locator('#rTime').inputValue(),'','changing date must reset previous time');
  await page.locator('#reserveForm button[type="submit"]').click();
  assert.equal(await page.locator('#rTime').getAttribute('aria-invalid'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'rTime');
  pass('Chromium date reselection invalidates old pickup hour; time error focus is correct');
  const options2=await page.locator('#rTime option').evaluateAll(els=>els.map(e=>e.value).filter(Boolean));
  assert.ok(options2.length>0);
  await page.locator('#rTime').selectOption(options2[0]);
  await page.locator('#reserveForm button[type="submit"]').click();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'reserveResultTitle');
  assert.equal(await page.locator('#rrDate').innerText(),dates[1]);
  const saved=await page.evaluate(()=>localStorage.getItem('afternoon-garden-calendar-demo-v1'));
  assert.ok(saved&&!saved.includes('01000000000')&&!saved.includes('가상 고객'),'no form contact details persisted');
  pass('Chromium valid synthetic reservation, result focus, no customer data stored');
  await page.locator('#rMarkPaid').click();
  assert.equal(await page.locator('#rMarkPaid').isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'rPaymentState');
  assert.match(await page.locator('#rPaymentState').innerText(),/실제 은행 거래나 송금은 발생하지 않았습니다/);
  pass('Chromium simulated transfer report and accessible payment announcement');
  await page.locator('#reserveResult a[href="#/admin-demo"]').click();
  await page.locator('#adminDetail').waitFor({state:'visible'});
  const created=await page.locator('#adminList .admin-request').first().getAttribute('data-request-id');
  assert.ok(created&&created.startsWith('DEMO-'));
  const box=page.locator('#adminDetail .admin-verify input[type="checkbox"]');
  assert.equal(await box.count(),1);
  await box.check();
  const confirm=page.locator('#adminDetail .admin-action').filter({hasText:'입금 확인 · 예약 확정'}).first();
  assert.equal(await confirm.isEnabled(),true);
  await confirm.click();
  assert.match(await page.locator('#adminDetail').innerText(),/예약 확정/);
  pass('Chromium manager: simulated deposit checked before manual confirmation');
  await page.locator('#adminDemo .admin-calendar-link').click();
  await page.locator('#calMonthView').waitFor({state:'visible'});
  const label='[aria-label^="'+dates[1]+' 예약 "]';
  for(let i=0;i<3&&await page.locator('#calGrid .cal-day'+label).count()===0;i++){
   await page.locator('#calNext').click();
  }
  assert.ok(await page.locator('#calGrid .cal-day'+label).count()>0,'booking day absent from calendar');
  await page.locator('#calGrid .cal-day'+label).click();
  await page.locator('#calDetails').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'calSelectedTitle');
  pass('Chromium monthly calendar opens selected booking date with title focus');
  const other=page.locator('#calWeekStrip .cal-week-date[aria-pressed="false"]').first();
  const otherDate=await other.getAttribute('data-date');
  assert.ok(otherDate);
  await other.focus();await other.click();
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.date),otherDate);
  assert.equal(await page.evaluate(()=>document.activeElement?.isConnected),true);
  assert.equal(await page.locator('#calWeekStrip .cal-week-date[aria-pressed="true"]').getAttribute('data-date'),otherDate);
  pass('Chromium week-strip click restores keyboard focus to connected replacement button');
  await page.locator('#calBackMonth').click();
  const label2='[aria-label^="'+dates[1]+' 예약 "]';
  for(let i=0;i<3&&await page.locator('#calGrid .cal-day'+label2).count()===0;i++)await page.locator('#calNext').click();
  await page.locator('#calGrid .cal-day'+label2).click();
  const row=page.locator('#calEvents .cal-timeline-item[data-request-id="'+created+'"]');
  assert.ok(await row.count()>0,'new booking missing from timeline');
  await row.locator('summary').click();
  await row.locator('button').filter({hasText:'수령 전으로 변경'}).click();
  assert.match(await row.locator('summary').innerText(),/수령 전/);
  assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'SUMMARY');
  await row.locator('button').filter({hasText:'수령 완료 처리'}).click();
  assert.match(await row.locator('summary').innerText(),/수령 완료/);
  assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'SUMMARY');
  pass('Chromium calendar pickup statuses and focus survive rerenders');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-15-day-390.png',fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  assert.match(await page.locator('#adminList .admin-request[data-request-id="'+created+'"]').innerText(),/수령 완료/);
  assert.deepEqual(errors,[],'browser JS runtime errors');
  pass('Chromium localStorage restore preserves final pickup state after reload');
  await context.close();
  // The published Pages is smoke-read only. Live booking operations are never driven there.
  const live=await browser.newPage();
  try{
   const response=await live.goto('https://jkd04255.github.io/flower-shop-preview/?ci=g3-15-browser',{waitUntil:'domcontentloaded',timeout:20000});
   assert.ok(response&&response.ok());
   await live.locator('#home .hero').waitFor({state:'visible',timeout:8000});
   const footer=await live.locator('footer').first().innerText({timeout:5000});
   assert.match(footer,/G3-1[4-7] STATIC DEMO/);
   pass('Chromium published GitHub Pages read-only smoke: home, footer version');
  }catch(error){
   process.stdout.write('UNVERIFIED published Pages browser smoke: '+String(error.message).slice(0,220)+'\n');
  }finally{await live.close()}
  console.log('G3-15 actual Chromium QA PASS: '+result.length+' checks, local real HTML/assets + optional live read-only smoke.');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(error=>{console.error(error.stack||error);server.close();process.exitCode=1;});
