'use strict';
/* G3-47: customer-facing reservation/status clarity without touching demo logic.
   Browser verification in Chromium and Linux WebKit across mobile/desktop. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),types={'.html':'text/html;charset=utf-8','.webp':'image/webp','.js':'application/javascript','.png':'image/png'};
const server=http.createServer((req,res)=>{
 let p;
 try{const u=new URL(req.url,'http://localhost');p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,b)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});res.end(b);});
});
async function check(engine,name,url){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const ctx=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    reducedMotion:'reduce',timezoneId:'Asia/Seoul'
  });
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
   await page.locator('#reservation').waitFor({state:'visible'});
   assert.equal(await page.locator('#reservation .booking-form .reserve-quick-actions button').count(),4,'four quick actions preserved');
   assert.equal(await page.locator('#reserveForm').isVisible(),true);
   const note=await page.locator('#reservation .booking-form .submit-note').innerText();
   assert.match(note,/실제 개인정보/,'safety guidance kept');
   assert.match(note,/서버에 전송·저장되지 않습니다/,'demo-only safety guidance kept');
   const disclaimer=await page.locator('#reservation .transfer-explainer').innerText();
   assert.match(disclaimer,/송금하지 마세요/,'no real payments');
   const nav=await page.locator('#reservation .reserve-quick-actions').evaluate(el=>{
    const r=el.getBoundingClientRect();
    return {cols:getComputedStyle(el).gridTemplateColumns,box:{width:r.width,top:r.top,bottom:r.bottom},
      children:[...el.querySelectorAll('button')].map(b=>{
       const x=b.getBoundingClientRect(),style=getComputedStyle(b);
       return {width:x.width,height:x.height,left:x.left,right:x.right,color:style.color,text:b.textContent.trim()};
      })};
   });
   for(const b of nav.children){
    assert.ok(b.height>=44&&b.width>80&&b.left>=0&&b.right<=width+1,
      name+' tappable compact quick action '+width+': '+JSON.stringify(b));
   }
   const reserveOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(reserveOverflow<=2,name+' reservation overflow '+width+'px '+reserveOverflow);
   assert.equal(await page.locator('#rReviewConfirm').count(),1,'review request action retained');
   assert.equal(await page.locator('#reserveProgress li').count(),3,'progress retained');
   console.log('PASS G3-47 '+name+' reservation '+width+'px: concise copy, 4 controls, safety notes, no overflow');

   await page.goto(url+'#/booking-status',{waitUntil:'domcontentloaded'});
   await page.locator('#customerStatus').waitFor({state:'visible'});
   const desc=await page.locator('#customerStatus .cs-desc').innerText();
   assert.ok(desc.length<95,name+' concise status intro');
   assert.match(desc,/실제 고객 예약/,'synthetic-data notice retained');
   assert.match(await page.locator('#customerStatus .cs-disclaimer').innerText(),/개인정보 보호/);
   assert.match(await page.locator('#csLookupHelp').innerText(),/실제 전화번호는 입력하지 마세요/);
   const statusOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(statusOverflow<=2,name+' booking status overflow '+width+'px '+statusOverflow);
   const search=await page.locator('#csLookupForm').boundingBox();
   assert.ok(search&&search.width>0&&search.x>=0&&search.x+search.width<=width+1,'status search fits '+width);
   if(width===390){
    await page.locator('#csLast4').fill('1001');
    await page.locator('#csSubmit').click();
    await page.locator('#customerStatus .cs-card').first().waitFor({state:'visible'});
    assert.ok(await page.locator('#csRefreshStatus').isVisible(),'refresh retained');
    assert.ok(await page.locator('#csLookupAgain').isVisible(),'relookup retained');
    fs.mkdirSync('qa-artifacts',{recursive:true});
    await page.screenshot({path:'qa-artifacts/g3-47-status-'+name.toLowerCase()+'-390.png'});
    await page.goto(url+'#/reserve/rosy-moment',{waitUntil:'domcontentloaded'});
    await page.screenshot({path:'qa-artifacts/g3-47-reserve-'+name.toLowerCase()+'-390.png'});
   }
   console.log('PASS G3-47 '+name+' status '+width+'px: compact lookup, demo warnings, no overflow');
  }
  assert.deepEqual(errors,[],name+' JavaScript errors');
  const version=(await page.locator('footer').innerText()).match(new RegExp('G3-([0-9]+) STATIC DEMO'));
  assert.ok(version&&Number(version[1])>=47,'G3-47 or newer demo marker');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);console.log('PASS G3-47 browser QA');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-47 '+(e.stack||e));server.close();process.exitCode=1;});
