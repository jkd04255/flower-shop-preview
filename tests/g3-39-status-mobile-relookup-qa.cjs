'use strict';
/** G3-39: mobile full-width photo and readable details, relookup and stale result removal.
 * Both Chromium and Linux WebKit. NOT real iPhone Instagram WebView.
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
 fs.readFile(filename,(err,bytes)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(bytes);});
});
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],where+' axe A/AA');
}
async function check(engine,name,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/booking-status',{waitUntil:'domcontentloaded'});
  await page.locator('#customerStatus').waitFor({state:'visible'});
  const again=page.locator('#csLookupAgain'),cards=page.locator('#csResults .cs-card'),lookup=page.locator('#csLast4');
  assert.equal(await again.isHidden(),true);
  assert.equal(await cards.count(),0);
  await lookup.fill('1002');
  await page.locator('#csSubmit').tap();
  assert.equal(await cards.count(),1);
  assert.equal(await again.isVisible(),true);
  assert.match(await cards.first().innerText(),/입금 전/);
  assert.match(await cards.first().innerText(),/000-0000-0000/);
  await axePass(page,name+' lookup result');
  console.log('PASS G3-39 '+name+' pending card, bank example and accessible relookup control');

  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const geometry=await page.evaluate(()=>{
    const card=document.querySelector('#csResults .cs-card');
    const photo=card.querySelector('.cs-photo').getBoundingClientRect();
    const details=card.querySelector('.cs-detail-list').getBoundingClientRect();
    const cells=[...card.querySelectorAll('.cs-detail-list > div')].map(e=>e.getBoundingClientRect());
    const steps=[...card.querySelectorAll('.cs-steps li')].map(e=>e.getBoundingClientRect());
    return{overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      photo:{left:photo.left,right:photo.right,top:photo.top,bottom:photo.bottom,width:photo.width},
      details:{left:details.left,right:details.right,top:details.top,bottom:details.bottom},
      cells:cells.map(r=>({left:r.left,top:r.top,right:r.right})),
      steps:steps.map(r=>({top:r.top,left:r.left}))};
   });
   assert.ok(geometry.overflow<=2,name+' width='+width+' overflow '+JSON.stringify(geometry));
   assert.ok(geometry.photo.bottom<=geometry.details.top+2,'photo must be above wider details: '+JSON.stringify(geometry));
   assert.ok(geometry.photo.width>width-90,'full mobile photo width must be readable: '+JSON.stringify(geometry));
   assert.ok(geometry.cells[1].left>geometry.cells[0].left+20,'mobile date and bouquet details use two columns');
   assert.ok(geometry.steps[1].left>geometry.steps[0].left,'mobile status step grid has two columns');
   assert.ok(Math.abs(geometry.steps[1].top-geometry.steps[0].top)<4,'first two status steps share top row');
   assert.ok(geometry.steps[2].top>geometry.steps[0].top+8,'third step wraps to next row');
  }
  const inputFont=await lookup.evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize));
  assert.ok(inputFont>=16,'mobile search input must not invite iOS focus zoom');
  const saveBefore=await page.evaluate(()=>JSON.stringify(localStorage));
  console.log('PASS G3-39 '+name+' 320/390 responsive grid: full-width photo, two-column details/steps, readable input');

  await again.tap();
  assert.equal(await cards.count(),0,'relookup clears prior card');
  assert.equal(await again.isHidden(),true,'relookup control hides when there is no card');
  assert.equal(await lookup.inputValue(),'');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'csLast4','relookup returns focus to 4-digit field');
  assert.match(await page.locator('#csStatusMessage').innerText(),/4자리를 입력/);
  await lookup.fill('1003');
  await page.keyboard.press('Enter');
  assert.equal(await cards.count(),1);
  assert.match(await cards.first().innerText(),/예약 확정/);
  assert.equal(await again.isVisible(),true);
  console.log('PASS G3-39 '+name+' relookup returns focus and shows new sample status without old result');

  await lookup.fill('12');
  await page.locator('#csSubmit').tap();
  assert.equal(await cards.count(),0,'invalid code must clear previously displayed customer card');
  assert.equal(await again.isHidden(),true);
  assert.match(await page.locator('#csStatusMessage').innerText(),/숫자 4자리를 입력/);
  await lookup.fill('9999');
  await page.locator('#csSubmit').tap();
  assert.equal(await cards.count(),0);
  assert.equal(await again.isHidden(),true);
  assert.match(await page.locator('#csStatusMessage').innerText(),/일치하는 가상 예약이 없습니다/);
  await axePass(page,name+' no results');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),saveBefore,'relookup and invalid searches never mutate persisted synthetic bookings');
  assert.ok(!page.url().includes('9999'),'never place demo lookup code in URL');
  console.log('PASS G3-39 '+name+' invalid/missing IDs clear stale results; accessibility and storage preserved');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#customerStatus').waitFor({state:'visible'});
  assert.equal(await cards.count(),0);
  assert.equal(await again.isHidden(),true);
  await page.setViewportSize({width:820,height:900});
  await lookup.fill('1001');
  await page.locator('#csSubmit').tap();
  assert.match(await cards.first().innerText(),/입금 확인 대기/);
  const desktop=await page.evaluate(()=>{
   const card=document.querySelector('#csResults .cs-card');
   const photo=card.querySelector('.cs-photo').getBoundingClientRect(),details=card.querySelector('.cs-detail-list').getBoundingClientRect();
   return{photoRight:photo.right,detailLeft:details.left};
  });
  assert.ok(desktop.photoRight<desktop.detailLeft,'desktop original photo-side layout must remain');
  assert.deepEqual(errors,[]);
  assert.match(await page.locator('footer').innerText(),/G3-39 STATIC DEMO/);
  console.log('PASS G3-39 '+name+' desktop layout, reload privacy and no JS errors');
  await context.close();
 }finally{await browser.close();}
}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);console.log('G3-39 BOTH engines PASS; actual iPhone Instagram browser unverified');}
 finally{server.close();}
}
run().catch(e=>{console.error('FAIL G3-39 '+(e.stack||e));server.close();process.exitCode=1;});
