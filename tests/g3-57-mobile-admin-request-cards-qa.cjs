'use strict';
/* G3-57: mobile manager booking-card hierarchy; synthetic-only flows.
   Chromium and Linux WebKit do not replace iPhone Safari/Instagram device QA. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd(),types={'.html':'text/html;charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript'};
const server=http.createServer((req,res)=>{
 let file;try{const uri=new URL(req.url,'http://localhost');file=path.resolve(root,'.'+decodeURIComponent(uri.pathname==='/'?'/index.html':uri.pathname));}
 catch{res.writeHead(400);res.end();return;}
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(b);});
});
async function check(engine,name,url){
 const launch=engine===chromium?{executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']}:{};
 const browser=await engine.launch({headless:true,...launch});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#/admin-demo',{waitUntil:'domcontentloaded'});
  const cards=page.locator('#adminList .admin-request');
  await cards.first().waitFor({state:'visible'});
  assert.equal(await cards.count(),4,name+' four initial synthetic requests');
  const initialRecords=await page.evaluate(()=>JSON.stringify(adminRequests));
  const initialStorage=await page.evaluate(()=>JSON.stringify(localStorage));
  for(const width of [320,390,600,768,1280]){
   await page.setViewportSize({width,height:900});
   const state=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('#adminList .admin-request')],first=cards[0];
    const q=selector=>first.querySelector(selector);
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const css=e=>getComputedStyle(e);
    const name=q('.admin-request-name'),meta=q('.admin-request-meta'),top=q('.admin-request-top'),status=q('.admin-status'),id=q('.admin-id');
    const selected=cards.find(e=>e.getAttribute('aria-current')==='true');
    return{pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      count:cards.length,card:rect(first),top:rect(top),id:rect(id),status:rect(status),name:rect(name),meta:rect(meta),
      cardPadding:parseFloat(css(first).paddingLeft),cardGap:parseFloat(css(first).rowGap),
      titleFont:parseFloat(css(name).fontSize),idFont:parseFloat(css(id).fontSize),statusFont:parseFloat(css(status).fontSize),
      metaFont:parseFloat(css(meta).fontSize),metaBorder:css(meta).borderTopStyle,
      metaText:meta.textContent,selectedId:selected?.dataset.requestId,
      selectedBg:selected?css(selected).backgroundColor:null,
      allMetadata:cards.map(e=>e.querySelector('.admin-request-meta')?.textContent),
      allStatus:cards.map(e=>e.querySelector('.admin-status')?.textContent)
    };
   });
   assert.ok(state.pageOverflow<=2,name+' '+width+'px document-wide overflow '+state.pageOverflow);
   assert.equal(state.count,4,name+' booking count preserved');
   assert.ok(state.metaText.includes(' · '),name+' date/time/alias/payment metadata preserved');
   assert.equal(state.allMetadata.length,4);
   assert.ok(state.allMetadata.every(s=>s.includes(' · ')&&/\d{4}-\d{2}-\d{2}/.test(s)),name+' original four metadata strings');
   assert.ok(state.allStatus.every(Boolean),name+' all status badges present');
   if(width<=600){
    assert.ok(state.cardPadding>=17&&state.cardPadding<=19,name+' '+width+'px compact editorial padding');
    assert.ok(state.card.height>=116,name+' '+width+'px generous clickable card');
    assert.ok(state.titleFont>=18&&state.idFont>=12&&state.statusFont>=12&&state.metaFont>=13,name+' '+width+'px readable hierarchy');
    assert.equal(state.metaBorder,'solid',name+' '+width+'px quiet divider before secondary facts');
    assert.ok(state.top.bottom<=state.name.top+2&&state.name.bottom<=state.meta.top+2,name+' '+width+'px ID/status → bouquet → metadata');
    assert.ok(state.card.left>=-1&&state.card.right<=width+1,name+' '+width+'px card fits viewport');
    assert.equal(state.selectedBg,'rgb(244, 246, 239)',name+' '+width+'px selected card distinguishable');
   }else{
    assert.equal(state.cardPadding,20,name+' '+width+'px unchanged desktop padding');
    assert.equal(state.metaBorder,'none',name+' '+width+'px desktop secondary info unchanged');
    assert.equal(state.titleFont,19,name+' '+width+'px desktop type unchanged');
   }
   console.log('PASS G3-57 '+name+' '+width+'px responsive cards, statuses and intact synthetic metadata');
  }
  await page.setViewportSize({width:390,height:844});
  const second=cards.nth(1),secondId=await second.getAttribute('data-request-id');
  const secondTitle=await second.locator('.admin-request-name').innerText();
  await second.click();
  const selected=page.locator('#adminList .admin-request[aria-current="true"]');
  assert.equal(await selected.count(),1,name+' one selected request after click');
  assert.equal(await selected.getAttribute('data-request-id'),secondId,name+' click selects correct synthetic request');
  assert.equal(await page.locator('#adminDetail h3').innerText(),secondTitle,name+' side detail matches clicked product');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.requestId),secondId,name+' rerender restores focus');
  const selectedStyle=await selected.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,box:getComputedStyle(el).boxShadow}));
  assert.equal(selectedStyle.bg,'rgb(244, 246, 239)');
  assert.match(selectedStyle.box,/inset/);
  await page.locator('.admin-filter[data-filter="pending"]').click();
  assert.match(await page.locator('#adminFilterSummary').innerText(),/입금 전/);
  await page.locator('#adminShowAll').click();
  assert.equal(await cards.count(),4,name+' filtering reset returns all requests');
  assert.equal(await page.evaluate(()=>JSON.stringify(adminRequests)),initialRecords,name+' no mutations to requests');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),initialStorage,name+' no storage writes');
  const visual=page.locator('#adminList .admin-request').first();
  await visual.focus();
  const focus=await visual.evaluate(el=>({active:document.activeElement===el,style:getComputedStyle(el).outlineStyle,width:parseFloat(getComputedStyle(el).outlineWidth)}));
  assert.ok(focus.active&&focus.style==='solid'&&focus.width>=2,name+' visible keyboard focus');
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const report=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']}));
  assert.deepEqual(report.violations.map(v=>({id:v.id,target:v.nodes.map(n=>n.target)})),[],name+' axe WCAG2.1 AA');
  fs.mkdirSync('qa-artifacts',{recursive:true});
  await page.screenshot({path:'qa-artifacts/g3-57-admin-cards-'+name.toLowerCase()+'-390.png',fullPage:true});
  const version=(await page.locator('footer').innerText()).match(/G3-(\d+) STATIC DEMO/);
  assert.ok(version&&Number(version[1])>=57,name+' G3-57 or later demo footer');
  assert.deepEqual(errors,[],name+' JavaScript runtime errors');
  await ctx.close();
  console.log('PASS G3-57 '+name+' selection, keyboard, status reset, accessibility and synthetic-only data');
 }finally{await browser.close();}
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await check(chromium,'Chromium',url);await check(webkit,'WebKit',url);
  console.log('PASS G3-57 in both browser engines; no actual iPhone/Instagram QA claim');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-57 '+(e.stack||e));server.close();process.exitCode=1;});
