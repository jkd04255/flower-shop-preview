'use strict';
/* G3-78 · targeted regression for the disabled 'review jump' when 20 arrival
 * entries are present, plus repeated photo selection and independent scroll. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lksAAAAASUVORK5CYII=','base64');
const photoA={name:'same-arrival.png',mimeType:'image/png',buffer:PNG};
const photoB={name:'same-arrival.png',mimeType:'image/png',buffer:Buffer.concat([PNG,Buffer.from('second-image-content')])};
const dataA='data:image/png;base64,'+photoA.buffer.toString('base64');
const dataB='data:image/png;base64,'+photoB.buffer.toString('base64');
const server=http.createServer((req,res)=>{
 let filename;
 try{const p=new URL(req.url,'http://localhost').pathname;
  filename=path.resolve(root,'.'+decodeURIComponent(p==='/'?'/index.html':p));}
 catch{res.writeHead(400);res.end();return;}
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filename,(err,data)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(data);
 });
});
async function run(engine,label,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const context=await browser.newContext({viewport:{width:1194,height:834},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'owner-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ownerArrivals .os-arrival').length===3);
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#arrivalList .arrival')?.dataset.ownerArrivalId==='arrival-1');
  const preview=page.frameLocator('#ownerPreview');
  const originalStore=await page.evaluate(()=>JSON.stringify(localStorage));
  // The end of a 20-item editor has to stay usable with native file inputs.
  for(let i=0;i<17;i++)await page.locator('#ownerAddArrival').click();
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),20,label+' max items');
  const picker=page.locator('#os-arrival-file-owner-arrival-17');
  const thumb=page.locator('[data-arrival-thumb="owner-arrival-17"]');
  const originalPhoto=await thumb.getAttribute('src');
  await picker.focus();
  await picker.setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});
  assert.match(await page.locator('#ownerStatus').innerText(),/3MB 이하 JPG·PNG·WebP/,label+' invalid format explained');
  assert.equal(await thumb.getAttribute('src'),originalPhoto,label+' invalid file cannot change preview');
  assert.equal(await picker.inputValue(),'',label+' file input reset to permit retry');
  await picker.setInputFiles(photoA);
  await page.waitForFunction(value=>document.querySelector('[data-arrival-thumb="owner-arrival-17"]')?.getAttribute('src')===value,dataA);
  await picker.setInputFiles(photoB);
  await page.waitForFunction(value=>document.querySelector('[data-arrival-thumb="owner-arrival-17"]')?.getAttribute('src')===value,dataB);
  assert.equal(await picker.inputValue(),'',label+' reselect same filename with different bytes');
  await page.waitForFunction(value=>{
   const doc=document.querySelector('#ownerPreview')?.contentDocument;
   return doc?.querySelector('#arrivalList .arrival:last-child img')?.getAttribute('src')===value;
  },dataB);
  assert.ok(await page.locator('[data-restore-arrival-photo="owner-arrival-17"]').isEnabled());
  await page.locator('[data-restore-arrival-photo="owner-arrival-17"]').click();
  assert.equal(await thumb.getAttribute('src'),originalPhoto,label+' photo restored');
  // Editing while scrolled in the iframe should not shift the iframe itself.
  await preview.locator('#arrivals').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentWindow?.scrollY>100);
  const iframeY=await page.evaluate(()=>document.querySelector('#ownerPreview').contentWindow.scrollY);
  await page.evaluate(()=>{
   const input=document.getElementById('os-arrival-owner-arrival-16-name');
   input.value='반복 수정된 입고';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForFunction(()=>[...document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#arrivalList .arrival strong')||[]].some(x=>x.textContent==='반복 수정된 입고'));
  assert.ok(Math.abs(await page.evaluate(()=>document.querySelector('#ownerPreview').contentWindow.scrollY)-iframeY)<=60,label+' preview scroll stays stable after edit');
  await page.locator('#ownerChangesToggle').click();
  // Reproduce: delete a baseline flower, replace it while already at the cap.
  await page.locator('#ownerArrivals [data-remove-arrival="arrival-1"]').click();
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),19);
  await page.locator('#ownerAddArrival').click();
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),20);
  assert.ok(await page.locator('#ownerAddArrival').isDisabled());
  assert.ok(await page.locator('#ownerUndoArrival').isDisabled());
  const count=page.locator('#ownerArrivalCount');
  assert.equal(await count.getAttribute('tabindex'),'-1',label+' count can receive programmatic focus');
  const deletedOne=page.locator('#ownerChangesList li').filter({hasText:'입고 소식 삭제: 가든 로즈'});
  assert.equal(await deletedOne.count(),1);
  assert.equal(await deletedOne.locator('[data-review-target]').getAttribute('data-review-target'),'ownerUndoArrival');
  await deletedOne.locator('[data-review-target]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerArrivalCount',label+' 20-item recent undo fallback focuses count');
  assert.match(await page.locator('#ownerStatus').innerText(),/최대 20개/,label+' cap explanation');
  assert.ok(await count.evaluate(el=>el.classList.contains('os-jump-target')),label+' focus indicator');
  // A second baseline deletion makes the first one an older entry, whose
  // change-review link points to Add (also disabled at capacity).
  await page.locator('#ownerArrivals [data-remove-arrival="arrival-2"]').click();
  await page.locator('#ownerAddArrival').click();
  const older=page.locator('#ownerChangesList li').filter({hasText:'입고 소식 삭제: 가든 로즈'});
  assert.equal(await older.locator('[data-review-target]').getAttribute('data-review-target'),'ownerAddArrival');
  await older.locator('[data-review-target]').click();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerArrivalCount',label+' older deletion cap fallback');
  const latest=page.locator('#ownerChangesList li').filter({hasText:'입고 소식 삭제: 라넌큘러스'});
  assert.equal(await latest.locator('[data-review-target]').getAttribute('data-review-target'),'ownerUndoArrival');
  await latest.locator('[data-review-target]').click();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerArrivalCount',label+' latest deletion cap fallback');
  // After a deletion frees a slot, Add is an actionable target again.
  await page.locator('#ownerArrivals [data-remove-arrival="owner-arrival-17"]').click();
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),19);
  await older.locator('[data-review-target]').click();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerAddArrival',label+' available add control gets focus at 19');
  await page.locator('#ownerReset').click();
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#arrivalList .arrival').length===3);
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),3);
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),originalStore,label+' demo editing does not persist');
  // Check split screen and mobile stacking after repeated interactions.
  for(const width of [1440,1194,1024,834,820,390,320]){
   await page.setViewportSize({width,height:900});
   const measure=await page.evaluate(()=>{
    const root=document.documentElement;
    const controls=document.querySelector('.os-controls').getBoundingClientRect();
    const frame=document.querySelector('#ownerPreview').getBoundingClientRect();
    const text=document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#home #store .booking-info p');
    return{overflow:root.scrollWidth-root.clientWidth,controlRight:controls.right,frameLeft:frame.left,frameRight:frame.right,frameWidth:frame.width,bookingWidth:text?.getBoundingClientRect().width};
   });
   assert.ok(measure.overflow<=2,label+' '+width+' no horizontal overflow '+JSON.stringify(measure));
   assert.ok(measure.frameRight<=width+3,label+' '+width+' preview fits');
   if(width>=834)assert.ok(measure.frameLeft>=measure.controlRight-10,label+' '+width+' split preserved');
   else assert.ok(measure.frameWidth>width*.6,label+' '+width+' stacked preview');
   assert.ok(measure.bookingWidth>=165,label+' '+width+' readable booking note');
  }
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(accessibility.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' axe WCAG 2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-78-owner-'+label.toLowerCase()+'-mobile.png'});
  await page.setViewportSize({width:1194,height:834});
  await page.screenshot({path:'qa-artifacts/g3-78-owner-'+label.toLowerCase()+'-ipad.png'});
  const independent=await context.newPage();
  await independent.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await independent.locator('#arrivalList .arrival strong').allInnerTexts(),['가든 로즈','라넌큘러스','라일락 튤립'],label+' public customer arrivals untouched');
  await independent.close();
  assert.deepEqual(errors,[],label+' runtime errors');
  console.log('PASS G3-78 '+label+' capped review focus, photo retries, preview scroll, responsive iPad/phone, axe and isolation');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{await run(chromium,'Chromium',base);await run(webkit,'WebKit',base);}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-78 '+(err.stack||err));server.close();process.exitCode=1;});
