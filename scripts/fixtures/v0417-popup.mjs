import {SCREENS} from '/extension/design-screens.mjs';
import {settingsWithDefaults,localDate,localTime,buildDaySegments,contextForDay,formatDuration,dayForDate,eventBounds,wallTimeToEpoch,segmentProgress,alertColor} from '/extension/companion-core.mjs';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const send=message=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,response=>{
 const error=chrome.runtime.lastError;if(error)reject(new Error('Background worker unavailable'));else resolve(response);
}));
const app=$('#app'),style=$('#visual-css');
let state=null,selectedDate=null,filter='special',mode='schedule',busy=false,loginBusy=false,activeVariant='',activeDate='',statusTimer=null;
let lastInfoOpen=false;
const settings=()=>settingsWithDefaults(state?.settings);
const today=()=>localDate(Date.now(),settings().timeZone);
const weekStart=date=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
const week=()=>state?.week?.weekStart===weekStart(today())?state.week:null;
const h=(tag,className='',text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const stamp=(epoch,options={})=>new Intl.DateTimeFormat('en-US',{timeZone:settings().timeZone,hour:'numeric',minute:'2-digit',...options}).format(new Date(epoch));
const shortDay=date=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short'}).format(new Date(`${date}T12:00:00Z`));
const fmtRange=(start,end)=>{const s=stamp(start),e=stamp(end);const match=s.match(/([AP]M)$/);return match&&e.endsWith(match[1])?`${s.replace(/ [AP]M$/,'')} – ${e}`:`${s} – ${e}`;};
const length=ms=>formatDuration(ms).replace(/\bminutes\b/g,'min');
const typeLabel=type=>({queue:'Queue',break:'Break',exception:'Event',time_off:'Time off',work:'Work',marked:'Marked',shift:'Shift',day_off:'Day Off',other:'Other'})[type]??'Event';
const setText=(selector,value)=>{const node=$(selector,app);if(node)node.textContent=value;return node;};
function updateFirstText(node,value){if(!node)return;const text=[...node.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(text)text.textContent=value;else node.prepend(document.createTextNode(value));}
function determineVariant(){
 const w=week();if(!w)return 'signed-empty';
 const day=dayForDate(w,selectedDate??today());
 if(day?.kind==='day_off')return 'off';
 if(state?.lastError?.reason==='not_authenticated')return 'signed-cache';
 // The reference marks the saved schedule stale when the previous refresh predates 6 AM today.
 const last=state?.lastUpdated;if(last){const freshDate=localDate(last,settings().timeZone);const current=today();const early=wallTimeToEpoch(current,'06:00',settings().timeZone);
  if(freshDate!==current || (early!==null && Date.now()>=early && last<early))return 'stale';}
 return 'today';
}
function header(variant){
 const badge=$('.hd .s',app),updated=state?.lastUpdated;
 const signout=!week()&&state?.lastError?.reason==='not_authenticated';
 let label='Not refreshed yet';
 if(signout)label='Signed out';
 else if(updated){const d=localDate(updated,settings().timeZone);label=(d===today()?'Updated ':'Updated yesterday, ')+stamp(updated);}
 if(variant==='stale'&&updated)label=`Updated ${localDate(updated,settings().timeZone)===today()?'today':'yesterday'}, ${stamp(updated)}`;
 updateFirstText(badge,label+' ');
 if(badge){const textNode=[...badge.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);if(textNode)textNode.replaceWith(h('span','update-label',label));}
 const refresh=$('.hd .btn',app);
 if(refresh){
  refresh.disabled=busy;refresh.classList.toggle('hot',variant==='stale'&&!busy);
  refresh.setAttribute('aria-label',busy?'Refreshing schedule':'Refresh schedule');
  refresh.setAttribute('aria-busy',String(busy));refresh.onclick=refreshSchedule;
  const icon=refresh.querySelector('svg');if(icon)icon.classList.toggle('spinning',busy);
  // Only rewrite the text node, never remove the design's SVG.
  updateFirstText(refresh,busy?'Refreshing…':'Refresh');
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
  if(state?.lastError?.reason)popup.append(h('div','',`Last refresh: ${errorMessage(state.lastError)}`));
  const warnings=week()?.warnings?.length??0;
  if(warnings)popup.append(h('div','',`${warnings} WFM data warning${warnings===1?'':'s'}. See Diagnostics.`));
  button.setAttribute('aria-controls',popup.id);
  button.append(popup);
  button.onclick=e=>{e.stopPropagation();lastInfoOpen=!lastInfoOpen;button.setAttribute('aria-expanded',String(lastInfoOpen));popup.hidden=!lastInfoOpen;};
 }
}


// Animate the *existing* schedule content to its new position after a day or
// filter change. The countdown ring is independent and keeps its own dock/return
// transition. Never animate initial load, async state updates, or ticking clocks.
// Only explicit screen-navigation clicks animate. Avoid animating async renders.
function changePopupMode(nextMode){
 if(mode===nextMode)return;
 mode=nextMode;render();
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const panel=mode==='settings'?$('.settings-body',app):$('.tabs',app);
 const content=mode==='settings'?null:$('.hero',app)??$('.dc',app)??$('.seg',app);
 for(const element of [panel,content])element?.animate([
  {opacity:0,transform:'translateY(6px)'},
  {opacity:1,transform:'translateY(0)'}
 ],{duration:200,easing:'ease-out'});
}
function changeScheduleView(change,kind='day'){
 const oldSeg=$('.seg',app),oldTable=$('.tb',app),oldHero=$('.hero',app);
 const oldSegY=oldSeg?.getBoundingClientRect().top;
 const oldTableY=oldTable?.getBoundingClientRect().top;
 const wasHero=Boolean(oldHero);
 change();
 render();
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const duration=260,easing='cubic-bezier(.22,.72,.28,1)';
 const animate=(selector,previousTop)=>{
  const element=$(selector,app);
  if(!element)return;
  const moved=Number.isFinite(previousTop)?previousTop-element.getBoundingClientRect().top:0;
  const offset=kind==='day'&&Math.abs(moved)>1?moved:6;
  element.animate([
   {transform:`translateY(${offset}px)`,opacity:kind==='day'&&Math.abs(moved)>1?0.9:0.72},
   {transform:'translateY(0)',opacity:1}
  ],{duration,easing});
 };
 animate('.seg',oldSegY);
 animate('.tb',oldTableY);
 const offDay=$('.dc',app);
 if(offDay)offDay.animate([
  {opacity:0,transform:'translateY(7px)'},
  {opacity:1,transform:'translateY(0)'}
 ],{duration,easing});
 const hero=$('.hero',app);
 if(hero&&!wasHero)hero.animate([
  {opacity:0,transform:'translateY(-7px)'},
  {opacity:1,transform:'translateY(0)'}
 ],{duration,easing});
}

function tabs(){
 const container=$('.tabs',app);const w=week();if(!container||!w)return;
 const selected=selectedDate??today();container.replaceChildren();
 for(const day of w.days){
  const button=h('button','tab');button.type='button';button.dataset.date=day.date;
  button.classList.toggle('on',day.date===selected);button.classList.toggle('td',day.date===today());button.classList.toggle('dim',day.kind==='day_off'||day.kind==='unknown');
  button.setAttribute('aria-label',`${shortDay(day.date)} ${Number(day.date.slice(8))}: ${day.kind.replaceAll('_',' ')}`);
  button.setAttribute('aria-current',day.date===today()?'date':'false');button.setAttribute('aria-pressed',String(day.date===selected));
  button.append(h('span','',shortDay(day.date)),h('strong','',String(Number(day.date.slice(8)))));
  const mark=h('i','dt'+(day.kind==='day_off'?' off':day.kind==='unknown'?' q':day.date===today()?' a':''));button.append(mark);
  button.onclick=()=>{if(selectedDate===day.date)return;changeScheduleView(()=>{selectedDate=day.date;lastInfoOpen=false;});};container.append(button);
 }
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
 const opts=settings(),date=selectedDate??today(),segments=buildDaySegments(day,opts);
 const filtered=filter==='special'?segments.filter(x=>!['queue','work','shift'].includes(x.type)):filter==='queues'?segments.filter(x=>x.type==='queue'):segments;
 table.replaceChildren();
 const t=Date.now(),firstUpcoming=filtered.find(x=>x.start>t),isToday=date===today();
 for(const seg of filtered){
  const row=h('div','row hv '+(seg.type==='queue'?'kS':seg.type==='exception'?'kE':seg.type==='break'?'kB':'kS'));
  if(isToday&&seg.end<=t)row.classList.add('past');
  if(isToday&&firstUpcoming===seg)row.classList.add('nxt');
  row.dataset.eventId=seg.id;
  row.append(h('i','bar'));
  const mid=h('div','mt');mid.append(h('div','ti',seg.name),h('div','su',`${typeLabel(seg.type)} · ${fmtRange(seg.start,seg.end)}`));row.append(mid);
  const rt=h('div','rt');if(isToday&&firstUpcoming===seg)rt.append(h('em','','NEXT'));
  rt.append(h('span','du',length(seg.end-seg.start)));row.append(rt);table.append(row);
 }
 if(!filtered.length){const empty=h('div','empty-hint','No events in this filter.');table.append(empty);}
 const filterButtons=$$('.seg button',app);for(const b of filterButtons){const group=b.textContent.trim()==='Breaks & events'?'special':b.textContent.trim()==='Queues'?'queues':'all';b.classList.toggle('on',group===filter);b.onclick=()=>{if(filter===group)return;changeScheduleView(()=>{filter=group;},'filter');};}
}
function signedEmpty(){
 const heading=$('.so2 h2',app),description=$('.so2 p',app),login=$('.so2 .pr',app),retry=$('.so2 .sc',app);
 const notAuth=state?.lastError?.reason==='not_authenticated';
 if(heading)heading.textContent=notAuth?'Sign in to see your schedule':'Your schedule is not loaded';
 if(description)description.textContent=notAuth?'Your WFM session has ended. Log in to load today’s shifts and breaks.':'Check WFM for an existing session before opening the site.';
 if(login){login.textContent=loginBusy?'Checking…':'Log in to WFM';login.disabled=loginBusy;login.setAttribute('aria-busy',String(loginBusy));login.onclick=loginSchedule;}
 if(retry){retry.disabled=busy;retry.textContent=busy?'Refreshing…':'Refresh';retry.onclick=refreshSchedule;}
}

function addNonmatchedPanel(){
 // This design file has no reference for unknown/other day screens; keep its clean structure and a small explicit message.
 const day=dayForDate(week(),selectedDate??today());if(!day)return;
 if(day.kind!=='unknown'&&day.kind!=='other')return;
 const t=$('.hero .nm',app);if(t)t.textContent=day.kind==='unknown'?'No schedule data':'Unrecognised day type';
 const c=$('.hero .c',app);if(c)c.textContent=day.kind==='unknown'?'Not confirmed as a day off':'Native events shown below';
}
function installScreen(variant){
 activeVariant=variant;app.innerHTML=SCREENS[variant];style.href=`design-${variant}.css`;
 header(variant);tabs();footer();if(variant==='signed-empty'){signedEmpty();syncLiveRing();return;}
 const day=dayForDate(week(),selectedDate??today());
 if(variant!=='off'){
  // The countdown card belongs exclusively to Today. Other days show their
  // schedule rows while the same live ring docks in the header.
  if((selectedDate??today())===today())hero(day);
  else $('.hero',app)?.remove();
  rows(day);addNonmatchedPanel();
 }
 syncLiveRing();
}
// One persistent DOM element: never reconstructed during day changes or renders.
let liveRing=null,liveRingTarget=null;
const ringMarkup=`<svg aria-hidden="true" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--ln)" stroke-width="8"></circle><circle class="live-stroke" cx="50" cy="50" r="42" fill="none" stroke="#30D6AC" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 264" transform="rotate(-90 50 50)"></circle></svg><div class="ct"><b></b><span>LEFT</span></div>`;
function getLiveRing(){
 if(!liveRing){liveRing=h('div','ring shared-countdown');liveRing.id='shared-countdown';liveRing.innerHTML=ringMarkup;document.body.append(liveRing);}
 return liveRing;
}
function hideLiveRing(){if(liveRing){liveRing.hidden=true;liveRingTarget=null;}const logo=$('.hd .lg',app);if(logo)logo.classList.add('idle-header-ring');}
function syncLiveRing(){
 if(mode!=='schedule'||!week()){hideLiveRing();return;}
 const countdown=liveCountdown();
 if(!countdown){hideLiveRing();return;}
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
  timeText.style.fontSize=isToday?(remainingText.length>7?'17px':'21px'):'33px';
 }
 const sublabel=el.querySelector('.ct span');if(sublabel)sublabel.hidden=!isToday;
 const progress=Math.max(0,Math.min(1,countdown.progress));
 el.querySelector('.live-stroke').setAttribute('stroke-dasharray',`${Math.round(264*progress)} 264`);
 const scale=Math.min(rect.width/100,rect.height/100);
 const x=rect.left+(rect.width-100*scale)/2,y=rect.top+(rect.height-100*scale)/2;
 const target=`translate3d(${x}px, ${y}px, 0) scale(${scale})`;
 if(!liveRingTarget){el.classList.add('no-transition');el.style.transform=target;void el.offsetWidth;el.classList.remove('no-transition');}
 else if(target!==liveRingTarget){el.style.transform=target;}
 liveRingTarget=target;
 // Exactly one visible ring: hide static design ring in today's live slot.
 if(isToday)dest.classList.add('live-ring-slot');
 else dest.classList.add('header-ring-slot');
}
function render(){
 if(mode==='settings'){hideLiveRing();renderSettings();return;}
 const w=week(),current=today();if(w&&!w.days.some(d=>d.date===selectedDate))selectedDate=w.days.some(d=>d.date===current)?current:w.days[0].date;
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
function showToast(message,kind='error'){
 let node=document.querySelector('#popup-toast');
 if(!node){node=h('div','popup-toast');node.id='popup-toast';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.append(node);}
 clearTimeout(statusTimer);
 node.className=`popup-toast ${kind}`;
 node.textContent=message;
 // Restart the small entrance transition for consecutive notifications.
 void node.offsetWidth;
 node.classList.add('visible');
 statusTimer=setTimeout(()=>{node.classList.remove('visible');setTimeout(()=>{if(!node.classList.contains('visible'))node.textContent='';},180);},kind==='success'?3000:4200);
}
async function openSite(){
 try{const result=await send({type:'WFM_OPEN_SITE'});if(!result?.ok)showToast('Unable to open WFM.');}
 catch{showToast('Extension background service unavailable.');}
}
async function loginSchedule(){
 if(loginBusy||busy)return;
 loginBusy=true;render();
 try{
  const result=await send({type:'WFM_LOGIN_CHECK'});
  await loadState();
  if(!result?.ok)showToast(errorMessage(result));
  else if(result.action==='reused'||result.action==='created')showToast('WFM opened for sign-in.','success');
  else if(result.action==='schedule_loaded')showToast('Schedule loaded.','success');
 }catch{showToast('Extension background service unavailable.');}
 finally{loginBusy=false;render();}
}
async function refreshSchedule(){
 if(busy||loginBusy)return;
 busy=true;render();
 try{
  const result=await send({type:'WFM_REFRESH'});
  await loadState();
  if(!result?.ok)showToast(errorMessage(result));
  else showToast('Schedule refreshed.','success');
 }catch(error){
  state={...(state??{}),lastError:{reason:'extension_error',message:'Background worker unavailable'}};
  showToast('Extension background service unavailable.');
 }finally{busy=false;render();}
}

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
  summary.replaceChildren(`${counts.logs} logs, `,h('span','anomalies',`${counts.anomalies} anomalies`),`, ${counts.diffs} diffs`);
 }catch{setText('#diag-status','Diagnostics unavailable.');}
}
function renderSettings(){
 // No settings reference exists in the supplied design; preserve its palette and keep this screen minimal.
 activeVariant='settings';style.href='design-today.css';
 app.innerHTML=`<div class="pop"><div class="top"><div class="hd"><div class="lg">⚙</div><div class="tt"><div class="t">Settings</div><div class="s">WFM Schedule Companion</div></div><button class="btn" id="back">← Back</button></div></div>
 <div class="settings-body">
  <section class="setting-block"><label for="lead">Show alert before</label><div class="lead-row"><div class="lead-manual"><input id="lead" type="number" min="1" max="120" step="1" inputmode="numeric" aria-label="Custom minutes before alert"><span>min</span></div><div class="lead-chips" role="group" aria-label="Quick alert timing"><button type="button" data-lead="2">2 min</button><button type="button" data-lead="5">5 min</button><button type="button" data-lead="10">10 min</button></div></div><small id="lead-note">Enter minutes or choose a preset.</small></section>
  <section class="setting-block" id="flags"><strong>Alerts</strong></section>
  <section class="setting-block diagnostics-block"><strong>Diagnostics</strong><p id="diag-summary">Loading diagnostics…</p><div class="diagnostic-actions"><button id="export" type="button">Export Diagnostics</button><button id="copy-json" type="button">Copy JSON</button><button id="clear" type="button">Clear</button></div><small id="diag-status" role="status"></small></section>
 </div><div class="ft"><button id="foot-back">← Schedule</button><a id="wfm" href="#">Open WFM ↗</a></div></div>`;
 const s=settings(),input=$('#lead');input.value=String(s.leadMinutes);
 const chips=$$('[data-lead]',app);
 const highlightChip=value=>chips.forEach(button=>{const active=Number(button.dataset.lead)===value;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
 highlightChip(s.leadMinutes);
 for(const button of chips)button.onclick=()=>{const minutes=Number(button.dataset.lead);input.value=String(minutes);highlightChip(minutes);settingChange({leadMinutes:minutes});};
 input.oninput=()=>{highlightChip(null);$('#lead-note').textContent='Enter minutes or choose a preset.';};
 input.onchange=()=>{
  const value=Number(input.value);
  if(!Number.isInteger(value)||value<1||value>120){input.value=String(settings().leadMinutes);$('#lead-note').textContent='Enter a whole number from 1 to 120.';return;}
  settingChange({leadMinutes:value});
 };
 for(const [text,key] of [['Page-edge alert ring','showRing'],['Breaks & meals','alertBreaks'],['Coaching & meetings','alertExceptions'],['Shift end','alertShiftEnd'],['Queue-switch toast','queueSwitchToast']]){
  const label=h('label','flag'),textNode=h('span','',text),toggle=h('input');toggle.type='checkbox';toggle.checked=Boolean(s[key]);toggle.addEventListener('change',()=>settingChange({[key]:toggle.checked}));label.append(textNode,toggle);$('#flags').append(label);
 }
 $('#back').onclick=$('#foot-back').onclick=()=>changePopupMode('schedule');
 $('#wfm').onclick=e=>{e.preventDefault();openSite();};
 $('#export').onclick=async(event)=>{if(event.currentTarget.disabled)return;event.currentTarget.disabled=true;event.currentTarget.dataset.original='Export Diagnostics';event.currentTarget.textContent='Exporting…';try{const report=await diagnosticsReport();const json=JSON.stringify({...report,client:{popupLoaded:true,browserFamily:/Edg\//.test(navigator.userAgent)?'Edge':'Chrome'}},null,2);const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=h('a');a.href=url;a.download=`wfm-diagnostics-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);setText('#diag-status','Diagnostics exported.');showToast('Diagnostics exported.','success');}catch{setText('#diag-status','Export failed.');showToast('Could not export diagnostics.');}finally{const b=$('#export');if(b){b.disabled=false;b.textContent='Export Diagnostics';}}};
 $('#copy-json').onclick=async(event)=>{if(event.currentTarget.disabled)return;event.currentTarget.disabled=true;event.currentTarget.textContent='Copying…';try{await navigator.clipboard.writeText(JSON.stringify(await diagnosticsReport(),null,2));setText('#diag-status','Copied as JSON');showToast('Copied as JSON','success');}catch{setText('#diag-status','Unable to copy JSON.');showToast('Unable to copy JSON.');}finally{const b=$('#copy-json');if(b){b.disabled=false;b.textContent='Copy JSON';}}};
 $('#clear').onclick=async(event)=>{if(event.currentTarget.disabled)return;event.currentTarget.disabled=true;event.currentTarget.textContent='Clearing…';try{const result=await send({type:'WFM_CLEAR_DIAGNOSTICS'});if(!result?.ok)throw Error();setText('#diag-status','Logs cleared.');showToast('Logs cleared.','success');await refreshDiagnosticCounts();}catch{setText('#diag-status','Could not clear logs.');showToast('Could not clear logs.');}finally{const b=$('#clear');if(b){b.disabled=false;b.textContent='Clear';}}};
 refreshDiagnosticCounts();
}
document.addEventListener('click',event=>{if(lastInfoOpen&&!event.target.closest('.schedule-info-button')){lastInfoOpen=false;const button=$('.schedule-info-button',app);if(button){button.setAttribute('aria-expanded','false');button.querySelector('.schedule-info-popover').hidden=true;}}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&lastInfoOpen){lastInfoOpen=false;const button=$('.schedule-info-button',app);if(button){button.setAttribute('aria-expanded','false');button.querySelector('.schedule-info-popover').hidden=true;button.focus();}}});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.wfm_companion_state_v1){state=changes.wfm_companion_state_v1.newValue;if(mode==='schedule')render();}});
(async()=>{try{await loadState();}catch{state={lastError:{reason:'extension_error',message:'Background worker unavailable'},settings:settingsWithDefaults()};render();}
 setInterval(()=>{if(mode==='schedule'){
  if(week()&&activeVariant!=='off'&&selectedDate===today())hero(dayForDate(week(),selectedDate));
  syncLiveRing();
 }},1000);
})();
