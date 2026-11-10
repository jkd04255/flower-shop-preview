'use strict';
/* G3-42: Safari-like early touch scrolling must not move the hero underneath
   the user's finger. This is a Linux WebKit approximation, not device Safari. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 let file;
 try{
  const url=new URL(req.url,'http://localhost');
  file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 }catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,content)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
  res.end(content);
 });
});
async function snapshot(page){
 return page.evaluate(()=>{
  const hero=document.querySelector('#home>.hero');
  const root=document.documentElement;
  return {height:hero.getBoundingClientRect().height,curationTop:document.getElementById('curation').getBoundingClientRect().top,
   y:window.scrollY,peek:root.classList.contains('hero-peek-visible'),
   shown:document.querySelectorAll('#home .reveal-copy .motion-line.is-shown').length,hash:location.hash};
 });
}
async function scrollWithoutSmooth(page,y=270){
 await page.evaluate(target=>{
  const root=document.documentElement,old=root.style.scrollBehavior;
  root.style.scrollBehavior='auto';
  window.scrollTo(0,target);
  root.style.scrollBehavior=old;
 },y);
 await page.waitForFunction(()=>window.scrollY>100);
}
function sameHeight(a,b,label){
 assert.ok(Math.abs(a.height-b.height)<3,label+' hero height must not change: '+JSON.stringify({a,b}));
}
async function check(engine,name,base){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const before=await snapshot(page);
  assert.equal(before.peek,false,name+' should not auto-peek before the text appears');
  /* Real pointer/touch intent, then scroll while copy is still hidden. */
  await page.touchscreen.tap(180,285);
  await scrollWithoutSmooth(page);
  const afterSwipe=await snapshot(page);
  sameHeight(before,afterSwipe,name+' early swipe');
  assert.equal(afterSwipe.peek,false,name+' early swipe must not instant-collapse hero');
  await page.waitForTimeout(4900);
  const afterTimer=await snapshot(page);
  sameHeight(before,afterTimer,name+' after original delayed peek deadline');
  assert.equal(afterTimer.peek,false,name+' delayed peek must be cancelled for scrolling visitor');
  assert.equal(afterTimer.shown,2,name+' preserve both staggered hero lines');
  assert.ok(afterTimer.y>100,name+' scroll position must not reset spontaneously');
  console.log('PASS G3-42 '+name+' early swipe preserves hero height, scroll and copy');

  /* Actual reload: top restoration still works; once a visitor swipes,
     subsequent pageshow/late WebKit reset guards must not fight the gesture. */
  await page.reload({waitUntil:'domcontentloaded'});
  await page.touchscreen.tap(180,285);
  await scrollWithoutSmooth(page);
  await page.waitForTimeout(420);
  const afterReloadSwipe=await snapshot(page);
  assert.ok(afterReloadSwipe.y>100,name+' reload early swipe must survive delayed reset: '+JSON.stringify(afterReloadSwipe));
  assert.equal(afterReloadSwipe.peek,false);
  console.log('PASS G3-42 '+name+' G3-41 reload guard yields to user input');

  /* A visitor who waits should still see the approved gentle section peek. */
  const idle=await context.newPage();
  idle.on('pageerror',e=>errors.push(e.message));
  await idle.goto(base,{waitUntil:'domcontentloaded'});
  const idleBefore=await snapshot(idle);
  await idle.waitForTimeout(5050);
  const idleAfter=await snapshot(idle);
  assert.equal(idleAfter.peek,true,name+' idle visitor should retain hero peek');
  assert.ok(idleAfter.height < idleBefore.height-80,name+' idle hero should expose the next section');
  assert.equal(idleAfter.shown,2);
  console.log('PASS G3-42 '+name+' idle reveal remains after copy');

  /* CTA to flowers must still navigate without any layout-changing peek. */
  const cta=await context.newPage();
  cta.on('pageerror',e=>errors.push(e.message));
  await cta.goto(base,{waitUntil:'domcontentloaded'});
  const ctaBefore=await snapshot(cta);
  await cta.locator('.heroText .call[href="#curation"]').tap();
  await cta.waitForFunction(()=>location.hash==='#curation'&&window.scrollY>100);
  const ctaAfter=await snapshot(cta);
  sameHeight(ctaBefore,ctaAfter,name+' CTA jump');
  assert.equal(ctaAfter.peek,false,name+' CTA should not collapse hero mid-navigation');
  await cta.waitForTimeout(250);
  assert.equal((await snapshot(cta)).peek,false);
  console.log('PASS G3-42 '+name+' CTA navigation without hero jump');

  const reduced=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const reducedPage=await reduced.newPage();
  await reducedPage.goto(base,{waitUntil:'domcontentloaded'});
  await reducedPage.waitForTimeout(200);
  const reducedState=await snapshot(reducedPage);
  assert.equal(reducedState.peek,false,name+' reduced motion avoids forced hero resize');
  assert.equal(await reducedPage.locator('#home .reveal-copy').isVisible(),true);
  await reduced.close();
  assert.deepEqual(errors,[],name+' JS errors');
  await context.close();
  console.log('PASS G3-42 '+name+' reduced motion and no JS errors');
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',base);await check(webkit,'WebKit',base);console.log('PASS G3-42 all tests; physical iOS Safari not verified');}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-42 '+(err.stack||err));server.close();process.exitCode=1;});
