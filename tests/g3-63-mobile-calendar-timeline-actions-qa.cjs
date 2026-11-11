'use strict';
/* G3-63: expanded calendar booking card actions on small smartphones.
 * Chromium and Linux WebKit do not replace physical iPhone Safari/Instagram QA.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
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
  const initial=await page.evaluate(()=>({
   bookings:JSON.stringify(adminRequests),stored:JSON.stringify(localStorage),
   confirmed:adminRequests.find(x=>x.status==='confirmed'),pending:adminRequests.find(x=>x.status==='pending')
  }));
  assert.ok(initial.confirmed&&initial.pending,label+' synthetic confirmed and pending samples');
  await page.evaluate(date=>calendarSelectDay(date),initial.confirmed.date);
  const row=page.locator('#calEvents .cal-timeline-item[data-request-id="'+initial.confirmed.id+'"]');
  await row.waitFor({state:'visible'});
  await row.locator('summary').click();
  assert.equal(await row.evaluate(e=>e.open),true,label+' existing details open');
  const actionButtons=row.locator('.cal-timeline-actions button');
  assert.deepEqual(await actionButtons.allInnerTexts(),['수령 전으로 변경','상세 보기'],label+' original confirm card actions retained');
  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const data=await page.evaluate(id=>{
    const item=[...document.querySelectorAll('#calEvents .cal-timeline-item')].find(x=>x.dataset.requestId===id);
    const actions=item.querySelector('.cal-timeline-actions'),buttons=[...actions.querySelectorAll('button')];
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,height:r.height,width:r.width,bottom:r.bottom}};
    const style=e=>getComputedStyle(e);
    return {
     overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     item:rect(item),actions:rect(actions),buttons:buttons.map(rect),
     sizes:buttons.map(b=>parseFloat(style(b).fontSize)),
     minHeight:buttons.map(b=>parseFloat(style(b).minHeight)),
     wraps:buttons.map(b=>style(b).whiteSpace),
     flex:buttons.map(b=>style(b).flexBasis),
     labels:buttons.map(b=>b.textContent),
     disabled:buttons.map(b=>b.disabled),
     open:item.open
    };
   },initial.confirmed.id);
   assert.ok(data.overflow<=2,label+' '+width+'px no page-wide horizontal overflow '+data.overflow);
   assert.deepEqual(data.labels,['수령 전으로 변경','상세 보기'],label+' '+width+'px actions unchanged');
   assert.ok(data.disabled.every(b=>b===false),label+' '+width+'px actions remain enabled');
   assert.ok(data.open,label+' '+width+'px selected synthetic card remains open');
   assert.ok(data.item.left>=-2&&data.item.right<=width+2,label+' '+width+'px card inside viewport');
   if(width<=440){
    assert.ok(data.buttons.every(b=>b.height>=44),label+' '+width+'px 44px or higher touch targets');
    assert.ok(data.sizes.every(f=>f>=12),label+' '+width+'px legible action labels');
    assert.ok(data.buttons.every((b,i)=>data.minHeight[i]>=44),label+' '+width+'px CSS touch minimum');
    assert.ok(data.wraps.every(t=>t==='normal'),label+' '+width+'px labels wrap under text scaling');
    assert.ok(data.buttons.every(b=>b.left>=data.actions.left-1&&b.right<=data.actions.right+1),label+' '+width+'px buttons bounded in action region');
   }else{
    assert.ok(data.sizes.every(f=>f<=11),label+' '+width+'px unchanged desktop action typography');
   }
   console.log('PASS G3-63 '+label+' '+width+'px expanded action sizes, original labels and no overflow');
  }
  await page.setViewportSize({width:320,height:900});
  await page.evaluate(date=>calendarSelectDay(date),initial.pending.date);
  const pendingRow=page.locator('#calEvents .cal-timeline-item[data-request-id="'+initial.pending.id+'"]');
  await pendingRow.waitFor({state:'visible'});
  await pendingRow.locator('summary').click();
  const pendingButtons=pendingRow.locator('.cal-timeline-actions button');
  assert.deepEqual(await pendingButtons.allInnerTexts(),['상세 보기'],label+' pending card preserves its single action');
  const single=await pendingButtons.first().evaluate(el=>({
    action:el.getBoundingClientRect().width,
    container:el.parentElement.getBoundingClientRect().width,
    height:el.getBoundingClientRect().height
  }));
  assert.ok(single.action>=single.container-2,label+' single pending action fills available width');
  assert.ok(single.height>=44,label+' single pending action >=44px');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initial.bookings,label+' CSS and disclosure never change synthetic bookings');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initial.stored,label+' no storage writes');
  await page.setViewportSize({width:390,height:844});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' WCAG2.1 AA zero violations');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-63-calendar-timeline-actions-'+label.toLowerCase()+'-390.png',fullPage:true});
  await pendingButtons.first().click();
  await page.waitForURL(/#\/admin-demo/);
  assert.equal(await page.evaluate(()=>adminSelectedId),initial.pending.id,label+' original detail navigation selects the same booking');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initial.bookings,label+' navigation remains read-only');
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=63,label+' current version footer');
  assert.deepEqual(errors,[],label+' no JavaScript runtime errors');
  console.log('PASS G3-63 '+label+' pending single action, detail navigation, axe and no data mutation');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-63 Chromium/WebKit/axe; physical iPhone Safari and Instagram WebView unverified');}
 finally{server.close();}
}
main().catch(err=>{console.error('FAIL G3-63 '+(err.stack||err));server.close();process.exitCode=1;});
