import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {fixture,NOW} from './browser-harness.mjs';
const report={checks:[]},listeners=[],data={local:{wfm_companion_state_v1:fixture()},session:{}},requests=[];
const originalNow=Date.now;Date.now=()=>Date.parse(NOW);
const event={addListener(){}};
const area=name=>({get:async key=>Array.isArray(key)?Object.fromEntries(key.map(k=>[k,data[name][k]])):{[key]:data[name][key]},set:async patch=>Object.assign(data[name],structuredClone(patch)),remove:async keys=>{for(const k of keys)delete data[name][k];}});
globalThis.chrome={storage:{local:area('local'),session:area('session')},runtime:{getManifest:()=>({version:'0.4.18'}),onMessage:{addListener:fn=>listeners.push(fn)},onInstalled:event,onStartup:event},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},alarms:{clear:async()=>{},create:async()=>{},onAlarm:event},tabs:{query:async()=>[],sendMessage:async()=>{}}};
globalThis.__fetchWeek=async date=>{
 requests.push(date);const source=fixture().week,start=new Date(date+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);const monday=start.toISOString().slice(0,10);
 return {...source,ok:true,weekStart:monday,weekEnd:new Date(+start+6*86400000).toISOString().slice(0,10),days:source.days.map((day,i)=>{const date=new Date(+start+i*86400000).toISOString().slice(0,10);return {...day,date,events:day.events.map(e=>({...e,startDate:date,endDate:date}))};})};
};
// Stub only the RPC reader at its call boundary. Exercise the production
// refresh/cache/message code, using real normalization and alert projections.
let source=await readFile('extension/background.mjs','utf8');
source=source.replace('const result=await getWeekSchedule(date);','const result=await globalThis.__fetchWeek(date);').replace(/from '(\.\/[^']+)'/g,(_,path)=>'from '+JSON.stringify(pathToFileURL(resolve('extension',path)).href));
try{
 data.local.wfm_companion_state_v1.snoozes={keep:Date.now()+60000};
 const initial=structuredClone(data.local.wfm_companion_state_v1);
 const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 await module.refresh({date:'2026-10-25'});
 let current=data.local.wfm_companion_state_v1;
 assert.deepEqual(current.week,initial.week);assert.equal(current.lastUpdated,initial.lastUpdated);
 assert.equal(current.weeks['2026-10-19'].weekStart,'2026-10-19');assert.equal(current.weekUpdated['2026-10-19'],Date.now());assert.deepEqual(current.snoozes,initial.snoozes);
 report.checks.push('Loading another week caches its data without changing today’s schedule, alert or snooze');
 await module.refresh({date:'2026-10-18'});current=data.local.wfm_companion_state_v1;assert.equal(current.week.weekStart,'2026-10-12');assert.ok(current.weeks['2026-10-19']);
 report.checks.push('Refreshing current week retains other cached weeks');
 const result=await module.refresh({date:'2026-02-30'});assert.equal(result.reason,'invalid_date');assert.equal(requests.length,2);
 report.checks.push('Invalid dates are rejected before any WFM request');
 for(let n=0;n<15;n++)await module.refresh({date:new Date(Date.parse('2026-10-19')+n*7*86400000).toISOString().slice(0,10)});
 current=data.local.wfm_companion_state_v1;assert.ok(Object.keys(current.weeks).length<=12);assert.ok(current.weeks['2026-10-12']);assert.ok(current.weeks['2027-01-25']);
 report.checks.push('Week cache stays bounded and retains both current and requested weeks');
 const before=requests.length;
 await Promise.all([module.refresh({trigger:'popup',date:'2026-10-25'}),module.refresh({date:'2026-10-19'}),module.refresh({date:'2026-10-21'})]);
 assert.equal(requests.length,before+1);
 report.checks.push('Concurrent requests for the same week share a single RPC read');
 for(const check of report.checks)console.log('PASS '+check);
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{Date.now=originalNow;await writeFile('verification/background-report.json',JSON.stringify(report,null,2));}
