'use strict';
/* G3-69: Customer page preview bridge. Only active inside the explicit
 * preview iframe. No live publishing, no persistence, no auth simulation.
 * Data travels from the same-origin owner editor to this one frame only. */
(function(){
  if(new URLSearchParams(window.location.search).get('owner-preview')!=='1'||window.parent===window)return;
  const BASE_PRODUCTS=P.map((p,i)=>({
    id:p[0],name:p[1],latin:p[2],description:p[3],price:p[4],
    colors:p[5],lead:p[6],available:p[7],
    image:U[i],section:i<3?'featured':'regular'
  }));
  const infoCells=[...document.querySelectorAll('#home #store table tr')];
  const base={
    type:'AFG_OWNER_BASELINE_V1',
    name:document.querySelector('#home .hero .nav .brand strong')?.textContent||'오후의 정원',
    address:infoCells[0]?.cells[1]?.textContent||'가상 매장 — 실제 주소 미등록',
    phone:'',
    hours:infoCells[1]?.cells[1]?.textContent||'월–금 11:00–20:00 (예시)',
    pickup:infoCells[3]?.cells[1]?.textContent||'예약 요청 → 계좌이체 → 매장 입금 확인 → 예약 확정',
    hero:'./assets/hero-original.webp',
    products:BASE_PRODUCTS
  };
  const allowedLocalImage=/^\.\/assets\/[a-z0-9-]+\.(?:webp|jpg|jpeg|png)$/i;
  const allowedUnsplash=/^https:\/\/images\.unsplash\.com\/photo-[\w-]+(?:\?[a-z0-9_=&%-]+)?$/i;
  function safeImage(url){
    if(typeof url!=='string')return null;
    if(allowedLocalImage.test(url)||allowedUnsplash.test(url))return url;
    if(url.length<=6500000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(url))return url;
    return null;
  }
  function value(text,max){
    return typeof text==='string'?text.trim().slice(0,max):'';
  }
  function makeCard(p,index){
    const a=document.createElement('a');a.className='card';a.href='#/flower/'+encodeURIComponent(p[0]);
    const img=document.createElement('img');img.loading='lazy';img.src=U[index];img.alt=p[1]+' 가상 꽃다발 사진';
    const row=document.createElement('div');row.className='row';
    const left=document.createElement('div');
    const title=document.createElement('strong');title.textContent=p[1];
    const description=document.createElement('small');description.textContent=p[3];
    left.append(title,description);
    if(!p[7]){const soldout=document.createElement('small');soldout.textContent='현재 품절 · 예약 불가';left.append(soldout);}
    const price=document.createElement('span');price.textContent=p[4]+' KRW';
    row.append(left,price);
    const link=document.createElement('span');link.className='card-detail-link';link.textContent='상품 상세 보기 ↗';
    a.append(img,row,link);return a;
  }
  function applyDraft(payload){
    if(!payload||!Array.isArray(payload.products)||payload.products.length>30)return;
    const name=value(payload.name,50)||base.name;
    document.querySelector('#home .hero .nav .brand strong').textContent=name;
    document.querySelector('#home .foot')?.setAttribute('data-ignored',''); // no-op; footer is outside home
    const footer=document.querySelector('.foot b');if(footer)footer.textContent=name;
    document.querySelectorAll('#detail .brand,#reservation .brand,#customerStatus .brand').forEach(el=>{el.textContent='AFTERNOON · '+name;});
    document.title=name+' · 미리보기';
    if(infoCells[0])infoCells[0].cells[1].textContent=value(payload.address,150)||base.address;
    if(infoCells[1])infoCells[1].cells[1].textContent=value(payload.hours,100)||base.hours;
    if(infoCells[2])infoCells[2].cells[1].textContent=value(payload.phone,50)||'전화 문의 채널 미등록';
    if(infoCells[3])infoCells[3].cells[1].textContent=value(payload.pickup,200)||base.pickup;
    const hero=safeImage(payload.hero)||base.hero;
    document.querySelector('#home>.hero').style.backgroundImage='linear-gradient(90deg,#252b27c7,#252b2730),url("'+hero+'")';
    const featured=document.querySelector('#featured'),regular=document.querySelector('#regular');
    featured.replaceChildren();regular.replaceChildren();
    const seen=new Set();let featuredCount=0;
    for(const item of payload.products){
      if(!item||typeof item!=='object'||typeof item.id!=='string'||!/^[a-z0-9-]{2,56}$/.test(item.id)||seen.has(item.id))continue;
      if(item.section!=='featured'&&item.section!=='regular')continue;
      seen.add(item.id);
      let index=P.findIndex(x=>x[0]===item.id);
      if(index<0){index=P.length;P.push([item.id,'','', '', '0','', '120분',true]);U.push(base.products[0].image);}
      const p=P[index];
      p[1]=value(item.name,60)||'새 꽃다발';
      p[2]=value(item.latin,60);
      p[3]=value(item.description,160);
      const digits=String(item.price??'').replace(/\D/g,'').slice(0,8);
      p[4]=Number(digits||0).toLocaleString('ko-KR');
      p[5]=value(item.colors,70);
      p[6]=value(item.lead,35)||'120분';
      p[7]=item.available===true;
      U[index]=safeImage(item.image)||base.products[0].image;
      (item.section==='featured'?featured:regular).appendChild(makeCard(p,index));
      if(item.section==='featured')featuredCount++;
    }
    const note=document.querySelector('#curation > p.muted');
    if(note)note.textContent='* 사진과 가격은 가상 자료입니다. 오늘의 추천은 '+featuredCount+'개입니다.';
    if(location.hash.startsWith('#/flower/')||location.hash.startsWith('#/reserve/'))route();
  }
  function respondBaseline(){
    window.parent.postMessage(base,window.location.origin);
  }
  window.addEventListener('message',function(event){
    if(event.source!==window.parent||event.origin!==window.location.origin||!event.data||typeof event.data!=='object')return;
    if(event.data.type==='AFG_OWNER_BASELINE_REQUEST_V1')respondBaseline();
    if(event.data.type==='AFG_OWNER_DRAFT_V1')applyDraft(event.data.draft);
  });
  respondBaseline();
})();
