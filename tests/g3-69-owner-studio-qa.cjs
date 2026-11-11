'use strict';
/* G3-69 — actual same-origin customer preview next to owner content editor.
 * Strictly demo-only: no login, backend, public posting or stored owner photos.
 * Linux WebKit does not replace physical iPhone Safari or Instagram WebView.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let file;try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lksAAAAASUVORK5CYII=','base64');
function productNames(frame,section){return frame.locator('#'+section+' .card strong').allInnerTexts();}
async function verify(engine,label,url){
 const args=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...args});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'owner-studio.html',{waitUntil:'domcontentloaded'});
  const preview=page.frameLocator('#ownerPreview');
  await page.waitForFunction(()=>document.getElementById('ownerFeatured').querySelectorAll('.os-product').length===3);
  await preview.locator('#home .hero .brand strong').waitFor({state:'visible'});
  assert.equal(await preview.locator('#home .hero .brand strong').innerText(),'오후의 정원',label+' actual customer baseline');
  assert.equal(await page.locator('#ownerFeatured .os-product').count(),3,label+' initial featured cards');
  assert.equal(await page.locator('#ownerRegular .os-product').count(),2,label+' initial regular cards');
  assert.deepEqual(await productNames(preview,'featured'),['로지 모먼트','멜로우 선데이','퍼플 레터'],label+' actual customer cards prepopulated');
  assert.equal(await preview.locator('#regular .card').count(),2,label+' existing regular cards retained');
  assert.equal(await preview.locator('#home .hero .call').innerText(),'오늘의 꽃 만나기 ↗',label+' protected hero CTA');

  for(const width of [1440,1280,1080,780,390,320]){
   await page.setViewportSize({width,height:900});
   const metrics=await page.evaluate(()=>{
    const root=document.getElementById('ownerStudio'),workspace=root.querySelector('.os-workspace'),
     left=root.querySelector('.os-controls'),right=root.querySelector('.os-preview-panel'),
     frame=root.querySelector('#ownerPreview');
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const display=getComputedStyle(workspace).gridTemplateColumns.split(' ').length;
    return{overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     left:rect(left),right:rect(right),frame:rect(frame),columns:display};
   });
   assert.ok(metrics.overflow<=2,label+' '+width+'px no horizontal overflow '+metrics.overflow);
   if(width>=831){
    assert.equal(metrics.columns,2,label+' '+width+'px desktop split columns');
    assert.ok(metrics.left.right<=metrics.right.left+2,label+' '+width+'px editing left, customer preview right');
    assert.ok(metrics.frame.width>=390,label+' '+width+'px real customer preview usable');
   }else{
    assert.equal(metrics.columns,1,label+' '+width+'px responsive single column');
    assert.ok(metrics.right.top>=metrics.left.bottom-1,label+' '+width+'px preview follows editor vertically');
    assert.ok(metrics.frame.right<=width+2,label+' '+width+'px mobile preview stays on screen');
   }
   console.log('PASS G3-69 '+label+' '+width+'px workspace responsiveness');
  }
  await page.setViewportSize({width:1440,height:900});
  const originalStored=await page.evaluate(()=>JSON.stringify(localStorage));
  await page.locator('#ownerBusinessName').fill('해질녘 꽃집');
  await page.locator('#ownerAddress').fill('경기도 수원시 가상로 12');
  await page.locator('#ownerPhone').fill('031-555-1234');
  await page.locator('#ownerHours').fill('화–일 10:00–19:00');
  await page.locator('#ownerPickup').fill('방문 픽업 우선 · 가상 예약');
  await page.waitForFunction(()=>{
   const f=document.querySelector('#ownerPreview')?.contentDocument;
   return f?.querySelector('#home .hero .brand strong')?.textContent==='해질녘 꽃집';
  });
  assert.equal(await preview.locator('#home .hero .brand strong').innerText(),'해질녘 꽃집',label+' owner business name live');
  const cells=preview.locator('#home #store table tr td:last-child');
  assert.deepEqual(await cells.allInnerTexts(),[
   '경기도 수원시 가상로 12','화–일 10:00–19:00','031-555-1234','방문 픽업 우선 · 가상 예약'
  ],label+' address/contact/hours/pickup all live in real customer store section');
  assert.equal(await preview.locator('.foot b').innerText(),'해질녘 꽃집',label+' footer brand preview');

  await page.locator('#ownerHeroUpload').setInputFiles({name:'hero.png',mimeType:'image/png',buffer:PNG});
  await page.waitForFunction(()=>document.getElementById('ownerHeroThumb').src.startsWith('data:image/png;base64,'));
  await page.waitForFunction(()=>{
   const child=document.getElementById('ownerPreview')?.contentDocument;
   return child&&child.querySelector('#home>.hero').style.backgroundImage.includes('data:image/png;base64,');
  });
  assert.ok((await preview.locator('#home>.hero').evaluate(el=>el.style.backgroundImage)).includes('linear-gradient(90deg'),label+' original hero scrim stays');
  const originalHero=await page.locator('#ownerHeroThumb').getAttribute('src');
  await page.locator('#ownerHeroUpload').setInputFiles({name:'payload.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')});
  assert.match(await page.locator('#ownerStatus').innerText(),/3MB 이하 JPG/);
  assert.equal(await page.locator('#ownerHeroThumb').getAttribute('src'),originalHero,label+' reject unsafe SVG without preview mutation');

  await page.locator('#os-item-rosy-moment-input-name').fill('새로운 로지');
  await page.locator('#os-item-rosy-moment-input-price').fill('12345');
  await page.waitForFunction(()=>{
   const f=document.querySelector('#ownerPreview')?.contentDocument;
   return f?.querySelector('#featured .card strong')?.textContent==='새로운 로지';
  });
  assert.equal(await preview.locator('#featured .card .row > span').first().innerText(),'12,345 KRW',label+' price format updates safely');
  await page.locator('#os-file-rosy-moment').setInputFiles({name:'flower.png',mimeType:'image/png',buffer:PNG});
  await page.waitForFunction(()=>{
   const f=document.querySelector('#ownerPreview')?.contentDocument;
   return f?.querySelector('#featured .card img')?.src.startsWith('data:image/png;base64,');
  });

  await page.locator('#os-section-rosy-moment').selectOption('regular');
  await page.waitForFunction(()=>document.getElementById('ownerFeatured').querySelectorAll('.os-product').length===2);
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#featured .card').length===2);
  assert.equal(await preview.locator('#featured .card').count(),2,label+' section switch removes featured card');
  assert.equal(await preview.locator('#regular .card').count(),3,label+' section switch adds regular card');
  await page.locator('#ownerAddFeatured').click();
  await page.waitForFunction(()=>document.getElementById('ownerFeatured').querySelectorAll('.os-product').length===3);
  await page.locator('#os-item-owner-draft-1-input-name').fill('봄의 신상품');
  assert.ok((await productNames(preview,'featured')).includes('봄의 신상품'),label+' dynamically appended product visible in actual customer page');
  await page.locator('#ownerAddRegular').click();
  await page.waitForFunction(()=>document.getElementById('ownerRegular').querySelectorAll('.os-product').length===4);
  assert.equal(await preview.locator('#regular .card').count(),4,label+' regular collection expanded');
  await page.locator('#ownerRegular [data-product-id="owner-draft-2"] button[data-remove]').click();
  await page.waitForFunction(()=>document.getElementById('ownerRegular').querySelectorAll('.os-product').length===3);
  assert.equal(await preview.locator('#regular .card').count(),3,label+' draft product deletion live');
  await page.locator('#ownerFeatured [data-product-id="owner-draft-1"] button[data-remove]').click();
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#featured .card').length===2);
  assert.equal(await preview.locator('#featured .card').count(),2,label+' featured deletion live');
  assert.match(await preview.locator('#curation > p.muted').innerText(),/오늘의 추천은 2개/,label+' original count caption updated for flexible collection');

  await page.locator('#ownerHeroRestore').click();
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#home>.hero')?.style.backgroundImage.includes('hero-original.webp'));
  assert.ok((await preview.locator('#home>.hero').evaluate(el=>el.style.backgroundImage)).includes('hero-original.webp'),label+' hero photo restoration');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),originalStored,label+' owner draft never persists to localStorage');

  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(accessibility.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' owner workspace WCAG 2.1 AA');
  await preview.locator('#home #store table').waitFor({state:'attached'});
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-69-owner-studio-'+label.toLowerCase()+'-desktop.png',fullPage:false});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'qa-artifacts/g3-69-owner-studio-'+label.toLowerCase()+'-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#ownerReset').click();
  await page.waitForFunction(()=>document.getElementById('ownerBusinessName').value==='오후의 정원');
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#home .hero .brand strong')?.textContent==='오후의 정원');
  assert.equal(await preview.locator('#home .hero .brand strong').innerText(),'오후의 정원',label+' reset restores original brand');
  assert.equal(await preview.locator('#featured .card').count(),3,label+' reset restores featured count');
  assert.equal(await preview.locator('#regular .card').count(),2,label+' reset restores regular count');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),originalStored,label+' reset does not persist');

  const publicPage=await context.newPage();
  await publicPage.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.equal(await publicPage.locator('#home .hero .brand strong').innerText(),'오후의 정원',label+' ordinary customer page unchanged');
  assert.equal(await publicPage.locator('#featured .card').count(),3,label+' ordinary customer product count unchanged');
  assert.equal(await publicPage.locator('#regular .card').count(),2,label+' ordinary customer regular count unchanged');
  assert.equal(await publicPage.locator('#home #store table tr').nth(2).locator('td').last().innerText(),'전화 문의 채널 미등록',label+' ordinary customer store phone unchanged');
  assert.equal(await publicPage.evaluate(()=>JSON.stringify(localStorage)),originalStored,label+' ordinary site never received owner draft');
  assert.ok(!await publicPage.evaluate(()=>window.OWNER_PREVIEW_ONLY),label+' normal customer site never runs preview-only storage guard');
  await publicPage.close();

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('ownerFeatured').querySelectorAll('.os-product').length===3);
  assert.equal(await page.locator('#ownerBusinessName').inputValue(),'오후의 정원',label+' owner draft cleared on reload (no publication/persistence)');
  assert.deepEqual(errors,[],label+' no runtime JS errors in owner or iframe');
  console.log('PASS G3-69 '+label+' true customer iframe, live owner edits, counts, photo files, reset, privacy, axe');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);
 console.log('PASS G3-69 both engines; physical iPhone Safari and Instagram WebView remain UNVERIFIED');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-69 '+(e.stack||e));server.close();process.exitCode=1;});
