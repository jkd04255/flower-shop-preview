'use strict';
/* G3-69 local owner editor. Draft-only state in RAM; no localStorage,
 * network write, authentication claim, payment, or publication. */
(function(){
 const frame=document.getElementById('ownerPreview');
 const status=document.getElementById('ownerStatus');
 const featured=document.getElementById('ownerFeatured');
 const regular=document.getElementById('ownerRegular');
 let baseline=null,draft=null,serial=0;
 const maxProducts=30;
 const fields={name:'ownerBusinessName',address:'ownerAddress',phone:'ownerPhone',hours:'ownerHours',pickup:'ownerPickup'};
 const byId=id=>document.getElementById(id);
 const clone=obj=>JSON.parse(JSON.stringify(obj));
 function announce(s){status.textContent=s;}
 function send(){
  if(!draft)return;
  if(frame.contentWindow)frame.contentWindow.postMessage({type:'AFG_OWNER_DRAFT_V1',draft:clone(draft)},window.location.origin);
  announce('고객 화면 미리보기에 반영됨 · 공개 게시되지 않음');
 }
 const imgTypes=['image/jpeg','image/png','image/webp'];
 function filePhoto(file,onSuccess){
  if(!file)return;
  if(!imgTypes.includes(file.type)||file.size>3*1024*1024||file.size<1){
   announce('사진은 3MB 이하 JPG·PNG·WebP 파일만 선택할 수 있습니다.');
   return;
  }
  const reader=new FileReader();
  reader.onerror=()=>announce('사진을 읽지 못했습니다. 다른 파일을 선택해 주세요.');
  reader.onload=()=>{
   const value=typeof reader.result==='string'?reader.result:'';
   if(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)){
    announce('선택한 이미지의 형식을 확인할 수 없습니다.');
    return;
   }
   onSuccess(value);send();
  };
  reader.readAsDataURL(file);
 }
 function field(labelText,value,key,id,type='text',max=60){
  const wrap=document.createElement('div');wrap.className='os-field';
  const label=document.createElement('label');label.textContent=labelText;label.htmlFor=id;
  const input=document.createElement('input');input.type=type;input.id=id;input.maxLength=max;
  input.value=value;input.dataset.field=key;input.dataset.product=id.split('os-item-')[1]?.split('-input-')[0]||'';
  wrap.append(label,input);return wrap;
 }
 function renderProduct(product){
  const wrap=document.createElement('article');wrap.className='os-product';wrap.dataset.productId=product.id;
  const title=document.createElement('div');title.className='os-product-header';
  const strong=document.createElement('strong');strong.textContent=product.name||'새 꽃다발';
  const del=document.createElement('button');del.type='button';del.className='os-action os-remove';del.dataset.remove=product.id;del.textContent='상품 삭제';
  title.append(strong,del);
  const photo=document.createElement('div');photo.className='os-image-row';
  const thumb=document.createElement('img');thumb.className='os-thumbnail';thumb.src=product.image;thumb.alt=product.name+' 선택 사진';thumb.dataset.thumb=product.id;
  const photoWrap=document.createElement('div');photoWrap.className='os-image-actions';
  const photoLabel=document.createElement('label');photoLabel.htmlFor='os-file-'+product.id;photoLabel.textContent='상품 사진 바꾸기';
  const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.id='os-file-'+product.id;file.dataset.photo=product.id;file.setAttribute('aria-label',product.name+' 사진 파일 선택');
  const fine=document.createElement('small');fine.textContent='3MB 이하 · 고객 미리보기에서만 사용';
  photoWrap.append(photoLabel,file,fine);photo.append(thumb,photoWrap);
  const col=document.createElement('div');col.className='os-row';
  col.append(
   field('상품명',product.name,'name','os-item-'+product.id+'-input-name','text',60),
   field('영문 이름',product.latin,'latin','os-item-'+product.id+'-input-latin','text',60)
  );
  const description=field('상품 설명',product.description,'description','os-item-'+product.id+'-input-description','text',160);
  const second=document.createElement('div');second.className='os-row';
  second.append(
   field('가격 (원)',String(product.price).replace(/[^\d]/g,''),'price','os-item-'+product.id+'-input-price','text',8),
   field('색상·구성',product.colors,'colors','os-item-'+product.id+'-input-colors','text',70)
  );
  const third=document.createElement('div');third.className='os-row';
  const sectionWrap=document.createElement('div');sectionWrap.className='os-field';
  const secLabel=document.createElement('label');secLabel.htmlFor='os-section-'+product.id;secLabel.textContent='노출 위치';
  const select=document.createElement('select');select.id='os-section-'+product.id;select.dataset.field='section';
  for(const [v,t] of [['featured','오늘의 꽃'],['regular','매일의 꽃다발']]){
   const option=document.createElement('option');option.value=v;option.textContent=t;select.append(option);
  }
  select.value=product.section;sectionWrap.append(secLabel,select);
  const lead=field('최소 준비시간',product.lead,'lead','os-item-'+product.id+'-input-lead','text',35);
  third.append(sectionWrap,lead);
  const toggle=document.createElement('label');toggle.className='os-toggle';
  const box=document.createElement('input');box.type='checkbox';box.checked=product.available;box.dataset.field='available';
  const toggleLabel=document.createElement('span');toggleLabel.textContent='가상 예약 가능 (체크 해제 시 품절 표시)';
  toggle.append(box,toggleLabel);
  wrap.append(title,photo,col,description,second,third,toggle);
  return wrap;
 }
 function renderProducts(){
  featured.replaceChildren();regular.replaceChildren();
  if(!draft)return;
  let featuredCount=0,regularCount=0;
  for(const product of draft.products){
   if(product.section==='featured'){featured.append(renderProduct(product));featuredCount++;}
   else{regular.append(renderProduct(product));regularCount++;}
  }
  byId('ownerFeaturedCount').textContent=featuredCount+'개';
  byId('ownerRegularCount').textContent=regularCount+'개';
  byId('ownerAddFeatured').disabled=draft.products.length>=maxProducts;
  byId('ownerAddRegular').disabled=draft.products.length>=maxProducts;
 }
 function renderAll(){
  for(const [key,id] of Object.entries(fields))byId(id).value=draft[key]||'';
  byId('ownerHeroThumb').src=draft.hero;
  renderProducts();
 }
 function add(section){
  if(!draft||draft.products.length>=maxProducts){announce('이 시연에서는 최대 '+maxProducts+'개까지 편집할 수 있습니다.');return;}
  serial++;
  const id='owner-draft-'+serial;
  const product={id,name:'새 꽃다발',latin:'New Bouquet',description:'가상 상품 미리보기',price:'35,000',colors:'시즌 컬러',lead:'120분',available:true,section,image:baseline.products[0].image};
  draft.products.push(product);renderProducts();send();
  document.getElementById('os-item-'+id+'-input-name')?.focus();
 }
 function reset(){
  if(!baseline)return;
  draft=clone(baseline);renderAll();send();announce('기본 시연 내용으로 초기화했습니다. 공개 사이트에는 영향이 없습니다.');
 }
 function loadBaseline(msg){
  if(baseline||!Array.isArray(msg.products)||msg.products.length<1)return;
  baseline={name:msg.name,address:msg.address,phone:msg.phone||'',hours:msg.hours,pickup:msg.pickup,hero:msg.hero,products:msg.products};
  draft=clone(baseline);renderAll();
  byId('ownerAddFeatured').disabled=false;byId('ownerAddRegular').disabled=false;byId('ownerReset').disabled=false;
  send();
 }
 window.addEventListener('message',event=>{
  if(event.origin!==window.location.origin||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
  if(event.data.type==='AFG_OWNER_BASELINE_V1')loadBaseline(event.data);
 });
 frame.addEventListener('load',()=>{
  frame.contentWindow?.postMessage({type:'AFG_OWNER_BASELINE_REQUEST_V1'},window.location.origin);
  if(draft)send();
 });
 for(const [key,id] of Object.entries(fields)){
  byId(id).addEventListener('input',event=>{if(!draft)return;draft[key]=event.target.value;send();});
 }
 document.addEventListener('input',event=>{
  const item=event.target.closest('.os-product');if(!item||!draft)return;
  const product=draft.products.find(p=>p.id===item.dataset.productId);
  if(!product||!event.target.dataset.field)return;
  const key=event.target.dataset.field;
  if(key==='available')product.available=event.target.checked;
  else if(key==='price')product.price=event.target.value.replace(/[^\d]/g,'').slice(0,8);
  else product[key]=event.target.value;
  if(key==='name'){
   item.querySelector('.os-product-header strong').textContent=product.name||'새 꽃다발';
   item.querySelector('input[type="file"]').setAttribute('aria-label',(product.name||'꽃다발')+' 사진 파일 선택');
  }
  send();
 });
 document.addEventListener('change',event=>{
  const target=event.target;
  if(target.matches('input[type=file][data-photo]')){
   if(!draft)return;
   const id=target.dataset.photo,file=target.files?.[0];
   if(id==='hero'){
    filePhoto(file,url=>{draft.hero=url;byId('ownerHeroThumb').src=url;});
   }else{
    const product=draft.products.find(p=>p.id===id);
    if(product)filePhoto(file,url=>{product.image=url;const img=document.querySelector('[data-thumb="'+id+'"]');if(img)img.src=url;});
   }
   target.value='';
  }else if(target.matches('select[data-field=section]')){
   const item=target.closest('.os-product'),product=draft?.products.find(p=>p.id===item?.dataset.productId);
   if(product){product.section=target.value;renderProducts();send();}
  }
 });
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!draft)return;
  if(button.dataset.remove){
   draft.products=draft.products.filter(p=>p.id!==button.dataset.remove);
   renderProducts();send();
  }
 });
 byId('ownerAddFeatured').addEventListener('click',()=>add('featured'));
 byId('ownerAddRegular').addEventListener('click',()=>add('regular'));
 byId('ownerHeroRestore').addEventListener('click',()=>{if(!draft)return;draft.hero=baseline.hero;byId('ownerHeroThumb').src=baseline.hero;send();});
 byId('ownerReset').addEventListener('click',reset);
})();
