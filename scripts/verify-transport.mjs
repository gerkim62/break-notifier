import assert from 'node:assert/strict';
import {createWfmClient} from '../extension/transport.mjs';
import {createDiagnosticRun,diagnosticExport} from '../extension/diagnostics.mjs';

const exception=(type,message='Server rejected request')=>'//EX'+JSON.stringify([2,1,[type+'/123456',message],0,7]);
const privateMessage='user@example.com agent 123456 Bearer secret http://private-host/ private response';
function harness(body,{status=200,path='dispatch'}={}){
 const calls=[],diag=createDiagnosticRun({date:'2026-10-19',source:1});
 const client=createWfmClient({fetchImpl:async(url,options)=>{
  calls.push({url:String(url),options});
  return {ok:status>=200&&status<300,status,url:String(url),headers:new Headers({'content-type':'application/json'}),text:async()=>body};
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
  for(const secret of ['user@example.com','123456','secret','private-host','private response','com.private'])assert.equal(exported.includes(secret),false,'No private server data in result or diagnostics');
 }
}
console.log('PASS RPC exceptions distinguish authentication, compatibility, token, authorization and server errors without exposing server data');

for(const body of ['//EXnot-json','//EX{}','//EX[1,[],0,7]',exception('java.lang.RuntimeException','NotAuthenticatedException')]){
 const h=harness(body),result=await h.read();
 assert.equal(result.reason,'rpc_error');
 assert.equal(h.diag.run.events.find(e=>e.code==='rpc_exception')?.reason,'unclassified_rpc_exception');
}
for(const status of [401,403])assert.equal((await harness('',{status}).read()).reason,'not_authenticated');
assert.equal((await harness('<html>Log in</html>').read()).reason,'not_authenticated');
console.log('PASS Malformed errors and message text do not imply logout; HTTP authentication failures still request login');

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
