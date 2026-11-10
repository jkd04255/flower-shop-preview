'use strict';
/** G3-34 Chromium + Linux Playwright WebKit mobile UX regression.
 * Live booking, external accounts and actual iOS Instagram WebView are NOT tested.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let full;try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);full=path.resolve(root,'.'+(p==='/'?'/index.html':p))}
 catch{res.writeHead(400);res.end();return}
 if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(full,(e,b)=>{if(e){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream'});res.end(b)});
});
async function availableDays(page){
 return page.evaluate(()=>{
  const bounds=pickupBounds(),first=dateFromLocalString(bounds.min),out=[];
  for(let day=first;localDateString(day)<=bounds.max;day.setDate(day.getDate()+1)){
   const date=localDateString(day),slots=pickupSlots(0,date);
   if(slots.length)out.push({date,time:slots[0]});
  }
  return out;
 });
}
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const audit=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],where+' axe WCAG A/AA');
}
async function check(engine,label,base){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  // Historical shortcut regressions intentionally open the optional helper.
  // Customer-facing G3-48 QA separately asserts that it starts collapsed.
  await page.addInitScript(()=>{
    document.addEventListener('DOMContentLoaded',()=>{
      const details=document.getElementById('reserveQuickDetails');
      if(details)details.open=true;
    });
  });
  await page.goto(base+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const choices=await availableDays(page);assert.ok(choices.length>=2,'expected two available synthetic weekdays');
  assert.equal(await page.locator('#rDate').inputValue(),'');
  assert.equal(await page.locator('#rEarliestStatus').textContent(),'');
  await page.locator('#rEarliestDate').tap();
  assert.equal(await page.locator('#rDate').inputValue(),choices[0].date);
  assert.equal(await page.locator('#rTime').inputValue(),'');
  assert.equal(await page.locator('#rTime').isDisabled(),false);
  assert.match(await page.locator('#rEarliestStatus').innerText(),new RegExp(choices[0].date));
  assert.ok((await page.locator('#rPickupPreview').innerText()).includes(choices[0].date));
  console.log('PASS G3-34 '+label+' earliest available date is picked without silently choosing a time');

  await page.locator('#rTime').selectOption(choices[0].time);
  await page.locator('#rDate').fill(choices[1].date);
  assert.equal(await page.locator('#rEarliestStatus').textContent(),'');
  assert.equal(await page.locator('#rTime').inputValue(),'','manual date change resets former pickup time');
  const manuallyChosen=await page.locator('#rPickupPreview').innerText();
  assert.ok(manuallyChosen.includes(choices[1].date)&&!manuallyChosen.includes(choices[0].date+' '+choices[0].time));
  await page.locator('#rEarliestDate').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#rDate').inputValue(),choices[0].date);
  assert.equal(await page.locator('#rTime').inputValue(),'');
  await axePass(page,label+' customer form');
  console.log('PASS G3-34 '+label+' manual change clears shortcut guidance and keyboard re-activation works, axe zero');

  await page.locator('#rTime').selectOption(choices[0].time);
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  await page.locator('#rMemo').fill('가상 전달사항');
  const countBefore=await page.evaluate(()=>adminRequests.length);
  await page.locator('#reserveForm button[type="submit"]').tap();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),countBefore);
  assert.equal(await page.locator('#rReviewMemo').textContent(),'가상 전달사항');
  await page.locator('#rReviewConfirm').tap();
  await page.locator('#reserveResult').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>adminRequests.length),countBefore+1);
  assert.equal(await page.locator('#rMemoCount').textContent(),'0 / 120자 · 가상 시연용');
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.ok(!storage.includes('가상 전달사항')&&!storage.includes('01000000000'));
  console.log('PASS G3-34 '+label+' original review/submit privacy gates and G3-33 memo count unaffected');

  await page.goto(base+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#adminList .admin-request[data-request-id="DEMO-005"]').waitFor({state:'visible'});
  const initial=await page.evaluate(()=>JSON.stringify(adminRequests));
  const originalIds=await page.locator('#adminList .admin-request').evaluateAll(nodes=>nodes.map(node=>node.dataset.requestId));
  assert.deepEqual(originalIds,await page.evaluate(()=>adminRequests.map(x=>x.id)));
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'request');
  await page.locator('#adminList .admin-request[data-request-id="DEMO-005"]').tap();
  assert.equal(await page.locator('#adminList .admin-request[data-request-id="DEMO-005"]').getAttribute('aria-current'),'true');
  await page.locator('#adminSortOrder').selectOption('pickup');
  const displayed=await page.locator('#adminList .admin-request').evaluateAll(nodes=>nodes.map(node=>node.dataset.requestId));
  const sorted=await page.evaluate(()=>[...adminRequests].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id)).map(x=>x.id));
  assert.deepEqual(displayed,sorted);
  assert.equal(await page.locator('#adminList .admin-request[data-request-id="DEMO-005"]').getAttribute('aria-current'),'true');
  assert.equal(await page.locator('#adminFilterSummary').innerText(),'전체 요청 · 5건 표시 / 전체 5건 · 가상 데이터');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initial,'sort may not mutate saved booking order');
  console.log('PASS G3-34 '+label+' ascending pickup date sort, selected request and original data preserved');

  await page.locator('.admin-filter[data-filter="pending"]').tap();
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'pickup');
  const visible=await page.locator('#adminList .admin-request').evaluateAll(nodes=>nodes.map(node=>node.dataset.requestId));
  const expected=await page.evaluate(()=>adminRequests.filter(x=>x.status==='pending').sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id)).map(x=>x.id));
  assert.deepEqual(visible,expected);
  assert.equal(await page.locator('#adminFilterSummary').innerText(),'입금 전 · 3건 표시 / 전체 5건 · 가상 데이터');
  await page.locator('#adminShowAll').tap();
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'pickup','filter reset should not reset sort');
  assert.equal(await page.locator('#adminList .admin-request').count(),5);
  await page.locator('#adminSortOrder').selectOption('request');
  const restored=await page.locator('#adminList .admin-request').evaluateAll(nodes=>nodes.map(node=>node.dataset.requestId));
  assert.deepEqual(restored,originalIds);
  await axePass(page,label+' admin');
  console.log('PASS G3-34 '+label+' filter and show-all maintain sort; returning to original order; axe zero');

  await page.locator('#adminReset').tap();
  assert.equal(await page.locator('#adminSortOrder').inputValue(),'request');
  assert.equal(await page.locator('#adminList .admin-request').count(),4);
  assert.equal(await page.locator('#adminList .admin-request').first().getAttribute('data-request-id'),'DEMO-001');
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,JSON.stringify({width,overflow}));
  }
  assert.deepEqual(errors,[]);
  const footer=await page.locator('footer').innerText();
  const version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=34,'G3-34 or newer static demo footer required: '+footer);
  console.log('PASS G3-34 '+label+' admin reset restores original sort, 320/390px layout and no JS errors');
  await ctx.close();
 }finally{await browser.close()}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{
  await check(chromium,'Chromium',base);
  await check(webkit,'WebKit',base);
  console.log('G3-34 Chromium+WebKit PASS 12 groups; no physical iPhone Instagram test');
 }finally{server.close()}
}
main().catch(err=>{console.error('FAIL G3-34 '+(err.stack||err));server.close();process.exitCode=1});
