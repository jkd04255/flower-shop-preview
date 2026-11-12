'use strict';
/* G3-75 user-reported iPad issue: compressed Korean copy in medium-width
 * customer preview, plus editable, removable (including zero) arrival news.
 * All changes remain in the owner iframe and the current tab only. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lksAAAAASUVORK5CYII=','base64');
const server=http.createServer((req,res)=>{
 let filepath;try{const u=new URL(req.url,'http://localhost');
  filepath=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!filepath.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filepath,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(filepath)]||'application/octet-stream'});res.end(data);});
});
async function verify(engine,label,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'owner-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ownerArrivals .os-arrival').length===3);
  const preview=page.frameLocator('#ownerPreview');
  const getNames=()=>preview.locator('#arrivalList .arrival strong').allInnerTexts();
  async function waitNames(expected){
   await page.waitForFunction(names=>{
    const doc=document.getElementById('ownerPreview')?.contentDocument;
    return JSON.stringify([...doc?.querySelectorAll('#arrivalList .arrival strong')||[]].map(el=>el.textContent))===JSON.stringify(names);
   },expected);
  }
  const baselineNames=['가든 로즈','라넌큘러스','라일락 튤립'];
  await waitNames(baselineNames);
  assert.deepEqual(await getNames(),baselineNames,label+' baseline inquiry-only arrivals');
  assert.match(await page.locator('#ownerArrivalCount').innerText(),/3개/);
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  assert.ok(await page.locator('#ownerArrivalsEmpty').isHidden());
  const storageBefore=await page.evaluate(()=>JSON.stringify(localStorage));
  // Narrow 730px iPad preview reproduces the original bug: 100% CTA and
  // horizontal flex made the text column a single Korean character wide.
  await page.evaluate(()=>{
   document.getElementById('ownerPreview').style.width='730px';
  });
  await page.waitForFunction(()=>{
   const frame=document.getElementById('ownerPreview');
   return frame?.contentWindow?.innerWidth>=701&&frame.contentWindow.innerWidth<=900;
  });
  const metrics=await preview.locator('#home #store .booking-info').evaluate(el=>{
   const body=el.querySelector('div'),paragraph=body.querySelector('p'),r=paragraph.getBoundingClientRect();
   return{width:el.clientWidth,direction:getComputedStyle(el).flexDirection,paragraphWidth:r.width,paragraphHeight:r.height,buttonWidth:el.querySelector('a').getBoundingClientRect().width};
  });
  assert.equal(metrics.direction,'column',label+' medium iframe uses vertical booking layout');
  assert.ok(metrics.paragraphWidth>=250,label+' description readable '+JSON.stringify(metrics));
  assert.ok(metrics.paragraphHeight<=250,label+' description not one-letter columns '+JSON.stringify(metrics));
  // The forced 730px width is only for reproducing the iPad breakpoint;
  // remove it before checking natural 320/390px responsive reflow.
  await page.evaluate(()=>document.getElementById('ownerPreview').style.removeProperty('width'));
  const announcement=preview.locator('#arrivalList .arrival').first();
  assert.match(await announcement.locator('em').innerText(),/문의 전용/);
  assert.equal(await preview.locator('#arrivalList a').count(),0,label+' arrival never becomes booking link');
  // Editing name/tag/price must update the actual iframe and the read-only change review.
  await page.locator('#os-arrival-arrival-1-name').fill('가든 로즈 시안');
  await page.locator('#os-arrival-arrival-1-tag').fill('11.12 / TODAY');
  await page.locator('#os-arrival-arrival-1-price').fill('13,000원 / 송이');
  await waitNames(['가든 로즈 시안','라넌큘러스','라일락 튤립']);
  assert.equal(await preview.locator('#arrivalList .arrival').first().locator('small').first().innerText(),'11.12 / TODAY');
  assert.equal(await preview.locator('#arrivalList .arrival').first().locator('small').last().innerText(),'13,000원 / 송이');
  assert.match(await page.locator('#ownerChangesCount').innerText(),/1건 변경/);
  await page.locator('#ownerChangesToggle').click();
  const edited=page.locator('#ownerChangesList li').filter({hasText:'가든 로즈 시안'});
  assert.equal(await edited.count(),1);
  await edited.locator('[data-review-target]').click();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'os-arrival-arrival-1-name',label+' arrival change jump focuses editor');
  // Photo upload and restore must stay in frame only, with original image restored.
  const originalPhoto=await page.locator('[data-arrival-thumb="arrival-1"]').getAttribute('src');
  await page.locator('#os-arrival-file-arrival-1').setInputFiles({name:'arrival.png',mimeType:'image/png',buffer:PNG});
  await page.waitForFunction(()=>document.querySelector('[data-arrival-thumb="arrival-1"]')?.src.startsWith('data:image/png;base64,'));
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#arrivalList .arrival img')?.src.startsWith('data:image/png;base64,'));
  assert.ok(await page.locator('[data-restore-arrival-photo="arrival-1"]').isEnabled());
  const humanReport=await page.locator('#ownerChangesList').innerText();
  assert.ok(!humanReport.includes('base64')&&!humanReport.includes('data:image'),label+' image data not exposed in review');
  await page.locator('[data-restore-arrival-photo="arrival-1"]').click();
  await page.waitForFunction(src=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#arrivalList .arrival img')?.getAttribute('src')===src,originalPhoto);
  assert.ok(await page.locator('[data-restore-arrival-photo="arrival-1"]').isDisabled());
  // Undo a single arrival deletion; do not conflate it with bouquet deletion undo.
  await page.locator('#ownerArrivals [data-remove-arrival="arrival-2"]').focus();
  await page.keyboard.press('Enter');
  await waitNames(['가든 로즈 시안','라일락 튤립']);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerUndoArrival',label+' delete focuses arrival undo');
  await page.keyboard.press('Enter');
  await waitNames(['가든 로즈 시안','라넌큘러스','라일락 튤립']);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'os-arrival-arrival-2-name',label+' undo focuses restored entry');
  assert.ok(await page.locator('#ownerUndoArrival').isHidden());
  // Remove all three original entries, including the last one. No minimum 3.
  for(const id of ['arrival-1','arrival-2','arrival-3']){
   await page.locator('#ownerArrivals [data-remove-arrival="'+id+'"]').click();
  }
  await waitNames([]);
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),0);
  assert.match(await page.locator('#ownerArrivalCount').innerText(),/0개/);
  assert.ok(await page.locator('#ownerArrivalsEmpty').isVisible());
  assert.match(await preview.locator('#arrivalList').innerText(),/현재 새로 들어온 꽃 소식이 없습니다/);
  assert.equal(await preview.locator('#featured .card').count(),3,label+' removing arrival news does not remove bouquet');
  assert.equal(await preview.locator('#regular .card').count(),2);
  assert.ok(await page.locator('#ownerAddArrival').isEnabled(),label+' zero-state remains editable');
  await page.locator('#ownerUndoArrival').click();
  await waitNames(['라일락 튤립']);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'os-arrival-arrival-3-name');
  // Add new owner-only arrival and modify its image; no persistence.
  await page.locator('#ownerAddArrival').click();
  await page.locator('#os-arrival-owner-arrival-1-name').fill('목련 새 입고');
  await page.locator('#os-arrival-owner-arrival-1-price').fill('가격 문의');
  await waitNames(['라일락 튤립','목련 새 입고']);
  assert.match(await page.locator('#ownerArrivalCount').innerText(),/2개/);
  assert.equal(await preview.locator('#arrivalList .arrival em').last().innerText(),'문의 전용');
  await page.locator('#ownerAddArrival').click();
  await page.locator('#os-arrival-owner-arrival-2-name').fill('오늘의 입고 2');
  await waitNames(['라일락 튤립','목련 새 입고','오늘의 입고 2']);
  // Extra items never change how many bouquet products a customer can order.
  assert.equal(await preview.locator('#featured .card').count(),3);
  // Simulate repeated entry edits and verify change-review buttons remain keyboard accessible.
  await page.locator('#os-arrival-owner-arrival-2-name').fill('오늘의 입고 3');
  await page.locator('#os-arrival-owner-arrival-2-name').fill('오늘의 입고 4');
  const entry=page.locator('#ownerChangesList li').filter({hasText:'오늘의 입고 4'});
  await entry.locator('[data-review-target]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'os-arrival-owner-arrival-2-name');
  await page.locator('#ownerReset').click();
  await waitNames(baselineNames);
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),3);
  assert.match(await page.locator('#ownerChangesCount').innerText(),/변경사항 없음/);
  assert.ok(await page.locator('#ownerUndoArrival').isHidden());
  for(const width of [1440,1080,780,390,320]){
   await page.setViewportSize({width,height:900});
   const size=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(size<=2,label+' '+width+'px no horizontal overflow: '+size);
  }
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(accessibility.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' owner arrivals WCAG2.1AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-75-arrivals-'+label.toLowerCase()+'-mobile.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'qa-artifacts/g3-75-arrivals-'+label.toLowerCase()+'-desktop.png'});
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),storageBefore,label+' owner edit never persists');
  const visitor=await context.newPage();
  await visitor.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await visitor.locator('#arrivalList .arrival strong').allInnerTexts(),baselineNames,label+' real standalone customer page unchanged');
  assert.equal(await visitor.locator('#owner-preview-width-fix').count(),0,label+' no preview-only style on public page');
  await visitor.close();
  assert.deepEqual(errors,[],label+' no uncaught browser errors');
  console.log('PASS G3-75 '+label+' iPad text width, arrival editor add/delete-to-zero/undo, photo, change-review, axe and privacy');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-75 arrival '+(e.stack||e));server.close();process.exitCode=1;});
