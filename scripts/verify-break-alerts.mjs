import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {start,init,fixture} from './browser-harness.mjs';
import {settingsWithDefaults,alertCandidates,selectedAlert,rowType,wallTimeToEpoch} from '../extension/companion-core.mjs';

const report={checks:[],errors:[]},native=fixture(),date='2026-10-18';
const settings=settingsWithDefaults({...native.settings,leadMinutes:5,alertShiftStart:false,alertShiftEnd:false});
const at=(time,day=date)=>wallTimeToEpoch(day,time,settings.timeZone);
const candidates=(week,time)=>alertCandidates(week,settings,at(time));
const nativeStart=candidates(native.week,'11:20')[0];
assert.equal(nativeStart.name,'Tea Break 1');
assert.equal(candidates(native.week,'11:29').length,0);
const end=candidates(native.week,'11:30')[0];
assert.equal(end.name,'Tea Break 1 ends');assert.equal(end.at,at('11:35'));assert.equal(end.remaining,5*60000);
assert.notEqual(end.id,nativeStart.id);
assert.equal(alertCandidates(native.week,settings,at('11:30')-1).length,0);
assert.equal(candidates(native.week,'11:34')[0].name,'Tea Break 1 ends');
assert.equal(candidates(native.week,'11:35').length,0);
assert.equal(candidates(native.week,'14:35')[0].name,'Lunch Break ends');
assert.equal(alertCandidates(native.week,{...settings,alertBreaks:false},at('11:30')).length,0);
assert.equal(selectedAlert(native.week,settings,{dismissed:{[nativeStart.id]:true}},at('11:30')).id,end.id);
assert.equal(selectedAlert(native.week,settings,{dismissed:{[end.id]:true}},at('11:30')),null);
assert.equal(selectedAlert(native.week,settings,{snoozes:{[end.id]:at('11:32')}},at('11:31')),null);
assert.equal(selectedAlert(native.week,settings,{snoozes:{[end.id]:at('11:32')}},at('11:32')).id,end.id);
report.checks.push('Native break and meal end reminders honor the exact lead window, enable setting, snooze and separate dismissal identities');

const dom=structuredClone(native.week);
for(const day of dom.days){day.source='dom';day.events=day.events.map(event=>({source:'WfmDom',kind:event.source==='SchAgentDay'?'shift':'activity',name:event.name,startDate:event.startDate,start:event.start,endDate:event.endDate,end:event.end}));}
for(const label of ['Tea Break 1','Tea Break1','Coffee Break 2','Rest Break','Break #2','Lunch Break','Lunch','Meal','Meal Break','Tea Break 1 ()'])assert.equal(rowType({source:'WfmDom',kind:'activity',name:label}),'break',label);
for(const label of ['Breakfast','Break planning meeting','Lunch coaching','Work','Queue 1'])assert.equal(rowType({source:'WfmDom',kind:'activity',name:label}),'other',label);
assert.equal(candidates(dom,'11:20')[0].name,'Tea Break 1');
assert.equal(candidates(dom,'11:30')[0].name,'Tea Break 1 ends');
assert.equal(candidates(dom,'14:35')[0].name,'Lunch Break ends');
assert.equal(dom.days[6].events[1].stateType,undefined);
report.checks.push('Existing DOM schedules recognize explicit break and meal labels for start/end reminders without assigning native state types');

const overlap=structuredClone(native.week);
overlap.days[6].events.push({source:'SchState',stateType:3,stateId:99,name:'Meeting',startDate:date,start:'11:32',endDate:date,end:'11:34'});
assert.equal(candidates(overlap,'11:30').find(alert=>alert.boundary==='end').at,at('11:35'));
const overnight={weekStart:'2026-10-12',days:[{date:'2026-10-18',kind:'scheduled',events:[{source:'SchState',stateType:4,name:'Overnight break',startDate:'2026-10-18',start:'23:50',endDate:'2026-10-19',end:'00:10'}]},{date:'2026-10-19',kind:'day_off',events:[]}]};
const night=alertCandidates(overnight,settings,at('00:05','2026-10-19'));
assert.equal(night[0].name,'Overnight break ends');assert.equal(night[0].remaining,5*60000);
report.checks.push('Break-end reminders use original interval ends through overlaps and midnight, including a following day off');

const env=await start();
try{
 for(const [name,week,time,title] of [['native',native.week,'11:30','Tea Break 1 ends'],['DOM',dom,'14:35','Lunch Break ends']]){
  const page=await env.browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  page.on('pageerror',error=>report.errors.push(error.message));
  await init(page,{...fixture(),week,settings});await page.goto(env.base+'/harness.html');await page.clock.setFixedTime(new Date(at(time)));
  await page.evaluate(()=>import('/extension/background.mjs'));await page.addScriptTag({url:env.base+'/extension/ring.js'});
  await page.waitForFunction(()=>window.__closedShadow?.querySelector('#control.visible'));
  assert.equal(await page.evaluate(()=>window.__closedShadow.querySelector('#label').textContent),title+' in 05:00');
  assert.equal(await page.evaluate(()=>window.__closedShadow.querySelector('#edge').classList.contains('visible')),true);
  if(name==='native'){
   const snoozed=await page.evaluate(id=>new Promise(resolve=>chrome.runtime.sendMessage({type:'WFM_SNOOZE',id,minutes:1},resolve)),end.id);
   assert.equal(snoozed.ok,true);
   await page.waitForFunction(()=>!window.__closedShadow.querySelector('#control.visible'));
   await page.clock.setFixedTime(new Date(at('11:31')));await page.waitForFunction(()=>window.__closedShadow.querySelector('#control.visible'));
  }
  const ends=time==='11:30'?'11:35':'14:40';await page.clock.setFixedTime(new Date(at(ends)));
  await page.waitForFunction(()=>!window.__closedShadow.querySelector('#control.visible'));
  assert.equal(await page.evaluate(()=>window.__fetches.length),0);await page.close();
 }
 report.checks.push('Real page overlays display native and DOM break-ending countdowns, honor background snooze, and disappear at the break end without WFM requests');
 assert.deepEqual(report.errors,[]);
 for(const check of report.checks)console.log('PASS '+check);
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile('verification/break-alerts-report.json',JSON.stringify(report,null,2));await env.close();}
