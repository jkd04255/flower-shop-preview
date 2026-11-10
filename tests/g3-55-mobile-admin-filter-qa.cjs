'use strict';
/* G3-55: six existing admin status filters as one horizontally scrollable row.
 * Chromium + Linux WebKit are automated approximations, not actual iPhone Safari.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.css':'text/css'};
const server=http.createServer((req,res)=>{
 let p;try{const u=new URL(req.url,'http://localhost');p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(e,data)=>{if(e){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});res.end(data);});
});
async function check(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#adminDemo .admin-filters').waitFor({state:'visible'});
  const initialBookings=await page.evaluate(()=>JSON.stringify(adminRequests));
  const initialStorage=await page.evaluate(()=>JSON.stringify(localStorage));
  const buttons=page.locator('#adminDemo .admin-filter');
  assert.equal(await buttons.count(),6,'all six filters must remain present');
  assert.deepEqual(await buttons.evaluateAll(all=>all.map(el=>el.dataset.filter)),['all','pending','confirmed','ready','completed','rejected']);
  assert.equal(await page.locator('#adminList .admin-request').count(),4,'synthetic entries remain visible');
  assert.match(await page.locator('#adminDemo .admin-intro').innerText(),/실제 은행 거래 내역 확인/);

  for(const width of [320,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const view=await page.evaluate(()=>{
    const rail=document.querySelector('#adminDemo .admin-filters');
    const buttons=[...rail.querySelectorAll('.admin-filter')];
    const rects=buttons.map(el=>el.getBoundingClientRect());
    const style=getComputedStyle(rail);
    return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     wrap:style.flexWrap,overflowX:style.overflowX,scrollWidth:rail.scrollWidth,clientWidth:rail.clientWidth,
     buttonHeights:rects.map(r=>r.height),buttonTops:rects.map(r=>r.top),
     buttonWidths:rects.map(r=>r.width),count:buttons.length};
   });
   assert.ok(view.overflow<=2,label+' '+width+'px page-wide horizontal overflow '+view.overflow);
   assert.equal(view.count,6);
   if(width<=600){
    assert.equal(view.wrap,'nowrap',label+' '+width+'px one-row rail');
    assert.equal(view.overflowX,'auto',label+' '+width+'px independently scrollable');
    assert.ok(view.buttonHeights.every(n=>n>=44),label+' '+width+'px touch target height '+JSON.stringify(view.buttonHeights));
    assert.ok(view.buttonWidths.every(n=>n>=40),label+' '+width+'px labels still usable');
    assert.ok(view.buttonTops.every(n=>Math.abs(n-view.buttonTops[0])<2),label+' '+width+'px all filters share one row');
    if(width<=390)assert.ok(view.scrollWidth>view.clientWidth+15,label+' '+width+'px offscreen filters in scroll rail');
   }else{
    assert.equal(view.wrap,'wrap',label+' '+width+'px desktop original filter layout');
    assert.equal(view.overflowX,'visible',label+' '+width+'px desktop no forced scroll rail');
   }
   console.log('PASS G3-55 '+label+' '+width+'px filter layout, six options and zero page overflow');
  }
  await page.setViewportSize({width:320,height:900});
  const rejected=page.locator('#adminDemo .admin-filter[data-filter="rejected"]');
  await rejected.click();
  assert.equal(await rejected.getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#adminFilterSummary').innerText(),/거절/);
  const scrollLeft=await page.locator('#adminDemo .admin-filters').evaluate(el=>el.scrollLeft);
  assert.ok(scrollLeft>0,label+' last visible by scrolling rail');
  const state=await buttons.evaluateAll(all=>all.filter(el=>el.getAttribute('aria-pressed')==='true').map(el=>el.dataset.filter));
  assert.deepEqual(state,['rejected'],'only one selected filter');
  await page.locator('#adminDemo .admin-filter[data-filter="all"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#adminDemo .admin-filter[data-filter="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#adminList .admin-request').count(),4,'keyboard activation restores all requests');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initialBookings,'pure filtering never updates records');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initialStorage,'filtering never writes contact/payment storage');
  console.log('PASS G3-55 '+label+' scroll to last state, pressed semantics, keyboard reset and unchanged synthetic records');

  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],label+' 390px axe 2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-55-admin-filters-'+label.toLowerCase()+'-390.png',fullPage:true});
  const footer=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(footer&&Number(footer[1])>=55,'G3-55 or later static-demo footer required');
  assert.deepEqual(errors,[],label+' browser page errors');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-55 Chromium/WebKit/axe; physical iPhone and Instagram webview unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-55 '+(e.stack||e));server.close();process.exitCode=1;});
