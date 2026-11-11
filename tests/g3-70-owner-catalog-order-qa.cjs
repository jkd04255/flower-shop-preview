'use strict';
/* G3-70: demo-only owner catalogue sorting and compact editing.
 * Runs with the untouched G3-69 and all prior regression suites.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 let file;
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
 });
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
  const names=()=>preview.locator('#featured .card strong').allInnerTexts();
  const waitNames=(section,expected)=>page.waitForFunction(({section,expected})=>{
   const frame=document.getElementById('ownerPreview')?.contentDocument;
   return JSON.stringify([...frame?.querySelectorAll('#'+section+' .card strong')||[]].map(x=>x.textContent))===JSON.stringify(expected);
  },{section,expected});
  assert.deepEqual(await names(),['로지 모먼트','멜로우 선데이','퍼플 레터']);
  assert.ok(await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-move="up"]').isDisabled());
  assert.ok(await page.locator('#ownerFeatured [data-product-id="purple-letter"] [data-move="down"]').isDisabled());
  assert.ok(await page.locator('#ownerRegular .os-product').first().locator('[data-move="up"]').isDisabled());
  assert.ok(await page.locator('#ownerRegular .os-product').last().locator('[data-move="down"]').isDisabled());
  // Compact layout is opt-in: original G3-69 controls remain visible by default.
  assert.ok(await page.locator('#os-item-rosy-moment-input-name').isVisible());
  await page.locator('#ownerCollapseAll').click();
  assert.equal(await page.locator('.os-product-details:not([hidden])').count(),0,label+' collapse all');
  assert.equal(await page.locator('.os-product-header').count(),5,label+' compact headers retained');
  assert.deepEqual(await names(),['로지 모먼트','멜로우 선데이','퍼플 레터'],label+' fold does not mutate preview');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-fold]').click();
  assert.ok(await page.locator('#os-item-mellow-sunday-input-name').isVisible(),label+' selective expand');
  assert.equal(await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-fold]').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('.os-product-details:not([hidden])').count(),1,label+' other cards stay compact');
  await page.locator('#os-item-mellow-sunday-input-name').fill('순서가 바뀐 꽃');
  await page.locator('#os-item-mellow-sunday-input-price').fill('42000');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-field="available"]').uncheck();
  assert.match(await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] .os-product-meta').innerText(),/42,000원 · 품절/,label+' live compact metadata');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-move="up"]').click();
  await waitNames('featured',['순서가 바뀐 꽃','로지 모먼트','퍼플 레터']);
  assert.deepEqual(await names(),['순서가 바뀐 꽃','로지 모먼트','퍼플 레터'],label+' reordering updates real customer cards');
  const first=page.locator('#ownerFeatured .os-product').first();
  assert.equal(await first.getAttribute('data-product-id'),'mellow-sunday',label+' editor ordering');
  assert.equal(await first.locator('[data-fold]').getAttribute('aria-expanded'),'true',label+' expanded state moves with product');
  assert.match(await preview.locator('#featured .card').first().innerText(),/42,000 KRW/,label+' price travels with reordered product');
  assert.match(await preview.locator('#featured .card').first().innerText(),/품절/,label+' stock travels with reordered product');
  assert.ok(await first.locator('[data-move="up"]').isDisabled(),label+' new first boundary disabled');
  await first.locator('[data-move="down"]').click();
  await waitNames('featured',['로지 모먼트','순서가 바뀐 꽃','퍼플 레터']);
  assert.deepEqual(await names(),['로지 모먼트','순서가 바뀐 꽃','퍼플 레터'],label+' moves can reverse without data loss');
  await page.locator('#ownerAddFeatured').click();
  assert.equal(await page.locator('#ownerFeatured .os-product').count(),4,label+' add item');
  assert.ok(await page.locator('#os-item-owner-draft-1-input-name').isVisible(),label+' newly added item opens even with compact mode');
  await page.locator('#os-item-owner-draft-1-input-name').fill('추가한 꽃');
  await page.locator('#ownerFeatured [data-product-id="owner-draft-1"] [data-move="up"]').click();
  await waitNames('featured',['로지 모먼트','순서가 바뀐 꽃','추가한 꽃','퍼플 레터']);
  assert.deepEqual(await names(),['로지 모먼트','순서가 바뀐 꽃','추가한 꽃','퍼플 레터'],label+' new item can reorder immediately');
  await page.locator('#ownerFeatured [data-product-id="owner-draft-1"] [data-fold]').click();
  await page.locator('#ownerExpandAll').click();
  assert.equal(await page.locator('.os-product-details[hidden]').count(),0,label+' expand all');
  await page.locator('#os-section-owner-draft-1').selectOption('regular');
  assert.equal(await page.locator('#ownerRegular .os-product').count(),3,label+' switch section persists');
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#regular .card').length===3);
  assert.equal(await preview.locator('#regular .card').count(),3,label+' section switch real customer');
  await page.locator('#ownerRegular [data-product-id="owner-draft-1"] [data-move="down"]').click();
  await waitNames('regular',['아이보리 데이','추가한 꽃','코랄 다이어리']);
  const regularNames=await preview.locator('#regular .card strong').allInnerTexts();
  assert.deepEqual(regularNames,['아이보리 데이','추가한 꽃','코랄 다이어리'],label+' regular ordering stays inside its section');
  // Reset removes the local draft; independently opened customer site never changes.
  await page.locator('#ownerReset').click();
  await waitNames('featured',['로지 모먼트','멜로우 선데이','퍼플 레터']);
  assert.deepEqual(await names(),['로지 모먼트','멜로우 선데이','퍼플 레터'],label+' reset restores order and fields');
  assert.equal(await page.locator('#ownerFeatured .os-product').count(),3);
  assert.equal(await page.locator('#ownerRegular .os-product').count(),2);
  assert.equal(await page.locator('.os-product-details[hidden]').count(),0,label+' reset opens editors');
  const publicPage=await context.newPage();
  await publicPage.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await publicPage.locator('#featured .card strong').allInnerTexts(),['로지 모먼트','멜로우 선데이','퍼플 레터'],label+' published customer page untouched');
  await publicPage.close();
  for(const width of [1440,1080,390,320]){
   await page.setViewportSize({width,height:900});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,label+' '+width+'px horizontal overflow='+overflow);
  }
  await page.setViewportSize({width:1440,height:900});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const axeResult=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(axeResult.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG 2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-70-owner-sort-'+label.toLowerCase()+'.png'});
  assert.deepEqual(errors,[],label+' runtime JS errors');
  console.log('PASS G3-70 '+label+' compact controls, live order, preview isolation, responsive layout, axe');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-70 '+(e.stack||e));server.close();process.exitCode=1;});
