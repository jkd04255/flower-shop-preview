'use strict';
/* G3-69 local owner editor. Draft-only state in RAM; no localStorage,
 * network write, authentication claim, payment, or publication. */
(function(){
 const frame=document.getElementById('ownerPreview');
 const status=document.getElementById('ownerStatus');
 const featured=document.getElementById('ownerFeatured');
 const regular=document.getElementById('ownerRegular');
 const arrivals=document.getElementById('ownerArrivals');
 let baseline=null,draft=null,serial=0,arrivalSerial=0,draftEpoch=0,lastRemoval=null,lastArrivalRemoval=null;
 const foldedProducts=new Set();
 const photoRequests=new Map();
 const maxProducts=30,maxArrivals=20;
 function invalidatePhoto(id){
  const next=(photoRequests.get(id)||0)+1;
  photoRequests.set(id,next);
  return next;
 }
 const fields={name:'ownerBusinessName',address:'ownerAddress',phone:'ownerPhone',hours:'ownerHours',pickup:'ownerPickup'};
 const byId=id=>document.getElementById(id);
 const clone=obj=>JSON.parse(JSON.stringify(obj));
 function announce(s){status.textContent=s;}
 function priceDigits(v){return String(v??'').replace(/\D/g,'');}
 function shortText(v){
  const text=String(v??'').replace(/\s+/g,' ').trim();
  return text.length>52?text.slice(0,51)+'…':text||'(비어 있음)';
 }
 function sectionText(value){return value==='featured'?'오늘의 꽃':'매일의 꽃다발';}
 function reviewEntries(){
  if(!draft||!baseline)return [];
  const changes=[];
  const record=(text,kind,target,productId='',key='')=>changes.push({
   text,kind,target,productId,key:key||kind+'|'+(productId||target)
  });
  const storeFields=[['name','가게 이름'],['address','매장 주소'],['phone','전화번호'],['hours','운영 시간'],['pickup','픽업 안내']];
  for(const [key,label] of storeFields){
   if(String(draft[key]||'')!==String(baseline[key]||'')){
    record(label+': '+shortText(baseline[key])+' → '+shortText(draft[key]),'매장 정보',fields[key]);
   }
  }
  if(draft.hero!==baseline.hero)record('메인 사진: 기본 사진 → 선택한 사진','메인 사진','ownerHeroUpload');
  const baseById=new Map(baseline.products.map(p=>[p.id,p]));
  const draftById=new Map(draft.products.map(p=>[p.id,p]));
  for(const before of baseline.products){
   if(!draftById.has(before.id)){
    const recent=lastRemoval?.product.id===before.id;
    record('상품 삭제: '+shortText(before.name),'상품 구성',recent?'ownerUndoDelete':(before.section==='featured'?'ownerAddFeatured':'ownerAddRegular'),'','deleted:'+before.id);
   }
  }
  for(const after of draft.products){
   const before=baseById.get(after.id);
   const itemId='os-item-'+after.id+'-input-name';
   if(!before){
    record('상품 추가: '+shortText(after.name)+' · '+sectionText(after.section),'상품 구성',itemId,after.id);
    continue;
   }
   const edits=[];
   let target='';
   function change(label,key,value){
    edits.push(label+' '+shortText(before[key])+' → '+shortText(value));
    if(!target)target='os-item-'+after.id+'-input-'+key;
   }
   const labelFields=[['name','이름'],['latin','영문 이름'],['description','설명'],['colors','색상·구성'],['lead','준비시간']];
   for(const [key,label] of labelFields){
    if(String(after[key]||'')!==String(before[key]||''))change(label,key,after[key]);
   }
   if(priceDigits(after.price)!==priceDigits(before.price)){
    edits.push('가격 '+shortText(before.price)+'원 → '+shortText(after.price)+'원');
    if(!target)target='os-item-'+after.id+'-input-price';
   }
   if(after.section!==before.section){
    edits.push('진열 위치 '+sectionText(before.section)+' → '+sectionText(after.section));
    if(!target)target='os-section-'+after.id;
   }
   if(after.available!==before.available){
    edits.push('예약 상태 '+(before.available?'예약 가능':'품절')+' → '+(after.available?'예약 가능':'품절'));
    if(!target)target='os-available-'+after.id;
   }
   if(after.image!==before.image){
    edits.push('상품 사진 교체');
    if(!target)target='os-file-'+after.id;
   }
   if(edits.length)record('상품 '+shortText(after.name)+': '+edits.join(' · '),'상품 수정',target||itemId,after.id);
  }
  // Ignore products removed or moved between sections when comparing
  // relative order; their structural change is already reported above.
  for(const section of ['featured','regular']){
   const stable=new Set(baseline.products.filter(p=>p.section===section&&draftById.get(p.id)?.section===section).map(p=>p.id));
   const original=baseline.products.filter(p=>stable.has(p.id)).map(p=>p.id);
   const current=draft.products.filter(p=>stable.has(p.id)).map(p=>p.id);
   if(original.some((id,i)=>id!==current[i])){
    const movedId=current.find((id,i)=>id!==original[i]);
    record(sectionText(section)+': 기존 상품 진열 순서 변경','진열 순서','os-item-'+movedId+'-input-name',movedId,'order:'+section);
   }
  }
  const oldArrivals=new Map((baseline.arrivals||[]).map(a=>[a.id,a]));
  const newArrivals=new Map((draft.arrivals||[]).map(a=>[a.id,a]));
  for(const old of baseline.arrivals||[]){
   if(!newArrivals.has(old.id))record('입고 소식 삭제: '+shortText(old.name),'최근 입고',
    lastArrivalRemoval?.arrival.id===old.id?'ownerUndoArrival':'ownerAddArrival','','arrival-deleted:'+old.id);
  }
  for(const item of draft.arrivals||[]){
   const old=oldArrivals.get(item.id),nameId='os-arrival-'+item.id+'-name';
   if(!old){record('입고 소식 추가: '+shortText(item.name),'최근 입고',nameId,'','arrival:'+item.id);continue;}
   const edits=[];let target='';
   for(const [key,label] of [['name','이름'],['tag','입고 표기'],['price','가격 안내']]){
    if(item[key]!==old[key]){
     edits.push(label+' '+shortText(old[key])+' → '+shortText(item[key]));
     if(!target)target='os-arrival-'+item.id+'-'+key;
    }
   }
   if(item.image!==old.image){edits.push('사진 교체');if(!target)target='os-arrival-file-'+item.id;}
   if(edits.length)record('입고 꽃 '+shortText(item.name)+': '+edits.join(' · '),'최근 입고',
    target||nameId,'','arrival:'+item.id);
  }
  return changes;
 }
 function renderReview(){
  if(!draft||!baseline)return;
  const entries=reviewEntries();
  byId('ownerChangesCount').textContent=entries.length?
   '기본 시연 대비 '+entries.length+'건 변경 · 미리보기 전용':
   '변경사항 없음 · 기본 시연과 동일';
  const list=byId('ownerChangesList'),scroller=document.querySelector('.os-change-scroll');
  const previousScroll=scroller?.scrollTop||0;
  const focused=list.contains(document.activeElement)?document.activeElement:null;
  const focusedKey=focused?.closest('li')?.dataset.reviewKey||'';
  const focusedIndex=focused?[...list.children].indexOf(focused.closest('li')):-1;
  const existing=new Map([...list.children].filter(li=>li.dataset.reviewKey)
   .map(li=>[li.dataset.reviewKey,li]));
  const nodes=entries.length?entries.map(entry=>{
   let li=existing.get(entry.key);
   if(!li){
    li=document.createElement('li');li.dataset.reviewKey=entry.key;
    const description=document.createElement('div');description.className='os-change-entry';
    const kind=document.createElement('span');kind.className='os-change-kind';
    const value=document.createElement('span');value.className='os-change-entry-text';
    description.append(kind,value);
    const jump=document.createElement('button');jump.type='button';jump.className='os-action os-change-jump';
    jump.textContent='위치로 이동';
    li.append(description,jump);
   }
   li.querySelector('.os-change-kind').textContent=entry.kind;
   const value=li.querySelector('.os-change-entry-text');
   if(value.textContent!==entry.text)value.textContent=entry.text;
   const control=li.querySelector('.os-change-jump');
   control.dataset.reviewTarget=entry.target;
   if(entry.productId)control.dataset.reviewProduct=entry.productId;
   else delete control.dataset.reviewProduct;
   const name=entry.kind+' · '+shortText(entry.text)+' 위치로 이동';
   if(control.getAttribute('aria-label')!==name)control.setAttribute('aria-label',name);
   return li;
  }):[document.createElement('li')];
  if(!entries.length)nodes[0].textContent='변경사항이 없습니다.';
  const oldNodes=[...list.children];
  const unchanged=oldNodes.length===nodes.length&&oldNodes.every((node,i)=>node===nodes[i]);
  // Avoid replacing focusable rows on every keystroke. If a row actually
  // disappeared, return focus to the next available action or scroll region.
  if(!unchanged){
   list.replaceChildren(...nodes);
   if(focused){
    const matching=focusedKey?nodes.find(li=>li.dataset.reviewKey===focusedKey):null;
    const fallback=matching||nodes[Math.min(Math.max(0,focusedIndex),nodes.length-1)];
    const target=fallback?.querySelector('.os-change-jump')||scroller;
    target?.focus({preventScroll:true});
   }
  }
  if(scroller)scroller.scrollTop=previousScroll;
 }
 function jumpToReviewTarget(button){
  const targetId=button.dataset.reviewTarget,productId=button.dataset.reviewProduct;
  if(!targetId)return;
  if(productId){
   const article=[...document.querySelectorAll('.os-product')].find(el=>el.dataset.productId===productId);
   if(!article){announce('상품 편집 위치를 찾지 못했습니다. 목록을 확인해 주세요.');return;}
   if(article.hidden)clearCatalogSearch();
   if(foldedProducts.has(productId)){
    foldedProducts.delete(productId);setFolded(article,false);
   }
  }
  const target=byId(targetId);
  // At the 20-arrival limit both Add and one-step Undo may be disabled.
  // A review link must never silently lead to a disabled, unfocusable control.
  if((targetId==='ownerAddArrival'||targetId==='ownerUndoArrival')&&target?.disabled){
   const summary=byId('ownerArrivalCount');
   document.querySelector('.os-jump-target')?.classList.remove('os-jump-target');
   summary.classList.add('os-jump-target');
   summary.focus({preventScroll:true});
   summary.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
   announce('최근 입고는 최대 20개입니다. 지금은 이 항목의 추가·삭제 취소를 사용할 수 없습니다. 전체를 원복하려면 편집 내용 초기화를 사용해 주세요.');
   return;
  }
  if(!target||target.disabled||target.closest('[hidden]')){
   announce('해당 편집 위치를 현재 표시할 수 없습니다. 상품 목록을 확인해 주세요.');
   return;
  }
  document.querySelector('.os-jump-target')?.classList.remove('os-jump-target');
  target.classList.add('os-jump-target');
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
  announce('변경 항목의 편집 위치로 이동했습니다. 수정 내용은 미리보기에서만 사용됩니다.');
 }
 function send(){
  if(!draft)return;
  renderReview();
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
 function originalArrivalPhoto(id){
  return baseline?.arrivals.find(a=>a.id===id)?.image||baseline?.arrivals[0]?.image||'';
 }
 function arrivalField(label,value,key,id,max=60){
  const wrapper=field(label,value,key,id,'text',max);
  wrapper.querySelector('input').dataset.arrivalField=key;
  return wrapper;
 }
 function renderArrival(item){
  const article=document.createElement('article');article.className='os-arrival';article.dataset.arrivalId=item.id;
  const head=document.createElement('div');head.className='os-arrival-header';
  const title=document.createElement('strong');title.textContent=item.name||'입고 꽃';
  const del=document.createElement('button');del.type='button';del.className='os-action os-remove';
  del.textContent='입고 항목 삭제';del.dataset.removeArrival=item.id;
  del.setAttribute('aria-label',(item.name||'입고 꽃')+' 입고 소식 삭제');head.append(title,del);
  const photo=document.createElement('div');photo.className='os-image-row';
  const thumb=document.createElement('img');thumb.className='os-thumbnail';thumb.src=item.image;
  thumb.alt=item.name+' 입고 사진';thumb.dataset.arrivalThumb=item.id;
  const actions=document.createElement('div');actions.className='os-image-actions';
  const uploadId='os-arrival-file-'+item.id;
  const label=document.createElement('label');label.textContent='입고 사진 바꾸기';label.htmlFor=uploadId;
  const file=document.createElement('input');file.type='file';file.id=uploadId;
  file.accept='image/png,image/jpeg,image/webp';file.dataset.photo='arrival:'+item.id;
  file.setAttribute('aria-label',(item.name||'입고 꽃')+' 입고 사진 파일 선택');
  const note=document.createElement('small');note.textContent='JPG·PNG·WebP 3MB 이하 · 임시 미리보기';
  const restore=document.createElement('button');restore.type='button';restore.className='os-action os-arrival-photo-restore';
  restore.textContent='기본 입고 사진으로';restore.dataset.restoreArrivalPhoto=item.id;
  restore.disabled=item.image===originalArrivalPhoto(item.id);
  actions.append(label,file,note,restore);photo.append(thumb,actions);
  const row=document.createElement('div');row.className='os-row';
  row.append(
   arrivalField('꽃 이름',item.name,'name','os-arrival-'+item.id+'-name',60),
   arrivalField('입고 날짜 · NEW 표기',item.tag,'tag','os-arrival-'+item.id+'-tag',35));
  article.append(head,photo,row,arrivalField('가격 안내 (문의 전용)',item.price,'price','os-arrival-'+item.id+'-price',50));
  return article;
 }
 function renderArrivals(){
  if(!draft)return;
  // Rebuilding all 20 cards after a single add/delete detached otherwise
  // unchanged focused inputs and photos, and disturbed Safari scroll anchoring.
  // Reuse cards by immutable arrival id; only create/remove changed cards.
  const existing=new Map([...arrivals.children]
   .filter(card=>card.classList.contains('os-arrival')&&card.dataset.arrivalId)
   .map(card=>[card.dataset.arrivalId,card]));
  const cards=draft.arrivals.map(item=>{
   let card=existing.get(item.id);
   if(!card)return renderArrival(item);
   const name=item.name||'입고 꽃';
   const heading=card.querySelector('.os-arrival-header strong');
   if(heading.textContent!==name)heading.textContent=name;
   const remove=card.querySelector('[data-remove-arrival]');
   const removeLabel=name+' 입고 소식 삭제';
   if(remove.getAttribute('aria-label')!==removeLabel)remove.setAttribute('aria-label',removeLabel);
   const upload=card.querySelector('[data-photo]');
   const uploadLabel=name+' 입고 사진 파일 선택';
   if(upload.getAttribute('aria-label')!==uploadLabel)upload.setAttribute('aria-label',uploadLabel);
   const thumb=card.querySelector('[data-arrival-thumb]');
   if(thumb.getAttribute('src')!==item.image)thumb.setAttribute('src',item.image);
   const alt=name+' 입고 사진';
   if(thumb.alt!==alt)thumb.alt=alt;
   for(const key of ['name','tag','price']){
    const input=card.querySelector('[data-arrival-field="'+key+'"]');
    if(input&&input.value!==item[key])input.value=item[key];
   }
   const restore=card.querySelector('[data-restore-arrival-photo]');
   restore.disabled=item.image===originalArrivalPhoto(item.id);
   return card;
  });
  // Avoid touching stable siblings (including a currently focused input).
  if(cards.length!==arrivals.children.length||cards.some((card,i)=>card!==arrivals.children[i])){
   for(let i=0;i<cards.length;i++){
    if(arrivals.children[i]!==cards[i])arrivals.insertBefore(cards[i],arrivals.children[i]||null);
   }
   const keep=new Set(cards);
   for(const old of [...arrivals.children])if(!keep.has(old))old.remove();
  }
  byId('ownerArrivalCount').textContent=draft.arrivals.length+'개 · 최대 '+maxArrivals+'개';
  byId('ownerArrivalsEmpty').hidden=draft.arrivals.length!==0;
  byId('ownerAddArrival').disabled=draft.arrivals.length>=maxArrivals;
  byId('ownerUndoArrival').hidden=!lastArrivalRemoval;
  byId('ownerUndoArrival').disabled=!!lastArrivalRemoval&&draft.arrivals.length>=maxArrivals;
 }
 function addArrival(){
  if(!draft||draft.arrivals.length>=maxArrivals){announce('입고 소식은 최대 '+maxArrivals+'개까지 편집할 수 있습니다.');return;}
  const id='owner-arrival-'+(++arrivalSerial);
  draft.arrivals.push({id,name:'새로 들어온 꽃',tag:'NEW',price:'가격 문의',image:originalArrivalPhoto(id)});
  renderArrivals();send();byId('os-arrival-'+id+'-name')?.focus();
 }
 function deleteArrival(id){
  const index=draft?.arrivals.findIndex(a=>a.id===id);
  if(index==null||index<0)return;
  lastArrivalRemoval={arrival:clone(draft.arrivals[index]),index};
  invalidatePhoto('arrival:'+id);
  draft.arrivals.splice(index,1);
  renderArrivals();send();byId('ownerUndoArrival').focus();
  announce('입고 소식을 삭제했습니다. 최근 삭제 취소로 복원할 수 있습니다. 공개 사이트에는 영향이 없습니다.');
 }
 function undoArrival(){
  if(!draft||!lastArrivalRemoval||draft.arrivals.length>=maxArrivals)return;
  const saved=lastArrivalRemoval;
  if(draft.arrivals.some(a=>a.id===saved.arrival.id))return;
  draft.arrivals.splice(Math.min(saved.index,draft.arrivals.length),0,saved.arrival);
  lastArrivalRemoval=null;renderArrivals();send();
  byId('os-arrival-'+saved.arrival.id+'-name')?.focus();
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
  const box=document.createElement('input');box.type='checkbox';box.id='os-available-'+product.id;box.checked=product.available;box.dataset.field='available';
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
  const article=[...document.querySelectorAll('.os-product')].find(el=>el.dataset.productId===id);
  const preferred=article?.querySelector('[data-move="'+direction+'"]');
  const target=preferred&&!preferred.disabled?preferred:article?.querySelector('[data-fold]');
  target?.focus({preventScroll:true});
  target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
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
  renderProducts();renderArrivals();
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
  byId('ownerCatalogSearch').value='';clearUndo();lastArrivalRemoval=null;
  renderAll();send();announce('기본 시연 내용으로 초기화했습니다. 공개 사이트에는 영향이 없습니다.');
 }
 function loadBaseline(msg){
  if(baseline||!Array.isArray(msg.products)||msg.products.length<1)return;
  baseline={name:msg.name,address:msg.address,phone:msg.phone||'',hours:msg.hours,pickup:msg.pickup,
   hero:msg.hero,products:msg.products,arrivals:Array.isArray(msg.arrivals)?msg.arrivals:[]};
  draftEpoch++;photoRequests.clear();draft=clone(baseline);clearUndo();lastArrivalRemoval=null;renderAll();
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
  const arrival=event.target.closest('.os-arrival');
  if(arrival&&draft&&event.target.dataset.arrivalField){
   const item=draft.arrivals.find(a=>a.id===arrival.dataset.arrivalId);
   if(!item)return;
   const key=event.target.dataset.arrivalField;item[key]=event.target.value;
   if(key==='name'){
    arrival.querySelector('.os-arrival-header strong').textContent=item.name||'입고 꽃';
    arrival.querySelector('[data-remove-arrival]').setAttribute('aria-label',(item.name||'입고 꽃')+' 입고 소식 삭제');
    arrival.querySelector('[data-photo]').setAttribute('aria-label',(item.name||'입고 꽃')+' 입고 사진 파일 선택');
   }
   send();return;
  }
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
   if(id.startsWith('arrival:')){
    const arrivalId=id.slice('arrival:'.length);
    filePhoto(file,url=>{
     if(!isCurrent())return false;
     const current=draft.arrivals.find(a=>a.id===arrivalId);
     if(!current)return false;
     current.image=url;
     const img=document.querySelector('[data-arrival-thumb="'+arrivalId+'"]');if(img)img.src=url;
     const restore=document.querySelector('[data-restore-arrival-photo="'+arrivalId+'"]');
     if(restore)restore.disabled=url===originalArrivalPhoto(arrivalId);
    },()=>isCurrent()&&draft.arrivals.some(a=>a.id===arrivalId));
   }else if(id==='hero'){
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
   if(product){
    const id=product.id;
    product.section=target.value;renderProducts();send();
    const relocated=byId('os-section-'+id);
    relocated?.focus({preventScroll:true});
    relocated?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
   }
  }
 });
 document.addEventListener('change',event=>{
  if(event.target.matches('.os-product input[data-field]')&&byId('ownerCatalogSearch').value.trim())applyCatalogFilter();
 });
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!draft)return;
  if(button.dataset.reviewTarget){
   jumpToReviewTarget(button);return;
  }
  if(button.dataset.restoreArrivalPhoto){
   const id=button.dataset.restoreArrivalPhoto;
   invalidatePhoto('arrival:'+id);
   const item=draft.arrivals.find(a=>a.id===id);
   if(item){
    item.image=originalArrivalPhoto(id);
    const img=document.querySelector('[data-arrival-thumb="'+id+'"]');if(img)img.src=item.image;
    button.disabled=true;send();
   }
   return;
  }
  if(button.dataset.removeArrival){deleteArrival(button.dataset.removeArrival);return;}
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
 byId('ownerChangesToggle').addEventListener('click',()=>{
  const panel=byId('ownerChangesDetails'),button=byId('ownerChangesToggle');
  const expand=panel.hidden;
  panel.hidden=!expand;
  button.setAttribute('aria-expanded',String(expand));
  button.textContent=expand?'변경 내역 접기':'변경 내역 펼치기';
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
 byId('ownerAddArrival').addEventListener('click',addArrival);
 byId('ownerUndoArrival').addEventListener('click',undoArrival);
 byId('ownerAddFeatured').addEventListener('click',()=>add('featured'));
 byId('ownerAddRegular').addEventListener('click',()=>add('regular'));
 byId('ownerHeroRestore').addEventListener('click',()=>{
  if(!draft)return;
  invalidatePhoto('hero');
  draft.hero=baseline.hero;byId('ownerHeroThumb').src=baseline.hero;send();
 });
 byId('ownerReset').addEventListener('click',reset);
})();
