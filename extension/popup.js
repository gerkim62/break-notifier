import {SCREENS} from './design-screens.mjs';
import {weekPicker,journey} from './schedule-components.mjs';
import {icon,countdownRing,paintRing} from './ui-icons.mjs';
import {PausableToastTimer} from './queue-toast.mjs';
import {captureMotion,restoreMotion,fadeContent} from './motion.mjs';
import {settingsWithDefaults,localDate,localTime,buildDaySegments,contextForDay,formatDuration,dayForDate,eventBounds,wallTimeToEpoch,segmentProgress,alertColor} from './companion-core.mjs';
import {scheduleFreshness,scheduleRefreshDue,scheduleRefreshFailure} from './schedule-freshness.mjs';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const send=message=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,response=>{
 const error=chrome.runtime.lastError;if(error)reject(new Error('Background worker unavailable'));else resolve(response);
}));
const app=$('#app'),style=$('#visual-css');
let state=null,selectedDate=null,filter='special',mode='schedule',loginBusy=false,activeVariant='',activeDate='',statusTimer=null;
let lastInfoOpen=false;
let retainedPicker=null;
let retainedFilters=null;
const weekLoads=new Map(),visitedChecks=new Set(),weekErrors=new Map();
let savedScheduleScroll=0;
let popupToastClock=null,toastActionBusy=false,toastVersion=0;
const settings=()=>settingsWithDefaults(state?.settings);
const today=()=>localDate(Date.now(),settings().timeZone);
const weekStart=date=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
const week=()=>state?.week?.weekStart===weekStart(today())?state.week:null;
const selectedWeek=()=>{const start=weekStart(selectedDate??today());return state?.week?.weekStart===start?state.week:state?.weeks?.[start]??null;};
const h=(tag,className='',text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const stamp=(epoch,options={})=>new Intl.DateTimeFormat('en-US',{timeZone:settings().timeZone,hour:'numeric',minute:'2-digit',...options}).format(new Date(epoch));
const shortDay=date=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short'}).format(new Date(`${date}T12:00:00Z`));
const fmtRange=(start,end)=>{const s=stamp(start),e=stamp(end);const match=s.match(/([AP]M)$/);return match&&e.endsWith(match[1])?`${s.replace(/ [AP]M$/,'')} – ${e}`:`${s} – ${e}`;};
const length=ms=>formatDuration(ms).replace(/\bminutes\b/g,'min');
const typeLabel=type=>({queue:'Queue',break:'Break',exception:'Event',time_off:'Time off',work:'Work',marked:'Marked',shift:'Shift',day_off:'Day Off',other:'Other'})[type]??'Event';
const setText=(selector,value)=>{const node=$(selector,app);if(node)node.textContent=value;return node;};
function updateFirstText(node,value){if(!node)return;const text=[...node.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(text)text.textContent=value;else node.prepend(document.createTextNode(value));}
function determineVariant(){
 const w=selectedWeek();if(!w)return 'today';
 const day=dayForDate(w,selectedDate??today());
 if(day?.kind==='day_off')return 'off';
 if(state?.lastError?.reason==='not_authenticated')return 'signed-cache';
 if(scheduleFreshness(state,selectedDate??today()).status==='stale'&&!weekLoads.has(w.weekStart))return 'stale';
 return 'today';
}
function header(variant){
 const logo=$('.hd .lg',app);if(logo)logo.innerHTML=countdownRing(20);
 const badge=$('.hd .s',app),updated=state?.weekUpdated?.[weekStart(selectedDate??today())]??(selectedWeek()===week()?state?.lastUpdated:null);
 const signout=!week()&&state?.lastError?.reason==='not_authenticated';
 let label='Not refreshed yet';
 if(signout)label='Signed out';
 else if(updated)label='Updated '+stamp(updated,localDate(updated,settings().timeZone)===today()?{}:{month:'short',day:'numeric'});
 updateFirstText(badge,label+' ');
 if(badge){const textNode=[...badge.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);if(textNode)textNode.replaceWith(h('span','update-label',label));}
 const refresh=$('.hd .btn',app);
 if(refresh){
  const loading=weekLoads.has(weekStart(selectedDate??today()))||loginBusy;
  const unconfirmed=scheduleFreshness(state,selectedDate??today()).status==='stale';
  refresh.disabled=loading;refresh.classList.toggle('hot',unconfirmed&&!loading);badge?.classList.toggle('w',unconfirmed&&!loading);
  refresh.setAttribute('aria-label',loading?'Refreshing schedule':'Refresh schedule');
  refresh.setAttribute('aria-busy',String(loading));refresh.onclick=refreshSchedule;
  const icon=refresh.querySelector('svg');if(icon)icon.classList.toggle('spinning',loading);
  // Only rewrite the text node, never remove the design's SVG.
  updateFirstText(refresh,loading?'Checking…':'Refresh');
 }
 // Retain the exact visual icon, but make it a real accessible trigger.
 const original=$('.hd .s svg',app);
 if(original){
  const button=h('button','schedule-info-button');button.type='button';button.title='Schedule details';
  button.setAttribute('aria-label','Schedule details');button.setAttribute('aria-expanded',String(lastInfoOpen));
  original.replaceWith(button);button.append(original);
  const popup=h('div','schedule-info-popover');popup.id='schedule-info-popover';popup.hidden=!lastInfoOpen;
  popup.setAttribute('role','status');popup.append(h('strong','','Schedule details'));
  popup.append(h('div','',updated?`Last updated: ${stamp(updated,{month:'short',day:'numeric'})}`:'Not refreshed yet'));
  const freshness=scheduleFreshness(state,selectedDate??today());
  popup.append(h('div','',freshness.status==='confirmed'?'Confirmed for this shift.':freshness.status==='stale'?'Saved schedule has not been confirmed.':freshness.status==='provisional'?(freshness.bounds?'Future schedule is provisional.':'No shift has been confirmed for this day.'):freshness.status==='archived'?'Saved schedule for a completed day.':freshness.status==='day-off'?'Day off checked today.':'Schedule has not been loaded.'));
  if(state?.lastError?.reason)popup.append(h('div','',`Last refresh: ${errorMessage(state.lastError)}`));
  const warnings=week()?.warnings?.length??0;
  if(warnings)popup.append(h('div','',`${warnings} WFM data warning${warnings===1?'':'s'}. See Diagnostics.`));
  button.setAttribute('aria-controls',popup.id);
  button.append(popup);
  button.onclick=e=>{e.stopPropagation();lastInfoOpen=!lastInfoOpen;button.setAttribute('aria-expanded',String(lastInfoOpen));popup.hidden=!lastInfoOpen;};
 }
}
function freshnessNotice(){
 const date=selectedDate??today(),freshness=scheduleFreshness(state,date);
 if(freshness.status!=='stale'||weekLoads.has(freshness.weekStart))return;
 const failure=scheduleRefreshFailure(state,date),notice=h('div','warn schedule-refresh-warning');notice.setAttribute('role','status');
 const message=failure?(freshness.bounds?'Couldn’t confirm this shift. Showing saved schedule.':'Couldn’t confirm this day. Showing saved schedule.'):'Schedule needs checking. Showing saved schedule.';
 notice.append(h('span','',message));
 if(failure?.reason==='not_authenticated'){
  const button=h('button','',loginBusy?'Checking…':'Log in');button.type='button';button.disabled=loginBusy;button.setAttribute('aria-busy',String(loginBusy));button.onclick=loginSchedule;notice.append(button);
 }
 const top=$('.top',app);top?.insertBefore(notice,$('.week-picker',top));
}


// Content replacement stays at its final position. Only explicit navigation
// dissolves briefly; initial loads, async updates and clock ticks stay still.
function changePopupMode(nextMode){
 if(mode===nextMode)return;
 if(mode==='schedule')savedScheduleScroll=$('.schedule-scroll',app)?.scrollTop??0;
 mode=nextMode;render();
 fadeContent(mode==='settings'?$('.settings-body',app):$('.schedule-scroll',app),{duration:150});
}
function changeScheduleView(change,kind='day'){
 change();
 render();
 fadeContent($('.tb',app)??$('.dc',app));
 if(kind==='day')fadeContent($('.hero',app));
}

function tabs(){
 let container=$('.tabs',app);if(!container)return;
 if(retainedPicker){container.replaceWith(retainedPicker);container=retainedPicker;retainedPicker=null;}
 weekPicker(container,{start:weekStart(selectedDate??today()),selected:selectedDate??today(),today:today(),week:selectedWeek(),settings:settings(),onSelect:(date,focus)=>{
  if(selectedDate===date)return;
  changeScheduleView(()=>{selectedDate=date;lastInfoOpen=false;});
  ensureWeekLoaded(date);
  if(focus)$(`[data-date="${date}"]`,app)?.focus();
 }});
}
function footer(){
 const btn=$('.ft button',app),link=$('.ft a',app);
 if(btn){btn.type='button';btn.onclick=()=>changePopupMode('settings');}
 if(link){link.href='#';link.onclick=event=>{event.preventDefault();openSite();};}
}
function liveCountdown(now=Date.now()){
 const w=week(),date=today(),day=dayForDate(w,date);
 if(!day||day.kind==='day_off')return null;
 const {current,next,shiftBounds}=contextForDay(w,date,settings(),now);
 if(!shiftBounds||now>=shiftBounds.end)return null;
 if(current){return {text:formatDuration(current.end-now,{seconds:true}),progress:segmentProgress(current,now),name:current.name};}
 if(next&&now<next.start&&now>=shiftBounds.start){
  const segments=buildDaySegments(day,settings()),prior=segments.filter(e=>e.end<=now).at(-1);
  const gapStart=prior?.end??shiftBounds.start;
  if(next.start>gapStart)return {text:formatDuration(next.start-now,{seconds:true}),progress:(now-gapStart)/(next.start-gapStart),name:next.name};
 }
 return null; // No honest interval against which to show progress.
}
function dottedRing(){
 const ring=$('.hero .ring',app);if(!ring)return;
 const svg=$('svg',ring);if(svg&&!svg.classList.contains('countdown-svg'))svg.outerHTML=countdownRing(100);
 ring.classList.add('inactive-ring');
 const number=ring.querySelector('.ct b');if(number)number.textContent='';
 const label=ring.querySelector('.ct span');if(label)label.textContent='';
}
function hero(day){
 const container=$('.hero',app);if(!container)return;
 const w=week(),date=selectedDate??today(),s=settings();let current=null,next=null,nextBreak=null,shiftBounds=null;
 if(day){({current,next,nextBreak,shiftBounds}=contextForDay(w,date,s,Date.now()));}
 const now=Date.now();
 let heading='Schedule',nextName='No upcoming change',nextAt='',then=null;
 if(date!==today()){
  heading=day?.shift?`Shift · ${day.shift.start}–${day.shift.end}`:'No scheduled shift';
  nextName=day?.events?.find(e=>e.source==='SchState'&&[4,5].includes(e.stateType))?.name??'View daily activities';
 }else if(shiftBounds){
  if(now<shiftBounds.start){heading='Before shift';nextAt=stamp(shiftBounds.start);nextName='Shift starts';}
  else if(now>=shiftBounds.end){heading='Shift ended';nextName='No more changes today';}
  else if(current){heading=current.name;nextAt=stamp(next?.start??shiftBounds.end);nextName=next?.name??'Shift end';}
  else if(next){heading='Between activities';nextAt=stamp(next.start);nextName=next.name;}
  else{heading='Shift';nextAt=stamp(shiftBounds.end);nextName='Shift end';}
  const upcomingBreaks=buildDaySegments(day,s).filter(segment=>segment.type==='break'&&segment.start>now);
  then=upcomingBreaks.find(segment=>segment.start>(next?.start??0))??nextBreak;
 }else{heading='No shift boundary';nextName='See native events below';}
 setText('.nm',heading);
 const lbl=$$('.hero .lb',app);if(lbl[0])lbl[0].textContent=date===today()?'Now':'Selected day';if(lbl[1])lbl[1].textContent=`Next${nextAt?' · '+nextAt:''}`;
 const type=$('.hero .c',app);if(type){type.textContent=nextName;type.className='c '+(next?.type==='queue'?'q':next?.type==='exception'?'e':'b');}
 const nextLine=$('.hero .then span',app);
 if(nextLine){nextLine.replaceChildren();if(then){nextLine.append('Then ',h('b','',then.name),` at ${stamp(then.start)} · in ${length(Math.max(0,then.start-now))}`);}else nextLine.append('Timeline from WFM');}
 if(variantIsStale())container.setAttribute('aria-label','Cached schedule countdown');
 dottedRing(); // The only active progress display is the persistent movable ring.
}

function variantIsStale(){return activeVariant==='stale';}
function rows(day){
 const table=$('.tb',app);if(!table)return;
 const date=selectedDate??today();
 if(!selectedWeek()){
  table.classList.add('journey');
  table.classList.add('missing-week');
  const start=weekStart(date),loading=weekLoads.has(start),error=weekErrors.get(start);
  const status=`${start}:${loading}:${error?.reason??''}:${loginBusy}`;
  if(table.dataset.loadStatus!==status){
   table.dataset.loadStatus=status;
   const empty=h('div','empty-hint');empty.setAttribute('role','status');empty.setAttribute('aria-busy',String(loading));
   empty.append(h('div','',loading?'Loading schedule…':error?errorMessage(error):'No schedule detected.'));
   if(!loading){const auth=error?.reason==='not_authenticated',button=h('button','btn',auth?(loginBusy?'Checking…':'Log in'):'Try again');button.type='button';button.disabled=loginBusy;button.setAttribute('aria-busy',String(loginBusy));button.onclick=auth?loginSchedule:refreshSchedule;empty.append(button);}
   table.replaceChildren(empty);
  }
 }else{delete table.dataset.loadStatus;table.classList.remove('missing-week');journey(table,{day,settings:settings(),filter,isToday:date===today()});}
 filterTabs(table);
}
function filterTabs(table){
 const seg=$('.seg',app);if(!seg)return;
 seg.setAttribute('role','tablist');seg.setAttribute('aria-label','Schedule activities');
 table.id='schedule-activities';table.setAttribute('role','tabpanel');
 const buttons=$$('button',seg),groups=['special','queues','all'];
 buttons.forEach((button,i)=>{
  const selected=groups[i]===filter;button.classList.toggle('on',selected);button.type='button';button.id=`filter-${groups[i]}`;
  button.setAttribute('role','tab');button.setAttribute('aria-selected',String(selected));button.setAttribute('aria-controls',table.id);button.tabIndex=selected?0:-1;
  if(selected)table.setAttribute('aria-labelledby',button.id);
  button.onclick=()=>{if(filter!==groups[i])changeScheduleView(()=>{filter=groups[i];},'filter');};
 });
 seg.onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const i=groups.indexOf(filter),next=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;
  buttons[next].click();buttons[next].focus();
 };
 let underline=$('.filter-underline',seg);if(!underline){underline=h('i','filter-underline');underline.setAttribute('aria-hidden','true');seg.append(underline);}
 underline.style.transform=`translateX(${groups.indexOf(filter)*100}%)`;
}
function addNonmatchedPanel(){
 // This design file has no reference for unknown/other day screens; keep its clean structure and a small explicit message.
 const day=dayForDate(selectedWeek(),selectedDate??today());if(!day)return;
 if(day.kind!=='unknown'&&day.kind!=='other')return;
 const t=$('.hero .nm',app);if(t)t.textContent=day.kind==='unknown'?'No schedule data':'Unrecognised day type';
 const c=$('.hero .c',app);if(c)c.textContent=day.kind==='unknown'?'Not confirmed as a day off':'Native events shown below';
}
function installScreen(variant){
 const movements=captureMotion(app);
 const focused=document.activeElement;
 const previousScroll=$('.schedule-scroll',app)?.scrollTop??savedScheduleScroll;
 const sameDate=activeDate===(selectedDate??today());
 retainedPicker=$('.week-picker',app);
 retainedFilters=$('.seg',app)??retainedFilters;
 activeVariant=variant;app.innerHTML=SCREENS[variant];style.href=`design-${variant}.css`;
 const popup=$('.pop',app),scroller=h('div','schedule-scroll'),foot=$('.ft',popup);
 scroller.tabIndex=0;scroller.setAttribute('role','region');scroller.setAttribute('aria-label','Schedule');
 popup.classList.add('schedule-view');
 for(const child of [...popup.children])if(child!==foot)scroller.append(child);
 popup.prepend(scroller);activeDate=selectedDate??today();
 const seg=$('.seg',app);if(seg&&retainedFilters){seg.replaceWith(retainedFilters);}
 header(variant);tabs();footer();freshnessNotice();
 const day=dayForDate(selectedWeek(),selectedDate??today());
 if(variant!=='off'){
  // The countdown card belongs exclusively to Today. Other days show their
  // schedule rows while the same live ring docks in the header.
  if((selectedDate??today())===today()&&day&&day.kind!=='unknown')hero(day);
  else $('.hero',app)?.remove();
  rows(day);addNonmatchedPanel();
 }
 if(sameDate)scroller.scrollTop=previousScroll;
 savedScheduleScroll=scroller.scrollTop;
 syncLiveRing();
 restoreMotion(movements);
 if(focused!==document.body&&focused?.isConnected)focused.focus({preventScroll:true});
}
// One persistent DOM element: never reconstructed during day changes or renders.
let liveRing=null,liveRingTarget=null;
const ringMarkup=countdownRing(100)+`<div class="ct"><b></b><span>LEFT</span></div>`;
function getLiveRing(){
 if(!liveRing){liveRing=h('div','ring shared-countdown');liveRing.id='shared-countdown';liveRing.innerHTML=ringMarkup;}
 const parent=$('.schedule-scroll',app)??document.body;
 if(liveRing.parentElement!==parent)parent.append(liveRing);
 return liveRing;
}
function hideLiveRing(){
 if(liveRing){liveRing.hidden=true;liveRingTarget=null;}
 const logo=$('.hd .lg',app);if(logo){logo.classList.remove('header-ring-slot');logo.classList.add('idle-header-ring');}
 $('.hero .ring',app)?.classList.remove('live-ring-slot');
}
function syncLiveRing(){
 if(mode!=='schedule'||!week()){hideLiveRing();return;}
 const countdown=liveCountdown();
 if(!countdown){hideLiveRing();return;}
 $('.hd .lg',app)?.classList.remove('idle-header-ring');
 const isToday=(selectedDate??today())===today();
 const dest=isToday?$('.hero .ring',app):$('.hd .lg',app);
 if(!dest){hideLiveRing();return;}
 const el=getLiveRing(),rect=dest.getBoundingClientRect();
 if(!rect.width||!rect.height){hideLiveRing();return;}
 el.hidden=false;el.classList.toggle('docked',!isToday);
 const timeText=el.querySelector('.ct b');
 if(timeText){
  // Docked indicator keeps a tiny live readout: minutes, or bare seconds in the final minute.
  const remainingText=countdown.text;
  const parts=remainingText.split(':').map(Number);
  const seconds=parts.reduce((total,part)=>total*60+part,0);
  const remaining=Math.max(0,Math.ceil(seconds));
  timeText.textContent=isToday?remainingText:(remaining<60?String(remaining):`${Math.ceil(remaining/60)}m`);
  timeText.style.fontSize=Math.min(isToday?20:30,62/(.6*timeText.textContent.length))+'px';
 }
 const sublabel=el.querySelector('.ct span');if(sublabel)sublabel.hidden=!isToday;
 const progress=Math.max(0,Math.min(1,countdown.progress));
 paintRing($('svg',el),progress);
 paintRing($('.hd .lg .countdown-svg',app),progress);
 const scale=Math.min(rect.width/100,rect.height/100);
 const parent=el.parentElement,parentRect=parent.getBoundingClientRect();
 const x=rect.left-parentRect.left+parent.scrollLeft+(rect.width-100*scale)/2;
 const y=rect.top-parentRect.top+parent.scrollTop+(rect.height-100*scale)/2;
 const target=`translate3d(${x}px, ${y}px, 0) scale(${scale})`;
 if(!liveRingTarget){el.classList.add('no-transition');el.style.transform=target;void el.offsetWidth;el.classList.remove('no-transition');}
 else if(target!==liveRingTarget){el.style.transform=target;}
 liveRingTarget=target;
 // The hero slot uses the shared countdown; its header companion has the
 // same geometry and live progress rather than a decorative fixed arc.
 if(isToday)dest.classList.add('live-ring-slot');
 else dest.classList.add('header-ring-slot');
}
function render(){
 if(mode==='settings'){hideLiveRing();renderSettings();return;}
 selectedDate??=today();
 const variant=determineVariant();installScreen(variant);
}
function errorMessage(result){
 const reason=result?.reason;
 if(reason==='not_authenticated')return 'WFM session expired. Log in to refresh.';
 if(reason==='network_error'||reason==='request_failed'||reason==='transport_error')return 'Could not reach WFM. Check your connection.';
 if(reason==='parse_error')return 'WFM returned a schedule we could not read.';
 if(reason==='extension_error'||reason==='runtime_error')return 'Extension background service unavailable. Please try again.';
 return typeof result?.message==='string'&&result.message.length<180?result.message:'Could not refresh your schedule.';
}
function updateToastInteraction(){
 const node=$('#popup-toast');
 popupToastClock?.setHovered(Boolean(node&&(node.matches(':hover')||node.contains(document.activeElement)||toastActionBusy)));
}
function showRequestError(result){
 showToast(errorMessage(result),'error',result?.reason==='not_authenticated'?{label:'Log in',run:loginSchedule}:null);
}
function showToast(message,kind='error',action=null){
 let node=document.querySelector('#popup-toast');
 if(!node){
  node=h('div','popup-toast');node.id='popup-toast';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.append(node);
  node.addEventListener('pointerenter',updateToastInteraction);node.addEventListener('pointerleave',updateToastInteraction);
  node.addEventListener('focusin',updateToastInteraction);node.addEventListener('focusout',()=>queueMicrotask(updateToastInteraction));
  popupToastClock=new PausableToastTimer({onExpire:()=>{
   node.classList.remove('visible');
   statusTimer=setTimeout(()=>{node.hidden=true;node.replaceChildren();},180);
  }});
  document.addEventListener('visibilitychange',()=>popupToastClock.setInView(document.visibilityState==='visible'));
 }
 popupToastClock.cancel();
 clearTimeout(statusTimer);
 const version=++toastVersion;toastActionBusy=false;
 node.hidden=false;node.className=`popup-toast ${kind}${action?' has-action':''}`;
 node.replaceChildren(h('span','toast-message',message));
 if(action){
  const button=h('button','toast-action',action.label);button.type='button';
  button.onclick=async()=>{
   if(button.disabled||toastActionBusy)return;
   button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Checking…';toastActionBusy=true;updateToastInteraction();
   try{await action.run();}
   finally{if(version===toastVersion){toastActionBusy=false;button.disabled=false;button.removeAttribute('aria-busy');button.textContent=action.label;updateToastInteraction();}}
  };
  node.append(button);
 }
 // Restart the small entrance transition for consecutive notifications.
 void node.offsetWidth;
 node.classList.add('visible');
 popupToastClock.durationMs=kind==='success'?3000:4200;
 popupToastClock.setInView(document.visibilityState==='visible');updateToastInteraction();popupToastClock.show();
}
async function openSite(){
 try{const result=await send({type:'WFM_OPEN_SITE'});if(!result?.ok)showToast('Unable to open WFM.');}
 catch{showToast('Extension background service unavailable.');}
}
async function loginSchedule(){
 if(loginBusy||weekLoads.has(weekStart(selectedDate??today())))return;
 let loadSelected=false;
 loginBusy=true;render();
 try{
  const result=await send({type:'WFM_LOGIN_CHECK'});
  await loadState();
  if(!result?.ok)showRequestError(result);
  else if(result.action==='reused'||result.action==='created')showToast('WFM opened for sign-in.','success');
  else if(result.action==='schedule_loaded'){showToast('Schedule loaded.','success');loadSelected=scheduleFreshness(state,selectedDate??today()).needsCheck;}
 }catch{showToast('Extension background service unavailable.');}
 finally{loginBusy=false;if(loadSelected)await loadWeek(selectedDate??today(),{manual:true});else render();}
}
function ensureWeekLoaded(date){
 const policy=scheduleFreshness(state,date);if(visitedChecks.has(policy.key)||!scheduleRefreshDue(state,date))return;
 return loadWeek(date);
}
async function loadWeek(date,{manual=false}={}){
 const start=weekStart(date);if(weekLoads.has(start)||loginBusy)return;
 visitedChecks.add(scheduleFreshness(state,date).key);weekErrors.delete(start);
 const request=send({type:'WFM_REFRESH',date,trigger:manual?'manual':'popup'});
 weekLoads.set(start,request);render();
 try{
  const result=await request;
  await loadState();
  if(!result?.ok){weekErrors.set(start,result);if(start===weekStart(selectedDate??today())&&(manual||selectedWeek()))showRequestError(result);}
  else if(manual)showToast('Schedule refreshed.','success');
 }catch(error){
  weekErrors.set(start,{reason:'extension_error'});
  if(manual)showToast('Extension background service unavailable.');
 }finally{weekLoads.delete(start);render();}
}
async function refreshSchedule(){return loadWeek(selectedDate??today(),{manual:true});}

async function loadState(){const result=await send({type:'WFM_GET_STATE'});if(!result?.ok)throw Error('WFM worker returned invalid state');state=result.state;render();}
async function settingChange(patch){try{const response=await send({type:'WFM_SETTINGS_UPDATE',patch});if(response?.ok){state=response.state;showToast('Settings saved.','success');}else showToast('Could not save settings.');}catch{showToast('Could not save settings.');} }
function diagnosticCounts(report){
 const rpcEvents=(report?.runs??[]).flatMap(run=>run.events??[]);
 const uiEvents=report?.companionEvents??[];
 const all=[...rpcEvents,...uiEvents];
 const anomalous=event=>/anomal|error|fail|incomplete|mismatch|unknown|invalid/i.test(event.code??'');
 return {logs:all.length,anomalies:all.filter(anomalous).length,diffs:uiEvents.filter(event=>event.code==='dom_schedule_difference').length};
}
async function diagnosticsReport(){
 const result=await send({type:'WFM_EXPORT_DIAGNOSTICS'});
 if(!result?.ok)throw Error('Diagnostics unavailable');
 return result.report;
}
async function refreshDiagnosticCounts(){
 try{
  const counts=diagnosticCounts(await diagnosticsReport());
  const summary=$('#diag-summary');if(!summary)return;
  summary.replaceChildren(`${counts.logs} logs · `,h('span','anomalies',`${counts.anomalies} anomalies`),` · ${counts.diffs} diffs`);
  const health=$('#diag-health');if(health){health.textContent=counts.anomalies||counts.diffs?'Needs attention':'All clear';health.className=counts.anomalies||counts.diffs?'':'ok';}
 }catch{setText('#diag-status','Diagnostics unavailable.');}
}
function renderSettings(){
 // Use the supplied HTML settings layout, with preset-only reminder timing.
 activeVariant='settings';style.href='design-today.css';
 app.innerHTML=`<div class="pop settings-reference"><header class="settings-heading"><button class="settings-back" id="back" type="button" aria-label="Back to schedule">${icon('back',20,2)}</button><h1>Alert settings</h1></header>
 <div class="settings-body">
  <section class="box"><h2>Remind me before<small>Choose when to get a heads-up</small></h2><div class="presets" role="group" aria-label="Reminder timing"><button class="preset" type="button" data-lead="2">2 min</button><button class="preset" type="button" data-lead="5">5 min</button><button class="preset" type="button" data-lead="10">10 min</button></div><div class="preview">${icon('bell',14,1.9)}<span id="lead-note"></span></div></section>
  <div class="label">Display</div><div class="list" id="display-options" style="margin-top:0"></div>
  <div class="label">Alert me about</div><div class="list" id="flags" style="margin-top:0"></div>
  <section class="diag"><b class="dh">Diagnostics</b> · <span id="diag-health" class="ok">Checking…</span><div id="diag-summary">Loading diagnostics…</div><div class="actions"><button class="btn" id="export" type="button">Export</button><button class="btn" id="copy-json" type="button">Copy JSON</button><button class="btn danger" id="clear" type="button">Clear</button></div><small id="diag-status" role="status"></small></section>
 </div></div>`;
 const s=settings();
 const chips=$$('[data-lead]',app);
 const highlightChip=value=>chips.forEach(button=>{const active=Number(button.dataset.lead)===value;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
 const preview=value=>{
  const note=$('#lead-note');if(!note)return;
  const segments=buildDaySegments(dayForDate(week(),today()),settings());
  const event=segments.find(segment=>segment.start>Date.now()&&['break','exception'].includes(segment.type));
  if(event)note.replaceChildren(`For ${event.name} you'll be alerted at `,h('b','',stamp(event.start-value*60000)));
  else note.textContent=`You'll be reminded ${value} min before your next event.`;
 };
 highlightChip(s.leadMinutes);
 preview(s.leadMinutes);
 for(const button of chips)button.onclick=async()=>{const minutes=Number(button.dataset.lead);chips.forEach(b=>b.disabled=true);highlightChip(minutes);preview(minutes);await settingChange({leadMinutes:minutes});highlightChip(settings().leadMinutes);preview(settings().leadMinutes);chips.forEach(b=>b.disabled=false);};
 for(const [text,key,meta,symbol,color,rgb] of [['Page-edge alert ring','showRing','Glowing border around the page','ring','accent','143,163,255'],['Breaks & meals','alertBreaks','Tea breaks and lunch','cup','amber','246,189,75'],['Coaching & meetings','alertExceptions','Coaching sessions and meetings','people','violet','182,156,255'],['Shift end','alertShiftEnd','Heads-up before your shift ends','flag','green','91,214,164'],['Queue-switch toast','queueSwitchToast','Pop-up when your queue changes','queue','sky','108,196,240']]){
  const row=h('div','opt');row.innerHTML=`<div class="tile" style="--c:var(--${color});--tint:rgba(${rgb},.14)">${icon(symbol,16)}</div><div class="t"><div class="name"></div><div class="meta"></div></div><button class="sw" type="button" role="switch"><i></i></button>`;
  $('.name',row).textContent=text;$('.meta',row).textContent=meta;
  const toggle=$('.sw',row);toggle.dataset.setting=key;toggle.setAttribute('aria-label',text);toggle.setAttribute('aria-checked',String(Boolean(s[key])));
  toggle.onclick=async()=>{const enabled=toggle.getAttribute('aria-checked')!=='true';toggle.disabled=true;toggle.setAttribute('aria-checked',String(enabled));await settingChange({[key]:enabled});toggle.setAttribute('aria-checked',String(Boolean(settings()[key])));toggle.disabled=false;};
  $(key==='showRing'?'#display-options':'#flags').append(row);
 }
 $('#back').onclick=()=>changePopupMode('schedule');
 $('#export').onclick=async(event)=>{if(event.currentTarget.disabled)return;event.currentTarget.disabled=true;event.currentTarget.dataset.original='Export';event.currentTarget.textContent='Exporting…';try{const report=await diagnosticsReport();const json=JSON.stringify({...report,client:{popupLoaded:true,browserFamily:/Edg\//.test(navigator.userAgent)?'Edge':'Chrome'}},null,2);const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=h('a');a.href=url;a.download=`wfm-diagnostics-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);setText('#diag-status','Diagnostics exported.');showToast('Diagnostics exported.','success');}catch{setText('#diag-status','Export failed.');showToast('Could not export diagnostics.');}finally{const b=$('#export');if(b){b.disabled=false;b.textContent='Export';}}};
 $('#copy-json').onclick=async(event)=>{if(event.currentTarget.disabled)return;event.currentTarget.disabled=true;event.currentTarget.textContent='Copying…';try{await navigator.clipboard.writeText(JSON.stringify(await diagnosticsReport(),null,2));setText('#diag-status','Copied as JSON');showToast('Copied as JSON','success');}catch{setText('#diag-status','Unable to copy JSON.');showToast('Unable to copy JSON.');}finally{const b=$('#copy-json');if(b){b.disabled=false;b.textContent='Copy JSON';}}};
 $('#clear').onclick=async(event)=>{if(event.currentTarget.disabled)return;event.currentTarget.disabled=true;event.currentTarget.textContent='Clearing…';try{const result=await send({type:'WFM_CLEAR_DIAGNOSTICS'});if(!result?.ok)throw Error();setText('#diag-status','Logs cleared.');showToast('Logs cleared.','success');await refreshDiagnosticCounts();}catch{setText('#diag-status','Could not clear logs.');showToast('Could not clear logs.');}finally{const b=$('#clear');if(b){b.disabled=false;b.textContent='Clear';}}};
 refreshDiagnosticCounts();
}
document.addEventListener('click',event=>{if(lastInfoOpen&&!event.target.closest('.schedule-info-button')){lastInfoOpen=false;const button=$('.schedule-info-button',app);if(button){button.setAttribute('aria-expanded','false');button.querySelector('.schedule-info-popover').hidden=true;}}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&lastInfoOpen){lastInfoOpen=false;const button=$('.schedule-info-button',app);if(button){button.setAttribute('aria-expanded','false');button.querySelector('.schedule-info-popover').hidden=true;button.focus();}}});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.wfm_companion_state_v1){state=changes.wfm_companion_state_v1.newValue;if(mode==='schedule')render();}});
(async()=>{try{await loadState();ensureWeekLoaded(selectedDate??today());}catch{state={lastError:{reason:'extension_error',message:'Background worker unavailable'},settings:settingsWithDefaults()};render();}
 setInterval(()=>{if(mode==='schedule'){
  if(determineVariant()!==activeVariant)render();
  ensureWeekLoaded(selectedDate??today());
  if(week()&&activeVariant!=='off'&&selectedDate===today())hero(dayForDate(week(),selectedDate));
  if(activeVariant!=='off'&&activeVariant!=='signed-empty')rows(dayForDate(selectedWeek(),selectedDate??today()));
  syncLiveRing();
 }},1000);
})();
