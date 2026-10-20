import {profile} from './wfm-wire-profile.mjs';
import {isoWeek} from './normalize.mjs';
import {describeRpcException} from './rpc-exception.mjs';
const EPOCH=Date.UTC(1899,11,30);
const DAY_MS=86400000;
const TIMEOUT_MS=15000;
const fail=(reason,message)=>({ok:false,reason,message});
const serial=iso=>(Date.parse(iso+'T00:00:00Z')-EPOCH)/DAY_MS;
function sessionResult(text,logger=()=>{}){
 if(!text.startsWith('//OK'))return fail('rpc_error','Session check did not return a valid RPC result');
 try{const data=JSON.parse(text.slice(4));const strings=data.at(-3),values=data.slice(0,-3);
 if(!Array.isArray(strings)||typeof strings[0]!=='string'||!strings[0].includes('CheckSessionResult')){logger('auth','session_result_invalid',{reason:'unexpected_result_structure'});return fail('parse_error','Session result has an unexpected structure');}
 const agentId=values[1],login=strings[values[12]-1],displayName=strings[values[9]-1];
 const hasAgentIdentity=Number.isSafeInteger(agentId)&&agentId>0;
 logger('auth','session_result_decoded',{fieldCount:values.length,stringCount:strings.length,hasAgentIdentity});
 if(!hasAgentIdentity)return fail('not_authenticated','No logged-in WFM agent');
 return {ok:true,agent:{id:agentId,login,displayName}};
 }catch{logger('auth','session_result_invalid',{reason:'session_result_decode_failed'});return fail('parse_error','Cannot decode WFM session response');}
}
function rpcBody(date,agentId,base,source=1){
 const monday=serial(isoWeek(date)[0]);
 const p=[...profile.schedulePayload];p[18]=String(source);p[22]=String(monday-(source===0?1:0));p[23]=String(monday+7);p[31]=String(agentId);p[91]=String(monday+6);p[96]=String(monday);
 const s=profile.scheduleStrings.map(x=>x.replace('{moduleBase}',base));
 return [7,0,s.length,...s,...p,''].join('|');
}
export function createWfmClient({origin='http://svdt1ipccwfm09:8070',fetchImpl=fetch}={}){
 const base=new URL('/wfm/agent/',origin).href;
 async function post(path,body,logger=()=>{}){
  const t0=Date.now();logger('network','request_started',{method:'POST',endpoint:path,credentialsMode:'include',modulePath:'/wfm/agent/',wireProfile:'wfm_852_captured',rpcVersion:7,wirePermutation:profile.permutation,serializationPolicy:path==='dispatch'?profile.checkSessionBody.split('|')[4]:profile.scheduleStrings[1],requestBytes:body.length});
  const ac=new AbortController();const timeout=setTimeout(()=>ac.abort(),TIMEOUT_MS);
  try{const response=await fetchImpl(new URL(path,base),{method:'POST',headers:{'Content-Type':'text/x-gwt-rpc; charset=UTF-8','X-GWT-Module-Base':base,'X-GWT-Permutation':profile.permutation},credentials:'include',redirect:'follow',body,signal:ac.signal});
   const mime=response.headers?.get?.('content-type')??'',finalUrl=response.url?new URL(response.url):null;
   const responseMime=/text\/html/i.test(mime)?'html':/gwt-rpc/i.test(mime)?'gwt_rpc':/json/i.test(mime)?'json':/text\/plain/i.test(mime)?'plain':mime?'other':'missing';
   const finalEndpoint=!finalUrl?'unknown':/\/login\/?$/i.test(finalUrl.pathname)?'login':finalUrl.pathname.endsWith('/dispatch')?'dispatch':finalUrl.pathname.endsWith('/WFMScheduleService852')?'schedule':'other';
   logger('network','response_received',{endpoint:path,httpStatus:response.status,elapsedMs:Date.now()-t0,responseHtml:responseMime==='html',responseMime,redirected:Boolean(response.redirected),responseUrlKnown:Boolean(finalUrl),...(finalUrl?{responseOriginMatches:finalUrl.origin===new URL(base).origin}:{}),finalEndpoint});
   if(response.status===401||response.status===403||finalEndpoint==='login')return fail('not_authenticated','Log into WFM to continue');
   if(!response.ok)return fail('network_error',`HTTP ${response.status}`);
   const text=await response.text();logger('network','body_classified',{endpoint:path,bytes:text.length,rpcStatus:text.startsWith('//OK')?'OK':text.startsWith('//EX')?'EX':/^\s*</.test(text)?'HTML':'OTHER'});
   if(text.startsWith('//EX')){
    const details=describeRpcException(text),{reason}=details,auth=reason==='authentication_exception';
    logger('network','rpc_exception',{endpoint:path,...details});
    const message=auth?'No verified WFM session. Log in to continue.':
     reason==='rpc_contract_mismatch'||reason==='rpc_serialization_error'?'WFM rejected the extension RPC format. Export diagnostics for troubleshooting.':
     path==='dispatch'?'WFM session check failed. Export diagnostics for troubleshooting.':'WFM returned an RPC error. Export diagnostics for troubleshooting.';
    return fail(auth?'not_authenticated':'rpc_error',message);
   }
   if(!text.startsWith('//OK'))return fail(/^\s*</.test(text)?'not_authenticated':'unexpected_response','Unexpected WFM RPC response');
   return {ok:true,text};
  }catch(e){logger('network','request_failed',{endpoint:path,reason:ac.signal.aborted?'timeout':e instanceof TypeError?'fetch_type_error':'request_error',timedOut:ac.signal.aborted,elapsedMs:Date.now()-t0});return fail('network_error',ac.signal.aborted?'Request timed out':'Unable to contact WFM')}finally{clearTimeout(timeout)}
 }
 return {async checkSession(logger=()=>{}){logger('auth','session_check_started');const result=await post('dispatch',profile.checkSessionBody.replace('{moduleBase}',base),logger);const session=result.ok?sessionResult(result.text,logger):result;logger('auth','session_check_completed',{...(session.ok?{authenticated:true}:session.reason==='not_authenticated'?{authenticated:false}:{}),reason:session.ok?'success':session.reason});return session;},
 async fetchWeek(date,{source=1,agentId,logger=()=>{}}={}){
  let dates;try{dates=isoWeek(date)}catch(e){return fail('invalid_date',e.message)}
  logger('input','week_validated',{source});let id=agentId;
  if(!Number.isSafeInteger(id)||id<=0){const session=await this.checkSession(logger);if(!session.ok)return session;id=session.agent.id}else{logger('auth','identity_supplied',{authenticated:true})}
  logger('schedule','request_prepared',{source});const fetched=await post('WFMScheduleService852',rpcBody(dates[0],id,base,source),logger);return fetched.ok?{ok:true,text:fetched.text,source,agentId:id}:fetched;
 }};
}
