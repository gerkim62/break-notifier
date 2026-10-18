import {settingsWithDefaults,localDate,wallTimeToEpoch,eventBounds} from './companion-core.mjs';

const CONFIRM_BEFORE=12*60*60*1000;
export function scheduleWeekStart(date){
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
}
const nextDate=date=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
function cachedWeek(state,start){return state?.week?.weekStart===start?state.week:state?.weeks?.[start];}
function updatedAt(state,start){return Number(state?.weekUpdated?.[start]??(state?.week?.weekStart===start?state?.lastUpdated:0))||0;}
function shiftBounds(day,zone){
 const event=(day?.events??[]).find(event=>event.source==='SchAgentDay'||event.kind==='shift');
 if(event)return eventBounds(event,zone);
 if(!day?.shift)return null;
 const shift=day.shift,startDate=shift.startDate??day.date;
 return eventBounds({...shift,startDate,endDate:shift.endDate??(shift.end<=shift.start?nextDate(startDate):startDate)},zone);
}

// A successful whole-week read confirms only the shifts whose 12-hour window
// has opened. Attempts and failures are deliberately excluded from updatedAt.
export function scheduleFreshness(state,date,now=Date.now()){
 const zone=settingsWithDefaults(state?.settings).timeZone,today=localDate(now,zone),start=scheduleWeekStart(date);
 const week=cachedWeek(state,start),updated=updatedAt(state,start),day=week?.days?.find(day=>day.date===date);
 const daily=wallTimeToEpoch(today,'00:00',zone),base={weekStart:start,updated,date};
 const dailyKey=`${start}:day:${today}`;
 if(!week)return {...base,status:'missing',needsCheck:true,key:dailyKey};
 const bounds=shiftBounds(day,zone);
 if(bounds){
  const opens=bounds.start-CONFIRM_BEFORE,key=`${start}:shift:${bounds.start}:${bounds.end}`;
  if(now>=bounds.end)return {...base,bounds,opens,key,status:'archived',needsCheck:false};
  if(now>=opens)return {...base,bounds,opens,key,status:updated>=opens?'confirmed':'stale',needsCheck:updated<opens};
  return {...base,bounds,opens,key,status:'provisional',needsCheck:false};
 }
 if(date<today)return {...base,key:dailyKey,status:'archived',needsCheck:false};
 // A confirmed overnight shift remains valid after midnight, including when
 // the following date has no shift of its own. Do not refetch it as a day off.
 if(date===today){
  const weeks=new Map([...(Object.entries(state?.weeks??{})),...(state?.week?[[state.week.weekStart,state.week]]:[])]);
  for(const [weekStart,week] of weeks)for(const candidate of week.days??[]){
   const active=shiftBounds(candidate,zone),checked=updatedAt(state,weekStart);
   if(active&&active.start<=now&&now<active.end&&checked>=active.start-CONFIRM_BEFORE)
    return {...base,bounds:active,key:`${weekStart}:shift:${active.start}:${active.end}`,status:'confirmed',needsCheck:false};
  }
 }
 const needsCheck=updated<daily;
 return {...base,key:dailyKey,status:needsCheck&&date===today?'stale':day?.kind==='day_off'?'day-off':'provisional',needsCheck};
}
export function scheduleRefreshFailure(state,date,now=Date.now()){
 return state?.refreshFailures?.[scheduleFreshness(state,date,now).key]??null;
}
export function scheduleRefreshDue(state,date,now=Date.now()){
 const freshness=scheduleFreshness(state,date,now);
 return freshness.needsCheck&&(freshness.status==='missing'||!state?.refreshFailures?.[freshness.key]);
}
