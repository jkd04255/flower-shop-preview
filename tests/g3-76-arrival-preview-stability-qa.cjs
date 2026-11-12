'use strict';
/* G3-76: keep existing arrival DOM and iframe scroll position stable across
 * repeated edits, verify stale photo callbacks after delete/undo/reset,
 * and preserve the synthetic/preview-only G2 HOLD contract. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lksAAAAASUVORK5CYII=','base64');
const IMG_A={name:'arrival-repeat.png',mimeType:'image/png',buffer:PNG};
const IMG_B={name:'arrival-repeat.png',mimeType:'image/png',buffer:Buffer.concat([PNG,Buffer.from('second-variant')])};
const URL_A='data:image/png;base64,'+IMG_A.buffer.toString('base64');
const URL_B='data:image/png;base64,'+IMG_B.buffer.toString('base64');
const server=http.createServer((req,res)=>{
 let file;try{
  const u=new URL(req.url,'http://localhost');
  file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
 });
});
async function test(engine,label,url){
 const args=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...args});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(url+'owner-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ownerArrivals .os-arrival').length===3);
  const preview=page.frameLocator('#ownerPreview');
  await preview.locator('#arrivalList .arrival').first().waitFor();
  const names=['가든 로즈','라넌큘러스','라일락 튤립'];
  const waitArrival=async value=>page.waitForFunction(expected=>{
   const doc=document.querySelector('#ownerPreview')?.contentDocument;
   return doc?.querySelector('#arrivalList .arrival strong')?.textContent===expected;
  },value);
  // Wait for initial owner draft replacement of static rows; then track identity.
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#arrivalList .arrival')?.dataset.ownerArrivalId==='arrival-1');
  await page.evaluate(()=>{
   const win=document.querySelector('#ownerPreview').contentWindow;
   win.__g376Row=win.document.querySelector('#arrivalList .arrival');
   win.__g376Photo=win.__g376Row.querySelector('img');
  });
  const nameInput=page.locator('#os-arrival-arrival-1-name');
  // Repeated edits should NOT destroy all arrival rows/images or scroll position.
  for(let i=0;i<8;i++){
   const name='가든 로즈 '+String(i);
   await nameInput.fill(name);
   await waitArrival(name);
   const stable=await page.evaluate(()=>{
    const win=document.querySelector('#ownerPreview').contentWindow;
    return win.__g376Row===win.document.querySelector('#arrivalList .arrival')
      &&win.__g376Photo===win.document.querySelector('#arrivalList .arrival img');
   });
   assert.ok(stable,label+' repeated edit '+i+' preserves DOM/image identity');
  }
  await preview.locator('#arrivals').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentWindow?.scrollY>100);
  const before=await page.evaluate(()=>{
   const win=document.querySelector('#ownerPreview').contentWindow;
   const control=document.querySelector('.os-controls');control.scrollTop=410;
   return {preview:win.scrollY,control:control.scrollTop,firstPhoto:win.__g376Photo.getAttribute('src')};
  });
  // Programmatic input mimics a keyboard edit without Playwright scrolling to
  // the editor first, so we can isolate preview/outer pane scroll anchoring.
  await page.evaluate(()=>{
   const input=document.getElementById('os-arrival-arrival-1-tag');
   input.value='11.12 / TODAY';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#arrivalList .arrival small')?.textContent==='11.12 / TODAY');
  const after=await page.evaluate(()=>{
   const win=document.querySelector('#ownerPreview').contentWindow;
   return{preview:win.scrollY,control:document.querySelector('.os-controls').scrollTop,
     sameImage:win.__g376Photo===win.document.querySelector('#arrivalList .arrival img')};
  });
  assert.ok(Math.abs(after.preview-before.preview)<=60,label+' iframe scroll remains near previous position '+JSON.stringify({before,after}));
  assert.ok(Math.abs(after.control-before.control)<=3,label+' owner pane scroll independent');
  assert.ok(after.sameImage,label+' photo node not re-created on text edit');
  // Existing image-loading code already protects ticket/epoch. Exercise real
  // FileReader completion order rather than relying on fast real disk reads.
  await page.evaluate(()=>{
   const Native=window.FileReader;
   window.__g376Queue=[];
   window.FileReader=class DelayedFileReader{
    result=null;
    readAsDataURL(file){
     const inner=new Native();
     inner.onload=()=>{
      this.result=inner.result;
      window.__g376Queue.push(()=>this.onload?.());
     };
     inner.onerror=()=>window.__g376Queue.push(()=>this.onerror?.());
     inner.readAsDataURL(file);
    }
   };
  });
  const input=page.locator('#os-arrival-file-arrival-1');
  await input.setInputFiles(IMG_A);
  await input.setInputFiles(IMG_B); // same filename, new content
  await page.waitForFunction(()=>window.__g376Queue?.length===2);
  assert.equal(await input.inputValue(),'',label+' same filename may be reselected');
  await page.evaluate(()=>window.__g376Queue.splice(1,1)[0]()); // new first
  await page.waitForFunction(src=>document.querySelector('[data-arrival-thumb="arrival-1"]')?.getAttribute('src')===src,URL_B);
  await page.evaluate(()=>window.__g376Queue.shift()()); // stale old later
  assert.equal(await page.locator('[data-arrival-thumb="arrival-1"]').getAttribute('src'),URL_B,label+' last selection wins when callbacks resolve out of order');
  await page.waitForFunction(src=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#arrivalList .arrival img')?.getAttribute('src')===src,URL_B);
  assert.equal(await page.locator('#ownerChangesList').innerText().then(x=>x.includes('base64,')),false,label+' no data URLs in change review');
  await page.locator('[data-restore-arrival-photo="arrival-1"]').click();
  const original=await page.locator('[data-arrival-thumb="arrival-1"]').getAttribute('src');
  assert.notEqual(original,URL_B);
  await input.setInputFiles(IMG_B);
  await page.waitForFunction(()=>window.__g376Queue?.length===1);
  await page.locator('#ownerArrivals [data-remove-arrival="arrival-1"]').click();
  await page.locator('#ownerUndoArrival').click();
  assert.equal(await page.locator('[data-arrival-thumb="arrival-1"]').getAttribute('src'),original,label+' deleted/restored item retains original image');
  await page.evaluate(()=>window.__g376Queue.shift()());
  assert.equal(await page.locator('[data-arrival-thumb="arrival-1"]').getAttribute('src'),original,label+' late upload cannot overwrite undo');
  await input.setInputFiles(IMG_A);
  await page.waitForFunction(()=>window.__g376Queue?.length===1);
  await page.locator('#ownerReset').click();
  await page.evaluate(()=>window.__g376Queue.shift()());
  assert.equal(await page.locator('[data-arrival-thumb="arrival-1"]').getAttribute('src'),original,label+' late upload cannot overwrite reset');
  // Repeated 3->0->undo->0 changes affect the preview-only inquiry section.
  for(const id of ['arrival-1','arrival-2','arrival-3'])
   await page.locator('#ownerArrivals [data-remove-arrival="'+id+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#arrivalList .arrival').length===0);
  assert.match(await preview.locator('#arrivalList').innerText(),/현재 새로 들어온 꽃 소식이 없습니다/);
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),0);
  // Updating shop data must leave the zero-state placeholder DOM intact.
  const emptyStillSame=await page.evaluate(()=>{
   const win=document.querySelector('#ownerPreview').contentWindow;
   win.__g376Empty=win.document.querySelector('#arrivalList .muted');
   document.getElementById('ownerBusinessName').value='시연 변경';
   document.getElementById('ownerBusinessName').dispatchEvent(new Event('input',{bubbles:true}));
   return true;
  });
  assert.ok(emptyStillSame);
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#home .hero .nav .brand strong')?.textContent==='시연 변경');
  assert.ok(await page.evaluate(()=>{
   const win=document.querySelector('#ownerPreview').contentWindow;
   return win.__g376Empty===win.document.querySelector('#arrivalList .muted');
  }),label+' empty state stays stable across unrelated updates');
  await page.locator('#ownerUndoArrival').click();
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#arrivalList .arrival').length===1);
  await page.locator('#ownerReset').click();
  await page.waitForFunction(expected=>{
   const doc=document.querySelector('#ownerPreview')?.contentDocument;
   return JSON.stringify([...doc?.querySelectorAll('#arrivalList .arrival strong')||[]].map(el=>el.textContent))===JSON.stringify(expected);
  },names);
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),3);
  for(const width of [1440,1194,1024,780,390,320]){
   await page.setViewportSize({width,height:900});
   const measure=await page.evaluate(()=>{
    const root=document.documentElement,preview=document.getElementById('ownerPreview');
    return {overflow:root.scrollWidth-root.clientWidth,iframe:preview.getBoundingClientRect().width};
   });
   assert.ok(measure.overflow<=2,label+' '+width+'px no horizontal overflow');
   if(width>830)assert.ok(measure.iframe>200,label+' iPad split preview visible');
  }
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(accessibility.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' owner edit WCAG2.1AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-76-arrival-'+label.toLowerCase()+'-mobile.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'qa-artifacts/g3-76-arrival-'+label.toLowerCase()+'-desktop.png'});
  const visitor=await context.newPage();
  await visitor.goto(url+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await visitor.locator('#arrivalList .arrival strong').allInnerTexts(),names,label+' standalone customer page remains unchanged');
  assert.equal(await visitor.locator('#owner-preview-width-fix').count(),0,label+' preview-specific fix not injected publicly');
  await visitor.close();
  assert.deepEqual(errors,[],label+' JS runtime errors');
  console.log('PASS G3-76 '+label+' stable arrival DOM, scroll, queued photos, delete/undo/reset, zero entries, viewport & axe');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await test(chromium,'Chromium',url);await test(webkit,'WebKit',url);}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-76 '+(e.stack||e));server.close();process.exitCode=1;});
