'use strict';
/* G3-68: readable mobile booking progress without changing sequential state or reservations.
   Linux WebKit is not physical iPhone Safari or Instagram WebView. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let file;try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function check(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  const initial=await page.evaluate(()=>({bookings:JSON.stringify(adminRequests),storage:JSON.stringify(localStorage)}));
  const names=['input','review','result'];
  const labels=['정보 입력','최종 확인','요청 완료 (가상)'];
  async function verifyStages(expected){
   const steps=await page.locator('#reserveProgress li').evaluateAll(els=>els.map(el=>({
    key:el.dataset.reservationStep,current:el.getAttribute('aria-current'),
    active:el.classList.contains('is-current'),done:el.classList.contains('is-complete'),
    label:el.innerText.trim().replace(/\s+/g,' ')
   })));
   assert.deepEqual(steps.map(s=>s.key),names,label+' original stage identifiers and order');
   assert.deepEqual(steps.map(s=>s.label),labels,label+' all original Korean step names');
   assert.equal(steps.filter(s=>s.current==='step').length,1,label+' one aria-current step');
   assert.equal(steps.find(s=>s.current==='step').key,expected,label+' active stage '+expected);
   assert.deepEqual(steps.map(s=>s.done),names.map(x=>names.indexOf(x)<names.indexOf(expected)),label+' completed-state logic unchanged');
   return steps;
  }
  await verifyStages('input');
  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const m=await page.evaluate(()=>{
    const group=document.querySelector('#reserveProgress ol'),els=[...group.querySelectorAll('li')];
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const css=e=>getComputedStyle(e);
    return{
     overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     group:rect(group),columns:css(group).gridTemplateColumns.split(' ').length,
     steps:els.map(el=>({
      rect:rect(el),font:parseFloat(css(el).fontSize),lineHeight:parseFloat(css(el).lineHeight),
      topBorder:parseFloat(css(el).borderTopWidth),
      numberFont:parseFloat(css(el.querySelector('.step-number')).fontSize),
      smallFont:parseFloat(css(el.querySelector('small')||el.querySelector('span:last-child')).fontSize),
      whiteSpace:css(el.querySelector('small')||el.querySelector('span:last-child')).whiteSpace
     }))
    };
   });
   assert.ok(m.overflow<=2,label+' '+width+'px document horizontal overflow '+m.overflow);
   assert.equal(m.columns,3,label+' '+width+'px original three-step grid');
   assert.ok(m.steps.every(s=>s.rect.left>=m.group.left-2&&s.rect.right<=m.group.right+2),label+' '+width+'px every step fits grid');
   assert.ok(m.steps.every(s=>s.topBorder>=2),label+' '+width+'px original sequence rules visible');
   if(width<=600){
    assert.ok(m.steps.every(s=>s.font>=12&&s.numberFont>=11),label+' '+width+'px restored mobile typography');
    assert.ok(m.steps[2].smallFont>=11,label+' '+width+'px virtual-completion marker readable');
    assert.ok(m.steps.every(s=>s.lineHeight>=19),label+' '+width+'px readable line spacing');
    assert.equal(m.steps[2].whiteSpace,'normal',label+' '+width+'px small marker can wrap');
   }else{
    assert.ok(m.steps.every(s=>s.font===12&&s.numberFont===11),label+' '+width+'px original tablet/desktop type scale');
    assert.equal(m.steps[2].smallFont,10,label+' '+width+'px original desktop small marker');
   }
   console.log('PASS G3-68 '+label+' '+width+'px progress, spacing, 3 columns and no overflow');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#reserveForm button[type=submit]').click();
  await verifyStages('input');
  assert.equal(await page.locator('#reserveReview').isVisible(),false,label+' invalid input does not advance');
  const slot=await page.evaluate(()=>{
   const now=new Date();now.setHours(12,0,0,0);
   for(let i=3;i<14;i++){const d=new Date(now);d.setDate(d.getDate()+i);
    const date=localDateString(d),slots=pickupSlots(0,date);
    if(slots.length)return {date,time:slots[0]};}
   return null;
  });
  assert.ok(slot&&slot.date&&slot.time,label+' sample future pickup available');
  await page.locator('#rDate').fill(slot.date);
  await page.locator('#rTime').selectOption(slot.time);
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  await page.locator('#reserveForm button[type=submit]').click();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  await verifyStages('review');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initial.bookings,label+' review does not create booking');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initial.storage,label+' review does not save data');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' axe WCAG2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-68-mobile-booking-progress-'+label.toLowerCase()+'-390.png',fullPage:true});
  await page.locator('#rReviewEdit').click();
  await verifyStages('input');
  assert.equal(await page.locator('#rName').inputValue(),'가상 고객',label+' edit preserves draft without saving');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initial.bookings,label+' no synthetic bookings written');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initial.storage,label+' no persistent PII');
  const ver=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(ver&&Number(ver[1])>=68,label+' updated G3-68 footer');
  assert.deepEqual(errors,[],label+' no page JS errors');
  console.log('PASS G3-68 '+label+' steps, invalid/review/edit navigation, accessibility and synthetic-only');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-68 Chromium/WebKit/axe; physical iPhone Safari/Instagram WebView NOT tested');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-68 '+(e.stack||e));server.close();process.exitCode=1;});
