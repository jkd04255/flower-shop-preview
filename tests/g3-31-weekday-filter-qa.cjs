'use strict';
/** G3-31: synthetic customer weekday & admin filter-result UX on Chromium and
 * Linux WebKit. The latter is not the physical iPhone Instagram WebView.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let full;
 try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);full=path.resolve(root,'.'+(p==='/'?'/index.html':p))}
 catch{res.writeHead(400);res.end();return}
 if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(full,(e,b)=>{if(e){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream'});res.end(b)});
});
async function getDayOptions(page){
 return page.evaluate(()=>{
  const base=new Date();base.setHours(12,0,0,0);
  const options=[];
  for(let i=3;i<14&&options.length<2;i++){
   const day=new Date(base);day.setDate(base.getDate()+i);
   const date=localDateString(day),times=pickupSlots(0,date);
   if(times.length)options.push({date,time:times[0],weekday:['일','월','화','수','목','금','토'][day.getDay()]+'요일'});
  }
  return options;
 });
}
async function checkEngine(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:undefined;
 const browser=await engine.launch({headless:true,...launch});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const slots=await getDayOptions(page);assert.equal(slots.length,2);
  assert.equal(await page.locator('#rPickupPreview').isVisible(),false);
  await page.locator('#rDate').fill(slots[0].date);
  let preview=await page.locator('#rPickupPreview').innerText();
  assert.ok(preview.includes(slots[0].date)&&preview.includes(slots[0].weekday)&&preview.includes('시간을 선택'),preview);
  await page.locator('#rTime').selectOption(slots[0].time);
  preview=await page.locator('#rPickupPreview').innerText();
  assert.ok(preview.includes(slots[0].date+' '+slots[0].time)&&preview.includes(slots[0].weekday)&&preview.includes('예약 확정 전 (가상)'),preview);
  console.log('PASS G3-31 '+label+' weekday matches real pickup date and pending-only label');

  await page.locator('#rDate').fill(slots[1].date);
  assert.equal(await page.locator('#rTime').inputValue(),'');
  preview=await page.locator('#rPickupPreview').innerText();
  assert.ok(preview.includes(slots[1].date)&&preview.includes(slots[1].weekday)&&!preview.includes(slots[0].date),preview);
  await page.locator('#rDate').fill('');
  assert.equal(await page.locator('#rPickupPreview').isVisible(),false);
  assert.equal(await page.locator('#rTime').isDisabled(),true);
  console.log('PASS G3-31 '+label+' date change/clear never retains stale preview');

  await page.goto(url+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#adminList .admin-request[data-request-id="DEMO-001"]').waitFor({state:'visible'});
  const initialRecords=await page.evaluate(()=>JSON.stringify(adminRequests));
  assert.equal(await page.locator('#adminFilterSummary').innerText(),'전체 요청 · 4건 표시 / 전체 4건 · 가상 데이터');
  assert.equal(await page.locator('#adminShowAll').isVisible(),false);
  await page.locator('.admin-filter[data-filter="pending"]').click();
  assert.equal(await page.locator('#adminFilterSummary').innerText(),'입금 전 · 2건 표시 / 전체 4건 · 가상 데이터');
  assert.equal(await page.locator('#adminList .admin-request').count(),2);
  assert.equal(await page.locator('#adminShowAll').isVisible(),true);
  assert.equal(await page.locator('.admin-filter[data-filter="pending"]').getAttribute('aria-pressed'),'true');
  console.log('PASS G3-31 '+label+' filtered count and reset affordance stay in sync');

  await page.locator('.admin-filter[data-filter="ready"]').click();
  assert.equal(await page.locator('#adminFilterSummary').innerText(),'수령 전 · 0건 표시 / 전체 4건 · 가상 데이터');
  assert.equal(await page.locator('#adminList .admin-request').count(),0);
  assert.equal(await page.locator('#adminList .admin-empty').count(),1);
  assert.equal(await page.locator('#adminShowAll').isVisible(),true);
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[]);
  console.log('PASS G3-31 '+label+' empty-status filter reset visible and axe-core automated violations zero');

  await page.locator('#adminShowAll').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const focus=await page.locator('#adminShowAll').evaluate(el=>{
   const s=getComputedStyle(el);
   return{active:el===document.activeElement,keyboard:el.matches(':focus-visible'),outline:s.outlineStyle,width:parseFloat(s.outlineWidth)};
  });
  assert.ok(focus.active&&focus.keyboard&&focus.outline!=='none'&&focus.width>=2,JSON.stringify(focus));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.admin-filter[data-filter="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#adminList .admin-request').count(),4);
  assert.equal(await page.locator('#adminShowAll').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.filter),'all');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initialRecords,'filter navigation never changes booking state');
  console.log('PASS G3-31 '+label+' keyboard reset moves focus to All; no synthetic records modified');

  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const extra=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(extra<=2,JSON.stringify({width,extra}));
  }
  assert.deepEqual(errors,[]);
  // A retained G3-31 regression must also pass on later G3-32+ releases.
  const footer=await page.locator('footer').innerText();
  const version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=31,'G3-31 or newer static-demo footer required: '+footer);
  console.log('PASS G3-31 '+label+' 320/390px no horizontal overflow and no JS errors');
  await ctx.close();
 }finally{await browser.close()}
}
async function main(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{
  await checkEngine(chromium,'Chromium',url);
  await checkEngine(webkit,'WebKit',url);
  console.log('G3-31 Chromium + WebKit PASS 10 groups; physical iPhone Instagram NOT verified');
 }finally{server.close()}
}
main().catch(e=>{console.error('FAIL G3-31 '+(e.stack||e));server.close();process.exitCode=1});
