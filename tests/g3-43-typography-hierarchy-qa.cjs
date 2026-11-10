'use strict';
/* G3-43: Korean-first typographic hierarchy without changes to the demo flows.
   Chromium and Linux WebKit cover 320/390px mobile and 1280px desktop. */
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
  res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});res.end(b);
 });
});
async function measure(page,selectors){
 return page.evaluate(selectors=>{
  const props={};
  for(const sel of selectors){
   const el=document.querySelector(sel);
   if(!el){props[sel]={exists:false};continue;}
   const style=getComputedStyle(el),r=el.getBoundingClientRect();
   props[sel]={exists:true,text:el.textContent.trim(),font:Number.parseFloat(style.fontSize),
    family:style.fontFamily,weight:Number.parseInt(style.fontWeight,10),lineHeight:Number.parseFloat(style.lineHeight),
    width:r.width,height:r.height,visible:r.width>0&&r.height>0&&style.display!=='none'};
  }
  props.overflow=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  return props;
 },selectors);
}
function minFont(o,sel,n,label){
 assert.ok(o[sel]?.exists&&o[sel].visible,label+' missing '+sel+' '+JSON.stringify(o[sel]));
 assert.ok(o[sel].font>=n,label+' too small '+sel+' '+JSON.stringify(o[sel]));
}
async function check(engine,name,base){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(base,{waitUntil:'domcontentloaded'});
   const o=await measure(page,[
    '#home>.hero h1','#home>.hero .heroText .call','#home .head h2',
    '#home .head .section-heading-en','#home .head .section-heading-ko',
    '#home .head p','#home .card .row strong','#home .card .row>span'
   ]);
   assert.ok(o.overflow<=2,name+' home horizontal overflow '+width+': '+o.overflow);
   minFont(o,'#home .head .section-heading-ko',34,name+' '+width);
   minFont(o,'#home .head p',14,name+' '+width);
   minFont(o,'#home .card .row strong',17,name+' '+width);
   minFont(o,'#home .card .row>span',15,name+' '+width);
   assert.ok(o['#home .head .section-heading-en'].font<o['#home .head .section-heading-ko'].font/2,
     name+' English should be subtle eyebrow '+width);
   assert.match(o['#home>.hero h1'].family,/Pretendard/,name+' hero keeps original Pretendard');
   assert.ok(o['#home .head h2'].text.includes('오늘의 꽃'),name+' Korean should lead heading');
   assert.match(await page.locator('.heroText .call').innerText(),/오늘의 꽃 만나기 ↗/);
   const allHeadings=await page.locator('#home .head .section-heading-ko').allTextContents();
   assert.deepEqual(allHeadings,['오늘의 꽃','새로 들어온 꽃','매일의 꽃다발','매장 안내']);
   console.log('PASS G3-43 '+name+' home '+width+'px: Korean hierarchy, fonts and no overflow');

   const screens=[
    ['#/flower/rosy-moment','#detail','#detail .detailCopy h1','#detail .detailCopy #dStory',15],
    ['#/reserve/rosy-moment','#reservation','#reservation .reserve-head h1','#reservation .booking-form .form-hint',14],
    ['#/booking-status','#customerStatus','#customerStatus h1','#customerStatus .cs-desc',15],
    ['#/admin-demo','#adminDemo','#adminDemo h1','#adminDemo .admin-intro',14],
    ['#/calendar-demo','#calendarDemo','#calendarDemo h1','#calendarDemo .calendar-description',14]
   ];
   for(const [hash,screen,title,description,bodySize] of screens){
    await page.goto(base+hash,{waitUntil:'domcontentloaded'});
    await page.locator(screen).waitFor({state:'visible'});
    const data=await measure(page,[title,description]);
    assert.ok(data.overflow<=2,name+' '+hash+' '+width+'px horizontal overflow '+data.overflow);
    minFont(data,title,32,name+' '+hash+' '+width);
    minFont(data,description,bodySize,name+' '+hash+' '+width);
   }
   console.log('PASS G3-43 '+name+' detail, reservation, status, admin and calendar '+width+'px');
  }
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const scripts=await page.locator('script').count();
  assert.equal(scripts,3,'keep original three inline scripts for legacy regression gate');
  const footerVersion=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(footerVersion&&Number(footerVersion[1])>=43,'G3-43 or later demo footer required');
  assert.deepEqual(errors,[],name+' JS runtime errors');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',base);await check(webkit,'WebKit',base);console.log('PASS G3-43 all browser typography checks');}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-43 '+(err.stack||err));server.close();process.exitCode=1;});
