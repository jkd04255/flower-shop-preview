'use strict';
/**
 * G3-13 integrated synthetic booking flow:
 * node tests/g3-13-integrated-qa.cjs
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
  if(q==='#calWeekStrip .cal-week-date')return els.calWeekStrip.children.filter(x=>x.className==='cal-week-date');
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
check('catalog renders 3 featured / 2 other',containers['#featured'].children.length===3&&containers['#regular'].children.length===2);
check('demo seeded with 4 bookings',app.getBookings().length===4);
loc.hash='#/reserve/rosy-moment';
check('reservation screen opens',els.reservation.style.display==='block');
const date=app.sampleWeekday(2);els.rDate.value=date;els.rDate.dispatch('change');
const slots=app.pickupSlots(0,date);
check('weekday pickup slot available',slots.length>0);
els.rTime.value=slots[0];els.rName.value='가상 고객';els.rPhone.value='01000000000';
els.reserveForm.dispatch('submit');
const id=app.getRequestId();
check('new synthetic booking created',!!id&&app.getBookings().length===5);
check('booking result visible',els.reserveForm.hidden&&els.reserveResult.hidden===false);
check('no customer contact persisted',!storage.get('afternoon-garden-calendar-demo-v1').includes('01000000000'));
els.rMarkPaid.dispatch('click');
check('fake transfer reported',app.getBookings().find(x=>x.id===id).paymentState==='reported');
loc.hash='#/admin-demo';
check('manager screen opens',els.adminDemo.style.display==='block');
const findRequest=(id)=>els.adminList.children.find(x=>x.dataset.requestId===id);
let request=findRequest(id);
check('synthetic new request in manager list',!!request);
request.focus();request.dispatch('click');
check('manager list focus follows rerender',doc.activeElement.isConnected&&doc.activeElement.dataset.requestId===id);
const findInDetail=(fn)=>descendants(els.adminDetail).find(fn);
let box=findInDetail(x=>x.tagName==='INPUT'&&x.type==='checkbox');
check('verification checkbox rendered',!!box);
box.focus();box.checked=true;box.dispatch('change');
check('checkbox focus retained after rerender',doc.activeElement.isConnected&&doc.activeElement.checked===true);
let action=findInDetail(x=>x.tagName==='BUTTON'&&x.textContent==='입금 확인 · 예약 확정');
check('confirmation enabled after deposit check',!!action&&!action.disabled);
action.focus();action.dispatch('click');
check('manually confirmed',app.getBookings().find(x=>x.id===id).status==='confirmed');
check('admin action focus restored after confirm',doc.activeElement.isConnected&&doc.activeElement.tagName==='BUTTON'&&!doc.activeElement.disabled);
loc.hash='#/calendar-demo';app.calendarSelectDay(date);
check('calendar shows selected date',els.calSelectedTitle.textContent.includes('월'));
let entry=doc.querySelectorAll('#calEvents .cal-timeline-item').find(x=>x.dataset.requestId===id);
check('confirmed booking in calendar',!!entry&&entry.className.includes('confirmed'));
let calendarAction=descendants(entry).find(x=>x.tagName==='BUTTON'&&x.textContent==='수령 전으로 변경');
check('calendar has ready action',!!calendarAction);
calendarAction.focus();calendarAction.dispatch('click');
check('calendar ready transition',app.getBookings().find(x=>x.id===id).status==='ready');
check('calendar focus restored to updated summary',doc.activeElement.isConnected&&doc.activeElement.tagName==='SUMMARY');
entry=doc.querySelectorAll('#calEvents .cal-timeline-item').find(x=>x.dataset.requestId===id);
calendarAction=descendants(entry).find(x=>x.tagName==='BUTTON'&&x.textContent==='수령 완료 처리');
calendarAction.focus();calendarAction.dispatch('click');
check('calendar completed transition',app.getBookings().find(x=>x.id===id).status==='completed');
check('calendar focused after completion',doc.activeElement.isConnected&&doc.activeElement.tagName==='SUMMARY');
check('selected date contains new completed booking',doc.querySelectorAll('#calEvents .cal-timeline-item').some(x=>x.className.includes('completed')&&x.dataset.requestId===id));
check('booking status persisted',app.restoreDemoBookings()&&app.getBookings().find(x=>x.id===id).status==='completed');
loc.hash='#/admin-demo';
request=findRequest('DEMO-001');request.focus();request.dispatch('click');
check('switching admin list record maintains focus',doc.activeElement.isConnected&&doc.activeElement.dataset.requestId==='DEMO-001');
const reject=findInDetail(x=>x.tagName==='BUTTON'&&x.textContent==='거절');
check('rejection action offered for pending sample',!!reject&&!reject.disabled);
reject.focus();reject.dispatch('click');
check('rejection applied',app.getBookings().find(x=>x.id==='DEMO-001').status==='rejected');
check('rejection restores focus to heading',doc.activeElement.isConnected&&doc.activeElement.tagName==='H3');
check('existing G3-12 cap and storage invariants retained',html.includes('DEMO_BOOKINGS_LIMIT=500')&&html.includes('DEMO_SLOT_CAPACITY=3'));
check('existing mobile CSS retained',html.includes('g3-11-mobile-a11y'));
check('release is simulated only',html.includes('실제 접수·연락·결제 불가'));
loc.hash='#/calendar-demo';app.calendarSelectDay(date);
const otherWeekDate=els.calWeekStrip.children.find(x=>x.getAttribute('aria-pressed')==='false');
check('other week date available for keyboard test',!!otherWeekDate);
otherWeekDate.focus();otherWeekDate.dispatch('click');
check('week button focus survives its day rerender',doc.activeElement.isConnected&&doc.activeElement.className==='cal-week-date'&&doc.activeElement.attributes['aria-pressed']==='true');
console.log('G3-13 + G3-15 synthetic DOM QA PASS: '+checks.length+' checks. Not full browser/AT QA.');