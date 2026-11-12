'use strict';
/* G3-74: live owner-change deep links, visibility, keyboard, mobile, 30 items.
   Customer page, synthetic bookings and persisted records remain untouched. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lksAAAAASUVORK5CYII=','base64');
const file={name:'g374.png',mimeType:'image/png',buffer:PNG};
const server=http.createServer((req,res)=>{
 let filepath;try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  filepath=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!filepath.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filepath,(err,data)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(filepath)]||'application/octet-stream'});res.end(data);
 });
});
async function verify(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(url+'owner-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ownerFeatured .os-product').length===3);
  const preview=page.frameLocator('#ownerPreview');
  const count=()=>page.locator('#ownerChangesList li').count();
  const review=()=>page.locator('#ownerChangesList li');
  const focus=()=>page.evaluate(()=>document.activeElement?.id);
  const jump=async fragment=>{
   const li=review().filter({hasText:fragment});
   assert.equal(await li.count(),1,label+' unique change '+fragment);
   const button=li.locator('[data-review-target]');
   assert.equal(await button.count(),1,label+' navigable change '+fragment);
   await button.click();
   return button;
  };
  const changes=await page.locator('#ownerChangesCount').innerText();
  assert.match(changes,/변경사항 없음/,label+' initial report clean');
  assert.equal(await review().count(),1);
  assert.equal(await page.locator('[data-review-target]').count(),0,label+' empty report has no jump');
  const originalStore=await page.evaluate(()=>JSON.stringify(localStorage));
  await page.locator('#ownerChangesToggle').click();
  assert.equal(await page.locator('.os-change-scroll').getAttribute('role'),'region');
  assert.equal(await page.locator('.os-change-scroll').getAttribute('tabindex'),'0');
  await page.locator('#ownerBusinessName').fill('편집 시안');
  await page.locator('.os-change-scroll').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.reviewTarget),'ownerBusinessName',label+' scroll region followed by jump in keyboard order');
  await page.keyboard.press('Enter');
  assert.equal(await focus(),'ownerBusinessName',label+' Enter focuses changed store field');
  assert.ok(await page.locator('#ownerBusinessName').evaluate(el=>el.classList.contains('os-jump-target')),label+' focus indicator');
  await page.locator('#ownerBusinessName').fill('오후의 정원');
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  // Hero image has a safe, named navigation target.
  await page.locator('#ownerHeroUpload').setInputFiles(file);
  await page.waitForFunction(()=>document.getElementById('ownerChangesCount')?.textContent.includes('1건 변경'));
  await jump('메인 사진');
  assert.equal(await focus(),'ownerHeroUpload',label+' hero deep link');
  await page.locator('#ownerHeroRestore').click();
  assert.equal(await page.locator('[data-review-target]').count(),0,label+' image restore clears entry');
  // A collapsed, search-hidden product must become visible and editable.
  await page.locator('#os-item-rosy-moment-input-price').fill('52000');
  await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-fold]').click();
  await page.locator('#ownerCatalogSearch').fill('검색불가값');
  assert.equal(await page.locator('.os-product:visible').count(),0,label+' target hidden by search');
  await jump('가격');
  assert.equal(await page.locator('#ownerCatalogSearch').inputValue(),'',label+' jump clears restrictive filter');
  assert.equal(await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-fold]').getAttribute('aria-expanded'),'true',label+' jump expands collapsed product');
  assert.equal(await focus(),'os-item-rosy-moment-input-price',label+' price field focused');
  assert.equal(await page.locator('#ownerFeatured .os-product:visible').count(),3,label+' catalog visible after jump');
  await page.locator('#os-item-rosy-moment-input-price').fill('39000');
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  // Checkbox change navigates to exact checkbox, not only the product card.
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-field="available"]').uncheck();
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-fold]').click();
  await jump('예약 상태');
  assert.equal(await focus(),'os-available-mellow-sunday',label+' booking-state checkbox focused');
  assert.ok(await page.locator('#os-available-mellow-sunday').isVisible());
  await page.locator('#os-available-mellow-sunday').check();
  // Structural reordering also provides a stable target.
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-move="up"]').click();
  await jump('진열 순서 변경');
  assert.match(await focus(),/^os-item-(?:mellow-sunday|rosy-moment)-input-name$/,label+' reorder target focused');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-move="down"]').click();
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  // The two different deleted-product links must not point to missing DOM nodes.
  await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-remove]').click();
  await jump('상품 삭제');
  assert.equal(await focus(),'ownerUndoDelete',label+' latest removal focuses undo');
  await page.locator('#ownerUndoDelete').click();
  await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-remove]').click();
  await page.locator('#ownerFeatured [data-product-id="purple-letter"] [data-remove]').click();
  const deleted=review().filter({hasText:'상품 삭제'});
  assert.equal(await deleted.count(),2,label+' both original deletions reported');
  await deleted.first().locator('[data-review-target]').click();
  assert.equal(await focus(),'ownerAddFeatured',label+' older deletion links to available section controls');
  await deleted.last().locator('[data-review-target]').click();
  assert.equal(await focus(),'ownerUndoDelete',label+' most recent deletion offers undo');
  await page.locator('#ownerReset').click();
  // Long list: all 25 additions produce bounded, scrollable, keyboard-actionable review.
  for(let i=0;i<25;i++)await page.locator('#ownerAddFeatured').click();
  await page.waitForFunction(()=>document.querySelectorAll('.os-product').length===30);
  assert.equal(await review().count(),25,label+' 25 added products produce 25 review rows');
  const metrics=await page.locator('.os-change-scroll').evaluate(el=>({
   clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,maxHeight:getComputedStyle(el).maxHeight
  }));
  assert.ok(metrics.clientHeight<=342,label+' review height remains capped '+JSON.stringify(metrics));
  assert.ok(metrics.scrollHeight>metrics.clientHeight+50,label+' long list is internally scrollable');
  const last=review().last();
  assert.match(await last.innerText(),/상품 추가/,label+' long list last is an added product');
  await last.locator('[data-review-target]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await focus(),'os-item-owner-draft-25-input-name',label+' keyboard jumps to latest added product');
  await page.locator('#os-item-owner-draft-25-input-name').fill('마지막 수정 꽃');
  assert.equal(await review().count(),25,label+' rename does not duplicate additions');
  assert.ok(await review().last().innerText().then(v=>v.includes('마지막 수정 꽃')));
  const siteNames=await preview.locator('#featured .card strong').allInnerTexts();
  assert.ok(siteNames.includes('마지막 수정 꽃'),label+' preview still updates even after 30 products');
  for(const width of [1440,1080,780,390,320]){
   await page.setViewportSize({width,height:900});
   const vals=await page.evaluate(()=>{
    const wrap=document.querySelector('.os-change-scroll'),rect=wrap.getBoundingClientRect();
    const btn=document.querySelector('.os-change-jump'),height=btn?.getBoundingClientRect().height;
    return {over:document.documentElement.scrollWidth-document.documentElement.clientWidth,right:rect.right,height:wrap.clientHeight,buttonHeight:height};
   });
   assert.ok(vals.over<=2,label+' no horizontal overflow '+width+'px: '+vals.over);
   assert.ok(vals.right<=width+2,label+' list fits width '+width);
   assert.ok(vals.height<=342,label+' bounded long list '+width);
   if(width<=830)assert.ok(vals.buttonHeight>=43.5,label+' mobile touch button '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#ownerChangesToggle').focus();
  await page.keyboard.press('Enter');
  assert.ok(await page.locator('#ownerChangesDetails').isHidden());
  await page.keyboard.press('Enter');
  assert.ok(await page.locator('#ownerChangesDetails').isVisible());
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(accessibility.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG2.1AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-74-owner-'+label.toLowerCase()+'-mobile.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'qa-artifacts/g3-74-owner-'+label.toLowerCase()+'-desktop.png'});
  await page.locator('#ownerReset').click();
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  assert.equal(await page.locator('#ownerFeatured .os-product').count(),3);
  await page.waitForFunction(()=>{
   const doc=document.querySelector('#ownerPreview')?.contentDocument;
   const names=[...doc?.querySelectorAll('#featured .card strong')||[]].map(el=>el.textContent);
   return JSON.stringify(names)===JSON.stringify(['로지 모먼트','멜로우 선데이','퍼플 레터']);
  });
  assert.deepEqual(await preview.locator('#featured .card strong').allInnerTexts(),['로지 모먼트','멜로우 선데이','퍼플 레터']);
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),originalStore,label+' draft did not persist');
  const independent=await context.newPage();
  await independent.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await independent.locator('#featured .card strong').allInnerTexts(),['로지 모먼트','멜로우 선데이','퍼플 레터'],label+' public site untouched');
  await independent.close();
  assert.deepEqual(errors,[],label+' browser runtime errors');
  console.log('PASS G3-74 '+label+' all review links, hidden/folded fields, keyboard, 25-change scroll, mobile, axe, reset and isolation');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-74 '+(err.stack||err));server.close();process.exitCode=1;});
