import assert from 'node:assert/strict';
import {createWfmClient} from '../extension/transport.mjs';
import {createDiagnosticRun,diagnosticExport} from '../extension/diagnostics.mjs';
import {describeRpcException,redactRpcDiagnosticText} from '../extension/rpc-exception.mjs';
import {profile} from '../extension/wfm-wire-profile.mjs';

const exception=(type,message='Server rejected request')=>'//EX'+JSON.stringify([2,1,[type+'/123456',message],0,7]);
const privateMessage='user@example.com agent 123456 Bearer secret http://private-host/ private response';
function harness(body,{status=200,path='dispatch',mime='application/json',responseUrl,redirected=false}={}){
 const calls=[],diag=createDiagnosticRun({date:'2026-10-19',source:1});
 const client=createWfmClient({fetchImpl:async(url,options)=>{
  calls.push({url:String(url),options});
  return {ok:status>=200&&status<300,status,url:responseUrl??String(url),redirected,headers:new Headers({'content-type':mime}),text:async()=>body};
 }});
 return {calls,diag,read:()=>client.fetchWeek('2026-10-19',{logger:diag.log,...(path==='dispatch'?{}:{agentId:42})})};
}

for(const [type,category,auth] of [
 ['com.genesyslabs.shared.exception.SessionExpiredException','authentication_exception',true],
 ['com.genesyslabs.shared.exception.NotAuthenticatedException','authentication_exception',true],
 ['com.genesyslabs.shared.exception.UnauthenticatedException','authentication_exception',true],
 ['com.genesyslabs.shared.exception.AuthenticationException','authentication_exception',true],
 ['com.genesyslabs.shared.exception.LoginRequiredException','authentication_exception',true],
 ['com.google.gwt.user.client.rpc.IncompatibleRemoteServiceException','rpc_contract_mismatch',false],
 ['com.google.gwt.user.client.rpc.SerializationException','rpc_serialization_error',false],
 ['com.google.gwt.user.client.rpc.SerializedTypeViolationException','rpc_serialization_error',false],
 ['com.google.gwt.user.client.rpc.RpcTokenException','rpc_token_rejected',false],
 ['net.customware.gwt.dispatch.shared.UnsupportedActionException','rpc_action_unsupported',false],
 ['com.genesyslabs.shared.exception.AccessDeniedException','rpc_access_denied',false],
 ['java.lang.NullPointerException','rpc_server_error',false],
 ['java.lang.IllegalArgumentException','rpc_server_error',false],
 ['java.lang.IllegalStateException','rpc_server_error',false],
 ['com.genesyslabs.shared.exception.ClientException','rpc_application_error',false],
 ['net.customware.gwt.dispatch.shared.ActionException','rpc_application_error',false],
 ['com.private.UnknownException','unclassified_rpc_exception',false],
]){
 for(const path of ['dispatch','schedule']){
  const h=harness(exception(type,privateMessage),{path}),result=await h.read();
  assert.equal(result.reason,auth?'not_authenticated':'rpc_error',type+' '+path);
  assert.equal(h.calls.length,1,'A failed session check never requests a schedule');
  assert.equal(h.calls[0].options.credentials,'include');
  assert.equal(h.diag.run.events.find(e=>e.code==='rpc_exception')?.reason,category);
  if(path==='dispatch')assert.equal(h.diag.run.events.find(e=>e.code==='session_check_completed')?.authenticated,auth?false:undefined);
  h.diag.finish(result.reason);
  const exported=JSON.stringify({report:diagnosticExport([h.diag.run]),result});
  assert.equal(exported.includes('Bearer secret'),false,'Authorization values are redacted');
  assert.equal(exported.includes('user@example.com'),true,'Server explanation is retained');
  assert.equal(exported.includes('private response'),true,'Diagnostic context is retained');
  assert.ok(h.diag.run.events.find(event=>event.code==='rpc_exception').rpcExceptionResponse.startsWith('//EX'));
 }
}
console.log('PASS RPC exceptions include server explanations and failed responses while redacting authorization values');

for(const body of ['//EXnot-json','//EX{}','//EX[1,[],0,7]',exception('java.lang.RuntimeException','NotAuthenticatedException')]){
 const h=harness(body),result=await h.read();
 assert.equal(result.reason,'rpc_error');
 assert.equal(h.diag.run.events.find(e=>e.code==='rpc_exception')?.reason,'unclassified_rpc_exception');
}
for(const status of [401,403])assert.equal((await harness('',{status}).read()).reason,'not_authenticated');
assert.equal((await harness('<html>Log in</html>').read()).reason,'not_authenticated');
console.log('PASS Malformed errors and message text do not imply logout; HTTP authentication failures still request login');

const appType='com.genesyslabs.shared.exception.ClientException';
for(const [message,hint] of [
 ['Session has expired. '+privateMessage,'session_expired'],
 ['Invalid session. '+privateMessage,'session_invalid'],
 ['No active session. '+privateMessage,'session_missing'],
 ['Not authenticated. '+privateMessage,'not_authenticated'],
 ['Please log in. '+privateMessage,'login_required'],
 [privateMessage,'none'],
]){
 const h=harness(exception(appType,message)),result=await h.read();
 const event=h.diag.run.events.find(event=>event.code==='rpc_exception');
 assert.equal(result.reason,'rpc_error','Message hints alone must not claim the user logged out');
 assert.equal(event.exceptionType,appType);assert.deepEqual(event.exceptionTypes,[appType]);
 assert.equal(event.rpcDecode,'decoded');assert.equal(event.authenticationHint,hint);
 assert.equal(event.rpcStreamVersion,7);assert.equal(event.rpcFlags,0);
 assert.equal(event.fieldCount,2);assert.equal(event.stringCount,2);assert.equal(event.exceptionReferenceValid,true);
 assert.equal(JSON.stringify(h.diag.run).includes(privateMessage),false);
}
const custom=harness(exception('com.genesyslabs.shared.exception.CustomSessionException',privateMessage));
await custom.read();assert.equal(custom.diag.run.events.find(event=>event.code==='rpc_exception').exceptionType,'com.genesyslabs.shared.exception.CustomSessionException');
const fakeMessage=describeRpcException(exception('java.lang.RuntimeException','com.genesyslabs.shared.exception.NotAuthenticatedException/123'));
assert.equal(fakeMessage.reason,'unclassified_rpc_exception');assert.equal(fakeMessage.exceptionType,'java.lang.RuntimeException');
assert.equal(describeRpcException('//EXnot-json').rpcDecode,'invalid_json');
assert.equal(describeRpcException('//EX{}').rpcDecode,'invalid_envelope');
assert.equal(describeRpcException('//EX[1,2,0,7]').rpcDecode,'missing_string_table');
const jsEscapes=describeRpcException('//EX[2,1,["com.genesyslabs.shared.exception.ClientException/123","bad\\x20response"],0,7]');
assert.equal(jsEscapes.rpcDecode,'invalid_json');assert.deepEqual(jsEscapes.exceptionTypes,[appType]);assert.equal(jsEscapes.reason,'unclassified_rpc_exception');
console.log('PASS Diagnostics retain exception identifiers, stream metadata and safe authentication hints, including unknown vendor exceptions and non-JSON responses');

const metadata=harness(exception(appType)),metadataResult=await metadata.read();
assert.equal(metadataResult.ok,false);
const request=metadata.diag.run.events.find(event=>event.code==='request_started'),response=metadata.diag.run.events.find(event=>event.code==='response_received');
assert.equal(request.credentialsMode,'include');assert.equal(request.modulePath,'/wfm/agent/');
assert.equal(request.wirePermutation,profile.permutation);assert.equal(request.serializationPolicy,profile.checkSessionBody.split('|')[4]);
assert.equal(request.rpcVersion,7);assert.ok(request.requestBytes>0);
assert.equal(response.responseMime,'json');assert.equal(response.responseOriginMatches,true);assert.equal(response.responseUrlKnown,true);assert.equal(response.redirected,false);assert.equal(response.finalEndpoint,'dispatch');
const redirected=harness('',{mime:'text/html',redirected:true,responseUrl:'http://another-private-host/wfm/login'});
assert.equal((await redirected.read()).reason,'not_authenticated');
const redirectEvent=redirected.diag.run.events.find(event=>event.code==='response_received');
assert.equal(redirectEvent.redirected,true);assert.equal(redirectEvent.responseOriginMatches,false);assert.equal(redirectEvent.finalEndpoint,'login');assert.equal(redirectEvent.responseMime,'html');
assert.equal(JSON.stringify(redirected.diag.run).includes('another-private-host'),false);
console.log('PASS Request/response diagnostics identify public wire fingerprints, credential mode, MIME and redirects without recording hosts or payloads');

const privacy=createDiagnosticRun();privacy.log('network','rpc_exception',{
 exceptionType:privateMessage,exceptionTypes:[appType,privateMessage,'com.private.UnknownException'],authenticationHint:privateMessage,rpcDecode:privateMessage,
 wirePermutation:privateMessage,serializationPolicy:privateMessage,credentialsMode:privateMessage,modulePath:privateMessage,responseMime:privateMessage,finalEndpoint:privateMessage,
 responseBody:privateMessage,cookie:privateMessage,authorization:privateMessage,
});
assert.deepEqual(privacy.run.events[0].exceptionTypes,[appType,'com.private.UnknownException']);
assert.deepEqual(Object.keys(privacy.run.events[0]).sort(),['code','exceptionTypes','ms','stage']);
console.log('PASS Full exception namespaces are retained while credential headers and successful response bodies remain uncollected');
for(const text of [
 'password=supersecret failure', 'password="multi word secret" failure', "password='multi word secret' failure",
 'JSESSIONID=session-secret; path=/', 'token:plain-token', 'access_token=access-secret&reason=expired',
 '{"password":"json secret"}', 'Authorization: Bearer bearer-secret', 'Cookie: session=abc; other=def',
 'password=\\"escaped secret\\" failure',
]){
 const redacted=redactRpcDiagnosticText(text);
 for(const secret of ['supersecret','multi word secret','session-secret','plain-token','access-secret','json secret','bearer-secret','session=abc','escaped secret'])assert.equal(redacted.includes(secret),false,text);
 assert.equal(redactRpcDiagnosticText(redacted),redacted,'Redaction must be stable through decoding and export');
}
const explanation='Session invalid for user@example.com at http://wfm-host/dispatch, error 123456; password="hide me"';
const detailed=harness(exception('org.example.CustomSessionException',explanation));await detailed.read();
const detail=detailed.diag.run.events.find(event=>event.code==='rpc_exception');
assert.equal(detail.exceptionType,'org.example.CustomSessionException');
assert.deepEqual(detail.exceptionMessages,[explanation.replace('"hide me"','[redacted]')]);
assert.equal(JSON.parse(detail.rpcExceptionResponse.slice(4)).at(-3)[1],detail.exceptionMessages[0]);
assert.equal(JSON.stringify(detail).includes('hide me'),false);
const malformedDetail=harness('//EX["broken\\x20json password=secret-value"]');await malformedDetail.read();
const malformedEvent=malformedDetail.diag.run.events.find(event=>event.code==='rpc_exception');
assert.equal(malformedEvent.rpcDecode,'invalid_json');assert.ok(malformedEvent.rpcExceptionResponse.includes('broken\\x20json'));assert.equal(malformedEvent.rpcExceptionResponse.includes('secret-value'),false);
console.log('PASS Failed RPC bodies and full messages survive export, including malformed responses; passwords, session tokens and authorization headers are redacted');
const bounded=describeRpcException(exception(appType,'x'.repeat(9000)));
assert.equal(bounded.rpcExceptionResponse.length,8192);assert.equal(bounded.rpcExceptionResponseTruncated,true);assert.equal(bounded.exceptionMessages[0].length,4096);
const expanded=describeRpcException(exception(appType,'token=a;'.repeat(900)));
assert.equal(expanded.rpcExceptionResponseTruncated,true,'Flag truncation when redaction expands a short response');
assert.equal(diagnosticExport([],{userAgent:'Mozilla/5.0 Chrome/140.0 Edg/140.0'}).browserFamily,'Edge');
assert.equal(diagnosticExport([],{userAgent:'Mozilla/5.0 Chrome/140.0'}).browserFamily,'Chrome');
assert.equal(JSON.stringify(diagnosticExport([],{userAgent:'private-user-agent'})).includes('private-user-agent'),false);

const session=agentId=>'//OK'+JSON.stringify([0,agentId,0,0,0,0,0,0,0,2,0,0,3,['com.genesyslabs.shared.rpc.CheckSessionResult/123456','Example Agent','example-login'],0,7]);
const invalid=harness(session(0));assert.equal((await invalid.read()).reason,'not_authenticated');assert.equal(invalid.calls.length,1);
const calls=[];
const client=createWfmClient({fetchImpl:async(url,options)=>{
 calls.push({url:String(url),options});
 return {ok:true,status:200,url:String(url),text:async()=>calls.length===1?session(42):'//OK[]'};
}});
const result=await client.fetchWeek('2026-10-19');
assert.equal(result.ok,true);assert.equal(result.agentId,42);assert.equal(calls.length,2);
assert.ok(calls[0].url.endsWith('/dispatch'));assert.ok(calls[1].url.endsWith('/WFMScheduleService852'));
assert.ok(calls[1].options.body.includes('|42|'));
console.log('PASS Verified agent identity is required before a schedule request; successful sessions continue normally');
