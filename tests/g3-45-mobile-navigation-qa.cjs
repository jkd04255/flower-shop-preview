'use strict';
/* G3-45: two clear home mobile navigation routes, no horizontal overflow,
   tappable return controls, preservation of desktop navigation and SPA routes.
   Chromium + Linux WebKit emulate 320/360/390/700/768/1280 CSS px. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const types={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 let p;
 try{
  const u=new URL(req.url,'http://localhost');
  p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,b)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});res.end(b);
 });
});
const navSelector='#home>.hero .nav>nav a';
async function navigationGeometry(page){
 return page.evaluate(selector=>{
  const nav=document.querySelector('#home>.hero .nav');
  const brand=nav.querySelector('.brand').getBoundingClientRect();
  const links=[...document.querySelectorAll(selector)].map(el=>{
   const r=el.getBoundingClientRect(),style=getComputedStyle(el);
   return {text:el.textContent.trim(),href:el.getAttribute('href'),display:style.display,
    width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,
    visible:style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0};
  });
  const heroCopy=document.querySelector('#home>.hero .heroText').getBoundingClientRect();
  const header=nav.getBoundingClientRect();
  return {links,brand:{left:brand.left,right:brand.right,top:brand.top,bottom:brand.bottom},
   header:{left:header.left,right:header.right,top:header.top,bottom:header.bottom},
   heroCopy:{top:heroCopy.top,bottom:heroCopy.bottom},
   overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
   viewport:innerWidth,hasLabel:nav.querySelector('nav').getAttribute('aria-label')};
 },navSelector);
}
async function check(engine,name,url){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  for(const width of [320,360,390,700,768,1280]){
   await page.setViewportSize({width,height:width===320?568:900});
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const m=await navigationGeometry(page);
   assert.equal(m.hasLabel,'쇼윈도 주요 메뉴',name+' nav should be labeled');
   assert.deepEqual(m.links.map(a=>a.text),['오늘의 꽃','최근 입고','매장 안내','예약 조회']);
   assert.ok(m.overflow<=2,name+' home horizontal overflow at '+width+'px '+JSON.stringify(m));
   assert.ok(m.header.right<=width+2,name+' header fits viewport '+width+'px');
   if(width<=700){
    assert.deepEqual(m.links.map(a=>a.visible),[true,false,false,true],name+' mobile exposes direct journeys at '+width);
    for(const a of [m.links[0],m.links[3]]){
     assert.ok(a.height>=43&&a.width>=50&&a.left>=0&&a.right<=width+1,
       name+' mobile link not tappable at '+width+'px '+JSON.stringify(a));
    }
    assert.ok(m.brand.right<=m.links[0].left+1,name+' brand and actions overlap at '+width+'px '+JSON.stringify(m));
    assert.ok(m.header.bottom<m.heroCopy.top-4,name+' navigation overlays hero heading at '+width+'px '+JSON.stringify(m));
   } else {
    assert.ok(m.links.every(a=>a.visible),name+' preserve four desktop nav links at '+width);
   }
   assert.equal(await page.locator('.heroText .call').innerText(),'오늘의 꽃 만나기 ↗');
   console.log('PASS G3-45 '+name+' home '+width+'px: navigation visible, collision-free, no overflow');
  }
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('#home>.hero .nav>nav a[href="#curation"]').click();
   await page.waitForFunction(()=>location.hash==='#curation'&&scrollY>100);
   assert.equal(await page.locator('#home').isVisible(),true,name+' flower-section link preserves homepage');
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('#home>.hero .nav>nav a[href="#/booking-status"]').click();
   await page.locator('#customerStatus').waitFor({state:'visible'});
   assert.equal(await page.locator('#home').isVisible(),false,name+' route hides home while looking up booking');
   const returnStatus=page.locator('#customerStatus .cs-nav>a[href="#store"]');
   assert.ok((await returnStatus.boundingBox()).height>=43,name+' status back navigation tappable');
   await returnStatus.click();
   await page.locator('#home').waitFor({state:'visible'});
   assert.equal(new URL(page.url()).hash,'#store',name+' returns to approved store section');
   await page.goto(url+'#/flower/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.locator('#detail').waitFor({state:'visible'});
   const returnDetail=page.locator('#detail .detailNav>a[href="#curation"]');
   assert.ok((await returnDetail.boundingBox()).height>=43,name+' detail back navigation tappable');
   await returnDetail.click();
   await page.locator('#home').waitFor({state:'visible'});
   await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.locator('#reservation').waitFor({state:'visible'});
   assert.ok((await page.locator('#rBack').boundingBox()).height>=43,name+' reserve back navigation tappable');
   console.log('PASS G3-45 '+name+' '+width+'px: click flower, status, detail, reservation and return');
  }
  const footer=await page.locator('footer').innerText();
  const version=footer.match(new RegExp('G3-([0-9]+) STATIC DEMO'));
  assert.ok(version&&Number(version[1])>=45,'G3-45 or later static-demo footer required');
  assert.equal(await page.locator('script').count(),3,'existing three scripts retained');
  assert.deepEqual(errors,[],name+' JavaScript runtime errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);console.log('PASS G3-45 responsive mobile navigation');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-45 '+(e.stack||e));server.close();process.exitCode=1;});
