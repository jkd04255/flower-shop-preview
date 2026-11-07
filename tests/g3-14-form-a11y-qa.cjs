'use strict';
/**
 * G3-14 reservation form accessibility regression:
 * node tests/g3-14-form-a11y-qa.cjs
 * Full inline application script runs against a deterministic, in-memory DOM and storage stub.
 * No network, actual bank, server, real customer data, or external dependencies.
 */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(inline.length,3);
for(const match of inline)assert.doesNotThrow(()=>new Function(match[1]));
const appCode=inline[0][1];
const checks=[];function check(name,predicate){assert.ok(predicate,name);checks.push(name);}
class E {
 constructor(tag='div',id=''){
  this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.parentNode=null;
  this.style={};this.className='';this.dataset={};this.attributes={};this.textContent='';
  this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.listeners={};
  this.open=false;this.href='';this.isConnected=false;this.tabIndex=0;
  this.classList={add:(...names)=>{this.className+=' '+names.join(' ')}};
 }
 _connection(value){this.isConnected=value;for(const c of this.children)c._connection(value)}
 appendChild(child){this.children.push(child);child.parentNode=this;child._connection(this.isConnected);return child}
 insertBefore(child,anchor){const idx=this.children.indexOf(anchor);if(idx<0)return this.appendChild(child);this.children.splice(idx,0,child);child.parentNode=this;child._connection(this.isConnected);return child}
 replaceChildren(...children){for(const c of this.children)c._connection(false);this.children=[];for(const c of children)this.appendChild(c)}
 setAttribute(k,v){this.attributes[k]=String(v)}
 removeAttribute(k){delete this.attributes[k]}
 getAttribute(k){return this.attributes[k]||null}
 addEventListener(k,fn){(this.listeners[k] ||= []).push(fn)}
 dispatch(k,params={}){for(const fn of this.listeners[k]||[])fn.call(this,{target:this,preventDefault(){},...params})}
 focus(){doc.activeElement=this}
 scrollIntoView(){}
 reset(){for(const id of ['rDate','rTime','rName','rPhone','rMemo'])doc.getElementById(id).value=''}
 querySelectorAll(q){
  const nodes=descendants(this);
  if(q==='.admin-action')return nodes.filter(x=>x.className.split(' ').includes('admin-action'));
  throw Error('unknown element selector '+q);
 }
 querySelector(q){
  if(q==='h3')return descendants(this).find(x=>x.tagName==='H3')||null;
  if(q==='summary')return descendants(this).find(x=>x.tagName==='SUMMARY')||null;
  throw Error('unknown element query '+q);
 }
}
function descendants(node){return node.children.flatMap(c=>[c,...descendants(c)])}
const ids=new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(x=>x[1]));
const els=Object.fromEntries([...ids].map(id=>{const e=new E('div',id);e.isConnected=true;return [id,e]}));
const adminFilters=['all','pending','confirmed','ready','completed','rejected'].map(x=>{const e=new E('button');e.dataset.filter=x;e.isConnected=true;return e});
const statusFilters=['all','pending','confirmed','ready','completed'].map(x=>{const e=new E('button');e.dataset.calStatus=x;e.isConnected=true;return e});
const containers={'#featured':new E('div'),'#regular':new E('div'),'#arrivalList':new E('div')};
for(const node of Object.values(containers))node.isConnected=true;
const doc={
 activeElement:null,
 createElement:tag=>new E(tag),
 getElementById(id){assert.ok(els[id],'missing HTML id '+id);return els[id]},
 querySelector(q){
  if(containers[q])return containers[q];
  if(q==='#adminDetail .admin-verify input[type="checkbox"]')return descendants(els.adminDetail).find(x=>x.tagName==='INPUT'&&x.type==='checkbox')||null;
  throw Error('unknown document selector '+q);
 },
 querySelectorAll(q){
  if(q==='#adminDemo .admin-filter')return adminFilters;
  if(q==='#calStatusFilters button')return statusFilters;
  if(q==='#calGrid .cal-day')return els.calGrid.children.filter(x=>x.className==='cal-day');
  if(q==='#adminList .admin-request')return els.adminList.children.filter(x=>x.className==='admin-request');
  if(q==='#calEvents .cal-timeline-item')return descendants(els.calEvents).filter(x=>x.className.split(' ').includes('cal-timeline-item'));
  throw Error('unknown document collection '+q);
 }
};
const storage=new Map();
const handlers={};let hash='#top';
const loc={
 get hash(){return hash},
 set hash(value){hash=value;for(const fn of handlers.hashchange||[])fn({})}
};
const win={
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 addEventListener:(event,fn)=>{(handlers[event] ||= []).push(fn)},
 scrollTo(){}
};
const app=new Function('window','document','location',appCode+
 'return {route,renderAdminDemo,renderCalendar,calendarSelectDay,restoreDemoBookings,'+
 'sampleWeekday,pickupSlots,getBookings:()=>adminRequests,getRequestId:()=>currentDemoRequestId};'
)(win,doc,loc);

check('catalog still renders five synthetic flowers',containers['#featured'].children.length===3&&containers['#regular'].children.length===2);
loc.hash='#/reserve/rosy-moment';
check('booking form route visible',els.reservation.style.display==='block'&&!els.reserveForm.hidden);
check('date hint ARIA wired',els.rDate.attributes['aria-describedby']==='rTimeHint');
check('time hint ARIA wired',els.rTime.attributes['aria-describedby']==='rTimeHint');
check('alert has focus target in HTML',html.includes('id="rError" class="form-error" role="alert" tabindex="-1"'));
check('result heading has focus target in HTML',html.includes('id="reserveResultTitle" tabindex="-1"'));
check('payment message has focus target in HTML',html.includes('id="rPaymentState" aria-live="polite" tabindex="-1"'));
els.reserveForm.dispatch('submit');
check('missing date keeps form open',!els.reserveForm.hidden&&els.reserveResult.hidden);
check('missing date focuses date',doc.activeElement===els.rDate);
check('missing date marked invalid',els.rDate.attributes['aria-invalid']==='true'&&els.rDate.attributes['aria-describedby']==='rTimeHint rError');
const firstDate=app.sampleWeekday(2),secondDate=app.sampleWeekday(9);
check('two different available business days',firstDate!==secondDate);
const nextSaturday=new Date(firstDate+'T12:00:00');
while(nextSaturday.getDay()!==6)nextSaturday.setDate(nextSaturday.getDate()+1);
const weekendDate=[nextSaturday.getFullYear(),String(nextSaturday.getMonth()+1).padStart(2,'0'),String(nextSaturday.getDate()).padStart(2,'0')].join('-');
els.rDate.value=weekendDate;els.rDate.dispatch('change');
check('weekend date disables time selection',els.rTime.disabled===true);
els.reserveForm.dispatch('submit');
check('unavailable day focuses editable date, not disabled time',doc.activeElement===els.rDate&&els.rDate.attributes['aria-invalid']==='true');
check('weekend error asks for new date',els.rError.textContent.includes('다른 날짜를 선택'));
els.rDate.value=firstDate;els.rDate.dispatch('change');
check('date change clears error',els.rError.textContent===''&&!('aria-invalid' in els.rDate.attributes));
const times=app.pickupSlots(0,firstDate);
check('available pickup slots offered',times.length>0);
els.rName.value='가상 고객';els.rPhone.value='01000000000';
els.reserveForm.dispatch('submit');
check('missing time focuses time',doc.activeElement===els.rTime&&els.rTime.attributes['aria-invalid']==='true');
check('invalid time preserves hint and error references',els.rTime.attributes['aria-describedby']==='rTimeHint rError');
els.rTime.value=times[0];els.rTime.dispatch('change');
check('time edit clears alert and invalid flag',els.rError.textContent===''&&!('aria-invalid' in els.rTime.attributes));
els.rName.value='A';els.reserveForm.dispatch('submit');
check('short name focuses name',doc.activeElement===els.rName&&els.rName.attributes['aria-invalid']==='true');
els.rName.value='가상 고객';els.rName.dispatch('input');
check('name edit clears name error',els.rError.textContent===''&&!('aria-invalid' in els.rName.attributes));
els.rPhone.value='123';els.reserveForm.dispatch('submit');
check('phone format focuses phone',doc.activeElement===els.rPhone&&els.rPhone.attributes['aria-invalid']==='true');
els.rPhone.value='01000000000';els.rPhone.dispatch('input');
check('phone edit clears error',els.rError.textContent===''&&!('aria-invalid' in els.rPhone.attributes));
const oldTime=els.rTime.value;
els.rDate.value=secondDate;els.rDate.dispatch('change');
check('date switch clears previously selected hour',oldTime!==''&&els.rTime.value==='');
check('date switch provides new time instructions',els.rTimeHint.textContent.includes('다시 선택'));
els.reserveForm.dispatch('submit');
check('date change cannot accidentally submit old hour',els.reserveResult.hidden&&doc.activeElement===els.rTime);
els.rTime.value=app.pickupSlots(0,secondDate)[0];els.rTime.dispatch('change');
els.reserveForm.dispatch('submit');
const bookingId=app.getRequestId();
check('valid booking accepted after reselection',!!bookingId&&app.getBookings().some(x=>x.id===bookingId));
check('success focuses visible confirmation title',doc.activeElement===els.reserveResultTitle&&!els.reserveResult.hidden&&els.reserveForm.hidden);
check('submitted form discarded sample contacts',els.rPhone.value===''&&els.rName.value==='');
check('saved data excludes sample phone',!storage.get('afternoon-garden-calendar-demo-v1').includes('01000000000'));
check('fake payment not yet confirmed',app.getBookings().find(x=>x.id===bookingId).paymentState==='waiting');
els.rMarkPaid.focus();els.rMarkPaid.dispatch('click');
check('fake payment report succeeds',app.getBookings().find(x=>x.id===bookingId).paymentState==='reported');
check('payment announcement focuses live status',doc.activeElement===els.rPaymentState&&els.rMarkPaid.disabled&&els.rPaymentState.textContent.includes('실제 은행 거래나 송금은 발생하지 않았습니다'));
check('payment button described by status',html.includes('id="rMarkPaid" class="transfer-demo-button" aria-describedby="rPaymentState"'));
check('booking persists after reload simulation',app.restoreDemoBookings()&&app.getBookings().find(x=>x.id===bookingId).paymentState==='reported');
check('original manager and calendar still present',html.includes('focusAdminAfterStatusChange')&&html.includes('calendarTimelineItem'));
check('storage limits and slot protection still present',html.includes('DEMO_BOOKINGS_LIMIT=500')&&html.includes('DEMO_SLOT_CAPACITY=3'));
check('approved no-payment demo notice retained',html.includes('실제 접수·연락·결제 불가'));
console.log('G3-14 synthetic booking-form/keyboard QA PASS: '+checks.length+' checks. Not full browser/assistive-tech QA.');
