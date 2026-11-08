'use strict';
/* G3-27: real Chromium reproducible evidence for non-interactive detail heading
   focus outline. Browser automation is not iOS Instagram/WebKit device testing. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=process.cwd(),passed=[];
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let file;
 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname))}
 catch{res.writeHead(400);res.end();return}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(e,data)=>{
  if(e){res.writeHead(404);res.end();return}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
 });
});
function pass(what){passed.push(what);console.log('PASS G3-27 '+what)}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port+'/';
  for(const entry of [
   {width:390,card:'#featured a.card',slug:'rosy-moment',name:'로지 모먼트'},
   {width:320,card:'#regular a.card',slug:'ivory-day',name:'아이보리 데이'},
   {width:1280,card:'#featured a.card',slug:'rosy-moment',name:'로지 모먼트'}
  ]){
   await page.setViewportSize({width:entry.width,height:844});
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.locator(entry.card).first().click();
   await page.locator('#detail').waitFor({state:'visible'});
   assert.equal(new URL(page.url()).hash,'#/flower/'+entry.slug);
   const info=await page.evaluate(()=>{
    const h=document.getElementById('dTitle'),s=getComputedStyle(h);
    return {id:document.activeElement?.id,text:h.textContent,tabIndex:h.getAttribute('tabindex'),
     outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,background:s.backgroundColor,
     role:h.tagName,hasTargetedCSS:!!document.querySelector('#g3-27-detail-heading-focus')};
   });
   assert.deepEqual([info.id,info.text,info.tabIndex,info.outlineStyle,info.role,info.hasTargetedCSS],
    ['dTitle',entry.name,'-1','none','H1',true],JSON.stringify(info));
   pass(entry.width+'px '+entry.slug+': route retains heading focus and semantic H1 without default outline');
   await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
   await page.waitForTimeout(100);
   const afterScroll=await page.evaluate(()=>({
    focused:document.activeElement?.id,outline:getComputedStyle(document.getElementById('dTitle')).outlineStyle
   }));
   assert.deepEqual(afterScroll,{focused:'dTitle',outline:'none'});
   pass(entry.width+'px: page scroll does not leave a visible title focus rectangle');
   await page.keyboard.press('Tab');
   const linkFocus=await page.evaluate(()=>{
    const a=document.activeElement,s=getComputedStyle(a);
    return {id:a.id,tag:a.tagName,visible:a.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth)};
   });
   assert.equal(linkFocus.id,'dReserve',JSON.stringify(linkFocus));
   assert.equal(linkFocus.tag,'A');
   assert.ok(linkFocus.visible&&linkFocus.style!=='none'&&linkFocus.width>=2,JSON.stringify(linkFocus));
   pass(entry.width+'px: keyboard focus on actual booking link still clearly visible');
   if(entry.width===390){
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(()=>window.axe.run(document,{
     runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},
     resultTypes:['violations']
    }));
    assert.equal(axe.violations.length,0,JSON.stringify(axe.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)}))));
    pass('390px product detail WCAG axe-core auto scan: zero violations');
   }
  }
  assert.deepEqual(errors,[]);
  pass('no JavaScript runtime exceptions or navigation failures');
  await ctx.close();
  console.log('G3-27 REAL CHROMIUM DETAIL FOCUS QA PASS: '+passed.length+' checks');
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(e=>{console.error('FAIL '+(e.stack||e));server.close();process.exitCode=1;});
