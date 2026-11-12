'use strict';
/* G3-73: compare owner draft with the initial synthetic baseline in RAM.
 * A read-only review: no publishing, storage, or customer-site mutation. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lksAAAAASUVORK5CYII=','base64');
const IMG_A={name:'flower-a.png',mimeType:'image/png',buffer:PNG};
const IMG_B={name:'flower-b.png',mimeType:'image/png',buffer:Buffer.concat([PNG,Buffer.from('review-only-tail')])};
const server=http.createServer((req,res)=>{
 let f;try{const name=new URL(req.url,'http://localhost').pathname;
  f=path.resolve(root,'.'+decodeURIComponent(name==='/'?'/index.html':name));}
 catch{res.writeHead(400);res.end();return;}
 if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(f,(err,data)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});res.end(data);
 });
});
async function verify(engine,label,url){
 const options=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...options});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(url+'owner-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('ownerFeatured')?.querySelectorAll('.os-product').length===3);
  const preview=page.frameLocator('#ownerPreview');
  await preview.locator('#home .hero .brand strong').waitFor();
  const list=page.locator('#ownerChangesList li');
  async function summary(count,fragments=[],excluded=[]){
   const entries=await list.allInnerTexts();
   assert.equal(entries.length,count||1,label+' comparison row count '+JSON.stringify(entries));
   const text=await page.locator('#ownerChangesCount').innerText();
   if(count===0){
    assert.match(text,/변경사항 없음/,label+' no pending changes');
    assert.deepEqual(entries,['변경사항이 없습니다.'],label+' empty summary');
   }else{
    assert.match(text,new RegExp('기본 시연 대비 '+count+'건 변경'),label+' pending count');
   }
   for(const fragment of fragments)assert.ok(entries.some(x=>x.includes(fragment)),label+' expected '+fragment+' in '+JSON.stringify(entries));
   for(const fragment of excluded)assert.ok(entries.every(x=>!x.includes(fragment)),label+' excluded '+fragment);
   assert.ok(entries.every(x=>!x.includes('data:image')&&!x.includes('base64,')),label+' no image-data leakage into human report');
  }
  const initialStore=await page.evaluate(()=>JSON.stringify(localStorage));
  assert.equal(await page.locator('#ownerChangesToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#ownerChangesDetails').isHidden(),true);
  await summary(0);
  await page.locator('#ownerChangesToggle').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ownerChangesToggle').getAttribute('aria-expanded'),'true',label+' keyboard expand');
  assert.equal(await page.locator('#ownerChangesDetails').isVisible(),true);
  await page.locator('#ownerBusinessName').fill('오후의 정원 새 이름');
  await summary(1,['가게 이름: 오후의 정원 → 오후의 정원 새 이름']);
  await page.locator('#ownerBusinessName').fill('오후의 정원');
  await summary(0);
  await page.locator('#ownerHeroUpload').setInputFiles(IMG_A);
  await page.waitForFunction(()=>document.getElementById('ownerHeroThumb')?.src.startsWith('data:image/png;base64,'));
  await summary(1,['메인 사진: 기본 사진 → 선택한 사진']);
  await page.locator('#ownerHeroRestore').click();
  await summary(0);
  await page.locator('#os-item-rosy-moment-input-price').fill('39000');
  await summary(0); // presentation formatting alone is not a real price change
  // Rapid sequential edits must result in one product-level change, not duplicate log entries.
  for(let i=0;i<4;i++){
   await page.locator('#os-item-rosy-moment-input-name').fill('로지 모먼트 시안 '+i);
   await page.locator('#os-item-rosy-moment-input-price').fill('5200'+i);
   await page.locator('#os-file-rosy-moment').setInputFiles(i%2?IMG_A:IMG_B);
   await page.waitForFunction(()=>document.querySelector('[data-thumb="rosy-moment"]')?.src.startsWith('data:image/png;base64,'));
   await summary(1,['로지 모먼트 시안 '+i,'가격','상품 사진 교체']);
   assert.equal(await page.locator('#ownerChangesDetails').isVisible(),true,label+' review stays expanded across edits');
  }
  await page.locator('#os-item-rosy-moment-input-name').fill('로지 모먼트');
  await page.locator('#os-item-rosy-moment-input-price').fill('39000');
  await page.locator('[data-restore-photo="rosy-moment"]').click();
  await summary(0);
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#featured .card strong')?.textContent==='로지 모먼트');
  // Changing other fields of one product creates one grouped, understandable report.
  await page.locator('#os-item-mellow-sunday-input-description').fill('가상 테스트용 설명 변경');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-field="available"]').uncheck();
  await summary(1,['설명','예약 상태']);
  await page.locator('#os-item-mellow-sunday-input-description').fill('천천히 흘러가는 오후의 색');
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-field="available"]').check();
  await summary(0);
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-move="up"]').click();
  await summary(1,['오늘의 꽃: 기존 상품 진열 순서 변경']);
  await page.locator('#ownerFeatured [data-product-id="mellow-sunday"] [data-move="down"]').click();
  await summary(0);
  await page.locator('#os-section-mellow-sunday').selectOption('regular');
  await summary(1,['진열 위치 오늘의 꽃 → 매일의 꽃다발'],['진열 순서 변경']);
  await page.locator('#os-section-mellow-sunday').selectOption('featured');
  await summary(0);
  // Added/deleted products are changes; undo restores original representation.
  await page.locator('#ownerAddFeatured').click();
  await page.locator('#os-item-owner-draft-1-input-name').fill('테스트 꽃다발');
  await summary(1,['상품 추가: 테스트 꽃다발']);
  await page.locator('#ownerFeatured [data-product-id="owner-draft-1"] [data-remove]').click();
  await summary(0);
  await page.locator('#ownerUndoDelete').click();
  await summary(1,['상품 추가: 테스트 꽃다발']);
  await page.locator('#ownerReset').click();
  await summary(0);
  assert.equal(await page.locator('#ownerUndoBar').isHidden(),true,label+' baseline reset clears undo');
  await page.locator('#ownerFeatured [data-product-id="rosy-moment"] [data-remove]').click();
  await summary(1,['상품 삭제: 로지 모먼트'],['진열 순서 변경']);
  await page.locator('#ownerUndoDelete').click();
  await summary(0);
  // Untrusted text is shown literally, never as executable markup.
  await page.locator('#ownerBusinessName').fill('<img src=x onerror=alert(1)>');
  await summary(1,['<img src=x onerror=alert(1)>']);
  assert.equal(await page.locator('#ownerChangesDetails img').count(),0,label+' text-only report prevents HTML injection');
  await page.locator('#ownerBusinessName').fill('오후의 정원');
  await summary(0);
  const independent=await context.newPage();
  await independent.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.equal(await independent.locator('#home .hero .brand strong').innerText(),'오후의 정원',label+' visitor page unaffected');
  assert.equal(await independent.locator('#featured .card').count(),3);
  await independent.close();
  for(const width of [1440,1080,780,390,320]){
   await page.setViewportSize({width,height:900});
   const metrics=await page.evaluate(()=>{
    const root=document.documentElement,section=document.getElementById('ownerChangesDetails');
    const rect=section.getBoundingClientRect();
    return{overflow:root.scrollWidth-root.clientWidth,detailRight:rect.right,visible:!section.hidden};
   });
   assert.ok(metrics.overflow<=2,label+' '+width+'px no overflow '+metrics.overflow);
   assert.ok(metrics.detailRight<=width+2,label+' change review stays within viewport');
   assert.ok(metrics.visible,label+' comparison remains open after responsive change');
  }
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  let axe=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(axe.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],label+' expanded panel mobile WCAG2.1AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-73-review-'+label.toLowerCase()+'-mobile.png',fullPage:false});
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#ownerBusinessName').fill('변경사항 화면');
  await summary(1,['가게 이름']);
  await page.screenshot({path:'qa-artifacts/g3-73-review-'+label.toLowerCase()+'-desktop.png',fullPage:false});
  await page.locator('#ownerChangesToggle').click();
  assert.equal(await page.locator('#ownerChangesToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#ownerChangesDetails').isHidden(),true);
  await page.locator('#ownerReset').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initialStore,label+' no new persistence');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('ownerChangesCount')?.textContent.includes('변경사항 없음'));
  assert.equal(await page.locator('#ownerChangesDetails').isHidden(),true,label+' fresh tab starts collapsed');
  assert.deepEqual(errors,[],label+' no JS runtime errors');
  console.log('PASS G3-73 '+label+' repeat edits, accurate change review, grouping, photo privacy, undo, reset, viewport and axe');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-73 '+(err.stack||err));server.close();process.exitCode=1;});
