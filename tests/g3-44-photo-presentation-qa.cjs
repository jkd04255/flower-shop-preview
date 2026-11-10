'use strict';
/* G3-44: photo presentation (unchanged source images), responsive geometry and
   basic product/reservation/lookup behavior in Chromium + Linux WebKit. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const types={'.html':'text/html;charset=utf-8','.js':'application/javascript','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 let p;
 try{
  const url=new URL(req.url,'http://localhost');
  p=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,buffer)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});res.end(buffer);
 });
});
async function geometry(page,selector){
 return page.locator(selector).evaluateAll(els=>els.map(e=>{
  const r=e.getBoundingClientRect(),s=getComputedStyle(e);
  return {
   src:e.getAttribute('src'),
   w:r.width,h:r.height,
   fit:s.objectFit,position:s.objectPosition,filter:s.filter,
   naturalWidth:e.naturalWidth||0,naturalHeight:e.naturalHeight||0,
   display:s.display,ratio:r.width&&r.height?r.width/r.height:0
  };
 }));
}
function near(actual,target,tolerance=0.045){
 return Math.abs(actual-target)<=tolerance;
}
async function verify(engine,name,url){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const context=await browser.newContext({
   viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
   timezoneId:'Asia/Seoul',reducedMotion:'reduce'
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>[...document.querySelectorAll('#featured .card img')].every(x=>x.complete&&x.naturalWidth>0));
   const featured=await geometry(page,'#featured .card img');
   const regular=await geometry(page,'#regular .card img');
   const arrivals=await geometry(page,'#arrivalList .arrival img');
   assert.equal(featured.length,3,name+' featured image count');
   assert.equal(regular.length,2,name+' regular image count');
   assert.equal(arrivals.length,3,name+' arrivals count');
   assert.deepEqual(featured.map(p=>p.src),[
    './assets/rosy-moment.webp','./assets/mellow-sunday.webp','./assets/purple-letter.webp'
   ],'original local product assets must be preserved');
   for(const p of [...featured,...regular]){
    assert.ok(p.w>0&&p.h>0&&near(p.ratio,4/5),name+' bouquet 4:5 ratio '+width+': '+JSON.stringify(p));
    assert.equal(p.fit,'cover','photo must be cropped rather than distorted');
    assert.ok(/saturate\(0\.96\)/.test(p.filter),'photo saturation should be gently restored: '+p.filter);
   }
   for(const p of arrivals){
    assert.ok(p.w>0&&p.h>0&&near(p.ratio,1),name+' arrival square thumbnail '+width+': '+JSON.stringify(p));
    assert.equal(p.fit,'cover');
    assert.ok(Math.abs(p.w-(width<=700?86:112))<=1,name+' thumbnail dimension '+width+': '+p.w);
   }
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=2,name+' home horizontal overflow '+width+'px: '+overflow);
   assert.equal(await page.locator('.heroText .call').innerText(),'오늘의 꽃 만나기 ↗');
   console.log('PASS G3-44 '+name+' '+width+'px: original local photos, consistent crops, thumbnails, no overflow');

   await page.goto(url+'#/flower/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.locator('#detail').waitFor({state:'visible'});
   const detail=(await geometry(page,'#detail .detailBody>img'))[0];
   assert.ok(detail.naturalWidth>0&&detail.naturalHeight>0,name+' original detail photo loads');
   assert.equal(detail.fit,'cover');
   assert.match(detail.src,/assets\/rosy-moment\.webp$/);
   if(width<=700)assert.ok(detail.h>=385&&detail.h<=555,name+' mobile detail photo not oversized: '+JSON.stringify(detail));

   await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.locator('#reservation').waitFor({state:'visible'});
   const reserve=(await geometry(page,'#reservation .reserve-product img'))[0];
   assert.ok(reserve.naturalWidth>0&&reserve.naturalHeight>0,name+' original reservation photo loads');
   assert.equal(reserve.fit,'cover');
   assert.match(reserve.src,/assets\/rosy-moment\.webp$/);
   console.log('PASS G3-44 '+name+' '+width+'px: detail and reservation same photo, cover cropping');
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(url+'#/booking-status',{waitUntil:'domcontentloaded'});
  await page.locator('#customerStatus').waitFor({state:'visible'});
  await page.locator('#csLast4').fill('1001');
  await page.locator('#csSubmit').click();
  await page.locator('#customerStatus .cs-photo').first().waitFor({state:'visible'});
  const status=(await geometry(page,'#customerStatus .cs-photo'))[0];
  assert.ok(status.w>180&&near(status.ratio,4/3),name+' mobile lookup photo shows more of the full bouquet '+JSON.stringify(status));
  assert.equal(status.fit,'cover');
  const statusOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(statusOverflow<=2,name+' customer lookup overflow '+statusOverflow);
  assert.equal(await page.locator('script').count(),3,'legacy three-inline-script contract');
  assert.match(await page.locator('footer').innerText(),/G3-44 STATIC DEMO/);
  assert.deepEqual(errors,[],name+' JS runtime errors');
  console.log('PASS G3-44 '+name+' lookup 390px: larger bouquet preview, no overflow or JS errors');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);console.log('PASS G3-44 all browser photo checks');}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-44 '+(err.stack||err));server.close();process.exitCode=1;});
