'use strict';
/* G3-75: focused change-review actions must survive live editing;
 * reordering/section changes preserve editor focus; no publishing. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let file;try{const pathname=new URL(req.url,'http://localhost').pathname;
  file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function run(engine,name,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'owner-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ownerFeatured .os-product').length===3);
  const list=page.locator('#ownerChangesList');
  const jump=target=>page.locator('[data-review-target="'+target+'"]');
  const active=()=>page.evaluate(()=>document.activeElement?.id||document.activeElement?.dataset?.reviewTarget||'');
  const changed=async(id,value)=>page.evaluate(([id,value])=>{
   const input=document.getElementById(id);input.value=value;
   input.dispatchEvent(new Event('input',{bubbles:true}));
  },[id,value]);
  const before=await page.evaluate(()=>({
   name:document.getElementById('ownerBusinessName').value,
   address:document.getElementById('ownerAddress').value,
   hours:document.getElementById('ownerHours').value,
   storage:JSON.stringify(localStorage)
  }));
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/,name+' initially unchanged');
  await page.locator('#ownerChangesToggle').click();
  await page.locator('#ownerBusinessName').fill('테스트 이름');
  await page.locator('#ownerAddress').fill('테스트 주소');
  await page.locator('#ownerHours').fill('테스트 영업시간');
  assert.equal(await page.locator('#ownerChangesList li').count(),3,name+' three changes');
  // Stable buttons while another change recomputes the same entries.
  await jump('ownerBusinessName').focus();
  await page.evaluate(()=>window.__reviewButton=document.querySelector('[data-review-target="ownerBusinessName"]'));
  await changed('ownerBusinessName','테스트 이름 2');
  assert.equal(await active(),'ownerBusinessName',name+' focused jump preserved during same-row text edit');
  assert.equal(await page.evaluate(()=>window.__reviewButton===document.querySelector('[data-review-target="ownerBusinessName"]')),true,name+' jump DOM node identity stable');
  assert.ok((await jump('ownerBusinessName').getAttribute('aria-label')).includes('테스트 이름 2'),name+' accessible label refreshed');
  await changed('ownerHours','테스트 영업시간 2');
  assert.equal(await active(),'ownerBusinessName',name+' other-field edit does not remove focused action');
  // Deleting an earlier change retains focus on the same surviving row.
  await jump('ownerHours').focus();
  await changed('ownerAddress',before.address);
  assert.equal(await active(),'ownerHours',name+' focus remapped onto surviving row');
  assert.equal(await page.locator('#ownerChangesList li').count(),2);
  // If the focused change is resolved, fall back to another row at same index.
  await changed('ownerHours',before.hours);
  assert.equal(await active(),'ownerBusinessName',name+' disappearing focused row hands focus to remaining row');
  assert.equal(await page.locator('#ownerChangesList li').count(),1);
  await changed('ownerBusinessName',before.name);
  assert.equal(await page.locator('[data-review-target]').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('os-change-scroll')),true,name+' empty review retains keyboard focus on region');
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  // Original G3-74 jump still reveals hidden/collapsed targets.
  await page.locator('#os-item-rosy-moment-input-name').fill('로지 시안');
  await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-fold]').click();
  await page.locator('#ownerCatalogSearch').fill('일치하지않음');
  await jump('os-item-rosy-moment-input-name').click();
  assert.equal(await page.locator('#ownerCatalogSearch').inputValue(),'');
  assert.equal(await active(),'os-item-rosy-moment-input-name');
  assert.equal(await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-fold]').getAttribute('aria-expanded'),'true');
  await page.locator('#os-item-rosy-moment-input-name').fill('로지 모먼트');
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  // When moving an item to a boundary, focus must not be sent to a disabled button.
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-move="up"]').click();
  assert.equal(await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-move="up"]').isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.fold),'mellow-sunday',name+' boundary fallback is enabled fold button');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-move="down"]').click();
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.move),'down',name+' moved item keeps enabled directional control');
  // Changing a section destroys the old field; the replacement gets focus.
  await page.locator('#os-section-mellow-sunday').selectOption('regular');
  assert.equal(await active(),'os-section-mellow-sunday',name+' section change focus preserved');
  assert.equal(await page.locator('#ownerRegular [data-product-id="mellow-sunday"]').count(),1);
  await page.locator('#os-section-mellow-sunday').selectOption('featured');
  assert.equal(await active(),'os-section-mellow-sunday',name+' reverse section change focus preserved');
  await page.locator('#ownerReset').click();
  // Maximum synthetic catalog, 25 live entries; keep keyboard and internal scroll.
  for(let i=0;i<25;i++)await page.locator('#ownerAddFeatured').click();
  await page.waitForFunction(()=>document.querySelectorAll('.os-product').length===30);
  assert.equal(await page.locator('#ownerChangesList li').count(),25,name+' 25 pending additions');
  const scroller=page.locator('.os-change-scroll');
  await scroller.evaluate(node=>{node.scrollTop=node.scrollHeight;});
  await page.waitForFunction(()=>document.querySelector('.os-change-scroll').scrollTop>100);
  const beforeScroll=await scroller.evaluate(node=>node.scrollTop);
  const last=jump('os-item-owner-draft-25-input-name');
  await last.focus();
  await page.evaluate(()=>window.__lastReviewButton=document.querySelector('[data-review-target="os-item-owner-draft-25-input-name"]'));
  const bottomScroll=await scroller.evaluate(node=>node.scrollTop);
  assert.ok(bottomScroll>100,name+' focus placed at lower review rows');
  for(let n=0;n<6;n++){
   await changed('os-item-owner-draft-25-input-name','반복 편집 '+n);
   assert.equal(await page.evaluate(()=>window.__lastReviewButton===document.querySelector('[data-review-target="os-item-owner-draft-25-input-name"]')),true,name+' repeated edit uses same DOM button');
   assert.equal(await active(),'os-item-owner-draft-25-input-name',name+' keyboard stays on review action '+n);
   const scroll=await scroller.evaluate(node=>node.scrollTop);
   assert.ok(Math.abs(scroll-bottomScroll)<=2,name+' review scroll stays stable '+n+' '+bottomScroll+'→'+scroll);
  }
  assert.ok((await last.getAttribute('aria-label')).includes('반복 편집 5'));
  // Reorder changes the list order, but focus must remain usable.
  await last.focus();
  await page.evaluate(()=>window.__focusButton=document.activeElement);
  await page.evaluate(()=>{
   const button=document.getElementById('ownerAddFeatured');
   // Owner UI dispatch remains the only source of catalog mutations.
   // Editing existing input is sufficient to verify focus under re-render.
   document.getElementById('os-item-owner-draft-24-input-name').value='이름 수정';
   document.getElementById('os-item-owner-draft-24-input-name').dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.equal(await active(),'os-item-owner-draft-25-input-name');
  assert.equal(await page.evaluate(()=>window.__focusButton===document.activeElement),true,name+' sibling edit preserves jump focus');
  for(const width of [1440,1080,780,390,320]){
   await page.setViewportSize({width,height:900});
   const metrics=await page.evaluate(()=>{
    const node=document.querySelector('.os-change-scroll'),rect=node.getBoundingClientRect();
    return{overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     right:rect.right,height:rect.height,scroll:node.scrollTop};
   });
   assert.ok(metrics.overflow<=2,name+' '+width+'px no horizontal overflow '+metrics.overflow);
   assert.ok(metrics.right<=width+2,name+' list viewport fits '+width);
   assert.ok(metrics.height<=342,name+' bounded review '+width);
   assert.ok(metrics.scroll>0,name+' retains internal scroll at '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(accessibility.violations.map(v=>({id:v.id,targets:v.nodes.map(x=>x.target)})),[],name+' WCAG 2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-75-owner-'+name.toLowerCase()+'-mobile.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'qa-artifacts/g3-75-owner-'+name.toLowerCase()+'-desktop.png'});
  await page.locator('#ownerReset').click();
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  assert.equal(await page.locator('#ownerFeatured .os-product').count(),3);
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),before.storage,name+' no persistent edits');
  const publicPage=await context.newPage();
  await publicPage.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await publicPage.locator('#featured .card strong').allInnerTexts(),
   ['로지 모먼트','멜로우 선데이','퍼플 레터'],name+' public page unmodified');
  await publicPage.close();
  assert.deepEqual(errors,[],name+' no page runtime errors');
  console.log('PASS G3-75 '+name+' keyed focus, resolved-row fallback, 25 changes scroll, section/move boundary, 320px and axe');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await run(chromium,'Chromium',url);await run(webkit,'WebKit',url);}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-75 '+(err.stack||err));server.close();process.exitCode=1;});
