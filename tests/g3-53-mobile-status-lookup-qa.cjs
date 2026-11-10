'use strict';
/* G3-53 — mobile booking-status search hierarchy (Chromium + Linux WebKit).
 * No real customer bookings, phone numbers or payment transactions.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript'};
const server=http.createServer((req,res)=>{
 let p;try{
  const u=new URL(req.url,'http://localhost');
  p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,buf)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream'});res.end(buf);
 });
});
async function check(engine,name,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
   args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  const button=page.locator('#csSubmit'),input=page.locator('#csLast4'),form=page.locator('#csLookupForm');
  for(const width of [320,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(url+'#/booking-status',{waitUntil:'domcontentloaded'});
   await page.locator('#customerStatus').waitFor({state:'visible'});
   const m=await page.evaluate(()=>{
    const get=id=>document.querySelector(id);
    const form=get('#csLookupForm'),row=get('#customerStatus .cs-search-row'),
     input=get('#csLast4'),button=get('#csSubmit'),help=get('#csLookupHelp');
    const box=e=>{const r=e.getBoundingClientRect();return{
     left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    return {form:box(form),input:box(input),button:box(button),help:box(help),
     rowDisplay:getComputedStyle(row).display,
     formBg:getComputedStyle(form).backgroundColor,
     formTopBorder:getComputedStyle(form).borderTopWidth,
     inputFont:parseFloat(getComputedStyle(input).fontSize),
     buttonFont:parseFloat(getComputedStyle(button).fontSize),
     labelFont:parseFloat(getComputedStyle(get('#csLookupForm label')).fontSize),
     overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
   });
   assert.ok(m.overflow<=2,name+' overflow '+width+'px: '+m.overflow);
   assert.ok(m.button.left>=0&&m.button.right<=width+2,name+' CTA in viewport at '+width);
   assert.ok(m.input.left>=0&&m.input.right<=width+2,name+' input in viewport at '+width);
   if(width<=600){
    assert.equal(m.rowDisplay,'grid',name+' one-column lookup '+width);
    assert.ok(m.button.top>=m.input.bottom-1,name+' button must follow input '+width);
    assert.ok(m.button.width>=m.form.width-3,name+' mobile full-width CTA '+width);
    assert.ok(m.button.height>=50&&m.input.height>=50,name+' accessible touch controls '+width);
    assert.equal(m.formBg,'rgba(0, 0, 0, 0)',name+' no heavy filled card '+width);
    assert.equal(m.formTopBorder,'1px',name+' subtle separator '+width);
    assert.ok(m.labelFont>=14&&m.inputFont>=16&&m.buttonFont>=15,name+' readable mobile type '+width);
    assert.ok(m.help.top>=m.button.bottom-1,name+' sample help below CTA '+width);
   }else{
    assert.notEqual(m.rowDisplay,'grid',name+' preserve desktop form layout '+width);
   }
   if(width===390){
    await input.fill('1002');
    await button.click();
    const card=page.locator('#csResults .cs-card');
    assert.equal(await card.count(),1,name+' known synthetic lookup works');
    assert.match(await card.innerText(),/입금 전/);
    assert.equal(await page.locator('#csLookupAgain').isVisible(),true);
    assert.match(await page.locator('#csLookupHelp').innerText(),/실제 전화번호는 입력하지 마세요/);
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:[
      'wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
    assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],
     name+' 390px WCAG 2.1 AA');
    fs.mkdirSync('qa-artifacts',{recursive:true});
    await page.screenshot({path:'qa-artifacts/g3-53-status-lookup-'+name.toLowerCase()+'-390.png'});
    await page.locator('#csLookupAgain').click();
    assert.equal(await card.count(),0,name+' relookup clears prior result');
    assert.equal(await input.inputValue(),'');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'csLast4');
    await input.fill('12');
    await button.click();
    assert.match(await page.locator('#csStatusMessage').innerText(),/숫자 4자리를 입력/);
    assert.equal(await card.count(),0,name+' invalid code cannot leave stale results');
   }
   console.log('PASS G3-53 '+name+' '+width+'px: lookup hierarchy and existing data flow');
  }
  const demoVersion=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(demoVersion&&Number(demoVersion[1])>=53,'G3-53 or later demo footer required');
  assert.deepEqual(errors,[],name+' javascript errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-53 full Chromium/WebKit mobile status lookup QA');}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-53 '+(err.stack||err));server.close();process.exitCode=1;});
