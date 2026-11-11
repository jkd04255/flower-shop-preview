'use strict';
/* G3-66: mobile store's existing synthetic booking lookup form.
 * Linux WebKit automation does NOT certify physical iPhone Safari/Instagram. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.css':'text/css'};
const server=http.createServer((req,res)=>{
 let file;try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function check(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#store',{waitUntil:'domcontentloaded'});
  const fields=page.locator('#store .status-lookup-fields'),input=page.locator('#rStatusLast4'),submit=page.locator('#rStatusLookupSubmit');
  await input.waitFor({state:'visible'});
  const original=await page.evaluate(()=>({records:JSON.stringify(adminRequests),storage:JSON.stringify(localStorage)}));
  assert.equal(await input.getAttribute('maxlength'),'4',label+' 4-character cap preserved');
  assert.equal(await input.getAttribute('inputmode'),'numeric',label+' numeric mobile keyboard preserved');
  assert.equal(await input.getAttribute('autocomplete'),'off',label+' private lookup autocomplete disabled');
  assert.equal(await submit.innerText(),'가상 예약 조회 ↗',label+' original lookup CTA copy preserved');

  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const data=await page.evaluate(()=>{
    const fields=document.querySelector('#store .status-lookup-fields'),
     label=fields.querySelector('label'),input=document.querySelector('#rStatusLast4'),
     submit=document.querySelector('#rStatusLookupSubmit');
    const r=e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};
    const c=e=>getComputedStyle(e);
    return {
      documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      grid:r(fields),label:r(label),input:r(input),submit:r(submit),
      display:c(fields).display,columns:c(fields).gridTemplateColumns.split(' ').length,
      labelFont:parseFloat(c(label).fontSize),inputFont:parseFloat(c(input).fontSize),
      buttonFont:parseFloat(c(submit).fontSize),inputMin:parseFloat(c(input).minHeight),
      buttonMin:parseFloat(c(submit).minHeight),
      labelText:label.textContent.trim(),buttonText:submit.textContent,
      inputType:input.getAttribute('inputmode'),inputPattern:input.getAttribute('pattern')
    };
   });
   assert.ok(data.documentOverflow<=2,label+' '+width+'px no document overflow '+data.documentOverflow);
   assert.match(data.labelText,/전화번호 뒷자리 4자리/,label+' '+width+'px existing label');
   assert.equal(data.buttonText,'가상 예약 조회 ↗',label+' '+width+'px unchanged CTA');
   assert.equal(data.inputType,'numeric',label+' '+width+'px numeric input');
   assert.equal(data.inputPattern,'[0-9]{4}',label+' '+width+'px unchanged validation');
   if(width<=600){
    assert.equal(data.display,'grid',label+' '+width+'px single-column grid');
    assert.equal(data.columns,1,label+' '+width+'px exactly one input column');
    assert.ok(data.labelFont>=14&&data.buttonFont>=14,label+' '+width+'px readable label and CTA');
    assert.ok(data.inputFont>=16,label+' '+width+'px anti-zoom input typography');
    assert.ok(data.input.height>=52&&data.submit.height>=52,label+' '+width+'px 52px touch controls');
    assert.ok(data.inputMin>=52&&data.buttonMin>=52,label+' '+width+'px CSS min-height');
    assert.ok(data.submit.top>=data.input.bottom-1,label+' '+width+'px action follows input vertically');
    assert.ok(data.input.left>=data.grid.left-2&&data.input.right<=data.grid.right+2,label+' '+width+'px input within form');
    assert.ok(data.submit.left>=data.grid.left-2&&data.submit.right<=data.grid.right+2,label+' '+width+'px button within form');
    assert.ok(Math.abs(data.input.width-data.submit.width)<=2,label+' '+width+'px equal control widths');
   }else{
    assert.equal(data.display,'flex',label+' '+width+'px desktop retains existing flex layout');
    assert.equal(data.labelFont,12,label+' '+width+'px desktop label unchanged');
    assert.equal(data.buttonFont,13,label+' '+width+'px desktop CTA unchanged');
   }
   console.log('PASS G3-66 '+label+' '+width+'px form alignment, labels and tap targets');
  }

  await page.setViewportSize({width:390,height:844});
  await input.fill('12');
  await submit.click();
  assert.equal(new URL(page.url()).hash,'#store',label+' malformed demo suffix does not navigate');
  assert.match(await page.locator('#rStatusLookupResult').innerText(),/숫자 4자리를 입력/,label+' existing validation feedback');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),original.storage,label+' invalid lookup writes no storage');

  await input.fill('1002');
  await submit.click();
  await page.waitForURL(/#\/booking-status/);
  await page.locator('#csResults .cs-card').first().waitFor({state:'visible'});
  assert.equal(await page.locator('#csResults .cs-card').count(),1,label+' matched sample booking');
  assert.match(await page.locator('#csResults .cs-card').first().innerText(),/DEMO-002/,label+' original sample reservation ID');
  assert.equal(await page.locator('#csLast4').inputValue(),'',label+' no suffix kept in secondary form');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),original.records,label+' store lookup never changes synthetic bookings');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),original.storage,label+' no personal or payment storage writes');

  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG 2.1 AA no violations');
  await page.goto(url+'#store',{waitUntil:'domcontentloaded'});
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-66-mobile-store-lookup-'+label.toLowerCase()+'-390.png',fullPage:true});
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=66,label+' G3-66 static demo version');
  assert.deepEqual(errors,[],label+' no JavaScript errors');
  console.log('PASS G3-66 '+label+' malformed and valid sample lookups, WCAG axe and synthetic-only');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-66 Chromium/WebKit/axe; physical iPhone Safari and Instagram WebView remain unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-66 '+(e.stack||e));server.close();process.exitCode=1;});
