'use strict';
/* G3-48: user-requested date -> time-only initial booking flow.
   The shortcuts are still accessible through optional disclosure, never
   exposed as four competing primary choices by default. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),types={'.html':'text/html;charset=utf-8','.js':'application/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let p;try{
  const u=new URL(req.url,'http://localhost');
  p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,b)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});res.end(b);
 });
});
async function check(engine,name,url){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',err=>errors.push(err.message));
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
   // Same-document hash navigation retains inputs from the previous viewport.
   // Start a fresh page load for each viewport's default-state assertions.
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#reserveForm').waitFor({state:'visible'});
   const summary=page.locator('#reserveQuickDetails summary');
   assert.equal(await summary.count(),1,name+' optional tools disclosure exists');
   assert.equal(await page.locator('#reserveQuickDetails').evaluate(el=>el.open),false,name+' starts collapsed '+width);
   for(const selector of ['#rEarliestDate','#rNextDate','#rEarliestTime','#rLatestTime','#rEarliestStatus','#rNextDateStatus','#rEarliestTimeStatus','#rLatestTimeStatus']){
    assert.equal(await page.locator(selector).isVisible(),false,name+' optional control not in default layout: '+selector);
   }
   assert.equal(await page.locator('#rDate').isVisible(),true,name+' date remains visible');
   assert.equal(await page.locator('#rTime').isVisible(),true,name+' time remains visible');
   assert.equal(await page.locator('#rPickupPreview').isVisible(),false,'no selection before date and time');
   assert.equal(await page.locator('#reserveProgress li').count(),3,'existing three-step booking flow retained');

   const choices=await page.evaluate(()=>{
    const bounds=pickupBounds(),start=dateFromLocalString(bounds.min);
    for(let day=start;localDateString(day)<=bounds.max;day.setDate(day.getDate()+1)){
     const date=localDateString(day),times=pickupSlots(0,date);
     if(times.length)return {date,time:times[0]};
    }
    return null;
   });
   assert.ok(choices,'expected at least one legal mock pickup slot');
   await page.locator('#rDate').fill(choices.date);
   assert.equal(await page.locator('#rTime').isDisabled(),false,'selecting date enables time');
   assert.equal(await page.locator('#rTime').inputValue(),'','date alone never auto-selects time');
   await page.locator('#rTime').selectOption(choices.time);
   const preview=page.locator('#rPickupPreview');
   assert.equal(await preview.isVisible(),true,'one selected-pickup summary');
   const text=await preview.innerText();
   assert.ok(text.includes(choices.date+' '+choices.time),name+' date and time displayed together '+text);
   assert.ok(!await page.locator('#reserveQuickDetails').evaluate(el=>el.open),'manual choice does not expand extra options');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=2,name+' reservation overflow at '+width+': '+overflow);
   if(width===390){
    fs.mkdirSync('qa-artifacts',{recursive:true});
    await page.screenshot({path:'qa-artifacts/g3-48-simplified-pickup-'+name.toLowerCase()+'-390.png'});
   }

   await summary.click();
   assert.equal(await page.locator('#reserveQuickDetails').evaluate(el=>el.open),true,'optional helper expands');
   for(const selector of ['#rEarliestDate','#rNextDate','#rEarliestTime','#rLatestTime']){
    assert.equal(await page.locator(selector).isVisible(),true,'old shortcut available on demand '+selector);
   }
   await summary.click();
   assert.equal(await page.locator('#reserveQuickDetails').evaluate(el=>el.open),false,'optional helper closes again');
   assert.equal(await preview.isVisible(),true,'selected pickup remains after disclosure toggle');
   assert.match(await page.locator('#reservation .booking-form .submit-note').innerText(),/실제 개인정보/);
   assert.match(await page.locator('#reservation .transfer-explainer').innerText(),/송금하지 마세요/);
   console.log('PASS G3-48 '+name+' '+width+'px: only date/time shown, one selection summary, advanced helpers optional');
  }
  const foot=(await page.locator('footer').innerText()).match(/G3-([0-9]+) STATIC DEMO/);
  assert.ok(foot&&Number(foot[1])>=48,'G3-48 static demo marker');
  assert.deepEqual(errors,[],name+' JS errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);console.log('PASS G3-48 simplified pickup UI');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-48 '+(e.stack||e));server.close();process.exitCode=1;});
