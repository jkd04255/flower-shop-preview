'use strict';
/* G3-41: Home reload starts at the hero. Normal user taps and SPA deep links survive.
   Both Chromium and Linux WebKit; actual iPhone Instagram browser remains unverified. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg+xml':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let filename;
 try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);filename=path.resolve(root,'.'+(p==='/'?'/index.html':p));}
 catch{res.writeHead(400);res.end();return;}
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filename,(err,b)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(b);});
});
async function axePass(page,description){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],description+' axe WCAG2.1 A/AA');
}
async function scrollState(page){
 return page.evaluate(()=>({
  y:window.scrollY,hash:location.hash,home:document.getElementById('home').style.display,
  heroTop:document.querySelector('#home .hero').getBoundingClientRect().top,
  navigation:performance.getEntriesByType('navigation')[0]?.type
 }));
}
async function reloadTop(page,description){
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(450);
 const s=await scrollState(page);
 assert.ok(s.y<=4,description+' should show hero at top after reload: '+JSON.stringify(s));
 assert.ok(s.heroTop>=-15&&s.heroTop<130,description+' hero should be visible: '+JSON.stringify(s));
 assert.equal(s.home,'block');
 assert.equal(s.navigation,'reload','must exercise actual browser reload');
 return s;
}
async function check(engine,name,base){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#home').waitFor({state:'visible'});
  assert.equal((await scrollState(page)).hash,'');
  await page.evaluate(()=>{
   const html=document.documentElement,old=html.style.scrollBehavior;
   html.style.scrollBehavior='auto';
   window.scrollTo(0,document.getElementById('curation').offsetTop);
   html.style.scrollBehavior=old;
  });
  await page.waitForFunction(()=>window.scrollY>180);
  const plain=await reloadTop(page,name+' no-hash scroll');
  assert.equal(plain.hash,'');
  console.log('PASS G3-41 '+name+' no-hash reload resets home scroll');

  const call=page.locator('.heroText .call[href="#curation"]');
  await call.tap();
  await page.waitForFunction(()=>location.hash==='#curation'&&window.scrollY>180);
  const anchor=await reloadTop(page,name+' #curation');
  assert.equal(anchor.hash,'#top');
  await call.tap();
  await page.waitForFunction(()=>location.hash==='#curation'&&window.scrollY>180);
  console.log('PASS G3-41 '+name+' #curation reload to top but intentional CTA scroll still works');

  for(const section of ['arrivals','other','store']){
   await page.evaluate(target=>{
    const html=document.documentElement,old=html.style.scrollBehavior;
    html.style.scrollBehavior='auto';
    location.hash='#'+target;
    window.scrollTo(0,document.getElementById(target).offsetTop);
    html.style.scrollBehavior=old;
   },section);
   await page.waitForFunction(target=>location.hash==='#'+target&&window.scrollY>180,section);
   const state=await reloadTop(page,name+' #'+section);
   assert.equal(state.hash,'#top');
  }
  console.log('PASS G3-41 '+name+' other home-section hash reloads start at hero');

  for(const [hash,selector] of [
   ['#/flower/rosy-moment','#detail'],
   ['#/reserve/rosy-moment','#reservation'],
   ['#/booking-status','#customerStatus'],
   ['#/admin-demo','#adminDemo'],
   ['#/calendar-demo','#calendarDemo']
  ]){
   await page.goto(base+hash,{waitUntil:'domcontentloaded'});
   await page.locator(selector).waitFor({state:'visible'});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator(selector).waitFor({state:'visible'});
   assert.equal((await scrollState(page)).hash,hash,'deep-link route must not be rewritten');
  }
  console.log('PASS G3-41 '+name+' product, reservation, status, admin and calendar reload preserve routes');

  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#home').waitFor({state:'visible'});
  await axePass(page,name+' homepage');
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,'no overflow at '+width+': '+overflow);
  }
  const footerVersion=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(footerVersion&&Number(footerVersion[1])>=41,'G3-41 or newer demo footer expected');
  assert.match(await call.innerText(),/오늘의 꽃 만나기/);
  assert.deepEqual(errors,[]);
  await ctx.close();
  console.log('PASS G3-41 '+name+' axe, mobile width, hero copy, no page errors');
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',base);await check(webkit,'WebKit',base);console.log('PASS G3-41 all checks; no physical iPhone test');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-41 '+(e.stack||e));server.close();process.exitCode=1;});
