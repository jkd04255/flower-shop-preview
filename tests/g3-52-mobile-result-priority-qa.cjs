'use strict';
/* G3-52: result screen shows one dominant next step, while all old routes,
   simulated bank/payment state, accessibility and booking data remain. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.webp':'image/webp','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 let p;try{
  const u=new URL(req.url,'http://localhost');
  p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,b)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);});
});
async function verify(engine,name,url){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#reserveForm').waitFor({state:'visible'});
   const pick=await page.evaluate(()=>{
    const b=pickupBounds(),d=dateFromLocalString(b.min);
    for(;localDateString(d)<=b.max;d.setDate(d.getDate()+1)){
     const date=localDateString(d),times=pickupSlots(0,date);
     if(times.length)return {date,time:times[0]};
    }
    return null;
   });
   assert.ok(pick,name+' a synthetic pickup slot must exist');
   await page.locator('#rDate').fill(pick.date);
   await page.locator('#rTime').selectOption(pick.time);
   await page.locator('#rName').fill('가상 고객');
   await page.locator('#rPhone').fill('01000000000');
   await page.locator('#reserveForm button[type="submit"]').click();
   await page.locator('#reserveReview').waitFor({state:'visible'});
   await page.locator('#rReviewConfirm').click();
   await page.locator('#reserveResult').waitFor({state:'visible'});
   assert.equal(await page.locator('#rrDate').innerText(),pick.date);
   assert.equal(await page.locator('#rrTime').innerText(),pick.time);
   assert.match(await page.locator('#reserveResult').innerText(),/실제 매장으로 접수되지 않았습니다/);
   assert.match(await page.locator('#reserveResult .transfer-result').innerText(),/송금하지 마세요/);
   assert.equal(await page.locator('#rResultStatus').getAttribute('href'),'#/booking-status');
   assert.equal(await page.locator('#rAgain').getAttribute('href'),'#curation');
   assert.match(await page.locator('#rResultBack').getAttribute('href'),/^#\/flower\//);
   assert.equal(await page.locator('#reserveResult .result-secondary-nav a').count(),3);
   assert.equal(await page.locator('#reserveResult .result-secondary-nav a[href="#/admin-demo"]').count(),1);
   assert.equal(await page.locator('#rMarkPaid').isVisible(),true);
   assert.equal(await page.locator('#reserveResult a[href="#/booking-status"]').count(),1,
    name+' booking status should be single prominent navigation link');
   const m=await page.evaluate(()=>{
    const result=document.querySelector('#reserveResult'),main=result.querySelector('#rResultStatus'),
      transfer=result.querySelector('.transfer-result'),secondary=result.querySelector('.result-secondary-nav'),
      links=[...secondary.querySelectorAll('a')];
    const rect=el=>{let r=el.getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
    return {result:rect(result),main:rect(main),transfer:rect(transfer),secondary:rect(secondary),
      links:links.map(el=>({rect:rect(el),bg:getComputedStyle(el).backgroundColor,font:parseFloat(getComputedStyle(el).fontSize),border:getComputedStyle(el).borderLeftWidth})),
      mainColor:getComputedStyle(main).backgroundColor,mainFont:parseFloat(getComputedStyle(main).fontSize),
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
   });
   assert.ok(m.overflow<=2,name+' horizontal overflow at '+width+'px: '+m.overflow);
   assert.ok(m.main.x>=0&&m.main.right<=width+1&&m.main.h>=44,'main booking status target visible '+width);
   for(const link of m.links)assert.ok(link.rect.h>=44&&link.rect.x>=0&&link.rect.right<=width+1,
      'other navigation remains tappable within viewport '+width);
   if(width<=600){
    assert.ok(m.main.w>=m.result.w-3,name+' one full-width primary action at '+width);
    assert.ok(m.main.bottom<m.transfer.y+2,name+' status call to action before payment demo at '+width);
    assert.ok(m.transfer.bottom<m.secondary.y+2,name+' secondary navigation below payment demo at '+width);
    assert.equal(m.mainColor,'rgb(53, 69, 56)',name+' dominant dark green CTA');
    assert.ok(m.mainFont>=15,name+' legible primary action '+width);
    for(let i=0;i<m.links.length;i++){
     assert.equal(m.links[i].bg,'rgba(0, 0, 0, 0)','quiet navigation has no filled boxes '+width);
     assert.ok(m.links[i].font>=12,'quiet links still readable '+width);
     if(i)assert.ok(m.links[i].rect.y>=m.links[i-1].rect.bottom-1,'secondary links stacked '+width);
    }
   }
   if(width===390){
    fs.mkdirSync('qa-artifacts',{recursive:true});
    await page.screenshot({path:'qa-artifacts/g3-52-completion-'+name.toLowerCase()+'-390.png'});
    await page.locator('#rMarkPaid').click();
    assert.match(await page.locator('#rPaymentState').innerText(),/실제 은행 거래나 송금은 발생하지 않았습니다/);
    await page.locator('#rResultStatus').click();
    await page.locator('#customerStatus').waitFor({state:'visible'});
    assert.match(await page.locator('#customerStatus .cs-desc').innerText(),/실제 고객 예약/);
   }
   console.log('PASS G3-52 '+name+' '+width+'px: one prominent booking-status route, secondary routes and synthetic safety retained');
  }
  const footer=(await page.locator('footer').innerText()).match(/G3-([0-9]+) STATIC DEMO/);
  assert.ok(footer&&Number(footer[1])>=52,'G3-52+ static demo');
  assert.deepEqual(errors,[],name+' JavaScript runtime errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 try{
  const base='http://127.0.0.1:'+server.address().port+'/';
  await verify(chromium,'Chromium',base);await verify(webkit,'WebKit',base);
  console.log('PASS G3-52 result-screen hierarchy regression');
 }finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-52 '+(e.stack||e));server.close();process.exitCode=1;});
