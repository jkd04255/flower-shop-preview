'use strict';
/* G3-56 — mobile admin search + sorting information hierarchy.
 * Validate existing synthetic behavior, 320–1280px layouts and accessibility.
 * Linux WebKit is not a physical iPhone Safari or Instagram WebView test.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.css':'text/css'};
const server=http.createServer((req,res)=>{
 let file;try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(b);});
});
const near=(a,b,eps=2)=>Math.abs(a-b)<=eps;
async function check(engine,name,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/admin-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#adminList .admin-request').first().waitFor({state:'visible'});
  const initialRecords=await page.evaluate(()=>JSON.stringify(adminRequests));
  const initialStorage=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.equal(await page.locator('#adminList .admin-request').count(),4,'existing demo cards');
  assert.equal(await page.locator('#adminDemo .admin-filter').count(),6,'six status buttons unchanged');
  for(const width of [320,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const m=await page.evaluate(()=>{
    const get=q=>document.querySelector(q);
    const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};
    const feedback=get('#adminDemo .admin-filter-feedback'),summary=get('#adminFilterSummary'),
     search=get('#adminDemo .admin-id-search'),input=get('#adminRequestSearch'),
     hint=get('#adminRequestSearchHint'),sort=get('#adminDemo .admin-sort-label'),
     select=get('#adminSortOrder'),rail=get('#adminDemo .admin-filters');
    return {pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     fbDisplay:getComputedStyle(feedback).display,
     summary:rect(summary),search:rect(search),input:rect(input),hint:rect(hint),
     sort:rect(sort),select:rect(select),fontInput:parseFloat(getComputedStyle(input).fontSize),
     fontSelect:parseFloat(getComputedStyle(select).fontSize),searchMax:getComputedStyle(search).maxWidth,
     railWrap:getComputedStyle(rail).flexWrap,railScroll:rail.scrollWidth-rail.clientWidth};
   });
   assert.ok(m.pageOverflow<=2,name+' '+width+'px document overflow: '+m.pageOverflow);
   if(width<=600){
    assert.equal(m.fbDisplay,'grid',name+' stacked search controls '+width);
    assert.ok(m.input.height>=54,name+' large touch-friendly search '+width);
    assert.ok(m.select.height>=48,name+' touch-friendly sort '+width);
    assert.ok(m.fontInput>=16,name+' iOS search zoom-safe font '+width);
    assert.ok(m.fontSelect>=15,name+' readable mobile sort '+width);
    assert.ok(m.input.width>width-75,name+' wide search input '+width+' '+m.input.width);
    assert.ok(near(m.input.left,m.search.left)&&near(m.input.right,m.search.right),name+' full-width field '+width);
    assert.ok(m.summary.bottom<=m.search.top+2,name+' count above search '+width);
    assert.ok(m.search.bottom<=m.sort.top+2,name+' sort below search '+width);
    assert.equal(m.railWrap,'nowrap',name+' G3-55 status rail unchanged '+width);
   }else{
    assert.equal(m.fbDisplay,'flex',name+' desktop original toolbar '+width);
    assert.ok(m.search.width<=201,name+' desktop search stays compact '+width);
    assert.equal(m.railWrap,'wrap',name+' desktop filters unchanged '+width);
   }
   console.log('PASS G3-56 '+name+' '+width+'px search hierarchy, filter rail, no overflow');
  }
  await page.setViewportSize({width:390,height:844});
  const input=page.locator('#adminRequestSearch'),clear=page.locator('#adminSearchClear'),sort=page.locator('#adminSortOrder');
  await input.fill('DEMO-001');
  assert.equal(await page.locator('#adminList .admin-request').count(),1,name+' exact synthetic ID query');
  assert.match(await page.locator('#adminFilterSummary').innerText(),/1건 표시/);
  assert.equal(await clear.isVisible(),true,name+' clear action appears only for input');
  const clearHeight=await clear.evaluate(e=>e.getBoundingClientRect().height);
  assert.ok(clearHeight>=44,name+' mobile clear target min 44px: '+clearHeight);
  await clear.click();
  assert.equal(await input.inputValue(),'');
  assert.equal(await page.locator('#adminList .admin-request').count(),4,name+' clear restores unfiltered requests');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'adminRequestSearch',name+' clear restores search focus');
  await sort.selectOption('pickup-desc');
  assert.equal(await sort.inputValue(),'pickup-desc');
  const sorted=await page.locator('#adminList .admin-request').evaluateAll(nodes=>nodes.map(e=>e.dataset.requestId));
  const expected=await page.evaluate(()=>[...adminRequests].sort((a,b)=>-(a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id))).map(e=>e.id));
  assert.deepEqual(sorted,expected,name+' latest pickup sort unchanged');
  await page.locator('.admin-filter[data-filter="pending"]').click();
  assert.equal(await page.locator('.admin-filter[data-filter="pending"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#adminFilterSummary').innerText(),/입금 전/);
  assert.equal(await page.locator('#adminShowAll').isVisible(),true,name+' reset action available');
  await page.locator('#adminShowAll').click();
  assert.equal(await page.locator('.admin-filter[data-filter="all"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#adminList .admin-request').count(),4,name+' all status reset preserves sort');
  assert.equal(await sort.inputValue(),'pickup-desc');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initialRecords,name+' read-only query and sort');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initialStorage,name+' no synthetic storage writes');
  console.log('PASS G3-56 '+name+' search, clear focus, sort and filter flows intact');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(accessibility.violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)})),[],name+' axe 2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-56-admin-search-'+name.toLowerCase()+'-390.png',fullPage:true});
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=56,name+' G3-56 or later footer');
  assert.deepEqual(errors,[],name+' javascript errors');
  console.log('PASS G3-56 '+name+' axe WCAG2.1 AA and synthetic-only contract');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-56 all engines and axe; physical Safari/Instagram still unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-56 '+(e.stack||e));server.close();process.exitCode=1;});
