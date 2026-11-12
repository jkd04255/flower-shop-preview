'use strict';
/* G3-77 · large (0~20) recent-arrival editor preservation & iPad preview QA.
 * Test demo-only local state. Chromium + WebKit + WCAG 2.1 AA axe. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let file;try{const name=new URL(req.url,'http://localhost').pathname;
  file=path.resolve(root,'.'+decodeURIComponent(name==='/'?'/index.html':name));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,content)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);
 });
});
async function check(engine,label,base){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:1194,height:834},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base+'owner-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#ownerArrivals .os-arrival').length===3);
  const preview=page.frameLocator('#ownerPreview');
  const ids=['arrival-1','arrival-2','arrival-3'];
  const initialNames=['가든 로즈','라넌큘러스','라일락 튤립'];
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelector('#arrivalList .arrival')?.dataset.ownerArrivalId==='arrival-1');
  const beforeStore=await page.evaluate(()=>JSON.stringify(localStorage));
  const first=page.locator('#ownerArrivals .os-arrival[data-arrival-id="arrival-1"]');
  const firstImage=await first.locator('img').getAttribute('src');
  await page.evaluate(()=>{
   const doc=document;
   window.__g377First=doc.querySelector('#ownerArrivals .os-arrival[data-arrival-id="arrival-1"]');
   window.__g377FirstInput=doc.getElementById('os-arrival-arrival-1-name');
   window.__g377FirstImage=window.__g377First.querySelector('img');
   const win=doc.querySelector('#ownerPreview').contentWindow;
   win.__g377FirstPreview=win.document.querySelector('#arrivalList .arrival');
  });
  // Repeated additions were previously tearing down every input and image.
  for(let i=1;i<=17;i++){
   await page.locator('#ownerAddArrival').click();
   assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),3+i,label+' add count '+i);
   assert.equal(await page.evaluate(()=>document.activeElement?.id),'os-arrival-owner-arrival-'+i+'-name',label+' new entry focused '+i);
   assert.ok(await page.evaluate(()=>window.__g377First===document.querySelector('#ownerArrivals .os-arrival[data-arrival-id="arrival-1"]')
    &&window.__g377FirstInput===document.getElementById('os-arrival-arrival-1-name')
    &&window.__g377FirstImage===document.querySelector('[data-arrival-thumb="arrival-1"]')),label+' unchanged editor card and input survive adding '+i);
  }
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),20);
  assert.match(await page.locator('#ownerArrivalCount').innerText(),/20개/);
  assert.ok(await page.locator('#ownerAddArrival').isDisabled(),label+' cap 20 enforced');
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#arrivalList .arrival').length===20);
  // The iframe should similarly retain original rows when adding 17 more.
  assert.ok(await page.evaluate(()=>{
   const win=document.querySelector('#ownerPreview').contentWindow;
   return win.__g377FirstPreview===win.document.querySelector('#arrivalList .arrival');
  }),label+' preview original row reused');
  // Change one near-last item repeatedly; it must retain keyboard focus,
  // editor-side content and the preview update.
  const last=page.locator('#os-arrival-owner-arrival-17-name');
  await last.focus();
  for(let i=0;i<6;i++){
   await last.fill('최근 입고 '+i);
   assert.equal(await page.evaluate(()=>document.activeElement?.id),'os-arrival-owner-arrival-17-name',label+' keyboard focus retained '+i);
   await page.waitForFunction(text=>{
    const win=document.querySelector('#ownerPreview').contentWindow;
    const rows=win.document.querySelectorAll('#arrivalList .arrival strong');
    return rows[rows.length-1]?.textContent===text;
   },'최근 입고 '+i);
  }
  // The edit pane and customer iframe must scroll independently.
  await preview.locator('#arrivals').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentWindow?.scrollY>100);
  const position=await page.evaluate(()=>{
   const controls=document.querySelector('.os-controls');controls.scrollTop=controls.scrollHeight*0.45;
   const preview=document.querySelector('#ownerPreview').contentWindow;
   return{controls:controls.scrollTop,preview:preview.scrollY};
  });
  await page.evaluate(()=>{
   const el=document.querySelector('#os-arrival-owner-arrival-10-tag');
   el.value='11.12 신규입고';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForFunction(()=>{
   const rows=document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#arrivalList .arrival small');
   return [...rows||[]].some(el=>el.textContent==='11.12 신규입고');
  });
  const drift=await page.evaluate(()=>({
   controls:document.querySelector('.os-controls').scrollTop,
   preview:document.querySelector('#ownerPreview').contentWindow.scrollY
  }));
  assert.ok(Math.abs(drift.controls-position.controls)<=3,label+' editor scroll stable '+JSON.stringify({position,drift}));
  assert.ok(Math.abs(drift.preview-position.preview)<=60,label+' iframe scroll stable '+JSON.stringify({position,drift}));
  // Deleting a middle card must preserve all other stable input/image nodes.
  await page.locator('#ownerArrivals [data-remove-arrival="owner-arrival-9"]').click();
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),19);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'ownerUndoArrival',label+' undo control focused after deletion');
  assert.ok(await page.evaluate(()=>window.__g377FirstInput===document.getElementById('os-arrival-arrival-1-name')),label+' other edit field not destroyed on deletion');
  await page.locator('#ownerUndoArrival').click();
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),20);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'os-arrival-owner-arrival-9-name',label+' restored card focused');
  assert.ok(await page.evaluate(()=>window.__g377First===document.querySelector('#ownerArrivals .os-arrival[data-arrival-id="arrival-1"]')),label+' original card unaffected by undo');
  // At max capacity, a pending older deletion cannot be silently undone.
  await page.locator('#ownerArrivals [data-remove-arrival="arrival-3"]').click();
  await page.locator('#ownerAddArrival').click();
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),20);
  assert.ok(await page.locator('#ownerUndoArrival').isDisabled(),label+' blocked undo is visibly disabled at 20');
  assert.ok(await page.locator('#ownerAddArrival').isDisabled());
  // 20 -> 0 must be supported, and 0 -> 1 must be possible.
  const removeIds=await page.locator('#ownerArrivals .os-arrival').evaluateAll(nodes=>nodes.map(n=>n.dataset.arrivalId));
  for(const id of removeIds){
   await page.locator('#ownerArrivals [data-remove-arrival="'+id+'"]').click();
  }
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),0);
  await page.waitForFunction(()=>document.querySelector('#ownerPreview')?.contentDocument?.querySelectorAll('#arrivalList .arrival').length===0);
  assert.ok(await page.locator('#ownerArrivalsEmpty').isVisible());
  assert.ok(await page.locator('#ownerAddArrival').isEnabled());
  assert.match(await preview.locator('#arrivalList').innerText(),/현재 새로 들어온 꽃 소식이 없습니다/);
  assert.equal(await preview.locator('#featured .card').count(),3,label+' bouquet gallery unchanged');
  await page.locator('#ownerUndoArrival').click();
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),1);
  await page.locator('#ownerReset').click();
  await page.waitForFunction(expected=>{
   const doc=document.querySelector('#ownerPreview')?.contentDocument;
   return JSON.stringify([...doc?.querySelectorAll('#arrivalList .arrival strong')||[]].map(n=>n.textContent))===JSON.stringify(expected);
  },initialNames);
  assert.equal(await page.locator('#ownerArrivals .os-arrival').count(),3);
  assert.equal(await page.locator('[data-arrival-thumb="arrival-1"]').getAttribute('src'),firstImage,label+' reset preserves original image');
  // iPad landscape and portrait split, responsive mobile stack, and the
  // previously reported one-letter booking paragraph bug.
  for(const width of [1440,1366,1194,1024,834,820,390,320]){
   await page.setViewportSize({width,height:900});
   const metrics=await page.evaluate(()=>{
    const root=document.documentElement;
    const workspace=document.querySelector('.os-workspace');
    const controls=document.querySelector('.os-controls').getBoundingClientRect();
    const frame=document.querySelector('#ownerPreview').getBoundingClientRect();
    const doc=document.querySelector('#ownerPreview').contentDocument;
    const paragraph=doc?.querySelector('#home #store .booking-info p');
    const booking=doc?.querySelector('#home #store .booking-info');
    return{overflow:root.scrollWidth-root.clientWidth,
     columns:getComputedStyle(workspace).gridTemplateColumns,
     editorRight:controls.right,frameLeft:frame.left,frameRight:frame.right,
     frameWidth:frame.width,paraWidth:paragraph?.getBoundingClientRect().width,
     direction:booking?getComputedStyle(booking).flexDirection:null};
   });
   assert.ok(metrics.overflow<=2,label+' '+width+'px page overflow '+JSON.stringify(metrics));
   assert.ok(metrics.frameRight<=width+3,label+' '+width+'px preview within screen');
   if(width>=834)assert.ok(metrics.frameLeft>=metrics.editorRight-10,label+' '+width+'px two-pane split');
   if(width<=820)assert.ok(metrics.frameWidth>width*.6,label+' '+width+'px stacked full width');
   assert.ok(metrics.paraWidth>=165,label+' '+width+'px booking copy not one-letter column: '+JSON.stringify(metrics));
  }
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const violations=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(violations.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG 2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-77-editor-'+label.toLowerCase()+'-mobile.png'});
  await page.setViewportSize({width:1194,height:834});
  await page.screenshot({path:'qa-artifacts/g3-77-editor-'+label.toLowerCase()+'-ipad.png'});
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),beforeStore,label+' no persistence');
  const standalone=await context.newPage();
  await standalone.goto(base+'index.html#top',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await standalone.locator('#arrivalList .arrival strong').allInnerTexts(),initialNames,label+' public customer page untouched');
  await standalone.close();
  assert.deepEqual(errors,[],label+' no runtime errors');
  console.log('PASS G3-77 '+label+' 0-20 arrivals, stable DOM, focus, split-preview, scroll, mobile and axe');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',base);await check(webkit,'WebKit',base);}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-77 '+(err.stack||err));server.close();process.exitCode=1;});
