import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {start,init,fixture} from './browser-harness.mjs';
import {selectedAlert,settingsWithDefaults,wallTimeToEpoch} from '../extension/companion-core.mjs';

const report={checks:[],errors:[]},state=fixture(),settings=settingsWithDefaults(state.settings);
const now=wallTimeToEpoch('2026-10-18','11:30',settings.timeZone);
assert.equal(selectedAlert(null,settings,null,now),null);
assert.equal(selectedAlert(undefined,settings,undefined,now),null);
for(const absent of [null,undefined,{}, {snoozes:null,dismissed:null,userAlarms:null}])assert.equal(selectedAlert(state.week,settings,absent,now)?.name,'Tea Break 1 ends');
report.checks.push('Alert selection tolerates null state and null optional snooze, dismissal and alarm fields');

const env=await start();
try{
 for(const failure of ['delayed','empty','last_error','throw']){
  const page=await env.browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  page.on('pageerror',error=>report.errors.push(error.message));await init(page,state);
  await page.addInitScript(()=>{
   const addListener=chrome.storage.onChanged.addListener;window.__notifyStorage=[];
   chrome.storage.onChanged.addListener=fn=>{window.__notifyStorage.push(fn);addListener(fn);};
   const addRuntime=chrome.runtime.onMessage.addListener;window.__notifyRuntime=[];
   chrome.runtime.onMessage.addListener=fn=>{window.__notifyRuntime.push(fn);addRuntime(fn);};
  });
  await page.goto(env.base+'/harness.html');await page.clock.setFixedTime(new Date(now));
  await page.evaluate(()=>import('/extension/background.mjs'));
  await page.evaluate(mode=>{
   window.__pendingStateReplies=[];window.__stateReads=0;
   const send=chrome.runtime.sendMessage;
   chrome.runtime.sendMessage=(message,callback)=>{
    if(message.type!=='WFM_GET_STATE')return send(message,callback);
    window.__stateReads++;
    if(mode==='delayed'){window.__pendingStateReplies.push(()=>send(message,callback));return;}
    if(mode==='throw')throw new Error('Extension context invalidated');
    queueMicrotask(()=>{
     if(mode==='last_error')chrome.runtime.lastError={message:'Background unavailable'};
     callback(mode==='empty'?{ok:true,state:null}:undefined);chrome.runtime.lastError=null;
    });
   };
   window.__restoreStateReads=()=>{chrome.runtime.sendMessage=send;for(const reply of window.__pendingStateReplies.splice(0))reply();};
  },failure);
  await page.addScriptTag({url:env.base+'/extension/ring.js'});
  await page.waitForFunction(()=>window.__stateReads>0);
  // Resize can request a repaint before the first background reply. Failed
  // replies also leave the 125 ms drawing timer running without any state.
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>Boolean(window.__closedShadow.querySelector('#control.visible'))),false);
  assert.equal(await page.evaluate(()=>Boolean(window.__closedShadow.querySelector('#edge.visible'))),false);
  await page.evaluate(()=>{window.__restoreStateReads();window.__notifyRuntime.forEach(fn=>fn({type:'WFM_COMPANION_CHANGED'},{},()=>{}));});
  await page.waitForFunction(()=>window.__closedShadow.querySelector('#control.visible'));
  assert.match(await page.evaluate(()=>window.__closedShadow.querySelector('#label').textContent),/Tea Break 1 ends/);
  await page.evaluate(()=>{
   const send=chrome.runtime.sendMessage;window.__emptyReloads=0;
   chrome.runtime.sendMessage=(message,callback)=>message.type==='WFM_GET_STATE'?queueMicrotask(()=>{window.__emptyReloads++;callback({ok:true,state:null});}):send(message,callback);
   window.__notifyRuntime.forEach(fn=>fn({type:'WFM_COMPANION_CHANGED'},{},()=>{}));
   window.__restoreLoadedReads=()=>{chrome.runtime.sendMessage=send;};
  });
  await page.waitForFunction(()=>window.__emptyReloads>0);
  await page.evaluate(()=>{window.dispatchEvent(new Event('resize'));window.__restoreLoadedReads();});
  assert.equal(await page.evaluate(()=>Boolean(window.__closedShadow.querySelector('#control.visible'))),true);
  // Storage deletion/null values must hide the alert and permit a later restore.
  for(const value of [null,undefined]){
   await page.evaluate(value=>window.__notifyStorage.forEach(fn=>fn({wfm_companion_state_v1:{newValue:value}},'local')),value);
   assert.equal(await page.evaluate(()=>Boolean(window.__closedShadow.querySelector('#control.visible'))),false);
   await page.evaluate(state=>window.__notifyStorage.forEach(fn=>fn({wfm_companion_state_v1:{newValue:state}},'local')),state);
   await page.waitForFunction(()=>window.__closedShadow.querySelector('#control.visible'));
  }
  assert.equal(await page.evaluate(()=>window.__fetches.length),0);await page.close();
 }
 report.checks.push('Overlays safely wait through delayed, null, failed and throwing state reads, then recover when state arrives');
 report.checks.push('State removal hides active alerts immediately and a later storage update restores them without WFM requests');
 report.checks.push('An empty background reload preserves a previously loaded schedule and its active alert');
 assert.deepEqual(report.errors,[]);
 for(const check of report.checks)console.log('PASS '+check);
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile('verification/overlay-state-report.json',JSON.stringify(report,null,2));await env.close();}
