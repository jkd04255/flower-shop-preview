'use strict';
/* G3-69 local owner editor. Draft-only state in RAM; no localStorage,
 * network write, authentication claim, payment, or publication. */
(function(){
 const frame=document.getElementById('ownerPreview');
 const status=document.getElementById('ownerStatus');
 const featured=document.getElementById('ownerFeatured');
 const regular=document.getElementById('ownerRegular');
 let baseline=null,draft=null,serial=0,draftEpoch=0,lastRemoval=null;
 const foldedProducts=new Set();
 const photoRequests=new Map();
 const maxProducts=30;
 function invalidatePhoto(id){
  const next=(photoRequests.get(id)||0)+1;
  photoRequests.set(id,next);
  return next;
 }
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
 function filePhoto(file,onSuccess,isCurrent){
  if(!file)return;
  if(!imgTypes.includes(file.type)||file.size>3*1024*1024||file.size<1){
   announce('사진은 3MB 이하 JPG·PNG·WebP 파일만 선택할 수 있습니다.');
   return;
  }
  const reader=new FileReader();
  reader.onerror=()=>{
   if(isCurrent())announce('사진을 읽지 못했습니다. 다른 파일을 선택해 주세요.');
  };
  reader.onload=()=>{
   if(!isCurrent())return;
   const value=typeof reader.result==='string'?reader.result:'';
   if(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)){
    announce('선택한 이미지의 형식을 확인할 수 없습니다.');
    return;
   }
   if(onSuccess(value)!==false)send();
  };
  try{reader.readAsDataURL(file);}
  catch{if(isCurrent())announce('사진을 읽지 못했습니다. 다른 파일을 선택해 주세요.');}
 }
 function originalPhoto(id){
  return baseline?.products.find(p=>p.id===id)?.image||baseline?.products[0]?.image||'';
 }
 function refreshPhotoControls(id){
  const product=draft?.products.find(p=>p.id===id);
  const article=[...document.querySelectorAll('.os-product')].find(el=>el.dataset.productId===id);
  if(!product||!article)return;
  const original=originalPhoto(id);
  const changed=product.image!==original;
  const state=article.querySelector('[data-photo-state]');
  const restore=article.querySelector('[data-restore-photo]');
  if(state)state.textContent=changed?'선택한 새 사진 · 임시 미리보기':'기본 사진 사용 중';
  if(restore)restore.disabled=!changed;
  const img=article.querySelector('[data-thumb]');
  if(img)img.src=product.image;
 }
 function applyCatalogFilter(){
  if(!draft)return;
  const term=byId('ownerCatalogSearch').value.trim().toLocaleLowerCase('ko');
  let visible=0;
  for(const item of draft.products){
   const card=[...document.querySelectorAll('.os-product')].find(el=>el.dataset.productId===item.id);
   if(!card)continue;
   const searchable=[item.name,item.latin,item.description,item.colors].join(' ').toLocaleLowerCase('ko');
   const matched=!term||searchable.includes(term);
   card.hidden=!matched;
   if(matched)visible++;
  }
  byId('ownerCatalogSummary').textContent=term?'검색 결과 '+visible+'개 / 전체 '+draft.products.length+'개':'전체 '+draft.products.length+'개 · 최대 '+maxProducts+'개';
  byId('ownerNoResults').hidden=!term||visible!==0;
  byId('ownerCatalogClear').disabled=!term;
 }
 function clearCatalogSearch(){
  byId('ownerCatalogSearch').value='';
  applyCatalogFilter();
 }
 function clearUndo(){
  lastRemoval=null;
  byId('ownerUndoBar').hidden=true;
  byId('ownerUndoText').textContent='';
 }
 function undoDelete(){
  if(!draft||!lastRemoval)return;
  if(draft.products.length>=maxProducts){announce('상품이 최대 '+maxProducts+'개입니다. 상품 수를 줄인 뒤 다시 시도해 주세요.');return;}
  const saved=lastRemoval;
  if(draft.products.some(p=>p.id===saved.product.id)){clearUndo();return;}
  draft.products.splice(Math.min(saved.index,draft.products.length),0,saved.product);
  if(saved.folded)foldedProducts.add(saved.product.id);
  else foldedProducts.delete(saved.product.id);
  clearUndo();
  byId('ownerCatalogSearch').value='';
  renderProducts();send();
  document.querySelector('.os-product[data-product-id="'+saved.product.id+'"] [data-fold]')?.focus();
  announce('삭제한 '+saved.product.name+' 상품을 원래 위치에 복원했습니다. 실제 공개 사이트는 변경되지 않았습니다.');
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
  const heading=document.createElement('div');heading.className='os-product-title';
  const strong=document.createElement('strong');strong.textContent=product.name||'새 꽃다발';
  const meta=document.createElement('span');meta.className='os-product-meta';
  meta.textContent=(Number(String(product.price).replace(/\D/g,'')||0)).toLocaleString('ko-KR')+'원 · '+(product.available?'예약 가능':'품절');
  heading.append(strong,meta);
  const actions=document.createElement('div');actions.className='os-product-actions';
  const sameSection=draft.products.filter(p=>p.section===product.section);
  const position=sameSection.findIndex(p=>p.id===product.id);
  function control(label,key,value){
   const button=document.createElement('button');button.type='button';button.className='os-action';button.textContent=label;
   button.dataset[key]=value;return button;
  }
  const up=control('위로','move','up');up.disabled=position===0;up.setAttribute('aria-label',product.name+' 위로 이동');
  const down=control('아래로','move','down');down.disabled=position===sameSection.length-1;down.setAttribute('aria-label',product.name+' 아래로 이동');
  const fold=control(foldedProducts.has(product.id)?'펼치기':'접기','fold',product.id);
  fold.setAttribute('aria-expanded',String(!foldedProducts.has(product.id)));
  fold.setAttribute('aria-controls','os-product-details-'+product.id);
  const del=control('삭제','remove',product.id);del.classList.add('os-remove');
  actions.append(up,down,fold,del);title.append(heading,actions);
  const photo=document.createElement('div');photo.className='os-image-row';
  const thumb=document.createElement('img');thumb.className='os-thumbnail';thumb.src=product.image;thumb.alt=product.name+' 선택 사진';thumb.dataset.thumb=product.id;
  const photoWrap=document.createElement('div');photoWrap.className='os-image-actions';
  const photoLabel=document.createElement('label');photoLabel.htmlFor='os-file-'+product.id;photoLabel.textContent='상품 사진 바꾸기';
  const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.id='os-file-'+product.id;file.dataset.photo=product.id;file.setAttribute('aria-label',product.name+' 사진 파일 선택');
  const fine=document.createElement('small');fine.textContent='JPG·PNG·WebP 3MB 이하 · 임시 미리보기 전용';
  const photoState=document.createElement('small');photoState.className='os-photo-state';
  photoState.dataset.photoState=product.id;
  const photoChanged=product.image!==originalPhoto(product.id);
  photoState.textContent=photoChanged?'선택한 새 사진 · 임시 미리보기':'기본 사진 사용 중';
  const restorePhoto=document.createElement('button');restorePhoto.type='button';
  restorePhoto.className='os-action os-photo-restore';restorePhoto.textContent='기본 상품 사진으로';
  restorePhoto.dataset.restorePhoto=product.id;restorePhoto.disabled=!photoChanged;
  photoWrap.append(photoLabel,file,fine,photoState,restorePhoto);photo.append(thumb,photoWrap);
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
  const details=document.createElement('div');details.className='os-product-details';
  details.id='os-product-details-'+product.id;
  details.hidden=foldedProducts.has(product.id);
  details.append(photo,col,description,second,third,toggle);
  wrap.append(title,details);
  return wrap;
 }
 function setFolded(article,folded){
  const details=article.querySelector('.os-product-details');
  const control=article.querySelector('[data-fold]');
  if(details)details.hidden=folded;
  if(control){control.setAttribute('aria-expanded',String(!folded));control.textContent=folded?'펼치기':'접기';}
 }
 function foldAll(folded){
  if(!draft)return;
  foldedProducts.clear();
  if(folded)draft.products.forEach(p=>foldedProducts.add(p.id));
  document.querySelectorAll('.os-product').forEach(article=>setFolded(article,folded));
 }
 function moveProduct(id,direction){
  if(!draft)return false;
  const index=draft.products.findIndex(p=>p.id===id),step=direction==='up'?-1:direction==='down'?1:0;
  if(index<0||step===0)return false;
  const section=draft.products[index].section;
  let neighbor=index+step;
  while(neighbor>=0&&neighbor<draft.products.length&&draft.products[neighbor].section!==section)neighbor+=step;
  if(neighbor<0||neighbor>=draft.products.length)return false;
  [draft.products[index],draft.products[neighbor]]=[draft.products[neighbor],draft.products[index]];
  renderProducts();send();
  document.querySelector('.os-product[data-product-id="'+id+'"] [data-move="'+direction+'"]')?.focus();
  return true;
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
  applyCatalogFilter();
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
  draft.products.push(product);foldedProducts.delete(id);
  byId('ownerCatalogSearch').value='';
  renderProducts();send();
  document.getElementById('os-item-'+id+'-input-name')?.focus();
 }
 function reset(){
  if(!baseline)return;
  draftEpoch++;photoRequests.clear();draft=clone(baseline);foldedProducts.clear();
  byId('ownerCatalogSearch').value='';clearUndo();
  renderAll();send();announce('기본 시연 내용으로 초기화했습니다. 공개 사이트에는 영향이 없습니다.');
 }
 function loadBaseline(msg){
  if(baseline||!Array.isArray(msg.products)||msg.products.length<1)return;
  baseline={name:msg.name,address:msg.address,phone:msg.phone||'',hours:msg.hours,pickup:msg.pickup,hero:msg.hero,products:msg.products};
  draftEpoch++;photoRequests.clear();draft=clone(baseline);clearUndo();renderAll();
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
   item.querySelector('[data-move="up"]').setAttribute('aria-label',(product.name||'꽃다발')+' 위로 이동');
   item.querySelector('[data-move="down"]').setAttribute('aria-label',(product.name||'꽃다발')+' 아래로 이동');
  }
  if(key==='name'||key==='price'||key==='available'){
   item.querySelector('.os-product-meta').textContent=(Number(String(product.price).replace(/\D/g,'')||0)).toLocaleString('ko-KR')+'원 · '+(product.available?'예약 가능':'품절');
  }
  send();
 });
 document.addEventListener('change',event=>{
  const target=event.target;
  if(target.matches('input[type=file][data-photo]')){
   if(!draft)return;
   const id=target.dataset.photo,file=target.files?.[0];
   if(!file)return;
   const ticket=invalidatePhoto(id),epoch=draftEpoch;
   const isCurrent=()=>epoch===draftEpoch&&photoRequests.get(id)===ticket&&!!draft;
   if(id==='hero'){
    filePhoto(file,url=>{
     if(!isCurrent())return false;
     draft.hero=url;byId('ownerHeroThumb').src=url;
    },isCurrent);
   }else if(draft.products.some(p=>p.id===id)){
    filePhoto(file,url=>{
     if(!isCurrent())return false;
     const current=draft.products.find(p=>p.id===id);
     if(!current)return false;
     current.image=url;refreshPhotoControls(id);
    },()=>isCurrent()&&draft.products.some(p=>p.id===id));
   }
   target.value='';
  }else if(target.matches('select[data-field=section]')){
   const item=target.closest('.os-product'),product=draft?.products.find(p=>p.id===item?.dataset.productId);
   if(product){product.section=target.value;renderProducts();send();}
  }
 });
 document.addEventListener('change',event=>{
  if(event.target.matches('.os-product input[data-field]')&&byId('ownerCatalogSearch').value.trim())applyCatalogFilter();
 });
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!draft)return;
  if(button.dataset.restorePhoto){
   const id=button.dataset.restorePhoto;
   invalidatePhoto(id);
   const product=draft.products.find(p=>p.id===id);
   if(product){product.image=originalPhoto(product.id);refreshPhotoControls(product.id);send();
    announce('기본 상품 사진으로 복원했습니다. 고객 미리보기에서만 변경됩니다.');}
   return;
  }
  if(button.dataset.remove){
   const id=button.dataset.remove,index=draft.products.findIndex(p=>p.id===id);
   if(index<0)return;
   const item=draft.products[index];
   lastRemoval={product:clone(item),index,folded:foldedProducts.has(id)};
   byId('ownerUndoText').textContent='“'+(item.name||'꽃다발')+'” 삭제됨';
   byId('ownerUndoBar').hidden=false;
   draftEpoch++;
   draft.products.splice(index,1);
   foldedProducts.delete(id);
   renderProducts();send();
   byId('ownerUndoDelete').focus();
   announce('상품을 미리보기에서 삭제했습니다. 최근 삭제 취소로 되돌릴 수 있습니다.');
   return;
  }
  if(button.dataset.move){
   moveProduct(button.closest('.os-product')?.dataset.productId,button.dataset.move);return;
  }
  if(button.dataset.fold){
   const id=button.dataset.fold,article=button.closest('.os-product');
   if(!article)return;
   if(foldedProducts.has(id))foldedProducts.delete(id);else foldedProducts.add(id);
   setFolded(article,foldedProducts.has(id));
  }
 });
 byId('ownerCatalogSearch').addEventListener('input',applyCatalogFilter);
 byId('ownerCatalogSearch').addEventListener('keydown',event=>{
  if(event.key==='Escape'&&byId('ownerCatalogSearch').value){
   event.preventDefault();clearCatalogSearch();
   announce('상품 검색을 지웠습니다. 전체 상품이 다시 표시됩니다.');
  }
 });
 byId('ownerCatalogClear').addEventListener('click',()=>{clearCatalogSearch();byId('ownerCatalogSearch').focus();});
 byId('ownerUndoDelete').addEventListener('click',undoDelete);
 byId('ownerCollapseAll').addEventListener('click',()=>foldAll(true));
 byId('ownerExpandAll').addEventListener('click',()=>foldAll(false));
 byId('ownerAddFeatured').addEventListener('click',()=>add('featured'));
 byId('ownerAddRegular').addEventListener('click',()=>add('regular'));
 byId('ownerHeroRestore').addEventListener('click',()=>{
  if(!draft)return;
  invalidatePhoto('hero');
  draft.hero=baseline.hero;byId('ownerHeroThumb').src=baseline.hero;send();
 });
 byId('ownerReset').addEventListener('click',reset);
})();
