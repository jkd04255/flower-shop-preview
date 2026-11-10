'use strict';
/**
 * G3-21 real Chromium visual/reflow QA on the synthetic static prototype only.
 * 640 / 320 CSS px approximate reflow at 200% / 400% from 1280 CSS px.
 * Not a native OS/browser zoom test; no phone or screen-reader claims.
 */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core'),{PNG}=require('pngjs');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const issues=[],records=[];function issue(label,detail){issues.push({label,detail});console.log('ISSUE '+label+' '+JSON.stringify(detail).slice(0,900))}
function ok(label,detail){records.push({label,detail});console.log('PASS '+label+' '+JSON.stringify(detail).slice(0,220))}
const server=http.createServer((req,res)=>{
 let name;try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);name=path.resolve(root,'.'+(p==='/'?'/index.html':p))}catch{res.writeHead(400);res.end();return}
 if(!name.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(name,(e,b)=>{if(e){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream'});res.end(b)});
});
const rgbLum=(r,g,b)=>{const c=[r,g,b].map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
async function route(page,hash,selector){
 await page.evaluate(h=>location.hash=h,hash);
 await page.locator(selector).first().waitFor({state:'visible',timeout:10000});
}
async function reflow(page,label,width,hash,selector){
 await page.setViewportSize({width,height:900});
 await route(page,hash,selector);
 const stats=await page.evaluate(()=>{
  const documentWidth=document.documentElement.scrollWidth,viewport=document.documentElement.clientWidth;
  const escaped=[...document.querySelectorAll('a,button,input,select,summary')].filter(n=>{
   const r=n.getBoundingClientRect(),s=getComputedStyle(n);
   if(!(r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&r.right>innerWidth+2))return false;
   /* A control deliberately clipped inside a bounded, independently
      scrollable filter rail is not a page-wide reflow failure.
      Keep failing for all other escaped controls and document overflow. */
   const rail=n.closest('#adminDemo .admin-filters');
   if(rail){
    const b=rail.getBoundingClientRect(),scroll=getComputedStyle(rail);
    if(scroll.overflowX==='auto'&&rail.scrollWidth>rail.clientWidth&&
       b.left>=-2&&b.right<=innerWidth+2)return false;
   }
   return true;
  }).slice(0,6).map(n=>({el:n.id||n.className||n.tagName,right:Math.round(n.getBoundingClientRect().right),text:n.innerText?.slice(0,42)}));
  return {documentWidth,viewport,overflow:documentWidth-viewport,escaped};
 });
 if(stats.overflow>2||stats.escaped.length)issue('reflow '+label+' '+width,stats);else ok('reflow '+label+' '+width,stats);
}
async function focus(page,label,start,expected){
 await page.locator(start).first().focus();
 await page.keyboard.press('Tab');
 const state=await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return {id:e.id,tag:e.tagName,outlineStyle:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth),outlineColor:s.outlineColor,visible:e.matches(':focus-visible'),connected:e.isConnected}});
 if(expected&&state.id!==expected)issue('tab-target '+label,state);
 else if(!state.visible||state.outlineStyle==='none'||state.outlineWidth<2)issue('focus-ring '+label,state);
 else ok('focus-ring '+label,state);
}
async function heroPhoto(page,width){
 await page.setViewportSize({width,height:900});
 await route(page,'#top','#home>.hero .heroText');
 await page.evaluate(()=>scrollTo(0,0));
 await page.evaluate(()=>document.documentElement.classList.add('hero-peek-immediate'));
 await page.waitForTimeout(400); // avoid collecting mismatched pixels while the hero-peek layout settles
 await page.locator('#home>.hero').evaluate(async el=>{
  const bg=getComputedStyle(el).backgroundImage;
  const u=bg.match(/url\(["']?([^"')]+)/);
  if(!u)throw Error('hero background not found');
  const im=new Image();im.src=u[1];await im.decode();
 });
 const selector=['#home>.hero .nav .brand','#home>.hero .heroText .micro','#home>.hero .heroText h1','#home>.hero .heroText p','#home>.hero .heroText .call'];
 const boxes=await page.evaluate(selectors=>selectors.map(sel=>{
  const el=document.querySelector(sel);if(!el)return{sel,missing:true};
  const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{sel,x:r.x,y:r.y,w:r.width,h:r.height,font:parseFloat(s.fontSize),weight:s.fontWeight};
 }),selector);
 const visible=PNG.sync.read(await page.screenshot({animations:'disabled'}));
 const handle=await page.addStyleTag({content:'#home>.hero .heroText,#home>.hero .nav{visibility:hidden!important}'});
 const hidden=PNG.sync.read(await page.screenshot({animations:'disabled'}));
 await handle.evaluate(el=>el.remove());
 const sample=[];
 for(const box of boxes){
  if(box.missing){issue('photo missing text',box);continue}
  let contrasts=[];
  for(let y=Math.max(0,Math.floor(box.y));y<Math.min(visible.height,Math.ceil(box.y+box.h));y+=2){
   for(let x=Math.max(0,Math.floor(box.x));x<Math.min(visible.width,Math.ceil(box.x+box.w));x+=2){
    const i=(y*visible.width+x)*4;
    const r=visible.data,g=hidden.data;
    const d=(Math.abs(r[i]-g[i])+Math.abs(r[i+1]-g[i+1])+Math.abs(r[i+2]-g[i+2]));
    if(d<55)continue; // actual painted white glyphs, not unrelated light pixels
    const l=rgbLum(g[i],g[i+1],g[i+2]);
    contrasts.push(1.05/(l+.05));
   }
  }
  contrasts.sort((a,b)=>a-b);
  const min=contrasts[0]||0,lower10=contrasts[Math.floor(contrasts.length*.1)]||0;
  const threshold=box.sel.includes(' h1')||box.sel.endsWith(' .brand')&&box.font>=24?3:4.5;
  const v={selector:box.sel,width,font:box.font,x:Math.round(box.x),y:Math.round(box.y),w:Math.round(box.w),h:Math.round(box.h),samples:contrasts.length,min:+min.toFixed(2),lower10:+lower10.toFixed(2),threshold};
  sample.push(v);
  if(contrasts.length<20)issue('photo samples insufficient',v);
  else if(lower10<threshold)issue('photo contrast '+width,v);
  else ok('photo contrast '+width,v);
 }
 records.push({label:'photo-sampling-'+width,detail:sample});
}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Seoul',reducedMotion:'reduce',deviceScaleFactor:1});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await heroPhoto(page,1280);
  await heroPhoto(page,390);
  for(const width of [640,320]){
   await reflow(page,'home',width,'#top','#home>.hero');
   await reflow(page,'reservation',width,'#/reserve/rosy-moment','#reserveForm');
   await page.locator('#reserveForm button[type="submit"]').click();
   await reflow(page,'form-error',width,'#/reserve/rosy-moment','#rError');
   await reflow(page,'admin',width,'#/admin-demo','#adminList .admin-request');
   await reflow(page,'calendar-month',width,'#/calendar-demo','#calMonthView');
   const day=page.locator('#calGrid .cal-day[aria-label$="예약 0건"]').first();
   if(await day.count())await day.click();else issue('empty day absent '+width,{});
   await reflow(page,'calendar-day',width,'#/calendar-demo','#calDetails');
   if(await page.locator('#calDetails').isVisible())await page.locator('#calBackMonth').click();
   await focus(page,'calendar-next-'+width,'#calPrev','calNext');
   await route(page,'#/admin-demo','#adminList .admin-request');
   await focus(page,'admin-reset-'+width,'#adminDemo .admin-calendar-link','adminReset');
   await route(page,'#/reserve/rosy-moment','#reserveForm');
   await focus(page,'reserve-date-'+width,'#rBack','rDate'); // may first focus another control: observed state recorded
  }
  if(errors.length)issue('runtime page errors',errors);
  fs.mkdirSync('qa-artifacts',{recursive:true});
  fs.writeFileSync('qa-artifacts/g3-21-visual-zoom-focus.json',JSON.stringify({description:'Chromium viewport reflow equivalence; photo pixel contrast sampled behind actual glyphs',issues,records},null,2));
  console.log('G3-21 Chromium QA: '+records.length+' passing observations, '+issues.length+' problems.');
  if(issues.length&&process.env.G321_DISCOVERY!=='1')throw Error('G3-21 visual/reflow/focus QA '+issues.length+' problems; see artifact.');
  if(issues.length)console.log('DISCOVERY ONLY: issues found; NOT a quality pass.');
  else console.log('G3-21 Chromium visual/reflow/focus PASS. Device zoom and screen readers not tested.');
  await ctx.close();
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(e=>{console.error('FAIL '+(e.stack||e));server.close();process.exitCode=1});
