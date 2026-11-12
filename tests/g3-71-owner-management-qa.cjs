'use strict';
/* G3-71: the owner editor remains a non-persistent, same-tab preview.
   The existing G3-69/70 and all legacy suites are also mandatory. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lksAAAAASUVORK5CYII=','base64');
const server=http.createServer((req,res)=>{
 let file;try{const u=new URL(req.url,'http://localhost');
  file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function verify(engine,label,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'owner-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ownerFeatured .os-product').length===3);
  const preview=page.frameLocator('#ownerPreview');
  const getNames=section=>preview.locator('#'+section+' .card strong').allInnerTexts();
  async function waitNames(section,expected){
   await page.waitForFunction(({section,expected})=>{
    const doc=document.getElementById('ownerPreview')?.contentDocument;
    if(!doc)return false;
    const got=[...doc.querySelectorAll('#'+section+' .card strong')].map(e=>e.textContent);
    return JSON.stringify(got)===JSON.stringify(expected);
   },{section,expected});
  }
  const initial=['로지 모먼트','멜로우 선데이','퍼플 레터'];
  assert.deepEqual(await getNames('featured'),initial,label+' original customer cards');
  assert.match(await page.locator('#ownerCatalogSummary').innerText(),/전체 5개/);
  const oldStorage=await page.evaluate(()=>JSON.stringify(localStorage));
  const baseImage=await page.locator('[data-thumb="rosy-moment"]').getAttribute('src');
  assert.ok(await page.locator('[data-restore-photo="rosy-moment"]').isDisabled(),label+' unchanged original image cannot restore');
  await page.locator('#os-file-rosy-moment').setInputFiles({name:'new-rose.png',mimeType:'image/png',buffer:PNG});
  await page.waitForFunction(()=>document.querySelector('[data-thumb="rosy-moment"]')?.src.startsWith('data:image/png;base64,'));
  await page.waitForFunction(()=>document.getElementById('ownerPreview')?.contentDocument?.querySelector('#featured .card img')?.src.startsWith('data:image/png;base64,'));
  assert.match(await page.locator('[data-photo-state="rosy-moment"]').innerText(),/선택한 새 사진/);
  assert.ok(await page.locator('[data-restore-photo="rosy-moment"]').isEnabled());
  await page.locator('[data-restore-photo="rosy-moment"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-thumb="rosy-moment"]')?.getAttribute('src')==='./assets/rosy-moment.webp');
  assert.equal(await page.locator('[data-thumb="rosy-moment"]').getAttribute('src'),baseImage,label+' original image restored');
  await page.waitForFunction(()=>document.getElementById('ownerPreview')?.contentDocument?.querySelector('#featured .card img')?.getAttribute('src')==='./assets/rosy-moment.webp');
  assert.ok(await page.locator('[data-restore-photo="rosy-moment"]').isDisabled(),label+' restore button resets');
  // Undo must keep product data, restored edited image and collapsed state, at the original index.
  await page.locator('#os-file-mellow-sunday').setInputFiles({name:'edited.png',mimeType:'image/png',buffer:PNG});
  await page.waitForFunction(()=>document.querySelector('[data-thumb="mellow-sunday"]')?.src.startsWith('data:image/png;base64,'));
  await page.locator('#os-item-mellow-sunday-input-name').fill('멜로우 수정본');
  await page.locator('#os-item-mellow-sunday-input-price').fill('62000');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-fold]').click();
  assert.equal(await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-fold]').getAttribute('aria-expanded'),'false');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-remove]').click();
  await waitNames('featured',['로지 모먼트','퍼플 레터']);
  assert.ok(await page.locator('#ownerUndoBar').isVisible(),label+' undo offered');
  assert.match(await page.locator('#ownerUndoText').innerText(),/멜로우 수정본/);
  await page.locator('#ownerUndoDelete').click();
  await waitNames('featured',['로지 모먼트','멜로우 수정본','퍼플 레터']);
  assert.equal(await page.locator('#ownerFeatured .os-product').nth(1).getAttribute('data-product-id'),'mellow-sunday',label+' exact insertion position');
  assert.equal(await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-fold]').getAttribute('aria-expanded'),'false',label+' collapsed state restored');
  assert.match(await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] .os-product-meta').innerText(),/62,000원/);
  assert.ok((await page.locator('[data-thumb="mellow-sunday"]').getAttribute('src')).startsWith('data:image/png;base64,'),label+' picture preserved by undo');
  assert.ok(await page.locator('#ownerUndoBar').isHidden(),label+' undo consumed once');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-fold]').click();
  await page.locator('[data-restore-photo="mellow-sunday"]').click();
  await page.waitForFunction(()=>document.getElementById('ownerPreview')?.contentDocument?.querySelectorAll('#featured .card img')[1]?.getAttribute('src')==='./assets/mellow-sunday.webp');
  // The owner-only search cannot remove/hide customer cards, even with zero matches.
  await page.locator('#ownerCatalogSearch').fill('Rosy');
  assert.equal(await page.locator('#ownerFeatured .os-product:visible').count(),1,label+' Latin-case-insensitive search');
  assert.equal(await page.locator('#ownerRegular .os-product:visible').count(),0);
  assert.match(await page.locator('#ownerCatalogSummary').innerText(),/검색 결과 1개 \/ 전체 5개/);
  assert.equal(await preview.locator('#featured .card').count(),3,label+' preview ignores management filter');
  await page.locator('#ownerCatalogSearch').fill('전혀없는꽃다발');
  assert.equal(await page.locator('.os-product:visible').count(),0);
  assert.ok(await page.locator('#ownerNoResults').isVisible(),label+' accessible empty result');
  assert.equal(await preview.locator('#featured .card').count(),3,label+' zero search does not empty public preview');
  await page.locator('#ownerCatalogClear').click();
  assert.equal(await page.locator('.os-product:visible').count(),5);
  assert.ok(await page.locator('#ownerCatalogClear').isDisabled());
  // Only the most recently deleted product can be undone; an earlier deletion stays removed.
  await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-remove]').click();
  await page.locator('#ownerFeatured [data-product-id="purple-letter"] [data-remove]').click();
  await page.locator('#ownerUndoDelete').click();
  await waitNames('featured',['멜로우 수정본','퍼플 레터']);
  assert.ok(await page.locator('#ownerFeatured [data-product-id="rosy-moment"]').isHidden());
  await page.locator('#ownerReset').click();
  await waitNames('featured',initial);
  assert.ok(await page.locator('#ownerUndoBar').isHidden(),label+' reset clears undo history');
  // Scale up to the existing 30 item cap, then search without changing the customer display.
  for(let i=0;i<25;i++){
   await page.locator('#ownerAddFeatured').click();
  }
  await page.waitForFunction(()=>document.querySelectorAll('.os-product').length===30);
  assert.ok(await page.locator('#ownerAddFeatured').isDisabled(),label+' max-products boundary');
  assert.ok(await page.locator('#ownerAddRegular').isDisabled(),label+' shared max-products boundary');
  assert.match(await page.locator('#ownerCatalogSummary').innerText(),/전체 30개/);
  await page.locator('#ownerCatalogSearch').fill('로지');
  assert.equal(await page.locator('.os-product:visible').count(),1,label+' 30 item list filtered');
  assert.match(await page.locator('#ownerCatalogSummary').innerText(),/검색 결과 1개 \/ 전체 30개/);
  assert.equal(await preview.locator('#featured .card').count(),28,label+' all items remain in preview');
  await page.locator('#ownerCatalogClear').click();
  assert.equal(await page.locator('.os-product:visible').count(),30,label+' clearing search shows full list');
  await page.locator('#ownerReset').click();
  await waitNames('featured',initial);
  assert.equal(await page.locator('.os-product').count(),5,label+' reset from max restores default');
  assert.equal(await page.locator('#ownerCatalogSearch').inputValue(),'');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),oldStorage,label+' editor never persists catalog edits');
  // Normal visitor view is separate from owner preview.
  const publicPage=await context.newPage();
  await publicPage.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await publicPage.locator('#featured .card strong').allInnerTexts(),initial,label+' independent customer page untouched');
  assert.equal(await publicPage.locator('#regular .card').count(),2);
  await publicPage.close();
  for(const width of [1440,1080,390,320]){
   await page.setViewportSize({width,height:900});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,label+' '+width+'px horizontal overflow '+overflow);
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-remove]').click();
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(accessibility.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' owner editor WCAG2.1AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-71-owner-'+label.toLowerCase()+'-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'qa-artifacts/g3-71-owner-'+label.toLowerCase()+'-mobile.png',fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('.os-product').length===5);
  assert.ok(await page.locator('#ownerUndoBar').isHidden(),label+' reload loses undo history');
  assert.deepEqual(errors,[],label+' no uncaught JS runtime errors');
  console.log('PASS G3-71 '+label+' last-delete undo, per-product image restore, scalable owner search, 30 cap, privacy, mobile, axe');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-71 '+(e.stack||e));server.close();process.exitCode=1;});
