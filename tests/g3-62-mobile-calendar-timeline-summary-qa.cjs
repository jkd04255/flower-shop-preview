'use strict';
/* G3-62 — accessible mobile calendar timeline summary hierarchy.
 * Linux WebKit is not physical iPhone Safari or Instagram WebView.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.css':'text/css'};
const server=http.createServer((req,res)=>{
 let file;
 try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function check(engine,label,url){
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/calendar-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#calGrid .cal-day').first().waitFor({state:'visible'});
  const records=await page.evaluate(()=>JSON.stringify(adminRequests));
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  const sample=await page.evaluate(()=>{
   const item=adminRequests.find(r=>r.status!=='rejected');
   return item?{date:item.date,id:item.id,status:item.status,product:P[item.productIndex][1]}:null;
  });
  assert.ok(sample,label+' representative synthetic booking exists');
  await page.evaluate(date=>calendarSelectDay(date),sample.date);
  const events=page.locator('#calEvents .cal-timeline-item');
  await events.first().waitFor({state:'visible'});
  const target=page.locator('#calEvents .cal-timeline-item[data-request-id="'+sample.id+'"]');
  await target.waitFor({state:'visible'});
  const summary=target.locator('summary');
  assert.equal(await target.evaluate(el=>el.open),false,label+' default collapsed summary');

  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const data=await page.evaluate(id=>{
    const row=[...document.querySelectorAll('#calEvents .cal-timeline-item')].find(el=>el.dataset.requestId===id);
    const summary=row.querySelector('summary'),name=summary.querySelector('.cal-timeline-name'),
     badge=summary.querySelector('.cal-timeline-state'),
     fold=summary.querySelector('.cal-fold-indicator'),group=summary.querySelector('.cal-timeline-heading-actions');
    const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const css=e=>getComputedStyle(e);
    return{
      docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      row:box(row),summary:box(summary),name:box(name),badge:box(badge),group:box(group),fold:box(fold),
      nameSize:parseFloat(css(name).fontSize),badgeSize:parseFloat(css(badge).fontSize),
      foldSize:parseFloat(css(fold).fontSize),summaryMin:parseFloat(css(summary).minHeight),
      groupDirection:css(group).flexDirection,badgeWrap:css(badge).whiteSpace,
      nameText:name.textContent,statusText:badge.textContent,foldText:fold.textContent,
      open:row.open
    };
   },sample.id);
   assert.ok(data.docOverflow<=2,label+' '+width+'px no document horizontal overflow '+data.docOverflow);
   assert.ok(data.row.left>=-2&&data.row.right<=width+2,label+' '+width+'px timeline card fits viewport');
   assert.equal(data.open,false,label+' '+width+'px no unintended disclosure');
   assert.ok(data.nameText.includes(sample.product),label+' '+width+'px original product name preserved');
   assert.equal(data.foldText,'상세',label+' '+width+'px original disclosure hint preserved');
   assert.ok(data.statusText.length>0,label+' '+width+'px original status badge');
   if(width<=440){
    assert.ok(data.summary.height>=48,label+' '+width+'px 48px disclosure target');
    assert.ok(data.nameSize>=14&&data.badgeSize>=12&&data.foldSize>=12,label+' '+width+'px legible title/state/hint');
    assert.equal(data.groupDirection,'column',label+' '+width+'px orderly two-line state and hint');
    assert.equal(data.badgeWrap,'normal',label+' '+width+'px state can wrap on text zoom');
    assert.ok(data.summary.left>=data.row.left&&data.summary.right<=data.row.right+1,label+' '+width+'px summary within card');
    assert.ok(data.badge.right<=data.row.right+1,label+' '+width+'px status inside card');
   }else{
    assert.equal(data.groupDirection,'row',label+' '+width+'px preserve desktop status inline');
    assert.ok(data.nameSize>=13,label+' '+width+'px original tablet/desktop title');
   }
   console.log('PASS G3-62 '+label+' '+width+'px timeline summary, status and text reflow');
  }

  await page.setViewportSize({width:390,height:844});
  await summary.click();
  assert.equal(await target.evaluate(el=>el.open),true,label+' summary expands');
  assert.match(await target.locator('.cal-timeline-meta').innerText(),new RegExp(sample.id),label+' original booking ID shown in disclosure');
  assert.ok(await target.locator('.cal-timeline-actions button').count()>=1,label+' existing calendar action retained');
  await summary.click();
  assert.equal(await target.evaluate(el=>el.open),false,label+' summary collapses');
  await summary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await target.evaluate(el=>el.open),true,label+' keyboard Enter toggles disclosure');
  await page.keyboard.press('Enter');
  assert.equal(await target.evaluate(el=>el.open),false,label+' keyboard closes disclosure');

  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),records,label+' visual interaction never mutates synthetic bookings');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),storage,label+' no data writes');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' axe WCAG2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-62-calendar-timeline-'+label.toLowerCase()+'-390.png',fullPage:true});
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=62,label+' G3-62 or later version');
  assert.deepEqual(errors,[],label+' no script errors');
  console.log('PASS G3-62 '+label+' disclosure, keyboard, synthetic records and accessibility');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-62 Chromium/WebKit/axe; physical iPhone Safari and Instagram WebView not verified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-62 '+(e.stack||e));server.close();process.exitCode=1;});
