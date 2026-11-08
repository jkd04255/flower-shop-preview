'use strict';
/**
 * G3-22 real Chrome CDP page-scale (pinch compositor), 2x text stress,
 * focus visibility/obstruction at 320px. Local synthetic HTML, no real data.
 * Chrome CDP page-scale != desktop browser menu zoom/OS zoom.
 * Text-only stress explicitly simulated via computed font sizes; != user font prefs.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=process.cwd(),discover=process.env.G322_DISCOVERY==='1';
const issues=[],checks=[];
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let file;try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);file=path.resolve(root,'.'+(p==='/'?'/index.html':p))}catch{res.writeHead(400);res.end();return}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(b)});
});
function record(label,observation,pass=true){const r={label,...observation};(pass?checks:issues).push(r);console.log((pass?'PASS ':'ISSUE ')+label+' '+JSON.stringify(observation).slice(0,500))}
async function route(page,hash,selector){
 await page.evaluate(h=>location.hash=h,hash);
 await page.locator(selector).first().waitFor({state:'visible',timeout:12000});
}
async function checkFocus(page,label,start,expected){
 await page.locator(start).first().focus();
 await page.keyboard.press('Tab');
 const info=await page.evaluate(()=>{
  const e=document.activeElement,style=getComputedStyle(e),r=e.getBoundingClientRect(),v=visualViewport;
  const x=Math.max(0,Math.min(r.right,v.offsetLeft+v.width)-Math.max(r.left,v.offsetLeft));
  const y=Math.max(0,Math.min(r.bottom,v.offsetTop+v.height)-Math.max(r.top,v.offsetTop));
  return {id:e.id,tag:e.tagName,focusVisible:e.matches(':focus-visible'),outlineStyle:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth),outlineColor:style.outlineColor,
   intersectX:+x.toFixed(1),intersectY:+y.toFixed(1),elementWidth:+r.width.toFixed(1),elementHeight:+r.height.toFixed(1),
   scale:+v.scale.toFixed(2),visualWidth:+v.width.toFixed(1),visualHeight:+v.height.toFixed(1),isConnected:e.isConnected};
 });
 const success=info.id===expected&&info.focusVisible&&info.outlineStyle!=='none'&&info.outlineWidth>=2&&info.intersectX>1&&info.intersectY>1&&info.isConnected;
 record(label,info,success);
}
async function scale(page,cdp,factor,label,hash,visible,start,expected){
 await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:factor});
 await route(page,hash,visible);
 const m=await page.evaluate(()=>({scale:visualViewport.scale,width:visualViewport.width,height:visualViewport.height,documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
 record('CDP native compositor page-scale '+label+' '+factor,m,Math.abs(m.scale-factor)<.08);
 await checkFocus(page,'focus '+label+' page-scale '+factor,start,expected);
}
async function textStress(page,label,hash,visible,selector){
 await cdpReset(page);
 await route(page,hash,visible);
 const baseline=await page.evaluate(sel=>{
  const nodes=[...document.querySelectorAll(sel)].filter(e=>{
   const r=e.getBoundingClientRect();return r.width>0&&r.height>0;
  });
  const entries=nodes.map(e=>({el:e,size:parseFloat(getComputedStyle(e).fontSize)}));
  entries.forEach(({el,size})=>el.style.setProperty('font-size',size*2+'px','important'));
  return {count:entries.length,orig:entries.slice(0,3).map(x=>x.size)};
 },selector);
 const m=await page.evaluate(sel=>{
  const nodes=[...document.querySelectorAll(sel)].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});
  const clipped=nodes.filter(n=>n.scrollWidth>n.clientWidth+3&&getComputedStyle(n).overflowX==='hidden').map(n=>({id:n.id,txt:n.textContent?.slice(0,32),scroll:n.scrollWidth,client:n.clientWidth})).slice(0,5);
  return {count:nodes.length,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,clipped};
 },selector);
 record('2x text-only stress '+label,{baseline,...m},baseline.count>0&&m.overflow<=2&&m.clipped.length===0);
 await page.evaluate(sel=>[...document.querySelectorAll(sel)].forEach(n=>n.style.removeProperty('font-size')),selector);
}
async function cdpReset(page){await page.context().newCDPSession(page).then(s=>s.send('Emulation.setPageScaleFactor',{pageScaleFactor:1}).then(()=>s.detach()))}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const ctx=await browser.newContext({viewport:{width:320,height:900},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  const cdp=await ctx.newCDPSession(page);
  for(const factor of [1,2,4]){
   await scale(page,cdp,factor,'calendar', '#/calendar-demo','#calMonthView','#calPrev','calNext');
   await scale(page,cdp,factor,'admin','#/admin-demo','#adminList','#adminDemo .admin-calendar-link','adminReset');
   await scale(page,cdp,factor,'reservation','#/reserve/rosy-moment','#reserveForm','#rBack','rDate');
  }
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
  await textStress(page,'calendar','#/calendar-demo','#calMonthView','#calendarDemo .cal-tools button,#calendarDemo .cal-month-switcher button,#calendarDemo .cal-status-filters button');
  await textStress(page,'admin','#/admin-demo','#adminList','#adminDemo .admin-reset,#adminDemo .admin-filter,#adminDemo .admin-calendar-link');
  await textStress(page,'reservation','#/reserve/rosy-moment','#reserveForm','#reserveForm label,#reserveForm button,#reservation .reserve-nav a');
  await route(page,'#/calendar-demo','#calMonthView');
  const day=page.locator('#calGrid .cal-day[aria-label$="예약 0건"]').first();
  if(await day.count()){await day.click();await page.locator('#calDetails').waitFor({state:'visible'});await textStress(page,'calendar-day','#/calendar-demo','#calDetails','#calendarDemo .cal-day-tools button,#calendarDemo .cal-back-month,#calendarDemo .cal-status-filters button')}
  else record('calendar day available',{count:0},false);
  if(errors.length)record('app JS errors',{errors},false);
  fs.mkdirSync('qa-artifacts',{recursive:true});
  fs.writeFileSync('qa-artifacts/g3-22-native-scale-text-focus.json',JSON.stringify({method:'CDP Emulation.setPageScaleFactor; simulated 2x computed text font; Chromium 320 CSS px',issues,checks},null,2));
  console.log('G3-22 Chrome '+checks.length+' PASS observations; '+issues.length+' issues.');
  if(issues.length&&!discover)throw Error('G3-22 strict page-scale/text/focus violations: '+issues.length);
  if(issues.length)console.log('G3-22 DISCOVERY only: issues detected, NOT PASS.');
  else console.log('G3-22 strict Chromium page-scale/text/focus PASS; not desktop menu zoom, OS text settings, iOS/Android or screen reader.');
  await cdp.detach();await ctx.close();
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(e=>{console.error('FAIL '+(e.stack||e));server.close();process.exitCode=1;});
