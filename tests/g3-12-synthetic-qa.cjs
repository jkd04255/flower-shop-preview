'use strict';
/* G3-12: synthetic-only checks. Run from repo root:
   node tests/g3-12-synthetic-qa.cjs
   No network, npm dependencies, real customers, or bank calls. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('index.html', 'utf8');
const testNames = [];
function test(name, run) { run(); testNames.push(name); }
function extract(name) {
  const at = source.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'missing source function ' + name);
  const brace = source.indexOf('{', at);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(at, i + 1);
  }
  throw new Error('unterminated ' + name);
}
const names = [
  'saveDemoBookings', 'restoreDemoBookings', 'mockNewAdminRequest',
  'markDemoPayment', 'updateAdminStatus', 'demoConfirmedSlotCount',
  'demoSlotAvailable', 'pickupSlots', 'calendarBookings', 'dateFromLocalString'
];
const functions = names.map(extract).join('\n');
const fixture = new Function(
  'const P=[["rosy","로지","","","","","120분",true],["mellow","멜로","","","","","180분",true],["p"],["i"],["c"]];' +
  'const DEMO_BOOKINGS_KEY="qa",DEMO_BOOKINGS_LIMIT=500,DEMO_ID_LIMIT=999999,DEMO_SLOT_CAPACITY=3;' +
  'let adminRequests=[],adminSequence=5,adminFilter="all",adminSelectedId="DEMO-001";' +
  'let denyStorage=false;const storage=new Map();' +
  'const window={localStorage:{getItem(k){if(denyStorage)throw Error("denied");return storage.get(k)||null},setItem(k,v){if(denyStorage)throw Error("denied");storage.set(k,v)}}};' +
  'const document={getElementById(){return {style:{display:"none"}}}};' +
  'function initialAdminRequests(){return [{id:"DEMO-001",productIndex:0,date:"2026-11-09",time:"15:00",status:"pending",paymentState:"waiting"}]}' +
  'function renderAdminDemo(){} function renderCalendar(){}' +
  'function pickupBounds(){return {now:new Date(2026,10,7,9),min:"2026-11-07",max:"2026-11-21"}}' +
  functions +
  'return {storage,saveDemoBookings,restoreDemoBookings,mockNewAdminRequest,markDemoPayment,updateAdminStatus,calendarBookings,demoConfirmedSlotCount,pickupSlots,' +
  'setRecords(v){adminRequests=v},records(){return adminRequests},sequence(){return adminSequence},deny(v){denyStorage=v}};'
)();
const record = (i, status='pending', paymentState='waiting', date='2026-11-09', time='15:00') => ({
  id:'DEMO-' + String(i).padStart(3,'0'), productIndex:0,date,time,status,paymentState,depositChecked:false
});
test('empty storage restores samples', () => {
  assert.equal(fixture.restoreDemoBookings(), false);
  assert.equal(fixture.records().length, 1);
});
test('persist only synthetic metadata', () => {
  const r = record(5);r.name='REAL CUSTOMER';r.phone='01000000000';r.memo='SECRET';
  fixture.setRecords([r]);fixture.saveDemoBookings();
  const raw=fixture.storage.get('qa');
  assert.equal(raw.includes('REAL CUSTOMER'),false);
  assert.equal(raw.includes('01000000000'),false);
  assert.equal(raw.includes('SECRET'),false);
});
test('round-trip valid record', () => {
  fixture.setRecords([]);assert.equal(fixture.restoreDemoBookings(),true);
  assert.equal(fixture.records()[0].id,'DEMO-005');
});
test('report payment once', () => {
  assert.equal(fixture.markDemoPayment('DEMO-005'),true);
  assert.equal(fixture.markDemoPayment('DEMO-005'),false);
});
test('requires deposit checkbox', () => {
  assert.equal(fixture.updateAdminStatus('DEMO-005','confirmed'),false);
  fixture.records()[0].depositChecked=true;
  assert.equal(fixture.updateAdminStatus('DEMO-005','confirmed'),true);
});
test('cannot reconfirm', () => assert.equal(fixture.updateAdminStatus('DEMO-005','confirmed'),false));
test('confirmed ready completed transitions', () => {
  assert.equal(fixture.updateAdminStatus('DEMO-005','ready'),true);
  assert.equal(fixture.updateAdminStatus('DEMO-005','completed'),true);
  assert.equal(fixture.demoConfirmedSlotCount('2026-11-09','15:00'),1);
});
test('rejected bookings absent from calendar', () => {
  fixture.setRecords([record(1),record(2,'rejected'),record(3,'confirmed','verified')]);
  assert.deepEqual(fixture.calendarBookings('2026-11-09').map(r=>r.id),['DEMO-001','DEMO-003']);
});
for (const invalid of [
  ['confirmed without verification',record(5,'confirmed','waiting')],
  ['ready with reported only',record(5,'ready','reported')],
  ['completed without verification',record(5,'completed','waiting')],
  ['pending with verified',record(5,'pending','verified')],
  ['rejected with verified',record(5,'rejected','verified')],
  ['checked while waiting',{...record(5),depositChecked:true}],
  ['invalid date',record(5,'pending','waiting','2026-02-30')],
  ['invalid hour',record(5,'pending','waiting','2026-11-09','20:00')]
]) {
  test('reject corrupt state: '+invalid[0],()=>{
    fixture.storage.set('qa',JSON.stringify({version:1,records:[invalid[1]]}));
    assert.equal(fixture.restoreDemoBookings(),false);
  });
}
test('reject duplicate IDs',()=>{
  fixture.storage.set('qa',JSON.stringify({version:1,records:[record(5),record(5)]}));
  assert.equal(fixture.restoreDemoBookings(),false);
});
test('legacy 151 records survive reload',()=>{
  fixture.storage.set('qa',JSON.stringify({version:1,records:Array.from({length:151},(_,i)=>record(i+1))}));
  assert.equal(fixture.restoreDemoBookings(),true);assert.equal(fixture.records().length,151);
});
test('500 records survive reload',()=>{
  fixture.storage.set('qa',JSON.stringify({version:1,records:Array.from({length:500},(_,i)=>record(i+1))}));
  assert.equal(fixture.restoreDemoBookings(),true);assert.equal(fixture.records().length,500);
});
test('500 cap prevents creating invalid history',()=>{
  assert.equal(fixture.mockNewAdminRequest(0,'2026-11-09','16:00'),null);
  assert.equal(fixture.records().length,500);
});
test('six-digit last ID restores',()=>{
  fixture.storage.set('qa',JSON.stringify({version:1,records:[record(999999)]}));
  assert.equal(fixture.restoreDemoBookings(),true);
  assert.equal(fixture.sequence(),1000000);
});
test('seven-digit ID never created',()=>{
  assert.equal(fixture.mockNewAdminRequest(0,'2026-11-09','16:00'),null);
  assert.equal(fixture.records()[0].id,'DEMO-999999');
});
test('corrupt 501 records fail closed',()=>{
  fixture.storage.set('qa',JSON.stringify({version:1,records:Array.from({length:501},(_,i)=>record(i+1))}));
  assert.equal(fixture.restoreDemoBookings(),false);
});
test('denied storage keeps in-memory demo',()=>{
  fixture.setRecords([record(7)]);fixture.deny(true);
  assert.doesNotThrow(()=>fixture.saveDemoBookings());
  assert.equal(fixture.records().length,1);
  fixture.deny(false);
});
test('third booking allowed; fourth blocked',()=>{
  const list=[record(7,'pending','reported'),record(8,'pending','reported'),record(9,'confirmed','verified'),record(10,'ready','verified')];
  list[0].depositChecked=true;list[1].depositChecked=true;fixture.setRecords(list);
  assert.equal(fixture.updateAdminStatus('DEMO-007','confirmed'),true);
  assert.equal(fixture.updateAdminStatus('DEMO-008','confirmed'),false);
  assert.equal(list[1].status,'pending');
});
test('full guest slot hidden; next slot visible',()=>{
  const available=fixture.pickupSlots(0,'2026-11-09');
  assert.equal(available.includes('15:00'),false);
  assert.equal(available.includes('16:00'),true);
});
test('weekend and date range blocked',()=>{
  assert.equal(fixture.pickupSlots(0,'2026-11-08').length,0);
  assert.equal(fixture.pickupSlots(0,'2026-12-01').length,0);
});
test('calendar overcapacity count is dynamic',()=>{
  assert.ok(source.includes("demoConfirmedSlotCount(calendarSelectedDate,time)+'/'+DEMO_SLOT_CAPACITY"));
  assert.ok(source.includes('정원 초과 가상 기록 발견'));
});
test('cross-tab event synchronizes guest view',()=>{
  assert.ok(source.includes("if(document.getElementById('reservation').style.display==='block')"));
  assert.ok(source.includes('updatePickupTimes();'));
  assert.ok(source.includes('가상 예약 기록이 초기화되거나 변경되었습니다'));
});
test('old layout, payment and calendar kept',()=>{
  for(const token of ['g3-11-mobile-a11y','DEMO_SLOT_CAPACITY=3','calendarTimelineItem','markDemoPayment','depositChecked','hero-original.webp'])assert.ok(source.includes(token),token);
});
const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
test('all inline scripts parse, including the G3-41 reload guard',()=>{
  assert.ok(scripts.length>=3,'the original scripts and approved additions must parse');
  assert.ok(source.includes('<script id="g3-41-home-reload-top">'),'early reload guard must exist');
  for(const match of scripts)assert.doesNotThrow(()=>new Function(match[1]));
});
console.log('G3-12 synthetic QA PASS: '+testNames.length+' tests; no network or real data.');