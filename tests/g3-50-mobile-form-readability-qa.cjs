'use strict';
/* G3-50: mobile booking inputs need full-width, 16px fonts and complete
   direct date->time->review behavior. Chromium and Linux WebKit only:
   simulated WebKit is not an actual iPhone Safari/Instagram device. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),types={'.html':'text/html;charset=utf-8','.js':'application/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let p;
 try{
  const u=new URL(req.url,'http://localhost');
  p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,b)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});res.end(b);
 });
});
const inputIds=['rDate','rTime','rName','rPhone','rMemo'];
async function metrics(page){
 return page.evaluate(ids=>{
  const info=Object.fromEntries(ids.map(id=>{
   const el=document.getElementById(id),r=el.getBoundingClientRect(),css=getComputedStyle(el);
   return [id,{x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height,font:parseFloat(css.fontSize)}];
  }));
  const form=document.getElementById('reserveForm').getBoundingClientRect();
  return {info,form:{x:form.x,right:form.right},overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
 },inputIds);
}
async function check(engine,name,url){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const context=await browser.newContext({
   viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
   reducedMotion:'reduce',timezoneId:'Asia/Seoul'
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,360,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#reserveForm').waitFor({state:'visible'});
   const m=await metrics(page);
   assert.ok(m.overflow<=2,name+' horizontal overflow '+width+'px: '+m.overflow);
   for(const id of inputIds){
    const a=m.info[id];
    assert.ok(a.w>100&&a.x>=0&&a.right<=width+1,name+' field clipping '+width+'px '+id+': '+JSON.stringify(a));
    assert.ok(a.h>=50,name+' small target '+width+'px '+id);
   }
   if(width<=600){
    for(const [first,second] of [['rDate','rTime'],['rName','rPhone']]){
     const a=m.info[first],b=m.info[second];
     assert.ok(b.y>=a.bottom-1,name+' vertical fields should not overlap '+width+'px '+first+' '+second);
     assert.ok(Math.abs(a.x-b.x)<2&&Math.abs(a.w-b.w)<2,name+' mobile fields should be single column '+width+'px');
     assert.ok(a.w>=m.form.right-m.form.x-3,name+' mobile fields should fill form '+width+'px');
    }
    for(const id of inputIds)assert.ok(m.info[id].font>=16,name+' 16px focus font '+width+'px '+id);
   }else{
    assert.ok(m.info.rTime.x>=m.info.rDate.right+6,name+' original two-column desktop pickup '+width+'px');
    assert.ok(m.info.rPhone.x>=m.info.rName.right+6,name+' original two-column desktop contact '+width+'px');
   }
   assert.equal(await page.locator('#reserveQuickDetails').count(),0,'unwanted shortcut disclosure must remain removed');
   assert.equal(await page.locator('#reserveProgress li').count(),3,'three-stage booking preserved');
   if(width===390){
    fs.mkdirSync('qa-artifacts',{recursive:true});
    await page.screenshot({path:'qa-artifacts/g3-50-booking-form-'+name.toLowerCase()+'-390.png'});
   }
   console.log('PASS G3-50 '+name+' '+width+'px field sizing, navigation and visual constraints');
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.match(await page.locator('.booking-form .form-hint').innerText(),/상품별 준비시간 적용/);
  const legal=await page.evaluate(()=>{
   const bounds=pickupBounds(),d=dateFromLocalString(bounds.min);
   for(;localDateString(d)<=bounds.max;d.setDate(d.getDate()+1)){
    const date=localDateString(d),times=pickupSlots(0,date);
    if(times.length)return {date,time:times[0]};
   }
   return null;
  });
  assert.ok(legal,name+' expected some valid synthetic slots');
  assert.equal(await page.locator('#rTime').isDisabled(),true);
  await page.locator('#rDate').fill(legal.date);
  assert.equal(await page.locator('#rTime').isDisabled(),false);
  await page.locator('#rTime').selectOption(legal.time);
  const preview=await page.locator('#rPickupPreview').innerText();
  assert.ok(preview.includes(legal.date+' '+legal.time),name+' direct date and time summary');
  await page.locator('#rName').fill('가상 고객');
  await page.locator('#rPhone').fill('01000000000');
  await page.locator('#reserveForm button[type="submit"]').click();
  await page.locator('#reserveReview').waitFor({state:'visible'});
  assert.equal(await page.locator('#rReviewDate').innerText(),legal.date);
  assert.equal(await page.locator('#rReviewTime').innerText(),legal.time);
  await page.locator('#rReviewEdit').click();
  await page.locator('#reserveForm').waitFor({state:'visible'});
  assert.equal(await page.locator('#rDate').inputValue(),legal.date,'edit retains valid pickup date');
  assert.equal(await page.locator('#rTime').inputValue(),legal.time,'edit retains valid pickup time');
  assert.match(await page.locator('#reservation .submit-note').innerText(),/실제 개인정보를 입력하지 마세요/);
  assert.match(await page.locator('#reservation .transfer-explainer').innerText(),/송금하지 마세요/);
  const footer=(await page.locator('footer').innerText()).match(/G3-([0-9]+) STATIC DEMO/);
  assert.ok(footer&&Number(footer[1])>=50,'G3-50+ footer');
  assert.deepEqual(errors,[],name+' JS errors');
  console.log('PASS G3-50 '+name+' end-to-end direct booking, review, edit and demo safety');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);console.log('PASS G3-50 mobile booking form readability');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-50 '+(e.stack||e));server.close();process.exitCode=1;});
