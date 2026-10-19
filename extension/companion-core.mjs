// Pure, browser-safe UI projection. Native reader JSON is never modified.
export const DEFAULT_SETTINGS = Object.freeze({
  autoRefresh: false, leadMinutes: 5, alertBreaks: true, alertExceptions: true, alertShiftStart: true, alertShiftEnd: true,
  alertQueues: false, queueSwitchToast: true, showRing: true, reducedMotion: 'system',
  timeZone: 'Africa/Nairobi', showQueuePrefixes: true, theme: 'system',
});
const DAY = 86400000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const dtfCache = new Map();
export function validTimeZone(zone) { if(typeof zone!=='string'||!zone.trim())return false;try { new Intl.DateTimeFormat('en-US',{timeZone:zone}); return true; } catch { return false; } }
export function settingsWithDefaults(input={}) {
  const s={...DEFAULT_SETTINGS};
  for(const key of Object.keys(DEFAULT_SETTINGS)) if(Object.hasOwn(input??{},key))s[key]=input[key];
  if (!Number.isInteger(Number(s.leadMinutes)) || Number(s.leadMinutes)<1 || Number(s.leadMinutes)>120) s.leadMinutes=5;
  else s.leadMinutes=Number(s.leadMinutes);
  s.alertQueues=false; // Queue switches use the at-time toast, never an advance ring alert.
  if (!validTimeZone(s.timeZone)) s.timeZone=DEFAULT_SETTINGS.timeZone;
  if (!['system','on','off'].includes(s.reducedMotion))s.reducedMotion='system';
  if (!['system','light','dark'].includes(s.theme))s.theme='system';
  return s;
}
function formatter(zone){
 if(!dtfCache.has(zone))dtfCache.set(zone,new Intl.DateTimeFormat('en-GB',{
  timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
 }));
 return dtfCache.get(zone);
}
export function zonedParts(epoch,zone='Africa/Nairobi'){
 const raw=Object.fromEntries(formatter(zone).formatToParts(new Date(epoch)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 return raw;
}
export function localDate(epoch=Date.now(),zone='Africa/Nairobi'){
 const p=zonedParts(epoch,zone);
 return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}
export function localTime(epoch=Date.now(),zone='Africa/Nairobi'){
 const p=zonedParts(epoch,zone);
 return `${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`;
}
export function wallTimeToEpoch(date,time,zone='Africa/Nairobi'){
 if(!DATE_PATTERN.test(date??'')||!TIME_PATTERN.test(time??'')||!validTimeZone(zone))return null;
 const y=Number(date.slice(0,4)),m=Number(date.slice(5,7)),d=Number(date.slice(8,10));
 const hh=Number(time.slice(0,2)),mm=Number(time.slice(3,5));
 const utc=Date.UTC(y,m-1,d,hh,mm);if(new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)!==date)return null;
 let epoch=utc;
 for(let i=0;i<5;i++){
  const p=zonedParts(epoch,zone);
  const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
  const delta=utc-represented;
  if(delta===0)break;
  epoch+=delta;
 }
 const p=zonedParts(epoch,zone);
 if(p.year!==y||p.month!==m||p.day!==d||p.hour!==hh||p.minute!==mm)return null; // DST gap or invalid.
 return epoch;
}
export function eventBounds(event,zone){
 if(!event||typeof event!=='object')return null;
 const start=wallTimeToEpoch(event.startDate,event.start,zone);
 const end=wallTimeToEpoch(event.endDate,event.end,zone);
 if(start===null||end===null||end<=start||end-start>8*DAY)return null;
 return {start,end};
}
export const rowType=event=> {
 if(event.source==='SchAgentDay'||event.kind==='shift')return 'shift';
 if(event.source==='SchCoverage'||event.kind==='allocation')return 'queue';
 if(event.stateType===4||event.stateType===5)return 'break';
 if(event.stateType===3)return 'exception';
 if(event.stateType===2)return 'time_off';
 if(event.stateType===9)return 'marked';
 if(event.stateType===7)return 'work';
 if(event.stateType===1)return 'day_off';
 return 'other';
};
export function eventName(event,settings=DEFAULT_SETTINGS){
 if(event.source==='SchAgentDay')return 'Shift';
 const name=typeof event.name==='string'&&event.name.trim()?event.name.trim():`Unnamed activity (type ${event.stateType??'allocation'} · id ${event.stateId??event.activityId??'?'})`;
 return settings.showQueuePrefixes===false&&event.source==='SchCoverage'?name.replace(/^\d+\.\s*/,''):name;
}
function priority(e){
 if(e.source==='SchAgentDay')return 10;
 if(e.source==='SchCoverage')return 30;
 if([2,3,4,5,9].includes(e.stateType))return 40;
 if(e.stateType===7)return 20;
 if(e.stateType===1)return 0;
 return 15; // unclassified native state retained; never outranks named allocations
}
const stableId=e=>`${e.source}:${e.stateType??'x'}:${e.stateId??e.activityId??'x'}:${e.name??''}`;
export function buildDaySegments(day,settings=DEFAULT_SETTINGS,report=()=>{}){
 if(!day||day.kind==='unknown'||day.kind==='day_off')return [];
 const shift=dayShiftBounds(day,settings);
 const shiftEvent=(day.events??[]).find(e=>e.source==='SchAgentDay'||e.kind==='shift')??(shift?{source:'SchAgentDay',start:day.shift?.start,end:day.shift?.end,startDate:day.date,endDate:day.date}:null);
 if(!shift){
  report('display_shift_unavailable',{date:day.date});
  // Do not suppress valid WFM records solely because the day's native shift
  // boundary is absent. Show their unmerged intervals, without claiming they
  // form an effective continuous shift timeline.
  return (day.events??[]).filter(e=>e.source!=='SchAgentDay').flatMap(event=>{
   const bounds=eventBounds(event,settings.timeZone);
   if(!bounds){report('display_event_invalid_time',{date:day.date,source:event.source});return [];}
   return [{id:stableId(event),start:bounds.start,end:bounds.end,name:eventName(event,settings),type:rowType(event),source:event.source,kind:event.kind,stateType:event.stateType??null,nativeId:event.stateId??event.activityId??null,unbounded:true}];
  }).sort((a,b)=>a.start-b.start||a.end-b.end);
 }
 const candidates=[];const boundaries=new Set([shift.start,shift.end]);
 for(const event of day.events??[]){
  const bounds=eventBounds(event,settings.timeZone);
  if(!bounds){report('display_event_invalid_time',{date:day.date,source:event.source});continue;}
  const start=Math.max(shift.start,bounds.start),end=Math.min(shift.end,bounds.end);
  if(start>=end)continue;
  candidates.push({event,start,end,priority:priority(event)});
  boundaries.add(start);boundaries.add(end);
 }
 const times=Array.from(boundaries).sort((a,b)=>a-b),slices=[];
 for(let i=1;i<times.length;i++){
  const start=times[i-1],end=times[i];if(end<=start)continue;
  const covering=candidates.filter(c=>c.start<=start&&c.end>=end);
  covering.sort((a,b)=>b.priority-a.priority||b.start-a.start||((a.event.stateId??a.event.activityId??0)-(b.event.stateId??b.event.activityId??0)));
  const winner=covering[0]?.event??shiftEvent;
  const id=stableId(winner),type=rowType(winner);
  if(slices.length&&slices[slices.length-1].id===id&&slices[slices.length-1].end===start){slices[slices.length-1].end=end;continue;}
  slices.push({id,start,end,name:eventName(winner,settings),type,source:winner.source,kind:winner.kind,stateType:winner.stateType??null,nativeId:winner.stateId??winner.activityId??null});
 }
 return slices;
}
export function dayForDate(week,date){return week?.days?.find(day=>day.date===date)??null;}
// Native shift boundary for a day, or null when WFM did not provide one.
export function dayShiftBounds(day,settings=DEFAULT_SETTINGS){
  if(!day||day.kind==='unknown'||day.kind==='day_off')return null;
  const shift=(day.events??[]).find(e=>e.source==='SchAgentDay'||e.kind==='shift');
  if(shift){const b=eventBounds(shift,settings.timeZone);if(b)return b;}
  if(day.shift&&day.shift.start&&day.shift.end){
    return eventBounds({start:day.shift.start,end:day.shift.end,startDate:day.shift.startDate??day.date,endDate:day.shift.endDate??day.date},settings.timeZone);
  }
  return null;
}
export function contextForDay(weekOrDay,date,settings,now=Date.now()){
 const day=weekOrDay?.events?weekOrDay:dayForDate(weekOrDay,date);
 const segments=buildDaySegments(day,settings);
 const current=segments.find(s=>s.start<=now&&now<s.end)??null;
 const upcoming=segments.find(s=>s.start>now)??null;
 const shiftBounds=dayShiftBounds(day,settings);
 const next= current ? segments.find(s=>s.start===current.end)??null : upcoming;
 const nextBreak=segments.find(s=>s.start>now&&s.type==='break')??null;
 return {day,segments,current,next,nextBreak,shiftBounds};
}
export function formatDuration(ms,{seconds=false}={}){
 const n=Math.max(0,Math.ceil(ms/1000));
 const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;
 if(seconds)return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
 return h?`${h} h${m?` ${m} min`:''}`:`${Math.max(1,Math.ceil(n/60))} min`;
}
export function segmentProgress(s,now){return s?Math.max(0,Math.min(1,(now-s.start)/(s.end-s.start))):0;}
export function alertCandidates(week,settings,now=Date.now()){
 if(!week)return [];
 const date=localDate(now,settings.timeZone),day=dayForDate(week,date);
 if(!day||day.kind==='unknown'||day.kind==='day_off')return [];
 const segments=buildDaySegments(day,settings);
 const lead=Number(settings.leadMinutes)*60000;
 const candidates=[];
 for(let i=0;i<segments.length;i++){
  const current=segments[i],before=segments[i-1];
  let enabled=false;
  if(current.type==='break')enabled=settings.alertBreaks;
  else if(current.type==='exception')enabled=settings.alertExceptions;
  else if(current.type==='queue')enabled=settings.alertQueues&&Boolean(before);
  if(enabled&&current.start>now&&current.start-now<=lead)candidates.push({id:`${date}:${current.id}:${current.start}`,name:current.name,type:current.type,at:current.start,remaining:current.start-now,lead});
 }
   const bounds=dayShiftBounds(day,settings);
  if(settings.alertShiftStart&&bounds&&bounds.start>now&&bounds.start-now<=lead)candidates.push({id:`${date}:shift_start:${bounds.start}`,name:'Shift starts',type:'shift',at:bounds.start,remaining:bounds.start-now,lead});
  const last=segments.at(-1);
 if(settings.alertShiftEnd&&last&&last.end>now&&last.end-now<=lead)candidates.push({id:`${date}:shift_end:${last.end}`,name:'Shift ends',type:'shift',at:last.end,remaining:last.end-now,lead});
 return candidates.sort((a,b)=>a.at-b.at);
}
export function selectedAlert(week,settings,{snoozes={},dismissed={}}={},now=Date.now()){
 // A snooze pauses the visual alert as a whole, not merely the matching
 // candidate. Otherwise a later eligible event can immediately replace the
 // snoozed one and leave the viewport glowing throughout the snooze.
 if(Object.values(snoozes).some(until=>Number.isFinite(until)&&until>now))return null;
 return alertCandidates(week,settings,now).find(e=>!dismissed[e.id])??null;
}
export function weekFingerprint(week){
 if(!week)return '';
 return JSON.stringify({weekStart:week.weekStart,days:week.days?.map(day=>({date:day.date,kind:day.kind,events:day.events?.map(e=>[e.source,e.kind,e.stateType,e.stateId,e.activityId,e.name,e.startDate,e.start,e.endDate,e.end])}))});
}
export function changedRemainingToday(oldWeek,newWeek,settings,now=Date.now()){
 const date=localDate(now,settings.timeZone),oldDay=dayForDate(oldWeek,date),newDay=dayForDate(newWeek,date);
 if(!oldDay||!newDay)return true;
 const relevant=day=>({kind:day.kind,events:(day.events??[]).filter(e=>{const b=eventBounds(e,settings.timeZone);return b&&b.end>now;}).map(e=>[e.source,e.kind,e.stateType,e.stateId,e.activityId,e.name,e.startDate,e.start,e.endDate,e.end])});
 return JSON.stringify(relevant(oldDay))!==JSON.stringify(relevant(newDay));
}
export function changeDescription(oldWeek,newWeek,settings,now=Date.now()){
 const date=localDate(now,settings.timeZone),old=dayForDate(oldWeek,date),next=dayForDate(newWeek,date);
 if(!old||!next)return 'Schedule updated for today';
 const oldShift=(old.events??[]).find(e=>e.source==='SchAgentDay'),newShift=(next.events??[]).find(e=>e.source==='SchAgentDay');
 if(oldShift?.end!==newShift?.end&&newShift?.end)return `Shift now ends ${newShift.end}`;
 if(oldShift?.start!==newShift?.start&&newShift?.start)return `Shift now starts ${newShift.start}`;
 const oldMap=new Map((old.events??[]).map(e=>[`${e.source}:${e.stateType??0}:${e.stateId??e.activityId??0}:${e.name??''}`,e]));
 const moved=(next.events??[]).find(e=>{const b=eventBounds(e,settings.timeZone),p=oldMap.get(`${e.source}:${e.stateType??0}:${e.stateId??e.activityId??0}:${e.name??''}`);return b&&b.end>now&&p&&(p.start!==e.start||p.end!==e.end);});
 return moved?`${eventName(moved,settings)} moved to ${moved.start}`:'Schedule updated for today';
}
export function nextShiftThisWeek(week,settings,now=Date.now()){
 const shifts=(week?.days??[]).flatMap(d=>(d.events??[]).filter(e=>e.source==='SchAgentDay').map(e=>({...e,bounds:eventBounds(e,settings.timeZone)}))).filter(e=>e.bounds?.start>now).sort((a,b)=>a.bounds.start-b.bounds.start);
 return shifts[0]??null;
}
export function ordinal(date){const d=Number(date.slice(-2)),suffix=[11,12,13].includes(d)?'th':d%10===1?'st':d%10===2?'nd':d%10===3?'rd':'th';return `${d}${suffix}`;}
export function alertColor(progress){
 const stops=[{p:0,hex:'#34d399'},{p:.35,hex:'#2dd4bf'},{p:.60,hex:'#fbbf24'},{p:.82,hex:'#fb7f5c'},{p:1,hex:'#f43f5e'}];
 const p=Math.max(0,Math.min(1,progress));
 for(let i=1;i<stops.length;i++)if(p<=stops[i].p){const a=stops[i-1],b=stops[i],fraction=(p-a.p)/(b.p-a.p);return {from:a.hex,to:b.hex,fraction};}
 return {from:'#f43f5e',to:'#f43f5e',fraction:0};
}
