import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {start,init,fixture,NOW} from './browser-harness.mjs';
import {safeDomObservation,compareDomToCached,scheduleFromDom} from '../extension/wfm-dom-compare.mjs';
import {wallTimeToEpoch,buildDaySegments} from '../extension/companion-core.mjs';
import {scheduleFreshness} from '../extension/schedule-freshness.mjs';

const report={checks:[],errors:[]},date='2026-10-18',now=Date.parse(NOW);
const wallTime=(date,time)=>wallTimeToEpoch(date,time,'Africa/Nairobi');
const observation=safeDomObservation({ok:true,days:Array.from({length:7},(_,i)=>({
 date:'2026-10-'+(12+i),status:i===6?'available':'unavailable',records:i===6?[
  {kind:'summary',label:'Shift',startLocal:date+'T11:00:00',endLocal:date+'T17:30:00'},
  {kind:'activity',label:'Tea Break 1',startLocal:date+'T11:25:00',endLocal:date+'T11:35:00'},
 ]:[],
}))},'2026-10-12');
const compare=(observed,cached,time=now)=>compareDomToCached(observed,cached,{},time,wallTime,date);
for(const cached of [null,{weekStart:'2026-10-05',days:[]},{weekStart:'2026-10-12',days:[]},{weekStart:'2026-10-12',days:[{date,kind:'unknown',events:[]}]}]){
 assert.deepEqual(compare(observation,cached),{status:'changed',reason:'schedule_discovered'});
}
assert.equal(compare(observation,null,wallTime(date,'17:30')).status,'historical_only');
const unavailable=structuredClone(observation);unavailable.days[6]={date,status:'unavailable'};
assert.equal(compare(unavailable,null).status,'inconclusive');
const invalid=structuredClone(observation);delete invalid.days[6].summary;
assert.equal(compare(invalid,null).status,'inconclusive');
const same={weekStart:observation.weekStart,days:[{date,kind:'scheduled',events:[
 {source:'SchAgentDay',name:'Shift',...observation.days[6].summary},
 {source:'SchState',stateType:4,...observation.days[6].details[0]},
]}]};
assert.equal(compare(observation,same).status,'same');
const changed=structuredClone(observation);changed.days[6].summary.end='18:00';
assert.equal(compare(changed,same).reason,'shift_bounds_changed');
report.checks.push('DOM discovery handles missing weeks and unknown days, excludes unavailable or completed shifts, and preserves existing comparisons');
const provisional=scheduleFromDom(observation,now,wallTime);
assert.equal(provisional.days[6].source,'dom');assert.equal(provisional.days[6].events[1].name,'Tea Break 1');
assert.equal(provisional.days[6].events[1].stateType,undefined);
assert.equal(compare(observation,provisional).status,'same');
assert.equal(compare(changed,provisional).reason,'shift_bounds_changed');
const addedActivity=structuredClone(observation);addedActivity.days[6].details.push({name:'Lunch',startDate:date,start:'14:00',endDate:date,end:'14:40'});
assert.equal(compare(addedActivity,provisional).reason,'state_interval_changed');
const firstActivity=structuredClone(provisional.days[6]);firstActivity.events[1].start='11:00';
assert.equal(buildDaySegments(firstActivity).find(segment=>segment.start===wallTime(date,'11:00')).name,'Tea Break 1');
assert.equal(scheduleFreshness({week:provisional,lastUpdated:now,weekUpdated:{[provisional.weekStart]:now}},date,now).status,'stale');
const invalidRows=structuredClone(observation);invalidRows.days[6].details[0].end='99:00';
assert.equal(scheduleFromDom(invalidRows,now,wallTime),null);
const empty=structuredClone(observation);empty.days[6]={date,status:'unavailable'};
assert.equal(scheduleFromDom(empty,now,wallTime),null);
report.checks.push('DOM fallback preserves visible names and times without inventing native types or inheriting RPC confirmation');

const env=await start();
try{
 const page=await env.browser.newPage({viewport:{width:1000,height:700},reducedMotion:'reduce'});
 page.on('pageerror',error=>report.errors.push(error.message));
 const state=fixture();state.week=null;state.weeks={};state.lastUpdated=null;
 await init(page,state);await page.goto(env.base+'/harness.html');
 await page.evaluate(()=>{
  history.replaceState({},'','/wfm/Agent?#Schedule;view=MY_SCHEDULE');
  const addListener=chrome.runtime.onMessage.addListener;
  chrome.runtime.onMessage.addListener=fn=>addListener((message,sender,respond)=>fn(message,message.type.startsWith('WFM_DOM_')?{url:'http://svdt1ipccwfm09:8070/wfm/Agent?#Schedule;view=MY_SCHEDULE',tab:{id:42}}:sender,respond));
  const row=values=>'<div><div></div>'+values.map(value=>'<div><div>'+value+'</div></div>').join('')+'</div>';
  document.body.innerHTML='<button title="My schedule" aria-pressed="true">My schedule</button>'+Array.from({length:7},(_,i)=>{
   const button='<button title="Expand/collapse, 10/'+(12+i)+'/26"'+(i===6?'':' aria-hidden="true" style="display:none"')+'>Day</button>';
   return '<section>'+button+(i===6?'<div>'+row(['Paid hours','Start time','End time','Schedule details'])+row(['6:30','11:00 AM','5:30 PM','Shift'])+row(['0:10','11:25 AM','11:35 AM','Tea Break 1'])+'</div>':'')+'</section>';
  }).join('');
 });
 const scheduleHtml=await page.locator('body').innerHTML();
 await page.evaluate(()=>import('/extension/background.mjs'));
 const source=(await readFile('extension/wfm-banner.js','utf8')).replace("if(location.origin!=='http://svdt1ipccwfm09:8070')return;",'');
 await page.addScriptTag({content:source});
 await page.waitForFunction(()=>window.__closedShadow?.querySelector('#banner.show'));
 assert.equal(await page.evaluate(()=>window.__storage.local.wfm_companion_state_v1.domChange.reason),'schedule_discovered');
 const imported=await page.evaluate(()=>window.__storage.local.wfm_companion_state_v1);
 assert.equal(imported.week.days[6].source,'dom');assert.equal(imported.week.days[6].events[1].name,'Tea Break 1');
 assert.equal(imported.lastUpdated,null);assert.deepEqual(imported.weekUpdated,{});
 assert.deepEqual(imported.weeks['2026-10-12'],imported.week);
 assert.match(await page.evaluate(()=>window.__closedShadow.querySelector('#title').textContent),/Schedule loaded from WFM/);
 assert.equal(await page.evaluate(()=>window.__fetches.length),0);
 await page.evaluate(()=>window.__closedShadow.querySelector('#close').click());
 await page.waitForFunction(()=>!window.__closedShadow.querySelector('#banner.show'));
 // A second observation of the same schedule respects dismissal.
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await page.waitForTimeout(600);
 assert.equal(await page.evaluate(()=>Boolean(window.__closedShadow.querySelector('#banner.show'))),false);
 assert.equal(await page.evaluate(()=>window.__fetches.length),0);
 report.checks.push('Opening WFM automatically loads visible schedules with an empty cache, shows a loaded banner without RPC, and respects dismissal');
 await page.close();
 const popup=await env.browser.newPage({viewport:{width:380,height:600},reducedMotion:'reduce'});popup.on('pageerror',error=>report.errors.push(error.message));await init(popup,imported);
 await popup.addInitScript(()=>{window.__scheduleError='rpc_error';});await popup.goto(env.base+'/extension/popup.html');
 await popup.waitForSelector('.ev');
 assert.match(await popup.locator('.journey').textContent(),/Tea Break 1/);
 assert.match(await popup.locator('.update-label').textContent(),/Loaded from WFM page/);
 await popup.waitForFunction(()=>!document.querySelector('.hd .btn').disabled);
 assert.equal(await popup.evaluate(()=>window.__storage.local.wfm_companion_state_v1.week.days[6].source),'dom');
 await popup.close();
 report.checks.push('The popup displays DOM activities immediately and retains them when a full schedule refresh fails');
 for(const [kind,week] of [['unknown',{weekStart:'2026-10-12',days:[{date,kind:'unknown',events:[]}]}],['cached',same],['race',null]]){
  const current=fixture();current.week=null;current.weeks=week?{'2026-10-12':week}:{};
  const scenario=await env.browser.newPage();scenario.on('pageerror',error=>report.errors.push(error.message));await init(scenario,current);
  await scenario.goto(env.base+'/harness.html');
  await scenario.evaluate(html=>{
   history.replaceState({},'','/wfm/Agent?#Schedule;view=MY_SCHEDULE');document.body.innerHTML=html;
   const addListener=chrome.runtime.onMessage.addListener;
   chrome.runtime.onMessage.addListener=fn=>addListener((message,sender,respond)=>fn(message,message.type.startsWith('WFM_DOM_')?{url:'http://svdt1ipccwfm09:8070/wfm/Agent?#Schedule;view=MY_SCHEDULE',tab:{id:42}}:sender,respond));
  },scheduleHtml);
  await scenario.evaluate(()=>import('/extension/background.mjs'));
  if(kind==='race')await scenario.evaluate(()=>{
   window.__scheduleDelayMs=4000;
   chrome.runtime.sendMessage({type:'WFM_REFRESH',date:'2026-10-19'},result=>{window.__otherWeekResult=result;});
  });
  await scenario.addScriptTag({content:source});
  await scenario.waitForFunction(()=>window.__storage.session.wfm_companion_ui_logs_v1.some(log=>log.code==='dom_schedule_difference'||log.code==='dom_comparison_inconclusive')||window.__messages.filter(message=>message.type==='WFM_GET_STATE').length>=4);
  if(kind!=='cached'){
   await scenario.waitForFunction(()=>window.__closedShadow.querySelector('#banner.show'));
   assert.equal(await scenario.evaluate(()=>window.__storage.local.wfm_companion_state_v1.domChange.reason),'schedule_discovered');
   assert.equal(await scenario.evaluate(()=>window.__storage.local.wfm_companion_state_v1.week.days[6].source),'dom');
  }else{
   assert.equal(await scenario.evaluate(()=>Boolean(window.__closedShadow.querySelector('#banner.show'))),false);
   assert.equal(await scenario.evaluate(()=>window.__storage.local.wfm_companion_state_v1.domChange),undefined);
   assert.deepEqual(await scenario.evaluate(()=>window.__storage.local.wfm_companion_state_v1.weeks['2026-10-12']),same);
  }
  if(kind==='race'){
   await scenario.waitForFunction(()=>window.__otherWeekResult?.ok);
   assert.equal(await scenario.evaluate(()=>window.__storage.local.wfm_companion_state_v1.weeks['2026-10-12'].days[6].source),'dom');
   assert.equal(await scenario.evaluate(()=>window.__storage.local.wfm_companion_state_v1.weeks['2026-10-19'].weekStart),'2026-10-19');
  }
  assert.equal(await scenario.evaluate(()=>window.__fetches.length),kind==='race'?1:0);await scenario.close();
 }
 report.checks.push('DOM discovery detects an unknown cached day and compares an existing current week in the weeks map without a false banner');
 report.checks.push('A concurrent refresh of another week retains the automatically imported DOM schedule');
 assert.deepEqual(report.errors,[]);
 for(const check of report.checks)console.log('PASS '+check);
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile('verification/dom-discovery-report.json',JSON.stringify(report,null,2));await env.close();}
