'use strict';
/* G3-51 - Quiet mobile booking review layout with a clear final action.
   Test in Chromium and desktop Linux WebKit across mobile/desktop viewports. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.webp':'image/webp','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 let p;try{let u=new URL(req.url,'http://localhost');p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(e,b)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);});
});
async function check(engine,name,url){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#reserveForm').waitFor({state:'visible'});
   const available=await page.evaluate(()=>{
    const b=pickupBounds(),day=dateFromLocalString(b.min);
    for(;localDateString(day)<=b.max;day.setDate(day.getDate()+1)){
     const date=localDateString(day),times=pickupSlots(0,date);
     if(times.length)return {date,time:times[0]};
    }
    return null;
   });
   assert.ok(available,name+' expected valid synthetic pickup');
   await page.locator('#rDate').fill(available.date);
   await page.locator('#rTime').selectOption(available.time);
   await page.locator('#rName').fill('가상 고객');
   await page.locator('#rPhone').fill('01000000000');
   await page.locator('#reserveForm button[type="submit"]').click();
   await page.locator('#reserveReview').waitFor({state:'visible'});
   assert.equal(await page.locator('#rReviewTitle').innerText(),'예약 정보 확인');
   assert.equal(await page.locator('#reserveReview .review-list>div').count(),7,'all seven review items remain');
   assert.equal(await page.locator('#rReviewDate').innerText(),available.date);
   assert.equal(await page.locator('#rReviewTime').innerText(),available.time);
   assert.equal(await page.locator('#rReviewName').innerText(),'가상 고객');
   assert.match(await page.locator('#reserveReview .review-warning').innerText(),/실제 꽃집으로 접수/);
   const style=await page.evaluate(()=>{
    const review=document.querySelector('#reserveReview'),list=review.querySelector('.review-list'),
    row=list.querySelector('div'),edit=review.querySelector('#rReviewEdit'),confirm=review.querySelector('#rReviewConfirm'),
    actions=review.querySelector('.review-actions');
    const rect=el=>{const r=el.getBoundingClientRect();return{x:r.left,right:r.right,y:r.top,bottom:r.bottom,w:r.width,h:r.height}};
    return {review:rect(review),list:rect(list),listBg:getComputedStyle(list).backgroundColor,
      listBorder:getComputedStyle(list).borderLeftWidth,cols:getComputedStyle(actions).gridTemplateColumns,
      rowCols:getComputedStyle(row).gridTemplateColumns,edit:rect(edit),confirm:rect(confirm),
      editBg:getComputedStyle(edit).backgroundColor,editBorder:getComputedStyle(edit).borderTopWidth,
      confirmBg:getComputedStyle(confirm).backgroundColor,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
   });
   assert.ok(style.overflow<=2,name+' no horizontal overflow '+width+'px: '+style.overflow);
   assert.ok(style.edit.h>=44&&style.confirm.h>=50,name+' touch target sizes preserved at '+width);
   assert.ok(style.edit.x>=0&&style.edit.right<=width+1&&style.confirm.x>=0&&style.confirm.right<=width+1,name+' buttons within viewport '+width);
   if(width<=600){
    assert.equal(style.listBg,'rgba(0, 0, 0, 0)',name+' remove heavy review card fill');
    assert.equal(style.listBorder,'0px',name+' remove heavy left card outline');
    assert.ok(style.edit.y<style.confirm.y,name+' edit then final confirm in visual+keyboard order');
    assert.ok(style.confirm.w>=style.review.w-3,name+' final confirm fills width at '+width);
    assert.ok(style.edit.w>=style.review.w-3,name+' secondary link accessible across row '+width);
    assert.equal(style.editBorder,'0px',name+' edit is a quiet text action');
    assert.equal(style.editBg,'rgba(0, 0, 0, 0)',name+' edit has no button box');
    assert.equal(style.confirmBg,'rgb(53, 69, 56)',name+' green primary action remains');
   }else{
    assert.ok(style.confirm.x>=style.edit.right+5,name+' original 2-column desktop actions remain');
   }
   if(width===390){
    fs.mkdirSync('qa-artifacts',{recursive:true});
    await page.screenshot({path:'qa-artifacts/g3-51-mobile-review-'+name.toLowerCase()+'-390.png'});
   }
   if(width===320){
    await page.locator('#rReviewEdit').click();
    await page.locator('#reserveForm').waitFor({state:'visible'});
    assert.equal(await page.locator('#rDate').inputValue(),available.date,'edit preserves date');
    assert.equal(await page.locator('#rTime').inputValue(),available.time,'edit preserves time');
   }
   if(width===390){
    await page.locator('#rReviewConfirm').click();
    await page.locator('#reserveResult').waitFor({state:'visible'});
    assert.match(await page.locator('#reserveResult').innerText(),/실제 매장으로 접수되지 않았습니다/);
    assert.equal(await page.locator('#rrDate').innerText(),available.date);
    assert.equal(await page.locator('#rrTime').innerText(),available.time);
    assert.equal(await page.locator('#rMarkPaid').isVisible(),true,'synthetic demo payment retained');
    assert.ok(await page.locator('#rAgain').isVisible(),'navigation after result preserved');
   }
   console.log('PASS G3-51 '+name+' '+width+'px: review clarity, preserved details and proper actions');
  }
  const foot=(await page.locator('footer').innerText()).match(/G3-([0-9]+) STATIC DEMO/);
  assert.ok(foot&&Number(foot[1])>=51,'G3-51 static demo footer');
  assert.deepEqual(errors,[],name+' unexpected JavaScript errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);console.log('PASS G3-51 mobile review hierarchy');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-51 '+(e.stack||e));server.close();process.exitCode=1;});
