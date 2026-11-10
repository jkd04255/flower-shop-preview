'use strict';
/* G3-46: screenshot and computed-style regression against floating boxed links.
   Original G3-45 browser test continues to cover navigation flows and touch targets. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright-core');
const root=process.cwd();
const server=http.createServer((req,res)=>{
 let p;
 try{
  const u=new URL(req.url,'http://localhost');
  p=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 }catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(err,b)=>{
  if(err){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':path.extname(p)==='.html'?'text/html;charset=utf-8':'application/octet-stream'});res.end(b);
 });
});
async function appearance(page){
 return page.evaluate(()=>{
  const header=document.querySelector('#home>.hero .nav'),brand=header.querySelector('.brand');
  const nav=header.querySelector('nav'),headerStyle=getComputedStyle(header);
  const br=brand.getBoundingClientRect();
  const links=[...nav.querySelectorAll('a')].map(el=>{
   const st=getComputedStyle(el),r=el.getBoundingClientRect(),after=getComputedStyle(el,'::after');
   return {text:el.textContent.trim(),href:el.getAttribute('href'),
    visible:st.display!=='none'&&r.width>0&&r.height>0,
    color:st.color,background:st.backgroundColor,image:st.backgroundImage,
    border:[st.borderTopWidth,st.borderRightWidth,st.borderBottomWidth,st.borderLeftWidth],
    radius:st.borderRadius,weight:st.fontWeight,
    w:r.width,h:r.height,x:r.left,right:r.right,top:r.top,bottom:r.bottom,
    line:{content:after.content,height:after.height,bg:after.backgroundColor,opacity:after.opacity}};
  });
  return {headerBg:headerStyle.backgroundImage,links,
   brandRight:br.right,headerBottom:header.getBoundingClientRect().bottom,
   heroTextTop:document.querySelector('#home>.hero .heroText').getBoundingClientRect().top,
   viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};
 });
}
async function run(engine,name,url){
 const browser=await engine.launch({headless:true,...(engine===chromium?{
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage']
 }:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,360,390,700,768,1280]){
   await page.setViewportSize({width,height:width===320?568:844});
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const st=await appearance(page);
   assert.ok(st.overflow<=2,name+' horizontal overflow at '+width+'px: '+JSON.stringify(st));
   if(width<=700){
    assert.deepEqual(st.links.map(a=>a.visible),[true,false,false,true],name+' menu links at '+width+'px');
    assert.ok(st.headerBg.includes('linear-gradient'),name+' full-width photographic scrim missing '+width);
    for(const link of [st.links[0],st.links[3]]){
     assert.equal(link.background,'rgba(0, 0, 0, 0)',name+' no individual nav button fill');
     assert.equal(link.image,'none',name+' no image fill on nav items');
     assert.ok(link.border.every(x=>x==='0px'),name+' no chip borders '+JSON.stringify(link));
     assert.equal(link.radius,'0px',name+' no rounded chips');
     assert.equal(link.color,'rgb(255, 253, 248)',name+' photo text uses white');
     assert.notEqual(link.line.content,'none',name+' CSS underline generated');
     assert.equal(link.line.height,'1px',name+' fine hairline');
     assert.ok(link.h>=43&&link.w>=50&&link.x>=0&&link.right<=width+1,name+' accessible 44px tap target '+JSON.stringify(link));
    }
    assert.ok(st.brandRight<=st.links[0].x+1,name+' brand/text collision '+width);
    assert.ok(st.headerBottom<st.heroTextTop-4,name+' header/hero collision '+width);
   }else{
    assert.ok(st.links.every(a=>a.visible),name+' all four desktop routes remain visible '+width);
    assert.equal(st.headerBg,'none',name+' do not alter desktop photo header');
   }
   console.log('PASS G3-46 '+name+' '+width+'px: quiet unboxed nav, contrast scrim and no overlap');
   if(width===390){
    fs.mkdirSync('qa-artifacts',{recursive:true});
    await page.screenshot({path:'qa-artifacts/g3-46-editorial-nav-'+name.toLowerCase()+'-390.png'});
   }
  }
  assert.equal(await page.locator('.heroText .call').innerText(),'오늘의 꽃 만나기 ↗');
  const footer=await page.locator('footer').innerText();
  const match=footer.match(new RegExp('G3-([0-9]+) STATIC DEMO'));
  assert.ok(match&&Number(match[1])>=46,'G3-46+ footer');
  assert.deepEqual(errors,[],name+' JS errors');
  await ctx.close();
 }finally{await browser.close();}
}
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{await run(chromium,'Chromium',url);await run(webkit,'WebKit',url);console.log('PASS G3-46 editorial navigation');}
 finally{server.close();}
}
main().catch(e=>{console.error('FAIL G3-46 '+(e.stack||e));server.close();process.exitCode=1;});
