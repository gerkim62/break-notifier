// Bounded, privacy-first diagnostics. No request/response bodies or personal identifiers.
export const DIAGNOSTICS_VERSION = 1;
const MAX_RUNS = 12;
const MAX_EVENTS = 400;
const MAX_TEXT = 240;
const SAFE_ERROR = /^(invalid_date|not_authenticated|network_error|rpc_error|parse_error|runtime_error|extension_error|unexpected_response)$/;
const scrub = value => String(value ?? '').replace(/https?:\/\/[^/\s]+/gi,'[wfm-host]').replace(/\b(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})\b/g,'[email]').replace(/\b(?:Bearer|Basic)\s+\S+/gi,'[auth]').replace(/\b(?:TRN|EK)\s?\d+\b/gi,'[employee]').replace(/\b\d{5,}\b/g,'[number]').slice(0, MAX_TEXT);
export function createDiagnosticRun({date,source,version='unknown',now=()=>Date.now()}={}) {
  const started = now();
  const events=[];
  const run={schema:DIAGNOSTICS_VERSION,startedAt:new Date(started).toISOString(),version,requestedWeekDate:/^\d{4}-\d{2}-\d{2}$/.test(date??'')?date:null,source,events,finishedAt:null,outcome:null,droppedEventCount:0};
  const log=(stage,code,fields={})=>{
    if(events.length>=MAX_EVENTS){run.droppedEventCount++;return;}
    const clean={};
    // Explicit allowlist only. Never copy arbitrary exception objects or server payloads.
    for(const [key,val] of Object.entries(fields)) {
      if(['method','endpoint','phase','reason','rpcStatus','resultKind','parserType','message','result','field'].includes(key))clean[key]=scrub(val);
      else if(['httpStatus','elapsedMs','bytes','dayCount','scheduledDays','offDays','unknownDays','breakCount','activities','missingDates','source','fieldCount','dayIndex','nativeStateType','nativeStateId','nativeDayType','nativeExceptionTypeId','nativeTimeOffTypeId','warningCount','nativeStateCount','coverageCount','eventCount','unnamedEventCount','workEventCount','incompleteNativeDays'].includes(key)&&typeof val==='number'&&Number.isFinite(val))clean[key]=val;
      else if(['authenticated','ok','timedOut','responseHtml','identityMatches'].includes(key)&&typeof val==='boolean')clean[key]=val;
    }
    events.push({ms:Math.max(0,now()-started),stage:scrub(stage),code:scrub(code),...clean});
  };
  const finish=(outcome)=>{run.finishedAt=new Date(now()).toISOString();run.outcome=SAFE_ERROR.test(outcome)?outcome:(outcome==='success'?'success':'runtime_error');log('run','finished',{reason:run.outcome});return run;};
  return {run,log,finish};
}
export function diagnosticSummary(schedule) {
 const days=schedule.days??[];
 return {
  warningCount:schedule.warnings?.length??0,
  dayCount:days.length,
  scheduledDays:days.filter(x=>x.kind==='scheduled').length,
  offDays:days.filter(x=>x.kind==='day_off').length,
  unknownDays:days.filter(x=>x.kind==='unknown').length,
  breakCount:days.reduce((n,d)=>n+(d.breaks?.length??0),0),
  nativeStateCount:days.reduce((n,d)=>n+(d.states?.length??0),0),
  coverageCount:days.reduce((n,d)=>n+(d.workSegments?.length??0),0),
  eventCount:days.reduce((n,d)=>n+(d.events?.length??0),0),
  unnamedEventCount:days.reduce((n,d)=>n+(d.events?.filter(e=>e.source!=='SchAgentDay'&&!e.name?.trim()).length??0),0),
  workEventCount:days.reduce((n,d)=>n+(d.events?.filter(e=>e.source==='SchCoverage').length??0),0),
  incompleteNativeDays:days.filter(d=>d.workSegments?.some(s=>s.unparsed)||d.states?.some(s=>s.unparsed)).length,
  missingDates:schedule.missingDates?.length??0,
 };
}
export function diagnosticExport(runs,{extensionVersion='unknown',userAgent='',now=()=>Date.now()}={}){
 return {format:'wfm-diagnostics',schema:DIAGNOSTICS_VERSION,exportedAt:new Date(now()).toISOString(),extensionVersion,browserFamily:/Edg\//.test(userAgent)?'Edge':/Chrome\//.test(userAgent)?'Chrome':'other',runs:runs.slice(-MAX_RUNS)};
}
export const diagnosticLimit=MAX_RUNS;
