'use strict';
/**
 * G3-20 real Chromium + axe-core WCAG 2.0/2.1 A/AA static demo audit.
 * Branch-local index.html/assets served on localhost; no customer data or real reservations.
 * AXE_ENFORCE=0: discovery only, report violations without claiming a pass.
 * AXE_ENFORCE=1: fail on *any* confirmed WCAG-tagged violation.
 * CI: CHROME_BIN=<chrome path> AXE_ENFORCE=1 node tests/g3-20-axe-qa.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright-core');
const root=process.cwd();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const tags=['wcag2a','wcag2aa','wcag21a','wcag21aa'];
const strict=process.env.AXE_ENFORCE==='1';
const server=http.createServer((req,res)=>{
 let filename;
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 }catch{res.writeHead(400);res.end();return}
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(filename,(error,data)=>{
  if(error){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});
  res.end(data);
 });
});
const records=[],violations=[];
function record(name,data){
 const row={name,violations:data.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary})).slice(0,8),totalNodes:v.nodes.length})),incomplete:data.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))};
 records.push(row);
 console.log('AXE '+name+': '+row.violations.length+' rule violations, '+row.violations.reduce((n,v)=>n+v.totalNodes,0)+' affected nodes; '+row.incomplete.length+' incomplete rule checks');
 for(const v of row.violations){
  console.log('  VIOLATION '+v.id+' ('+v.impact+'): '+v.totalNodes+' node(s), '+v.help);
  for(const n of v.nodes.slice(0,4))console.log('    '+JSON.stringify(n.target)+' | '+String(n.summary||'').slice(0,230));
  violations.push({screen:name,...v});
 }
 return row;
}
async function audit(page,name,width){
 await page.setViewportSize({width,height:844});
 const result=await page.evaluate(async t=>window.axe.run(document,{
  runOnly:{type:'tag',values:t},
  rules:{'color-contrast':{enabled:true}},
  resultTypes:['violations','incomplete']
 }),tags);
 record(name+'@'+width,result);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(overflow<=2,name+' overflows horizontally at '+width+'px: '+overflow);
}
async function route(page,hash,visible){
 await page.evaluate(next=>{location.hash=next;},hash);
 await page.locator(visible).first().waitFor({state:'visible',timeout:12000});
}
async function run(){
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  const page=await context.newPage();
  const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#featured .card').first().waitFor({timeout:12000});
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  assert.ok(await page.evaluate(()=>!!window.axe),'axe-core not injected');
  await audit(page,'home',390);
  await route(page,'#/reserve/rosy-moment','#reserveForm');
  await audit(page,'reservation',390);
  await page.locator('#reserveForm button[type="submit"]').click();
  assert.equal(await page.locator('#rDate').getAttribute('aria-invalid'),'true');
  await audit(page,'reservation-error',390);
  await route(page,'#/admin-demo','#adminList .admin-request');
  await audit(page,'admin-all',390);
  await page.locator('#adminDemo .admin-filter[data-filter="pending"]').click();
  await audit(page,'admin-filtered',390);
  await route(page,'#/calendar-demo','#calMonthView');
  await audit(page,'calendar-month',390);
  let label=await page.locator('#calGrid .cal-day').evaluateAll(nodes=>nodes.find(n=>/예약 [1-9]\d*건/.test(n.getAttribute('aria-label')||''))?.getAttribute('aria-label')||'');
  if(!label){await page.locator('#calNext').click();label=await page.locator('#calGrid .cal-day').evaluateAll(nodes=>nodes.find(n=>/예약 [1-9]\d*건/.test(n.getAttribute('aria-label')||''))?.getAttribute('aria-label')||'');}
  assert.ok(label,'no populated synthetic calendar day to audit');
  await page.locator('#calGrid .cal-day[aria-label="'+label+'"]').click();
  await page.locator('#calDetails').waitFor({state:'visible'});
  await audit(page,'calendar-day',390);
  await page.locator('#calBackMonth').click();
  const empty=page.locator('#calGrid .cal-day[aria-label$="예약 0건"]').first();
  assert.ok(await empty.count(),'no empty calendar date to audit');
  await empty.click();
  await page.locator('#calEmptyStatus').waitFor({state:'visible'});
  await audit(page,'calendar-empty',390);
  await audit(page,'calendar-empty',320);
  await page.locator('#calBackMonth').click();
  await audit(page,'calendar-month',320);
  await route(page,'#/admin-demo','#adminList .admin-request');
  await audit(page,'admin-all',320);
  await route(page,'#/reserve/rosy-moment','#reserveForm');
  await audit(page,'reservation',320);
  await route(page,'#/calendar-demo','#calMonthView');
  const firstMonth=page.locator('#calGrid .cal-day').first();
  await firstMonth.focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.isConnected),true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.isConnected),true);
  console.log('KEYBOARD Chromium calendar Shift+Tab and Tab: connected focus PASS');
  assert.deepEqual(jsErrors,[],'app JS errors during axe audit');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  fs.writeFileSync('qa-artifacts/g3-20-axe-results.json',JSON.stringify({version:'G3-20',tags,strict,scenarios:records,violations:violations.length},null,2));
  console.log('AXE TOTAL: '+records.length+' screen/viewport audits, '+violations.length+' WCAG rule-by-screen findings, '+new Set(violations.map(x=>x.id)).size+' distinct rule IDs.');
  if(violations.length){
   if(strict)throw Error('G3-20 axe-core WCAG audit: '+violations.length+' outstanding findings. See qa-artifacts/g3-20-axe-results.json.');
   console.log('AXE BASELINE AUDIT ONLY: findings detected; NOT A PASS (AXE_ENFORCE=0).');
  }else console.log('G3-20 axe-core WCAG automated checks PASS: 0 violations in '+records.length+' scenarios. This is not a manual screen-reader or WCAG conformance certification.');
  await context.close();
 }finally{await browser.close()}
}
run().then(()=>server.close()).catch(e=>{console.error('FAIL '+(e.stack||e));server.close();process.exitCode=1;});
