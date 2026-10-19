import {deserializeWfmRpc} from './parser.mjs';
import {normalizeWfmHolder,isoWeek} from './normalize.mjs';
import {createWfmClient} from './transport.mjs';
import {createDiagnosticRun,diagnosticSummary,diagnosticExport,diagnosticLimit} from './diagnostics.mjs';
import {DEFAULT_SETTINGS,settingsWithDefaults,localDate,wallTimeToEpoch,weekFingerprint,changedRemainingToday,changeDescription,selectedAlert} from './companion-core.mjs';
import {scheduleFreshness,scheduleRefreshDue} from './schedule-freshness.mjs';
import {compareDomToCached,observationId} from './wfm-dom-compare.mjs';

const client=createWfmClient();
const VERSION=chrome.runtime.getManifest().version;
const DIAG_KEY='wfm_diagnostic_runs_v1';
const STATE_KEY='wfm_companion_state_v1';
const UI_DIAG_KEY='wfm_companion_ui_logs_v1';
const LEGACY_POLL_ALARM='wfm-companion-poll';
const BADGE_ALARM='wfm-companion-badge';
const WFM_URL='http://svdt1ipccwfm09:8070/wfm/Agent?#Schedule;view=MY_SCHEDULE';
let fetchInProgress=null;
const weekRequests=new Map();
let openTabInProgress=null;
let loginInProgress=null;
let diagQueue=Promise.resolve();
let stateQueue=Promise.resolve();
const savedRuns=[];
const EMPTY={settings:{...DEFAULT_SETTINGS},week:null,weeks:{},weekUpdated:{},lastUpdated:null,lastError:null,domChange:null,toast:null,snoozes:{},dismissed:{},bannerHiddenFingerprint:null,userAlarms:[],earChange:{enabled:false,intervalMin:60,nextAt:null},holdEndsAt:null,holdTimer:{enabled:false,position:null}};
let stateLoaded=null;
const scrubCode=e=>e instanceof Error?e.name:'UnknownError';
async function getState(){
 if(!stateLoaded)stateLoaded=chrome.storage.local.get(STATE_KEY).then(x=>({...EMPTY,...x[STATE_KEY],settings:settingsWithDefaults(x[STATE_KEY]?.settings)})).catch(()=>({...EMPTY,settings:{...DEFAULT_SETTINGS}}));
 return stateLoaded;
}
async function patchState(change){
 stateQueue=stateQueue.catch(()=>{}).then(async()=>{
  const old=await getState(); const next={...old,...change};
  stateLoaded=Promise.resolve(next);
  await chrome.storage.local.set({[STATE_KEY]:next});
  return next;
 });
 return stateQueue;
}
async function logUI(code,info={}){
 try{
  const old=(await chrome.storage.session.get(UI_DIAG_KEY))[UI_DIAG_KEY]??[];
  const safe={at:new Date().toISOString(),code};
  for(const key of ['reason','outcome','trigger','phase','comparison'])if(typeof info[key]==='string')safe[key]=info[key].replace(/[^\w-]/g,'').slice(0,50);
  for(const key of ['dayCount','eventCount','changedToday','leadMinutes','availableDays','unknownDays'])if(typeof info[key]==='number')safe[key]=info[key];
  await chrome.storage.session.set({[UI_DIAG_KEY]:[...old,safe].slice(-120)});
 }catch{/* Diagnostics must not block schedule reading. */}
}
async function appendDiagnostic(run){
 diagQueue=diagQueue.catch(()=>{}).then(async()=>{
  let previous=savedRuns;
  try{const old=(await chrome.storage.session.get(DIAG_KEY))[DIAG_KEY];if(Array.isArray(old))previous=old;}catch{}
  const next=[...previous,run].slice(-diagnosticLimit);
  savedRuns.splice(0,savedRuns.length,...next);
  try{await chrome.storage.session.set({[DIAG_KEY]:next});}catch{}
 });
 await diagQueue;
}
function userFacingWeek(raw){
 // No agent identity is persisted in companion cache or sent to content scripts.
 return {ok:true,weekStart:raw.weekStart,weekEnd:raw.weekEnd,source:raw.source,
  days:raw.days.map(day=>({date:day.date,kind:day.kind,shift:day.shift,events:day.events,paidMinutes:day.paidMinutes,workMinutes:day.workMinutes,exception:day.exception})),
  warnings:raw.warnings??[],missingDates:raw.missingDates??[]};
}
export async function getWeekSchedule(date,{source=1,agentId}={}){
 const diag=createDiagnosticRun({date,source,version:VERSION});
 const {log,finish}=diag;log('run','started',{source});
 try{
  const response=await client.fetchWeek(date,{source,agentId,logger:log});
  if(!response.ok){log('run','failed',{reason:response.reason});finish(response.reason);await appendDiagnostic(diag.run);return response;}
  log('parser','started',{bytes:response.text.length});
  let parsed;
  try{parsed=deserializeWfmRpc(response.text);}catch(e){log('parser','failure',{reason:scrubCode(e)});throw e;}
  log('parser','completed',{parserType:'SchAgentDayHolder'});log('normalizer','started');
  const schedule=normalizeWfmHolder(parsed,date,{source,onWarning:warning=>{
   const {code,...fields}=warning;log('semantic',code,fields);
  }});
  const summary=diagnosticSummary(schedule);log('normalizer','completed',summary);
  const matched=schedule.agent?.id===response.agentId;
  log('validation','agent_identity',{identityMatches:matched});
  if(!matched){finish('parse_error');await appendDiagnostic(diag.run);return {ok:false,reason:'parse_error',message:'WFM agent identity mismatch'};}
  if(summary.unknownDays)log('validation','incomplete_week',{missingDates:summary.missingDates});
  if(summary.incompleteNativeDays)log('validation','incomplete_native_records',{incompleteNativeDays:summary.incompleteNativeDays});
  finish('success');await appendDiagnostic(diag.run);return schedule;
 }catch(e){log('run','exception',{reason:scrubCode(e)});finish('parse_error');await appendDiagnostic(diag.run);
  return {ok:false,reason:'parse_error',message:'Schedule processing failed. Export diagnostics for troubleshooting.'};}
}
async function broadcast(){
 try{const tabs=await chrome.tabs.query({});await Promise.allSettled(tabs.filter(t=>typeof t.id==='number').map(t=>chrome.tabs.sendMessage(t.id,{type:'WFM_COMPANION_CHANGED'})));}catch{}
}
async function updateBadge(){
 try{
  const state=await getState();const now=Date.now();
  const alert=selectedAlert(state.week,state.settings,state,now);
  const active=state.settings.showRing&&alert;
  const label=active?`${Math.max(1,Math.ceil(alert.remaining/60000))}m`:'';
  await chrome.action.setBadgeText({text:label});
  if(active)await chrome.action.setBadgeBackgroundColor({color:'#ea5268'});
 }catch{}
}
// Popup visits, week navigation, Refresh and Login may request a week.
// Startup, badge alarms and passive page observations never fetch WFM.
export async function refresh({trigger='manual',date:requestedDate}={}){
 if(requestedDate!==undefined){try{isoWeek(requestedDate);}catch{return {ok:false,reason:'invalid_date'};}}
 const initial=await getState(),requested=requestedDate??localDate(Date.now(),initial.settings.timeZone),key=isoWeek(requested)[0];
 if(trigger==='popup'&&!scheduleRefreshDue(initial,requested))return {ok:true,cached:true};
 if(weekRequests.has(key)){
  const result=await weekRequests.get(key);
  return result.cached&&trigger!=='popup'?refresh({trigger,date:requestedDate}):result;
 }
 const previous=fetchInProgress;
 const request=(async()=>{
  if(previous)await previous.catch(()=>{});
  const state=await getState();const now=Date.now(),currentDate=localDate(now,state.settings.timeZone),date=requestedDate??currentDate;
  if(trigger==='popup'&&!scheduleRefreshDue(state,date,now))return {ok:true,cached:true};
  const policy=scheduleFreshness(state,date,now);
  const result=await getWeekSchedule(date);
  if(!result.ok){
   const error={reason:result.reason,message:result.message??null,at:Date.now()};
   const refreshFailures=Object.fromEntries(Object.entries({...state.refreshFailures,[policy.key]:error}).sort((a,b)=>b[1].at-a[1].at).slice(0,48));
   await patchState({lastError:error,refreshFailures});
   await logUI('refresh_failed',{reason:result.reason,trigger});await broadcast();return {ok:false,reason:result.reason,message:result.message};
  }
  const week=userFacingWeek(result);
  const cached={...(state.weeks??{}),...(state.week?{[state.week.weekStart]:state.week}:{}),[week.weekStart]:week};
  // Bound the cache, retaining the current week used by page alerts.
  const currentStart=isoWeek(currentDate)[0];
  const starts=Object.keys(cached).sort((a,b)=>Math.abs(Date.parse(a)-now)-Math.abs(Date.parse(b)-now)).slice(0,12);
  if(!starts.includes(week.weekStart))starts[starts.length-1]=week.weekStart;
  if(cached[currentStart]&&!starts.includes(currentStart))starts[starts.length-1]=currentStart;
  const weeks=Object.fromEntries(starts.map(start=>[start,cached[start]]));
  const checkedAt=Date.now();
  const weekUpdated=Object.fromEntries(starts.map(start=>[start,start===week.weekStart?checkedAt:state.weekUpdated?.[start]??(state.week?.weekStart===start?state.lastUpdated:null)]));
  const refreshFailures=Object.fromEntries(Object.entries(state.refreshFailures??{}).filter(([failure])=>!failure.startsWith(week.weekStart+':')));
  if(week.weekStart!==currentStart){
   await patchState({weeks,weekUpdated,refreshFailures,lastError:null});
   await logUI('schedule_applied',{trigger,dayCount:week.days.length,eventCount:week.days.reduce((n,d)=>n+d.events.length,0),changedToday:0});
   await broadcast();return {ok:true,changedToday:false};
  }
  const old=state.week;
  const changed=Boolean(old)&&weekFingerprint(week)!==weekFingerprint(old);
  const changedToday=changed&&changedRemainingToday(old,week,state.settings,now);
  const toast=changedToday?{text:changeDescription(old,week,state.settings,now),expiresAt:now+5000}:null;
  const next={week,weeks,weekUpdated,refreshFailures,lastUpdated:checkedAt,lastError:null,domChange:null,bannerHiddenFingerprint:null,toast,pending:null,pendingAt:null};
  if(old?.weekStart!==week.weekStart){next.snoozes={};next.dismissed={};}
  await patchState(next);
  await logUI('schedule_applied',{trigger,dayCount:week.days.length,eventCount:week.days.reduce((n,d)=>n+d.events.length,0),changedToday:Number(changedToday)});
  await updateBadge();await broadcast();return {ok:true,changedToday};
 })().finally(()=>{weekRequests.delete(key);if(fetchInProgress===request)fetchInProgress=null;});
 weekRequests.set(key,request);fetchInProgress=request;
 return request;
}

// Invoked only by the content script when WFM renders its My Schedule DOM.
// A passive observation never fetches or navigates WFM and never overwrites
// its much richer RPC cache with the incomplete DOM representation.
async function observeDom(message,sender){
 const page=sender?.url??sender?.tab?.url??'';
 if(!/^http:\/\/svdt1ipccwfm09:8070\/wfm\/Agent(?:[?#]|$)/i.test(page) || !sender?.tab?.id)
  return {ok:false,reason:'untrusted_observation_source'};
 const observation=message?.observation;
 const s=await getState();
 const expected=localDate(Date.now(),s.settings.timeZone);
 const weekStartDate=new Date(`${expected}T00:00:00Z`);
 weekStartDate.setUTCDate(weekStartDate.getUTCDate()-(weekStartDate.getUTCDay()+6)%7);
 const currentWeek=weekStartDate.toISOString().slice(0,10);
 if(!observation||observation.weekStart!==currentWeek||!Array.isArray(observation.days)||observation.days.length!==7)
  return {ok:false,reason:'observation_week_mismatch'};
 if(observation.days.some(d=>typeof d.date!=='string'||!['scheduled','day_off','unavailable'].includes(d.status)||!Array.isArray(d.details??[])||(d.details??[]).length>90))
  return {ok:false,reason:'invalid_observation'};
 const id=observationId(observation);
 const compared=compareDomToCached(observation,s.week,s.settings,Date.now(),
   (date,time)=>wallTimeToEpoch(date,time,s.settings.timeZone),expected);
 const pending=compared.status==='changed';
 const samePending=s.domChange?.fingerprint===id;
 if(pending&&!samePending){
  await patchState({domChange:{fingerprint:id,detectedAt:Date.now(),reason:compared.reason}});
  await logUI('dom_schedule_difference',{comparison:compared.reason,changedToday:1,trigger:'manual_wfm_visit'});
  await broadcast();
 }else if(!pending&&s.domChange){
  await patchState({domChange:null});
  await logUI('dom_difference_cleared',{comparison:compared.reason,trigger:'manual_wfm_visit'});
  await broadcast();
 }else if(compared.status==='inconclusive'){
  // These are bounded sanitized codes, not names/employee details.
  if(!samePending)await logUI('dom_comparison_inconclusive',{comparison:compared.reason,trigger:'manual_wfm_visit'});
 }
 return {ok:true,status:compared.status,reason:compared.reason??null};
}

// Reuse the user's existing WFM tab and prevent concurrent create races.
const WFM_TAB_PATTERN=/^http:\/\/svdt1ipccwfm09:8070\/wfm(?:\/|[?#]|$)/i;
const MY_SCHEDULE_PATTERN=/^http:\/\/svdt1ipccwfm09:8070\/wfm\/Agent\/?\?#Schedule;view=MY_SCHEDULE(?:[;&]|$)/i;
async function openWfmTab({login=false}={}){
 if(openTabInProgress)return openTabInProgress;
 openTabInProgress=(async()=>{
  const tabs=(await chrome.tabs.query({})).filter(tab=>typeof tab.id==='number'&&WFM_TAB_PATTERN.test(tab.url??''));
  tabs.sort((a,b)=>Number(MY_SCHEDULE_PATTERN.test(b.url??''))-Number(MY_SCHEDULE_PATTERN.test(a.url??'')) || Number(b.active)-Number(a.active));
  if(tabs.length){
   const existing=tabs[0];
   await chrome.tabs.update(existing.id,{active:true});
   if(login){
    if(existing.url?.startsWith('http://svdt1ipccwfm09:8070/wfm/login')){
     try{if(typeof chrome.tabs?.reload==='function')await chrome.tabs.reload(existing.id);}catch{}
    }else{
     await chrome.tabs.update(existing.id,{url:'http://svdt1ipccwfm09:8070/wfm/login'});
    }
   }else{
    try{if(typeof chrome.tabs?.reload==='function')await chrome.tabs.reload(existing.id);}catch{}
   }
   if(typeof existing.windowId==='number')await chrome.windows.update(existing.windowId,{focused:true});
   await logUI('wfm_tab_reused',{trigger:login?'login':'open'});
   return {ok:true,action:'reused',tabId:existing.id};
  }
  const created=await chrome.tabs.create({url:login?'http://svdt1ipccwfm09:8070/wfm/login':WFM_URL,active:true});
  await logUI('wfm_tab_opened',{trigger:login?'login':'open'});
  return {ok:true,action:'created',tabId:created.id};
 })().finally(()=>{openTabInProgress=null;});
 return openTabInProgress;
}
async function loginCheck(){
 if(loginInProgress)return loginInProgress;
 loginInProgress=(async()=>{
  const result=await refresh({trigger:'login_click'});
  if(result.ok)return {ok:true,action:'schedule_loaded'};
  if(result.reason!=='not_authenticated')return result;
  const tab=await openWfmTab({login:true});
  return {...tab,reason:'not_authenticated'};
 })().finally(()=>{loginInProgress=null;});
 return loginInProgress;
}
async function handleMessage(message,sender){
 const type=message?.type;
 if(type==='WFM_GET_STATE')return {ok:true,state:await getState()};
 if(type==='WFM_REFRESH')return refresh({trigger:message.trigger==='popup'?'popup':'manual',date:message.date});
 if(type==='WFM_LOGIN_CHECK')return loginCheck();
 if(type==='WFM_DOM_OBSERVED')return observeDom(message,sender);
 if(type==='WFM_DOM_STATUS'){
  const page=sender?.url??sender?.tab?.url??'';
  if(!/^http:\/\/svdt1ipccwfm09:8070\/wfm\//i.test(page)||!sender?.tab?.id)return {ok:false,reason:'untrusted_observation_source'};
  const allowed=new Set(['not-authenticated','blocked','wrong-view','unsupported-dom','loading-or-empty','incomplete_or_other_week','rendered']);
  if(allowed.has(message.reason))await logUI('dom_observation_status',{reason:message.reason,trigger:'manual_wfm_visit'});
  return {ok:true};
 }
 if(type==='WFM_SETTINGS_UPDATE'){
  const old=await getState();
  const safe={};for(const key of Object.keys(DEFAULT_SETTINGS))if(Object.hasOwn(message.patch??{},key))safe[key]=message.patch[key];
  const settings=settingsWithDefaults({...old.settings,...safe});
  await patchState({settings});await logUI('settings_changed');await updateBadge();await broadcast();return {ok:true,state:await getState()};
 }
 if(type==='WFM_TOOLS')return updateTools(message);
  if(type==='WFM_SNOOZE'||type==='WFM_DISMISS'){
  const s=await getState();const alert=selectedAlert(s.week,s.settings,s,Date.now());
  if(!alert||message.id!==alert.id)return {ok:false,reason:'alert_no_longer_active'};
  if(type==='WFM_SNOOZE'){
   const minutes=Number(message.minutes);
   if(![1,2,5,10].includes(minutes)||minutes*60000>=alert.remaining)return {ok:false,reason:'snooze_exceeds_remaining'};
   await patchState({snoozes:{...s.snoozes,[alert.id]:Date.now()+minutes*60000}});await logUI('alert_snoozed',{leadMinutes:minutes});
  }else{
   await patchState({dismissed:{...s.dismissed,[alert.id]:true}});await logUI('alert_dismissed');
  }
  await updateBadge();await broadcast();return {ok:true};
 }
 if(type==='WFM_DISMISS_BANNER'){
  const s=await getState();await patchState({bannerHiddenFingerprint:s.domChange?.fingerprint??null});await logUI('banner_dismissed');await broadcast();return {ok:true};
 }
 if(type==='WFM_EXPORT_DIAGNOSTICS'){
  await diagQueue;let previous=savedRuns,ui=[];
  try{const stored=await chrome.storage.session.get([DIAG_KEY,UI_DIAG_KEY]);if(Array.isArray(stored[DIAG_KEY]))previous=stored[DIAG_KEY];if(Array.isArray(stored[UI_DIAG_KEY]))ui=stored[UI_DIAG_KEY];}catch{}
  return {ok:true,report:{...diagnosticExport(previous,{extensionVersion:VERSION}),companionEvents:ui}};
 }
 if(type==='WFM_CLEAR_DIAGNOSTICS'){
  await diagQueue;savedRuns.splice(0,savedRuns.length);
  try{await chrome.storage.session.remove([DIAG_KEY,UI_DIAG_KEY]);}catch{}
  return {ok:true};
 }
 if(type==='WFM_UI_DIAGNOSTIC'){
  if(['overlay_error','content_script_loaded','wfm_banner_error'].includes(message.code))await logUI(message.code,{reason:message.reason});
  return {ok:true};
 }
 if(type==='WFM_OPEN_SITE')return openWfmTab({login:Boolean(message.login)});
 return {ok:false,reason:'unknown_message'};
}
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
 if(!message||typeof message.type!=='string'||!message.type.startsWith('WFM_'))return false;
 handleMessage(message,_sender).then(sendResponse,error=>{
  logUI('companion_runtime_error',{reason:scrubCode(error)});
  sendResponse({ok:false,reason:'runtime_error',message:'Companion request failed'});
 });return true;
});
// ---- Personal alarms, ear-change reminders and hold timer ----
const TOOL_PREFIX='wfm-tool:';
const HOLD_MS=60000,MAX_ALARMS=10,EAR_INTERVALS=[30,45,60];
const TIME_RE=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
function nextAlarmTime(time,zone,now=Date.now()){
  const today=localDate(now,zone);
  let at=wallTimeToEpoch(today,time,zone);
  if(at===null||at<=now){const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);at=wallTimeToEpoch(d.toISOString().slice(0,10),time,zone);}
  return at;
}
async function notify(id,title,message){
  try{await chrome.notifications.create(`${id}:${Date.now()}`,{type:'basic',iconUrl:'icon-128.png',title,message,priority:2,requireInteraction:true});}catch{}
}
async function syncToolAlarms(){
  try{
   const state=await getState(),now=Date.now();
   for(const a of await chrome.alarms.getAll())if(a.name.startsWith(TOOL_PREFIX))await chrome.alarms.clear(a.name);
   for(const alarm of state.userAlarms??[])if(alarm.enabled){const when=nextAlarmTime(alarm.time,state.settings.timeZone,now);if(when)await chrome.alarms.create(`${TOOL_PREFIX}user:${alarm.id}`,{when});}
   const ear=state.earChange;
   if(ear?.enabled&&ear.nextAt)await chrome.alarms.create(`${TOOL_PREFIX}ear`,{when:Math.max(ear.nextAt,now+1000)});
   if(state.holdEndsAt&&state.holdEndsAt>now)await chrome.alarms.create(`${TOOL_PREFIX}hold`,{when:state.holdEndsAt});
  }catch{}
}
async function updateTools(message){
  const s=await getState(),now=Date.now();
  const action=message.action;
  if(action==='add_alarm'){
   const time=String(message.time??''),label=String(message.label??'').trim().slice(0,40);
   if(!TIME_RE.test(time))return {ok:false,reason:'invalid_time'};
   if((s.userAlarms??[]).length>=MAX_ALARMS)return {ok:false,reason:'too_many_alarms'};
   const alarm={id:`${now.toString(36)}${Math.random().toString(36).slice(2,6)}`,time,label:label||'Alarm',enabled:true};
   await patchState({userAlarms:[...(s.userAlarms??[]),alarm].sort((a,b)=>a.time.localeCompare(b.time))});
  }else if(action==='toggle_alarm'){
   await patchState({userAlarms:(s.userAlarms??[]).map(a=>a.id===message.id?{...a,enabled:Boolean(message.enabled)}:a)});
  }else if(action==='delete_alarm'){
   await patchState({userAlarms:(s.userAlarms??[]).filter(a=>a.id!==message.id)});
  }else if(action==='ear_change'){
   const old=s.earChange??{enabled:false,intervalMin:60,nextAt:null};
   const intervalMin=EAR_INTERVALS.includes(Number(message.intervalMin))?Number(message.intervalMin):old.intervalMin;
   const enabled=message.enabled===undefined?old.enabled:Boolean(message.enabled);
   // Restart the countdown whenever it is switched on or its interval changes.
   const restart=enabled&&(!old.enabled||intervalMin!==old.intervalMin||!old.nextAt);
   await patchState({earChange:{enabled,intervalMin,nextAt:enabled?(restart?now+intervalMin*60000:old.nextAt):null}});
  }else if(action==='toggle_hold_timer'){
   const current=s.holdTimer??{enabled:false,position:null};
   const enabled=message.enabled===undefined?!current.enabled:Boolean(message.enabled);
   await patchState({holdTimer:{...current,enabled}});
  }else if(action==='hold_position'){
   const current=s.holdTimer??{enabled:false,position:null};
   await patchState({holdTimer:{...current,position:message.position}});
  }else if(action==='hold_start'){
   await patchState({holdEndsAt:now+HOLD_MS});
  }else if(action==='hold_stop'||action==='hold_cancel'){
   await patchState({holdEndsAt:null});
  }else return {ok:false,reason:'unknown_action'};
  await syncToolAlarms();
  await broadcast();
  return {ok:true,state:await getState()};
}
async function onToolAlarm(name){
  const s=await getState(),now=Date.now(),key=name.slice(TOOL_PREFIX.length);
  if(key==='hold'){
   if(!s.holdEndsAt)return;
   await notify('hold','Hold timer reached 1 minute','1 minute is up. Check back with the caller.');
  }else if(key==='ear'){
   const ear=s.earChange;if(!ear?.enabled)return;
   await patchState({earChange:{...ear,nextAt:now+ear.intervalMin*60000}});
   await notify('ear','Change ears','Switch your headset to the other ear.');
  }else if(key.startsWith('user:')){
   const alarm=(s.userAlarms??[]).find(a=>a.id===key.slice(5));
   if(alarm?.enabled)await notify(`user-${alarm.id}`,alarm.label,`Alarm for ${alarm.time}`);
  }
  await syncToolAlarms();
}
async function ensureAlarms(){
 try{
  // Chrome retains old alarms across extension upgrades. Stop obsolete polling.
  await chrome.alarms.clear(LEGACY_POLL_ALARM);
  await chrome.alarms.create(BADGE_ALARM,{periodInMinutes:1});
 }catch{}
 await updateBadge();
}
chrome.runtime.onInstalled.addListener(()=>{ensureAlarms();syncToolAlarms();});
chrome.runtime.onStartup.addListener(()=>{ensureAlarms();});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===BADGE_ALARM)updateBadge();else if(a.name.startsWith(TOOL_PREFIX))onToolAlarm(a.name);});
syncToolAlarms();
ensureAlarms();
