'use strict';
/* G3-72 — mobile owner controls, keyboard navigation, and deterministic
 * FileReader race simulations. No production data or backend writes. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lksAAAAASUVORK5CYII=','base64');
const URL_A='data:image/png;base64,'+PNG.toString('base64');
const URL_B='data:image/png;base64,'+Buffer.concat([PNG,Buffer.from('safe-trailing-test-bytes')]).toString('base64');
const imageFile=(name='flower.png')=>({name,mimeType:'image/png',buffer:PNG});
const svgFile={name:'blocked.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')};
const server=http.createServer((req,res)=>{
 let file;try{const pathname=new URL(req.url,'http://localhost').pathname;
  file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
const options=engine=>engine===chromium?
 {executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
async function ready(page){
 await page.goto(page.__base+'owner-studio.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('#ownerFeatured .os-product').length===3);
}
async function interactive(browser,label,url){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];
 page.__base=url;page.on('pageerror',e=>errors.push(e.message));
 try{
  await ready(page);
  const preview=page.frameLocator('#ownerPreview');
  await page.locator('#ownerCatalogSearch').focus();
  await page.keyboard.type('로지');
  assert.equal(await page.locator('.os-product:visible').count(),1,label+' owner search visible only one');
  assert.equal(await preview.locator('#featured .card').count(),3,label+' customer preview not filtered');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ownerCatalogSearch').inputValue(),'');
  assert.equal(await page.locator('.os-product:visible').count(),5,label+' Escape restores full list');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerCatalogSearch',label+' search retains keyboard focus');
  await page.keyboard.type('퍼플');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerCatalogClear',label+' search clear next in tab order');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ownerCatalogSearch').inputValue(),'');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerCatalogSearch',label+' clear action returns focus');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-remove]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('#ownerFeatured .os-product').length===2);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerUndoDelete',label+' delete moves focus to undo control');
  assert.equal(await page.locator('#ownerUndoBar').isVisible(),true);
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('#ownerFeatured .os-product').length===3);
  const focused=await page.evaluate(()=>({tag:document.activeElement?.tagName,fold:document.activeElement?.dataset?.fold}));
  assert.deepEqual(focused,{tag:'BUTTON',fold:'mellow-sunday'},label+' undo restores keyboard focus to item');
  assert.equal(await page.locator('#ownerUndoBar').isHidden(),true);
  for(const width of [1440,1080,780,390,320]){
   await page.setViewportSize({width,height:900});
   const state=await page.evaluate(()=>{
    const root=document.getElementById('ownerStudio');
    const bounds=el=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height,left:r.left,right:r.right}};
    const mobileLink=root.querySelector('.os-mobile-preview-jump');
    const selectors=['#ownerFeatured [data-product-id="rosy-moment"] [data-move="down"]',
     '#ownerFeatured [data-product-id="rosy-moment"] [data-remove]',
     '#ownerFeatured [data-product-id="rosy-moment"] [data-fold]',
     '#ownerFeatured [data-product-id="rosy-moment"] [data-restore-photo]'];
    return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     mobileLinkDisplay:getComputedStyle(mobileLink).display,
     buttons:selectors.map(s=>bounds(root.querySelector(s))),
     font:getComputedStyle(root.querySelector('#ownerCatalogSearch')).fontSize,
     preview:bounds(root.querySelector('#ownerPreviewPanel'))};
   });
   assert.ok(state.overflow<=2,label+' '+width+'px horizontal overflow '+state.overflow);
   if(width<=830){
    assert.notEqual(state.mobileLinkDisplay,'none',label+' mobile shortcut visible');
    assert.equal(state.font,'16px',label+' mobile search size prevents autozoom');
    for(const rect of state.buttons)assert.ok(rect.height>=43.5,label+' '+width+'px mobile control is touchable '+rect.height);
    assert.ok(state.preview.right<=width+2,label+' preview width fits mobile');
   }else assert.equal(state.mobileLinkDisplay,'none',label+' desktop does not duplicate navigation');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.os-mobile-preview-jump').click();
  assert.equal(new URL(page.url()).hash,'#ownerPreviewPanel',label+' mobile jump anchor works');
  assert.ok(await page.locator('.os-mobile-preview-back').isVisible());
  await page.locator('.os-mobile-preview-back').click();
  assert.equal(new URL(page.url()).hash,'#ownerHeading',label+' return-to-editor anchor works');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const violations=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(violations.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG2.1 AA mobile');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-72-owner-'+label.toLowerCase()+'-mobile.png',fullPage:false});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'qa-artifacts/g3-72-owner-'+label.toLowerCase()+'-desktop.png',fullPage:false});
  assert.deepEqual(errors,[],label+' interactive no runtime errors');
  console.log('PASS G3-72 '+label+' mobile 320/390/780, keyboard search, undo focus, jump nav, axe');
 }finally{await context.close();}
}
async function race(browser,label,url){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await context.addInitScript(()=>{
  window.__pendingPhotoReads=[];
  window.FileReader=class{
   constructor(){this.result=null;this.onload=null;this.onerror=null;}
   readAsDataURL(file){window.__pendingPhotoReads.push({file,reader:this});}
  };
  window.__completePhotoRead=(index,data)=>{
   const entry=window.__pendingPhotoReads[index];
   if(!entry)throw new Error('Missing pending read '+index);
   entry.reader.result=data;
   entry.reader.onload?.();
  };
  window.__failPhotoRead=index=>{
   const entry=window.__pendingPhotoReads[index];
   if(!entry)throw new Error('Missing failed read '+index);
   entry.reader.onerror?.();
  };
 });
 const page=await context.newPage(),errors=[];page.__base=url;
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await ready(page);
  const oldStore=await page.evaluate(()=>JSON.stringify(localStorage));
  const pending=()=>page.evaluate(()=>window.__pendingPhotoReads.length);
  const complete=(i,value)=>page.evaluate(([index,data])=>window.__completePhotoRead(index,data),[i,value]);
  const fail=i=>page.evaluate(index=>window.__failPhotoRead(index),i);
  const photo=()=>page.locator('[data-thumb="rosy-moment"]').getAttribute('src');
  const preview=page.frameLocator('#ownerPreview');
  // Two selections on same product finish in reverse order: most recent wins.
  await page.locator('#os-file-rosy-moment').setInputFiles(imageFile('first.png'));
  await page.locator('#os-file-rosy-moment').setInputFiles(imageFile('second.png'));
  assert.equal(await pending(),2,label+' two deferred reads captured');
  await complete(1,URL_B);
  assert.equal(await photo(),URL_B,label+' latest product selection applies');
  await complete(0,URL_A);
  assert.equal(await photo(),URL_B,label+' obsolete earlier result ignored');
  assert.equal(await preview.locator('#featured .card img').first().getAttribute('src'),URL_B);
  // Restoring cancels pending read. Error from obsolete read must be ignored too.
  await page.locator('#os-file-rosy-moment').setInputFiles(imageFile('third.png'));
  await page.locator('[data-restore-photo="rosy-moment"]').click();
  await complete(2,URL_A);
  assert.equal(await photo(),'./assets/rosy-moment.webp',label+' restore defeats late file read');
  const beforeError=await page.locator('#ownerStatus').innerText();
  await fail(2);
  assert.equal(await page.locator('#ownerStatus').innerText(),beforeError,label+' obsolete read error not announced');
  // Invalid later selection revokes an earlier pending valid image.
  await page.locator('#os-file-rosy-moment').setInputFiles(imageFile('fourth.png'));
  await page.locator('#os-file-rosy-moment').setInputFiles(svgFile);
  assert.match(await page.locator('#ownerStatus').innerText(),/JPG·PNG·WebP/,label+' reject unsupported image');
  await complete(3,URL_B);
  assert.equal(await photo(),'./assets/rosy-moment.webp',label+' invalid new selection revokes prior pending image');
  // Restore hero while pending, then also reset while pending.
  await page.locator('#ownerHeroUpload').setInputFiles(imageFile('hero1.png'));
  await page.locator('#ownerHeroRestore').click();
  await complete(4,URL_B);
  assert.equal(await page.locator('#ownerHeroThumb').getAttribute('src'),'./assets/hero-original.webp',label+' hero reset defeats late read');
  await page.locator('#ownerHeroUpload').setInputFiles(imageFile('hero2.png'));
  await page.locator('#ownerReset').click();
  await complete(5,URL_B);
  assert.equal(await page.locator('#ownerHeroThumb').getAttribute('src'),'./assets/hero-original.webp',label+' full reset invalidates reads');
  // Delete/undo must not resurrect an in-flight photo assignment from the old epoch.
  await page.locator('#os-file-rosy-moment').setInputFiles(imageFile('deleted.png'));
  await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-remove]').click();
  await page.locator('#ownerUndoDelete').click();
  await complete(6,URL_B);
  assert.equal(await photo(),'./assets/rosy-moment.webp',label+' deletion and undo invalidate old photo');
  // Different targets remain independent, and genuine latest reads still work.
  await page.locator('#os-file-rosy-moment').setInputFiles(imageFile('final-product.png'));
  await page.locator('#ownerHeroUpload').setInputFiles(imageFile('final-hero.png'));
  await complete(8,URL_B);
  await complete(7,URL_A);
  assert.equal(await photo(),URL_A,label+' product final read');
  assert.equal(await page.locator('#ownerHeroThumb').getAttribute('src'),URL_B,label+' hero final read');
  assert.equal(await preview.locator('#featured .card img').first().getAttribute('src'),URL_A);
  assert.ok((await preview.locator('#home>.hero').evaluate(el=>el.style.backgroundImage)).includes(URL_B));
  await page.locator('#ownerReset').click();
  assert.equal(await photo(),'./assets/rosy-moment.webp');
  assert.equal(await page.locator('#ownerHeroThumb').getAttribute('src'),'./assets/hero-original.webp');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),oldStore,label+' no persistent photo content');
  assert.deepEqual(errors,[],label+' async races no runtime errors');
  console.log('PASS G3-72 '+label+' latest-wins, restore, invalid-file cancellation, reset, delete/undo, distinct-photo reads');
 }finally{await context.close();}
}
async function verify(engine,label,url){
 const browser=await engine.launch({headless:true,...options(engine)});
 try{await interactive(browser,label,url);await race(browser,label,url);}finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-72 '+(e.stack||e));server.close();process.exitCode=1;});
