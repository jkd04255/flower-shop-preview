'use strict';
/* G3-25: Small product-card wayfinding copy, homepage only.
   Live customers/bookings/actual payments are explicitly out of scope. */
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=process.cwd(),results=[];
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let file;
 try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);file=path.resolve(root,'.'+(p==='/'?'/index.html':p))}
 catch{res.writeHead(400);res.end();return}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
function pass(label){results.push(label);console.log('PASS G3-25 '+label)}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port+'/';
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#featured .card').first().waitFor({state:'visible'});
  assert.equal((await page.locator('#home>.hero .call').innerText()).trim(),'오늘의 꽃 만나기 ↗');
  assert.equal(await page.locator('#home>.hero .call').getAttribute('href'),'#curation');
  pass('approved hero CTA exact Korean copy, link destination and layout unchanged');
  assert.match(await page.locator('#curation .head p').innerText(),/추천 꽃다발.*사진을 눌러 상품 보기/);
  assert.match(await page.locator('#arrivals .head p').innerText(),/입고된 꽃 소식.*문의 전용/);
  assert.match(await page.locator('#arrivals .head p').innerText(),/예약 상품이 아니며/);
  assert.equal(await page.locator('#arrivalList .arrival').count(),3);
  assert.equal(await page.locator('#arrivalList .arrival a').count(),0);
  pass('recommended bouquets are distinguished from three inquiry-only arrivals');
  assert.equal(await page.locator('#featured .card').count(),3);
  assert.equal(await page.locator('#regular .card').count(),2);
  const cards=await page.locator('#home .cards a.card').evaluateAll(links=>links.map(el=>({
   href:el.getAttribute('href'),
   label:el.querySelector('.card-detail-link')?.textContent.trim(),
   nestedButton:!!el.querySelector('button'),
   images:el.querySelectorAll('img').length,
   details:el.querySelectorAll('.card-detail-link').length
  })));
  assert.equal(cards.length,5);
  for(const c of cards){
   assert.match(c.href,/^#\/flower\/[a-z-]+$/);
   assert.equal(c.label,'상품 상세 보기 ↗');
   assert.equal(c.images,1);
   assert.equal(c.details,1);
   assert.equal(c.nestedButton,false);
  }
  pass('all five product cards show a small detail-link cue inside existing single anchor');
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});
   const data=await page.evaluate(()=>{
    const els=[...document.querySelectorAll('#home .cards .card-detail-link')];
    return {
     overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     items:els.map(el=>{
      const r=el.getBoundingClientRect(),p=el.closest('.card').getBoundingClientRect();
      return{font:parseFloat(getComputedStyle(el).fontSize),visible:r.width>0&&r.height>0,
       x:r.left,within:r.right<=p.right+2,decorated:getComputedStyle(el).borderBottomStyle!=='none'};
     })
    };
   });
   assert.ok(data.overflow<=2,'horizontal page overflow at '+width+': '+data.overflow);
   assert.equal(data.items.length,5);
   assert.ok(data.items.every(x=>x.font>=12&&x.visible&&x.within&&x.decorated),JSON.stringify(data));
   pass(width+'px: product detail labels visible, underlined, at least 12px, no horizontal overflow');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#featured a.card').first().click();
  await page.locator('#detail').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).hash,'#/flower/rosy-moment');
  assert.equal((await page.locator('#dTitle').innerText()).trim(),'로지 모먼트');
  pass('clicking the complete bouquet card opens the original flower detail page');
  await page.locator('#detail .detailNav a[href="#curation"]').click();
  await page.locator('#featured .card').first().waitFor({state:'visible'});
  await page.locator('#regular a.card').first().click();
  await page.locator('#detail').waitFor({state:'visible'});
  assert.equal(new URL(page.url()).hash,'#/flower/ivory-day');
  pass('existing secondary bouquet cards still navigate to product details');
  await page.evaluate(()=>location.hash='#curation');
  await page.locator('#featured .card').first().waitFor({state:'visible'});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const axe=await page.evaluate(()=>window.axe.run(document,{
   runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},
   rules:{'color-contrast':{enabled:true}},resultTypes:['violations']
  }));
  assert.deepEqual(axe.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],'home axe WCAG findings');
  pass('real Chromium 390px axe-core WCAG A/AA homepage: zero automated violations');
  assert.deepEqual(errors,[],'browser JS exceptions');
  pass('no JavaScript runtime exceptions');
  await ctx.close();
  console.log('G3-25 REAL CHROMIUM PRODUCT UX QA PASS: '+results.length+' checks');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(e=>{console.error('FAIL '+(e.stack||e));server.close();process.exitCode=1});
