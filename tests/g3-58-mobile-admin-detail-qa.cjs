'use strict';
/* G3-58: mobile administrator detail information hierarchy (synthetic only).
 * Chromium/Linux WebKit tests are not actual iPhone Safari/Instagram WebView QA.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 let full;
 try{const u=new URL(req.url,'http://localhost');full=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname))}
 catch{res.writeHead(400);res.end();return}
 if(!full.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(full,(err,bytes)=>{if(err){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream'});res.end(bytes)});
});
async function verify(engine,label,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/admin-demo',{waitUntil:'domcontentloaded'});
  const detail=page.locator('#adminDetail'),cards=page.locator('#adminList .admin-request');
  await cards.first().waitFor({state:'visible'});
  const original=await page.evaluate(()=>JSON.stringify(adminRequests));
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.equal(await cards.count(),4,'initial four synthetic requests');

  for(const width of [320,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const m=await page.evaluate(()=>{
    const root=document.querySelector('#adminDetail'),
      rows=[...root.querySelectorAll('dl>div')],
      rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,width:r.width,height:r.height,bottom:r.bottom}},
      font=e=>parseFloat(getComputedStyle(e).fontSize),
      actions=[...root.querySelectorAll('.admin-action')],
      labels=rows.map(r=>r.querySelector('dt')?.textContent),
      values=rows.map(r=>r.querySelector('dd')?.textContent),
      date=rows[2]?.querySelector('dd'),time=rows[3]?.querySelector('dd'),
      jump=root.querySelector('.admin-calendar-day-jump');
    return{
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      detail:rect(root),padding:parseFloat(getComputedStyle(root).paddingLeft),
      rows:rows.map(rect),columns:rows.map(r=>getComputedStyle(r).gridTemplateColumns),
      labels,values,dateFont:date?font(date):0,timeFont:time?font(time):0,
      dateWeight:date?getComputedStyle(date).fontWeight:'',
      dateValue:date?.textContent,timeValue:time?.textContent,
      actionCount:actions.length,actionHeights:actions.map(e=>rect(e).height),
      actionDisabled:actions.map(e=>e.disabled),actionLabels:actions.map(e=>e.textContent),
      jumpHeight:jump?rect(jump).height:null,heading:root.querySelector('h3')?.textContent
    };
   });
   assert.ok(m.overflow<=2,label+' '+width+'px no document horizontal overflow');
   assert.equal(m.labels.length,8,label+' original eight detail rows');
   assert.deepEqual(m.labels,['가상 번호','가상 예약자','픽업 날짜','픽업 시간','상품 금액','입금 상태','유입','상태'],label+' fields unchanged');
   assert.ok(m.values.every(Boolean),label+' all synthetic values still visible');
   assert.match(m.dateValue,/^\d{4}-\d\d-\d\d$/,label+' pickup date data unchanged');
   assert.match(m.timeValue,/^\d\d:\d\d$/,label+' pickup time data unchanged');
   assert.equal(m.actionCount,2,label+' same two action buttons');
   assert.ok(m.detail.x>=-2&&m.detail.right<=width+2,label+' panel inside viewport');
   if(width<=600){
    assert.ok(m.padding>=17&&m.padding<=19,label+' '+width+'px compact side panel padding');
    assert.ok(m.dateFont>=16&&m.timeFont>=16,label+' '+width+'px emphasized pickup values');
    assert.ok(Number(m.dateWeight)>=650,label+' '+width+'px pickup weight');
    assert.ok(m.actionHeights.every(x=>x>=48),label+' '+width+'px admin controls >=48px');
    assert.ok(m.jumpHeight===null||m.jumpHeight>=44,label+' '+width+'px calendar shortcut >=44px');
    assert.ok(m.rows.every(r=>r.x>=m.detail.x&&r.right<=m.detail.right+2),label+' '+width+'px detail rows in panel');
   }else{
    assert.ok(m.padding>=22,label+' '+width+'px untouched tablet/desktop padding');
    assert.ok(m.dateFont<=14,label+' '+width+'px original desktop date font');
   }
   console.log('PASS G3-58 '+label+' '+width+'px detail layout and unchanged data/controls');
  }
  await page.setViewportSize({width:390,height:844});
  const first=cards.first(),second=cards.nth(1),secondId=await second.getAttribute('data-request-id');
  await second.click();
  assert.equal(await page.locator('#adminList .admin-request[aria-current="true"]').getAttribute('data-request-id'),secondId,label+' selected card retained');
  const displayedId=await detail.locator('dl>div').first().locator('dd').innerText();
  assert.equal(displayedId,secondId,label+' detail follows selected request');
  const request=await page.evaluate(id=>adminRequests.find(r=>r.id===id),secondId);
  assert.equal(await detail.locator('dl>div').nth(2).locator('dd').innerText(),request.date);
  assert.equal(await detail.locator('dl>div').nth(3).locator('dd').innerText(),request.time);
  const actions=detail.locator('.admin-action');
  assert.equal(await actions.count(),2);
  const prior=await page.evaluate(()=>JSON.stringify(adminRequests));
  assert.equal(prior,original,label+' selection is read-only');
  await page.locator('.admin-filter[data-filter="pending"]').click();
  await page.locator('#adminShowAll').click();
  assert.equal(await cards.count(),4,label+' filter reset preserved');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),original,label+' record state unmodified');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),storage,label+' storage unmodified');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],label+' WCAG 2.1 AA violations');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-58-admin-detail-'+label.toLowerCase()+'-390.png',fullPage:true});
  const footer=await page.locator('footer').innerText(),version=footer.match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=58,label+' G3-58 or later demo footer');
  assert.deepEqual(errors,[],label+' JavaScript runtime errors');
  console.log('PASS G3-58 '+label+' selection, filter, axe, synthetic data');
  await ctx.close();
 }finally{await browser.close()}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);console.log('PASS G3-58 browsers/axe; no real iPhone Safari verification')}
 finally{server.close()}
}
main().catch(e=>{console.error('FAIL G3-58 '+(e.stack||e));server.close();process.exitCode=1});
