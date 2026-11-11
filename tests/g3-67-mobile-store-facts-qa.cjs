'use strict';
/* G3-67: store information table remains factual, legible and usable on phones.
   Linux WebKit automation does not constitute physical iPhone Safari/Instagram QA. */
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
 const opts=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...opts});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#store',{waitUntil:'domcontentloaded'});
  const table=page.locator('#home #store table');
  await table.waitFor({state:'visible'});
  const labels=['ADDRESS','OPENING HOURS','CONTACT','PICKUP'];
  const values=[
   '가상 매장 — 실제 주소 미등록',
   '월–금 11:00–20:00 (예시)',
   '전화 문의 채널 미등록',
   '예약 요청 → 계좌이체 → 매장 입금 확인 → 예약 확정'
  ];
  const initial=await page.evaluate(()=>({
   records:JSON.stringify(adminRequests),
   storage:JSON.stringify(localStorage),
   html:document.querySelector('#home #store table').innerHTML
  }));
  assert.equal(await table.locator('tr').count(),4,label+' four original info rows retained');
  assert.equal(await table.locator('td').count(),8,label+' all original eight cells retained');
  assert.deepEqual(await table.locator('tr td:first-child').allInnerTexts(),labels,label+' all store labels preserved');
  assert.deepEqual(await table.locator('tr td:last-child').allInnerTexts(),values,label+' all store descriptions preserved');
  for(const width of [320,390,440,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const result=await page.evaluate(()=>{
    const tbl=document.querySelector('#home #store table');
    const rows=[...tbl.querySelectorAll('tr')];
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const css=e=>getComputedStyle(e);
    return {
     documentOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     table:rect(tbl),tableDisplay:css(tbl).display,
     rowDisplays:rows.map(r=>css(r).display),
     cellDisplays:rows.map(r=>[...r.querySelectorAll('td')].map(td=>css(td).display)),
     cells:rows.map(r=>[...r.querySelectorAll('td')].map(rect)),
     labels:rows.map(r=>r.cells[0].innerText),
     values:rows.map(r=>r.cells[1].innerText),
     labelSizes:rows.map(r=>parseFloat(css(r.cells[0]).fontSize)),
     valueSizes:rows.map(r=>parseFloat(css(r.cells[1]).fontSize))
    };
   });
   assert.ok(result.documentOverflow<=2,label+' '+width+'px no horizontal document overflow '+result.documentOverflow);
   assert.deepEqual(result.labels,labels,label+' '+width+'px original labels');
   assert.deepEqual(result.values,values,label+' '+width+'px original descriptions');
   assert.ok(result.table.left>=-2&&result.table.right<=width+2,label+' '+width+'px table within viewport');
   if(width<=440){
    assert.equal(result.tableDisplay,'block',label+' '+width+'px narrow-screen table container');
    assert.ok(result.rowDisplays.every(d=>d==='grid'),label+' '+width+'px rows are single-column grids');
    assert.ok(result.cellDisplays.every(row=>row.every(d=>d==='block')),label+' '+width+'px stacked labels/values');
    assert.ok(result.labelSizes.every(s=>s>=12)&&result.valueSizes.every(s=>s>=13),label+' '+width+'px readable original text');
    assert.ok(result.cells.every(row=>row[1].top>=row[0].bottom-1),label+' '+width+'px label above its value');
    assert.ok(result.cells.every(row=>row.every(c=>c.left>=result.table.left-2&&c.right<=result.table.right+2)),label+' '+width+'px no clipped facts');
   }else{
    assert.equal(result.tableDisplay,'table',label+' '+width+'px original desktop table display');
    assert.ok(result.rowDisplays.every(d=>d==='table-row'),label+' '+width+'px original two-cell rows');
    assert.ok(result.cellDisplays.every(row=>row.every(d=>d==='table-cell')),label+' '+width+'px default desktop cells');
    assert.ok(result.cells.every(row=>Math.abs(row[0].top-row[1].top)<2),label+' '+width+'px original side-by-side presentation');
   }
   console.log('PASS G3-67 '+label+' '+width+'px store facts, labels, stacking and no overflow');
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await table.getAttribute('role'),null,label+' retain original semantic HTML table markup');
  assert.equal(await page.getByRole('table').count(),1,label+' store table remains exposed to accessibility tree');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(audit.violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)})),[],label+' axe WCAG2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-67-mobile-store-facts-'+label.toLowerCase()+'-390.png',fullPage:true});
  assert.equal(await page.locator('#store #rStatusLookupSubmit').count(),1,label+' G3-66 store lookup button retained');
  assert.equal(await page.locator('#store #rStatusLast4').getAttribute('inputmode'),'numeric',label+' same lookup input');

  await page.locator('#store #rStatusLast4').fill('1002');
  await page.locator('#store #rStatusLookupSubmit').click();
  await page.waitForURL(/#\/booking-status/);
  await page.locator('#csResults .cs-card').first().waitFor({state:'visible'});
  assert.equal(await page.locator('#csResults .cs-card').count(),1,label+' existing demo status route works');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initial.records,label+' original synthetic bookings unchanged');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initial.storage,label+' no new data storage');
  assert.equal(await page.evaluate(()=>document.querySelector('#home #store table').innerHTML),initial.html,label+' original table DOM contents unchanged');
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=67,label+' version footer updated');
  assert.deepEqual(errors,[],label+' no JavaScript runtime errors');
  console.log('PASS G3-67 '+label+' synthetic status lookup, semantic facts, axe and source data');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-67 Chromium/WebKit/axe; actual iPhone Safari and Instagram WebView unverified');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-67 '+(e.stack||e));server.close();process.exitCode=1;});
