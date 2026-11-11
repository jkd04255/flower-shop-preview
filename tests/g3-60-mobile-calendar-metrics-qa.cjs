'use strict';
/* G3-60: calendar pickup operation metric readability on narrow smartphones.
   Chromium and Linux WebKit do not constitute iPhone Safari or Instagram QA.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.css':'text/css'};
const server=http.createServer((req,res)=>{
 let file;
 try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function check(engine,label,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/calendar-demo',{waitUntil:'domcontentloaded'});
  await page.locator('#calGrid .cal-day').first().waitFor({state:'visible'});
  const selectedDate=await page.evaluate(()=>calendarSelectedDate);
  await page.locator('#calGrid .cal-day[aria-label^="'+selectedDate+' 예약 "]').click();
  await page.locator('#calDetails').waitFor({state:'visible'});
  const baseline=await page.evaluate(()=>JSON.stringify(adminRequests));
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));
  const expected=await page.evaluate(()=>{
   const entries=calendarBookings(calendarSelectedDate);
   return [entries.length,...['pending','confirmed','ready','completed'].map(status=>entries.filter(e=>e.status===status).length)];
  });
  const allLabels=['전체','입금 전','예약 확정','수령 전','수령 완료'];
  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const m=await page.evaluate(()=>{
    const metricRoot=document.querySelector('#calDailyMetrics'),
      cards=[...metricRoot.querySelectorAll('.cal-daily-metric')],
      r=e=>{const b=e.getBoundingClientRect();return{top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:b.width,height:b.height}},
      css=e=>getComputedStyle(e);
    return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      root:r(metricRoot),columns:css(metricRoot).gridTemplateColumns.split(' ').length,
      cards:cards.map(r),labels:cards.map(e=>e.querySelector('small').textContent),
      values:cards.map(e=>Number(e.querySelector('strong').textContent)),
      labelSizes:cards.map(e=>parseFloat(css(e.querySelector('small')).fontSize)),
      countSizes:cards.map(e=>parseFloat(css(e.querySelector('strong')).fontSize)),
      totalBg:css(cards[0]).backgroundColor,
      day:document.querySelector('#calSelectedTitle').textContent,
      statusFilters:[...document.querySelectorAll('#calStatusFilters button')].map(e=>({status:e.dataset.calStatus,pressed:e.getAttribute('aria-pressed')}))};
   });
   assert.ok(m.overflow<=2,label+' '+width+'px page horizontal overflow '+m.overflow);
   assert.equal(m.cards.length,5,label+' unchanged five pickup metrics');
   assert.deepEqual(m.labels,allLabels,label+' labels and order preserved');
   assert.deepEqual(m.values,expected,label+' live counts correctly computed');
   assert.deepEqual(m.statusFilters.map(x=>x.status),['all','pending','confirmed','ready','completed'],label+' filter status options intact');
   assert.deepEqual(m.statusFilters.filter(x=>x.pressed==='true').map(x=>x.status),['all']);
   if(width<=440){
    assert.equal(m.columns,3,label+' '+width+'px three column two-row metric grid');
    assert.ok(m.cards[0].width>m.cards[1].width*1.7,label+' wide total summary');
    assert.ok(Math.abs(m.cards[0].top-m.cards[1].top)<2,label+' first two metrics row one');
    assert.ok(m.cards.slice(2).every(c=>Math.abs(c.top-m.cards[2].top)<2),label+' remaining metrics row two');
    assert.ok(m.cards[2].top>=m.cards[0].bottom,label+' two rows not overlapping');
    assert.ok(m.labelSizes.every(x=>x>=12),label+' 12px minimum status-label typography');
    assert.ok(m.countSizes.every(x=>x>=23),label+' clear numeric pickup counts');
    assert.ok(m.cards.every(c=>c.height>=69),label+' readable card hit area');
    assert.ok(m.cards.every(c=>c.left>=m.root.left-2&&c.right<=m.root.right+2),label+' bounded metric cards');
    assert.equal(m.totalBg,'rgb(232, 238, 229)',label+' subtle green total priority');
   }else{
    assert.equal(m.columns,5,label+' '+width+'px original five-column desktop/tablet grid');
    assert.ok(m.cards.every(c=>Math.abs(c.top-m.cards[0].top)<2),label+' original single-row metrics');
    assert.notEqual(m.totalBg,'rgb(232, 238, 229)',label+' original background restored above 440px');
   }
   console.log('PASS G3-60 '+label+' '+width+'px metric hierarchy, original values and horizontal reflow');
  }
  await page.setViewportSize({width:390,height:844});
  const before=await page.locator('#calDailyMetrics .cal-daily-metric strong').allInnerTexts();
  await page.locator('#calStatusFilters button[data-cal-status="confirmed"]').click();
  assert.equal(await page.locator('#calStatusFilters button[data-cal-status="confirmed"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#calDailyMetrics .cal-daily-metric strong').allInnerTexts().then(xs=>xs.join('|')),before.join('|'),label+' metrics stay unfiltered by status chips');
  await page.locator('#calStatusFilters button[data-cal-status="all"]').click();
  assert.equal(await page.evaluate(()=>calendarStatusFilter),'all',label+' filter resets');
  assert.equal(await page.evaluate(()=>calendarSelectedDate),selectedDate,label+' selected day unchanged');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),baseline,label+' demo reservation records unchanged');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),storage,label+' no storage writes');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(x=>({id:x.id,target:x.nodes.map(n=>n.target)})),[],label+' axe WCAG2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-60-calendar-metrics-'+label.toLowerCase()+'-390.png',fullPage:true});
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=60,label+' G3-60 or later static demo');
  assert.deepEqual(errors,[],label+' JS page errors');
  console.log('PASS G3-60 '+label+' status filtering, original five counts, axe and synthetic-only storage');
  await context.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-60 Chromium/WebKit/axe; physical iPhone Safari/Instagram remain unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-60 '+(e.stack||e));server.close();process.exitCode=1;});
