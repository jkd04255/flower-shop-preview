'use strict';
/* G3-54: status-result card visual hierarchy and unchanged synthetic behavior.
   Chromium and Linux WebKit (not a physical iPhone or Instagram webview). */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript'};
const server=http.createServer((req,res)=>{
 let p;try{const u=new URL(req.url,'http://localhost');
  p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,b)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);});
});
async function verify(engine,name,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(url+'#/booking-status',{waitUntil:'domcontentloaded'});
   await page.locator('#customerStatus').waitFor({state:'visible'});
   await page.locator('#csLast4').fill('1002');
   await page.locator('#csSubmit').click();
   const card=page.locator('#csResults .cs-card');
   assert.equal(await card.count(),1,name+' sample 1002 single synthetic result '+width);
   const text=await card.innerText();
   assert.match(text,/입금 전/);
   assert.match(text,/000-0000-0000/);
   assert.match(text,/실제 계좌가 아니며 송금할 수 없습니다/);
   const m=await page.evaluate(()=>{
    const card=document.querySelector('#csResults .cs-card');
    const q=sel=>card.querySelector(sel);
    const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const css=e=>getComputedStyle(e);
    const heading=q('.cs-card-heading'),title=q('.cs-card-heading h2'),badge=q('.cs-badge'),
     pickup=q('.cs-pickup-strip'),items=[...card.querySelectorAll('.cs-pickup-item')],
     photo=q('.cs-photo'),details=q('.cs-detail-list'),steps=q('.cs-steps'),payment=q('.cs-payment'),
     bank=q('.cs-bank'),warning=q('.cs-bank-warning');
    return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     card:box(card),heading:box(heading),title:box(title),badge:box(badge),pickup:box(pickup),
     pickupItems:items.map(box),pickupValues:items.map(e=>e.querySelector('strong').innerText),
     photo:box(photo),photoSrc:photo.getAttribute('src'),details:box(details),detailCells:[...details.children].map(box),
     steps:box(steps),stepCount:steps.children.length,payment:box(payment),bank:box(bank),
     warning:box(warning),warnText:warning.innerText,
     headingDirection:css(heading).flexDirection,pickupBg:css(pickup).backgroundColor,
     paymentBg:css(payment).backgroundColor,titleFont:parseFloat(css(title).fontSize),
     pickupFont:parseFloat(css(items[0].querySelector('strong')).fontSize),
     badgeFont:parseFloat(css(badge).fontSize),photoWidth:box(photo).width};
   });
   assert.ok(m.overflow<=2,name+' '+width+'px overflow '+m.overflow);
   assert.equal(m.stepCount,4,name+' existing four steps');
   assert.equal(m.detailCells.length,6,name+' existing six details');
   assert.match(m.photoSrc,/assets\//,name+' approved local flower photo');
   assert.ok(m.card.left>=-1&&m.card.right<=width+1,name+' card within screen '+width);
   if(width<=600){
    assert.equal(m.headingDirection,'column',name+' simplified vertical heading '+width);
    assert.ok(m.title.bottom<=m.badge.top+1,name+' badge follows flower title '+width);
    assert.ok(m.badge.bottom<=m.pickup.top+1,name+' pickup after status '+width);
    assert.ok(m.pickup.bottom<=m.photo.top+1,name+' pickup essentials before photo '+width);
    assert.ok(m.photo.bottom<=m.details.top+2,name+' full-width photograph above details '+width);
    assert.ok(m.details.bottom<=m.steps.top+2,name+' status progression after details '+width);
    assert.ok(m.steps.bottom<=m.payment.top+2,name+' bank simulation after state steps '+width);
    assert.ok(m.pickupItems[1].left>m.pickupItems[0].left+20,name+' two-column pickup summary '+width);
    assert.ok(m.pickupFont>=17&&m.titleFont>=21&&m.badgeFont>=12,name+' mobile legibility '+width);
    assert.equal(m.pickupBg,'rgb(241, 244, 237)',name+' understated pickup emphasis '+width);
    assert.equal(m.paymentBg,'rgb(246, 247, 242)',name+' quiet payment follow-up '+width);
    assert.ok(m.photoWidth>width-90,name+' approved photo remains full-width '+width);
   }else{
    assert.equal(m.headingDirection,'row',name+' desktop heading preserved '+width);
    assert.equal(m.paymentBg,'rgb(241, 243, 233)',name+' desktop payment unchanged '+width);
    assert.ok(m.photo.right<m.details.left,name+' desktop photo next to details '+width);
   }
   assert.match(m.pickupValues[0],/^\d{4}-\d{2}-\d{2}/);
   assert.match(m.pickupValues[1],/^\d{2}:\d{2}$/);
   if(width===390){
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',
     values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
    assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],
      name+' visible result WCAG 2.1 AA');
    fs.mkdirSync('qa-artifacts',{recursive:true});
    await page.screenshot({path:'qa-artifacts/g3-54-status-result-'+name.toLowerCase()+'-390.png',fullPage:true});
    await page.locator('#csRefreshStatus').click();
    assert.equal(await card.count(),1,name+' refresh preserves visible synthetic record');
    await page.locator('#csLookupAgain').click();
    assert.equal(await card.count(),0,name+' relookup clears existing cards');
    assert.equal(await page.locator('#csLast4').inputValue(),'');
    await page.locator('#csLast4').fill('1003');
    await page.locator('#csSubmit').click();
    assert.equal(await card.count(),1,name+' confirmed synthetic record visible');
    assert.match(await card.innerText(),/예약 확정/);
    assert.equal(await card.locator('.cs-bank').count(),0,name+' confirmed card without pending bank block');
    await page.locator('#csLookupAgain').click();
    await page.locator('#csLast4').fill('12');
    await page.locator('#csSubmit').click();
    assert.equal(await card.count(),0,name+' invalid code never leaves a stale card');
    assert.match(await page.locator('#csStatusMessage').innerText(),/숫자 4자리를 입력/);
   }
   console.log('PASS G3-54 '+name+' '+width+'px: readable card, pickup and unchanged safe demo');
  }
  assert.match(await page.locator('footer').innerText(),/G3-54 STATIC DEMO/);
  assert.deepEqual(errors,[],name+' JS page errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await verify(chromium,'Chromium',url);await verify(webkit,'WebKit',url);
  console.log('PASS G3-54 both engines and axe; real iPhone/Instagram unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-54 '+(e.stack||e));server.close();process.exitCode=1;});
