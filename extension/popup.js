import {settingsWithDefaults,localDate,buildDaySegments,dayForDate} from './companion-core.mjs';
import {icon} from './ui-icons.mjs';

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const app=$('#app');
const send=message=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,response=>{
 if(chrome.runtime.lastError)reject(Error('Background worker unavailable'));else resolve(response);
}));
const h=(tag,cls='',text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
let state=null,selectedDate=null,mode='schedule',filter='special',busy=false,loginBusy=false,toastTimer;
let pendingSettings={},settingRevisions={},saveQueue=Promise.resolve(),settingsView=0;
const settings=()=>settingsWithDefaults({...state?.settings,...pendingSettings});
const today=()=>localDate(Date.now(),settings().timeZone);
const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const weekStart=date=>{const d=new Date(date+'T12:00:00Z');return addDays(date,-((d.getUTCDay()+6)%7));};
const cachedWeek=date=>{const start=weekStart(date);return state?.week?.weekStart===start?state.week:state?.weeks?.[start]??null;};
const selectedDay=()=>dayForDate(cachedWeek(selectedDate),selectedDate);
const dateLabel=(date,options)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...options}).format(new Date(date+'T12:00:00Z'));
const stamp=(epoch,options={})=>new Intl.DateTimeFormat('en-US',{timeZone:settings().timeZone,hour:'numeric',minute:'2-digit',...options}).format(epoch);
const duration=ms=>{const m=Math.max(0,Math.round(ms/60000));return m<60?m+' min':Math.floor(m/60)+'h'+(m%60?' '+String(m%60).padStart(2,'0')+'m':'');};
const segmentsFor=day=>buildDaySegments(day,settings());
const specials=day=>segmentsFor(day).filter(s=>!['queue','work','shift'].includes(s.type));
const summaryFor=day=>{const b=specials(day).filter(s=>s.type==='break');return {count:b.length,minutes:Math.round(b.reduce((n,s)=>n+s.end-s.start,0)/60000)};};
const isMeal=s=>s.stateType===5||/lunch|meal/i.test(s.name);
// Keep rail/card nodes between ticks so the reference's transitions can travel
// continuously, and pointer/focus targets survive clock updates.
function reconcileChildren(target,next){
 for(let i=0;i<next.childNodes.length;i++){
  const incoming=next.childNodes[i],old=target.childNodes[i];
  if(!old){target.append(incoming.cloneNode(true));continue;}
  if(old.nodeType!==incoming.nodeType||old.nodeName!==incoming.nodeName){old.replaceWith(incoming.cloneNode(true));continue;}
  if(old.nodeType===Node.TEXT_NODE){if(old.data!==incoming.data)old.data=incoming.data;continue;}
  for(const attr of [...old.attributes])if(!incoming.hasAttribute(attr.name))old.removeAttribute(attr.name);
  for(const attr of incoming.attributes)if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
  reconcileChildren(old,incoming);
 }
 while(target.childNodes.length>next.childNodes.length)target.lastChild.remove();
}
function appearance(s){
 if(s.type==='break')return isMeal(s)?['coral','255,155,122','meal','Meal']:['amber','246,189,75','cup','Break'];
 if(s.type==='queue')return ['sky','108,196,240','queue','Queue'];
 if(s.type==='exception')return ['violet','182,156,255','people','Event'];
 return ['green','91,214,164','flag',s.type==='time_off'?'Time off':'Work'];
}
function showToast(message,kind='success'){
 let el=$('#popup-toast');if(!el){el=h('div','popup-toast');el.id='popup-toast';el.setAttribute('role','status');document.body.append(el);}
 clearTimeout(toastTimer);el.className='popup-toast '+kind;el.textContent=message;el.hidden=false;
 toastTimer=setTimeout(()=>{el.hidden=true;},3500);
}
function changeMode(next){mode=next;$('#schedule-info')?.remove();render();window.scrollTo(0,0);}
function chooseDate(date,focus=false){
 selectedDate=date;
 if($('#track')?.dataset.week===weekStart(date)){updatePicker();renderJourney();}else render();
 if(focus)$(`[data-date="${date}"]`)?.focus();
}
function render(){
 selectedDate??=today();
 if(mode==='settings'){renderSettings();return;}
 app.innerHTML=`<section id="view-schedule" aria-labelledby="h-sched">
 <header class="top"><h1 id="h-sched"><span class="sub" id="today-sub"></span><span id="date-title"></span></h1>
 <button class="icon-btn" id="settings" type="button" aria-label="Alert settings">${icon('settings')}</button></header>
 <section class="week-picker" aria-label="Choose a day">
 <div class="week-bar"><div class="week-range"><small>Week</small><span id="range"></span></div>
 <button class="today-chip" id="today" type="button" hidden>Today</button>
 <button class="arrow" id="prev" type="button" aria-label="Previous week">${icon('back',16,2)}</button>
 <button class="arrow" id="next" type="button" aria-label="Next week">${icon('next',16,2)}</button></div>
 <div class="track" id="track" role="group" aria-label="Days of the week"><div class="thumb" id="thumb" aria-hidden="true"></div></div>
 <div class="week-summary" id="summary" aria-live="polite"></div></section>
 <div id="notice" hidden></div>
 <div class="tabs" role="tablist" aria-label="Schedule filter">
 <button class="tab wide" role="tab" aria-selected="true" data-filter="special">Breaks &amp; events<span class="count"></span></button>
 <button class="tab" role="tab" aria-selected="false" data-filter="queues">Queues</button>
 <button class="tab" role="tab" aria-selected="false" data-filter="all">All</button></div>
 <div id="list" class="timeline"></div><div id="empty" class="empty" hidden></div>
 <button class="alert-link" id="alerts" type="button"><span style="flex:0;color:var(--accent)">${icon('bell')}</span><strong></strong><span id="lead-summary"></span><span style="flex:0;color:var(--muted)">${icon('next',16,2)}</span></button>
 <footer class="schedule-footer"><div class="updated"><span id="updated"></span><button type="button" class="info-button" aria-label="Schedule details" aria-expanded="false">${icon('info',13)}</button></div><button id="refresh" type="button">Refresh</button><button id="wfm" type="button">Open WFM</button></footer>
 </section>`;
 $('#settings').onclick=$('#alerts').onclick=()=>changeMode('settings');
 $('#refresh').onclick=refreshSchedule;$('#wfm').onclick=openSite;
 $('.info-button').onclick=toggleInfo;
 $('#prev').onclick=()=>chooseDate(addDays(selectedDate,-7));
 $('#next').onclick=()=>chooseDate(addDays(selectedDate,7));
 $('#today').onclick=()=>chooseDate(today(),true);
 for(const b of $$('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;renderJourney();};
 buildPicker();renderJourney();
}
function buildPicker(){
 const track=$('#track'),start=weekStart(selectedDate);track.dataset.week=start;
 for(let i=0;i<7;i++){
  const date=addDays(start,i),day=dayForDate(cachedWeek(date),date),off=day?.kind==='day_off';
  const b=h('button','day'+(off?' off':'')+(!day||day.kind==='unknown'?' unknown':'')+(date===today()?' today':''));b.type='button';b.dataset.date=date;
  b.setAttribute('aria-label',dateLabel(date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(off?', day off':!day?', no saved schedule':`, ${summaryFor(day).count} breaks`)+(date===today()?', today':''));
  if(date===today())b.setAttribute('aria-current','date');
  b.append(h('span','dow',dateLabel(date,{weekday:'short'})),h('span','num',String(Number(date.slice(8)))),h('span','pip'));
  b.onclick=()=>chooseDate(date);track.append(b);
 }
 track.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();chooseDate(e.key==='Home'?weekStart(selectedDate):e.key==='End'?addDays(weekStart(selectedDate),6):addDays(selectedDate,e.key==='ArrowRight'?1:-1),true);};
 let x=null;
 track.addEventListener('touchstart',e=>{x=e.touches[0].clientX;},{passive:true});
 track.addEventListener('touchend',e=>{if(x!==null&&Math.abs(e.changedTouches[0].clientX-x)>=30)chooseDate(addDays(selectedDate,e.changedTouches[0].clientX<x?1:-1));x=null;},{passive:true});
 const a=start,z=addDays(start,6),crossYear=a.slice(0,4)!==z.slice(0,4);
 $('#range').textContent=dateLabel(a,{month:'short'})+' '+Number(a.slice(8))+(crossYear?' '+a.slice(0,4):'')+' – '+(a.slice(0,7)===z.slice(0,7)?'':dateLabel(z,{month:'short'})+' ')+Number(z.slice(8))+(crossYear?' '+z.slice(0,4):'');
 updatePicker();
}
function updatePicker(){
 const start=weekStart(selectedDate),index=Math.round((Date.parse(selectedDate)-Date.parse(start))/86400000);
 for(const b of $$('#track .day'))b.setAttribute('aria-pressed',String(b.dataset.date===selectedDate));
 $('#thumb').style.transform=`translateX(${index*100}%)`;
 $('#today').hidden=selectedDate===today();
 const day=selectedDay(),summary=$('#summary'),info=summaryFor(day);
 summary.replaceChildren(h('b','',dateLabel(selectedDate,{weekday:'long'})+', '+Number(selectedDate.slice(8))+' '+dateLabel(selectedDate,{month:'short'})),document.createTextNode(' · '+(day?.kind==='day_off'?'day off':!day||day.kind==='unknown'?'no saved schedule':`${info.count} breaks · ${info.minutes} min`)));
 summary.classList.remove('pop');void summary.offsetWidth;summary.classList.add('pop');
}
function renderJourney(){
 const day=selectedDay(),all=segmentsFor(day),events=filter==='special'?specials(day):filter==='queues'?all.filter(s=>s.type==='queue'):all;
 const now=Date.now(),isToday=selectedDate===today(),past=selectedDate<today();
 $('#date-title').textContent=dateLabel(selectedDate,{weekday:'long',day:'numeric',month:'short'}).replace(/ (\d+)/,', $1');
 $('#today-sub').textContent=isToday?'Today · '+stamp(now):dateLabel(selectedDate,{year:'numeric'});
 for(const b of $$('[data-filter]'))b.setAttribute('aria-selected',String(b.dataset.filter===filter));
 $('.count').textContent=String(specials(day).length);
 const list=h('div');
 events.forEach((s,i)=>{
  const done=past||(isToday&&now>=s.end),live=isToday&&now>=s.start&&now<s.end;
  const p=done?1:live?(now-s.start)/(s.end-s.start):0;
  if(i>0&&s.start>events[i-1].end){
   const gs=events[i-1].end,ge=s.start,gp=past?1:!isToday?0:Math.max(0,Math.min(1,(now-gs)/(ge-gs))),inGap=isToday&&now>gs&&now<ge;
   const row=h('div','row gap-row '+(gp===1?'done':''));
   row.innerHTML=`<div class="time"></div><div class="grail"><i><b class="fill${inGap?' now':''}"></b></i></div><div class="gtext${inGap?' on':''}"></div>`;
   const fill=$('.fill',row);fill.style.height=inGap?`calc(12px + ${gp} * (100% - 30px))`:`${gp*100}%`;fill.dataset.t=stamp(now).replace(/ [AP]M$/,'');
   $('.gtext',row).textContent=inGap?duration(ge-now)+' until '+s.name:duration(ge-gs)+' free';list.append(row);
  }
  const [color,rgb,symbol,label]=appearance(s),row=h('div','row ev '+(done?'done':live?'live':'next'));
  row.dataset.eventId=s.id;row.style.cssText=`--c:var(--${color});--tint:rgba(${rgb},.14);--glow:rgba(${rgb},.45)`;
  row.innerHTML=`<div class="time"><b></b><small></small></div><div class="rail"><div class="dot">${done?icon('check',8,4):''}</div>${i<events.length-1?`<div class="tail"><b class="fill" style="height:${p*100}%"></b></div>`:''}</div><div class="card"><div class="tile">${icon(symbol)}</div><div class="t"><div class="name"></div><div class="meta"></div></div><div class="chip"></div>${live?`<div class="bar"><b style="width:${p*100}%"></b></div>`:''}</div>`;
  const parts=stamp(s.start).split(' ');$('.time b',row).textContent=parts[0];$('.time small',row).textContent=parts[1];
  $('.name',row).textContent=s.name;$('.meta',row).textContent=done?label+' · done':live?'Ends '+stamp(s.end):label+' · ends '+stamp(s.end);
  $('.chip',row).textContent=live?duration(s.end-now)+' left':duration(s.end-s.start);list.append(row);
 });
 if(events.length){const b=events.filter(s=>s.type==='break'),total=h('div','total');total.textContent=filter==='special'?`${b.length} breaks · ${Math.round(b.reduce((n,s)=>n+s.end-s.start,0)/60000)} min total${isToday?' today':''}`:`${events.length} ${filter==='queues'?'queue changes':'activities'} · ${duration(events.reduce((n,s)=>n+s.end-s.start,0))} total`;list.append(total);}
 reconcileChildren($('#list'),list);
 $('#empty').hidden=Boolean(events.length);$('#list').hidden=!events.length;
 if(!events.length){
  const empty=$('#empty');empty.replaceChildren(document.createTextNode(day?.kind==='day_off'?'Day off. Enjoy your time away.':!day||day.kind==='unknown'?'No saved schedule for this day.':filter==='queues'?'No queue changes on your schedule today.':'No events in this filter.'));
  if(!day||day.kind==='unknown'){const b=h('button','',loginBusy?'Checking…':state?.lastError?.reason==='not_authenticated'?'Log in to WFM':'Refresh to load this week');b.type='button';b.disabled=busy||loginBusy;b.onclick=state?.lastError?.reason==='not_authenticated'?loginSchedule:refreshSchedule;empty.append(b);}
 }
 const s=settings(),alerts=s.showRing&&(s.alertBreaks||s.alertExceptions||s.alertShiftEnd);
 $('#alerts strong').textContent=alerts?'Alerts on':'Alerts off';$('#lead-summary').textContent=alerts?s.leadMinutes+' min before':'Manage alerts';
 const notice=$('#notice'),error=state?.lastError;notice.hidden=!error;notice.className='notice';notice.textContent=error?errorMessage(error):'';
 if(error?.reason==='not_authenticated'){const b=h('button','',loginBusy?'Checking…':'Log in to WFM');b.type='button';b.disabled=loginBusy;b.onclick=loginSchedule;notice.append(b);}
 const updated=state?.week?.weekStart===weekStart(selectedDate)?state.lastUpdated:state?.weekUpdated?.[weekStart(selectedDate)];
 $('#updated').textContent=updated?'Updated '+stamp(updated,{month:'short',day:'numeric'}):'Not refreshed yet';
 $('#refresh').textContent=busy?'Refreshing…':'Refresh';$('#refresh').disabled=busy||loginBusy;
}
function toggleInfo(){
 const old=$('#schedule-info');if(old){old.remove();$('.info-button')?.setAttribute('aria-expanded','false');return;}
 const popup=h('div','info-popover');popup.id='schedule-info';popup.setAttribute('role','status');popup.append(h('strong','','Schedule details'),h('div','',state?.lastUpdated?'Last updated: '+stamp(state.lastUpdated,{month:'short',day:'numeric'}):'Not refreshed yet'));
 if(state?.lastError)popup.append(h('div','',errorMessage(state.lastError)));
 popup.append(h('div','',`${cachedWeek(selectedDate)?.warnings?.length??0} WFM data warnings`));document.body.append(popup);$('.info-button').setAttribute('aria-expanded','true');
}
function errorMessage(result){return result?.reason==='not_authenticated'?'WFM session expired. Log in to refresh.':result?.reason==='parse_error'?'WFM returned a schedule we could not read.':result?.reason==='extension_error'?'Extension background service unavailable. Please try again.':'Could not reach WFM. Your saved schedule is still available.';}
async function openSite(){try{if(!(await send({type:'WFM_OPEN_SITE'}))?.ok)throw Error();}catch{showToast('Unable to open WFM.','error');}}
async function loadState(){const r=await send({type:'WFM_GET_STATE'});if(!r?.ok)throw Error();state=r.state;render();}
async function refreshSchedule(){
 if(busy||loginBusy)return;busy=true;render();
 try{const r=await send({type:'WFM_REFRESH',date:selectedDate});await loadState();showToast(r?.ok?'Schedule refreshed.':errorMessage(r),r?.ok?'success':'error');}
 catch{showToast('Extension background service unavailable.','error');}finally{busy=false;render();}
}
async function loginSchedule(){
 if(busy||loginBusy)return;loginBusy=true;render();
 try{const r=await send({type:'WFM_LOGIN_CHECK'});await loadState();showToast(r?.ok?r.action==='schedule_loaded'?'Schedule loaded.':'WFM opened for sign-in.':errorMessage(r),r?.ok?'success':'error');}
 catch{showToast('Extension background service unavailable.','error');}finally{loginBusy=false;render();}
}
function settingChange(patch){
 pendingSettings={...pendingSettings,...patch};
 const revisions=Object.fromEntries(Object.keys(patch).map(key=>[key,settingRevisions[key]=(settingRevisions[key]??0)+1]));
 // Serialize rapid changes: an older response must not overwrite a newer choice.
 saveQueue=saveQueue.then(async()=>{
  try{const r=await send({type:'WFM_SETTINGS_UPDATE',patch});if(!r?.ok)throw Error();state=r.state;for(const k of Object.keys(patch))if(settingRevisions[k]===revisions[k])delete pendingSettings[k];showToast('Settings saved.');}
  catch{for(const k of Object.keys(patch))if(settingRevisions[k]===revisions[k])delete pendingSettings[k];showToast('Could not save settings.','error');}
  if(mode==='settings')syncSettings();
 });
 return saveQueue;
}
function renderSettings(){
 const view=++settingsView;
 app.innerHTML=`<section id="view-settings" aria-labelledby="h-set"><header class="top"><button class="icon-btn ghost" type="button" id="back" aria-label="Back to schedule">${icon('back',20,2)}</button><h1 id="h-set">Alert settings</h1></header>
 <div class="box"><h2>Remind me before<small>Pick a preset or type your own minutes</small></h2><div class="presets"><button class="preset" type="button" data-min="2">2 min</button><button class="preset" type="button" data-min="5">5 min</button><button class="preset" type="button" data-min="10">10 min</button><label class="cust"><input id="lead" type="number" inputmode="numeric" min="1" max="120" aria-label="Custom minutes"><span>min</span></label></div><div class="preview"><span style="color:var(--accent)">${icon('bell',14,1.9)}</span><span id="lead-preview"></span></div></div>
 <div class="label">Display</div><div class="list" id="display-options" style="margin-top:0"></div>
 <div class="label">Alert me about</div><div class="list" id="alert-options" style="margin-top:0"></div>
 <div class="diag"><b class="dh">Diagnostics</b> · <span id="diag-health" class="ok">Checking…</span><div id="diag-summary">Loading diagnostics…</div><div class="actions"><button class="btn" type="button" id="export">Export</button><button class="btn" type="button" id="copy">Copy JSON</button><button class="btn danger" type="button" id="clear">Clear</button></div><div class="diag-status" id="diag-status" role="status" hidden></div></div></section>`;
 const options=[['showRing','Page-edge alert ring','Glowing border around the page','ring','accent','143,163,255'],['alertBreaks','Breaks & meals','Tea breaks and lunch','cup','amber','246,189,75'],['alertExceptions','Coaching & meetings','Coaching sessions and meetings','people','violet','182,156,255'],['alertShiftEnd','Shift end','Heads-up before your shift ends','flag','green','91,214,164'],['queueSwitchToast','Queue-switch toast','Pop-up when your queue changes','queue','sky','108,196,240']];
 for(const [key,name,meta,symbol,color,rgb] of options){
  const row=h('div','opt');row.innerHTML=`<div class="tile" style="--c:var(--${color});--tint:rgba(${rgb},.14)">${icon(symbol,16)}</div><div class="t"><div class="name"></div><div class="meta"></div></div><button class="sw" type="button" role="switch"><i></i></button>`;
  $('.name',row).textContent=name;$('.meta',row).textContent=meta;
  const toggle=$('.sw',row);toggle.dataset.setting=key;toggle.setAttribute('aria-label',name);toggle.onclick=()=>{const value=toggle.getAttribute('aria-checked')!=='true';toggle.setAttribute('aria-checked',String(value));settingChange({[key]:value});};
  $(key==='showRing'?'#display-options':'#alert-options').append(row);
 }
 $('#back').onclick=()=>changeMode('schedule');
 for(const b of $$('.preset'))b.onclick=()=>{const n=Number(b.dataset.min);$('#lead').value=n;settingChange({leadMinutes:n});syncSettings();};
 $('#lead').oninput=()=>{for(const b of $$('.preset'))b.setAttribute('aria-pressed',String(Number(b.dataset.min)===Number($('#lead').value)));updateLeadPreview(Number($('#lead').value));};
 $('#lead').onchange=()=>{const input=$('#lead'),n=Number(input.value);if(!Number.isInteger(n)||n<1||n>120){input.value=settings().leadMinutes;showToast('Enter a whole number from 1 to 120.','error');syncSettings();return;}settingChange({leadMinutes:n});};
 $('#export').onclick=e=>diagnosticAction(e.currentTarget,'Exporting…',async()=>{const report=await diagnosticsReport();const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=h('a');a.href=url;a.download='wfm-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return 'Diagnostics exported.';});
 $('#copy').onclick=e=>diagnosticAction(e.currentTarget,'Copying…',async()=>{await navigator.clipboard.writeText(JSON.stringify(await diagnosticsReport(),null,2));return 'Copied as JSON';});
 $('#clear').onclick=e=>diagnosticAction(e.currentTarget,'Clearing…',async()=>{if(!(await send({type:'WFM_CLEAR_DIAGNOSTICS'}))?.ok)throw Error();await refreshDiagnosticCounts(view);return 'Logs cleared.';});
 syncSettings();refreshDiagnosticCounts(view);
}
function syncSettings(){
 const s=settings();for(const b of $$('.preset'))b.setAttribute('aria-pressed',String(Number(b.dataset.min)===s.leadMinutes));
 if(document.activeElement!==$('#lead'))$('#lead').value=s.leadMinutes;
 for(const b of $$('[data-setting]'))b.setAttribute('aria-checked',String(Boolean(s[b.dataset.setting])));
 updateLeadPreview(s.leadMinutes);
}
function updateLeadPreview(minutes){
 const el=$('#lead-preview');if(!el)return;
 const all=specials(dayForDate(cachedWeek(today()),today())),next=all.find(e=>e.start>Date.now())??all[0];
 if(next&&Number.isInteger(minutes)&&minutes>=1&&minutes<=120)el.replaceChildren(document.createTextNode(`For ${next.name} you'll be alerted at `),h('b','',stamp(next.start-minutes*60000)));
 else el.textContent='Alerts appear '+settings().leadMinutes+' min before your next event.';
}
async function diagnosticsReport(){const r=await send({type:'WFM_EXPORT_DIAGNOSTICS'});if(!r?.ok)throw Error();return r.report;}
async function refreshDiagnosticCounts(view=settingsView){
 try{const r=await diagnosticsReport();if(mode!=='settings'||view!==settingsView)return;const all=[...(r.runs??[]).flatMap(run=>run.events??[]),...(r.companionEvents??[])],anomalies=all.filter(e=>/anomal|error|fail|incomplete|mismatch|unknown|invalid/i.test(e.code??'')).length,diffs=(r.companionEvents??[]).filter(e=>e.code==='dom_schedule_difference').length;
  $('#diag-summary').textContent=`${all.length} logs · ${anomalies} anomalies · ${diffs} diffs`;$('#diag-health').textContent=anomalies||diffs?'Needs attention':'All clear';$('#diag-health').className=anomalies||diffs?'':'ok';
 }catch{if(mode==='settings'&&view===settingsView){$('#diag-health').textContent='Unavailable';$('#diag-summary').textContent='Could not load diagnostics.';}}
}
async function diagnosticAction(button,busyLabel,action){
 if(button.disabled)return;const original=button.textContent,view=settingsView;button.disabled=true;button.textContent=busyLabel;
 try{const message=await action();showToast(message);if(mode==='settings'&&view===settingsView){$('#diag-status').hidden=false;$('#diag-status').textContent=message;}}
 catch{showToast('Could not complete diagnostics action.','error');}finally{button.disabled=false;button.textContent=original;}
}
document.addEventListener('click',e=>{if($('#schedule-info')&&!e.target.closest('.info-button,.info-popover'))toggleInfo();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#schedule-info')){toggleInfo();$('.info-button')?.focus();}});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.wfm_companion_state_v1){state=changes.wfm_companion_state_v1.newValue;if(mode==='schedule')render();}});
(async()=>{try{await loadState();}catch{state={settings:settingsWithDefaults(),lastError:{reason:'extension_error'}};render();}
 let lastToday=today();
 setInterval(()=>{const current=today();if(current!==lastToday){if(selectedDate===lastToday)selectedDate=current;lastToday=current;render();}else if(mode==='schedule')renderJourney();},1000);
})();
