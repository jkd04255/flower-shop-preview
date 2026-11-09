'use strict';
/** G3-40: mobile pickup summary, local demo-status refresh and preserved relookup.
 * Chromium and Linux WebKit; NOT physical iPhone Instagram WebView.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let filename;
 try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);filename=path.resolve(root,'.'+(p==='/'?'/index.html':p));}
 catch{res.writeHead(400);res.end();return;}
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filename,(e,b)=>{if(e){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(b);});
});
async function axePass(page,where){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const a=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
 assert.deepEqual(a.violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)})),[],where+' axe WCAG2.1 A/AA');
}
async function check(engine,name,base){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#/booking-status',{waitUntil:'domcontentloaded'});
  await page.locator('#customerStatus').waitFor({state:'visible'});
  const lookup=page.locator('#csLast4'),refresh=page.locator('#csRefreshStatus'),again=page.locator('#csLookupAgain'),cards=page.locator('#csResults .cs-card');
  assert.equal(await refresh.isHidden(),true);
  assert.equal(await cards.count(),0);
  await lookup.fill('1002');
  await page.locator('#csSubmit').tap();
  assert.equal(await cards.count(),1);
  assert.equal(await refresh.isVisible(),true);
  assert.equal(await again.isVisible(),true);
  const sample=await page.evaluate(()=>{
   const x=adminRequests.find(x=>x.id==='DEMO-002');
   const d=dateFromLocalString(x.date);
   return {date:x.date,time:x.time,weekday:['일','월','화','수','목','금','토'][d.getDay()]+'요일',product:P[x.productIndex][1]};
  });
  const summary=page.locator('#csResults .cs-pickup-strip');
  assert.equal(await summary.count(),1);
  assert.deepEqual((await summary.locator('.cs-pickup-item strong').allTextContents()),[sample.date+' ('+sample.weekday+')',sample.time]);
  const firstCardText=await cards.first().innerText();
  assert.ok(firstCardText.includes(sample.product));
  assert.ok(firstCardText.includes('000-0000-0000'));
  const initialData=await page.evaluate(()=>JSON.stringify(adminRequests));
  const initialStorage=await page.evaluate(()=>JSON.stringify(localStorage));
  await axePass(page,name+' pending date/time header');
  console.log('PASS G3-40 '+name+' immediate pickup date + weekday + time and existing pending bank details, axe zero');

  const out=path.join(root,'qa-artifacts');fs.mkdirSync(out,{recursive:true});
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const geometry=await page.evaluate(()=>{
    const card=document.querySelector('#csResults .cs-card');
    const head=card.querySelector('.cs-card-heading').getBoundingClientRect();
    const strip=card.querySelector('.cs-pickup-strip').getBoundingClientRect();
    const photo=card.querySelector('.cs-photo').getBoundingClientRect();
    const cells=[...card.querySelectorAll('.cs-pickup-item')].map(e=>({x:e.getBoundingClientRect().left,w:e.getBoundingClientRect().width}));
    const bold=[...card.querySelectorAll('.cs-pickup-item strong')].map(e=>({px:parseFloat(getComputedStyle(e).fontSize),width:e.getBoundingClientRect().width}));
    return{overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,head,strip,photo,cells,bold};
   });
   assert.ok(geometry.overflow<=2,name+' '+width+'px overflow: '+geometry.overflow);
   assert.ok(geometry.head.bottom<=geometry.strip.top+2,name+' summary must follow status heading');
   assert.ok(geometry.strip.bottom<=geometry.photo.top+2,name+' pickup summary must precede photo');
   assert.ok(geometry.cells[1].x>geometry.cells[0].x+30,'pickup date/time two-column mobile layout');
   assert.ok(geometry.bold.every(x=>x.px>=17),'pickup facts must be at least 17px on phone');
   assert.ok(geometry.bold.every(x=>x.width>30),'pickup text must have available width');
   await page.screenshot({path:path.join(out,'g3-40-'+name.toLowerCase()+'-'+width+'.png'),fullPage:true});
  }
  console.log('PASS G3-40 '+name+' 320/390px summary position, readable typography, no horizontal overflow');

  await refresh.tap();
  assert.equal(await cards.count(),1);
  assert.equal(await refresh.isVisible(),true);
  assert.match(await page.locator('#csStatusMessage').innerText(),/현재 브라우저의 가상 예약 상태를 다시 확인했습니다/);
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initialData,'refresh must not mutate synthetic booking state');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initialStorage,'refresh must not write synthetic storage or contact data');
  assert.ok(!new URL(page.url()).hash.includes('1002'));
  await refresh.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const focus=await refresh.evaluate(el=>({active:document.activeElement===el,visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle}));
  assert.ok(focus.active&&focus.visible&&focus.outline!=='none,JSON.stringify(focus));
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#csStatusMessage').innerText(),/다시 확인했습니다/);
  await axePass(page,name+' refreshed result');
  console.log('PASS G3-40 '+name+' local-only refresh, keyboard focus, status announcement and unchanged storage');

  await again.tap();
  assert.equal(await cards.count(),0);
  assert.equal(await refresh.isHidden(),true,'relookup also hides refresh control');
  assert.equal(await lookup.inputValue(),'');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'csLast4');
  await lookup.fill('1003');
  await page.locator('#csSubmit').tap();
  assert.equal(await refresh.isVisible(),true);
  assert.match(await cards.first().innerText(),/예약 확정/);
  assert.equal(await cards.first().locator('.cs-pickup-strip .cs-pickup-item').count(),2);
  await lookup.fill('12');
  await page.locator('#csSubmit').tap();
  assert.equal(await cards.count(),0);
  assert.equal(await refresh.isHidden(),true);
  await lookup.fill('9999');
  await page.locator('#csSubmit').tap();
  assert.equal(await cards.count(),0);
  assert.equal(await refresh.isHidden(),true);
  await axePass(page,name+' empty result');
  console.log('PASS G3-40 '+name+' existing relookup, confirmed status, invalid/not-found error paths');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#customerStatus').waitFor({state:'visible'});
  assert.equal(await cards.count(),0);
  assert.equal(await refresh.isHidden(),true);
  await page.setViewportSize({width:820,height:900});
  await lookup.fill('1001');
  await page.locator('#csSubmit').tap();
  assert.match(await cards.first().innerText(),/입금 확인 대기/);
  const desktop=await page.evaluate(()=>{
   const card=document.querySelector('#csResults .cs-card');
   const p=card.querySelector('.cs-photo').getBoundingClientRect();
   const d=card.querySelector('.cs-detail-list').getBoundingClientRect();
   const pickup=card.querySelector('.cs-pickup-strip').getBoundingClientRect();
   return{photoRight:p.right,detailLeft:d.left,stripHeight:pickup.height};
  });
  assert.ok(desktop.photoRight<desktop.detailLeft,'desktop photo + details remain side by side');
  assert.ok(desktop.stripHeight>0);
  assert.deepEqual(errors,[]);
  assert.match(await page.locator('footer').innerText(),/G3-40 STATIC DEMO/);
  console.log('PASS G3-40 '+name+' desktop unchanged, reload clears tab lookup, no runtime errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',base);await check(webkit,'WebKit',base);console.log('G3-40 Chromium/WebKit PASS; physical iPhone Instagram still unverified');}
 finally{server.close();}
}
run().catch(e=>{console.error('FAIL G3-40 '+(e.stack||e));server.close();process.exitCode=1;});
