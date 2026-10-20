// Keep the server's error explanation while removing credential values.
const SECRET_KEY='(?:password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|session[_-]?(?:id|token)|JSESSIONID|(?:x[-_]?)?(?:csrf|xsrf)[-_]?token|authorization|cookie|set-cookie)';
const escapedSecret=new RegExp('(\\b'+SECRET_KEY+'\\b(?:\\\\?["\'])?\\s*[:=]\\s*)\\\\"(?:\\\\.|[^"\\\\])*\\\\"','gi');
const assignedSecret=new RegExp('(\\b'+SECRET_KEY+'\\b["\']?\\s*[:=]\\s*)(?:\\[redacted\\]|"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|[^\\s,;&|\\] }"\'\\\\<>]+)','gi');
export function redactRpcDiagnosticText(value,max=8192){
 return String(value??'')
  .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi,'[authorization redacted]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[token redacted]')
  .replace(/\b(?:Set-Cookie|Cookie|Authorization)\s*:\s*[^\r\n"\\]+/gi,'[credential header redacted]')
  .replace(escapedSecret,'$1[redacted]')
  .replace(assignedSecret,'$1[redacted]')
  .slice(0,max);
}
function exceptionResponse(text){
 let clean;
 try{
  const data=JSON.parse(text.slice(4),(key,value)=>{
   if(new RegExp('^'+SECRET_KEY+'$','i').test(key))return '[redacted]';
   return typeof value==='string'?redactRpcDiagnosticText(value,Infinity):value;
  });
  clean='//EX'+JSON.stringify(data);
 }catch{clean=redactRpcDiagnosticText(text,Infinity);}
 return {rpcExceptionResponse:clean.slice(0,8192),rpcExceptionResponseTruncated:clean.length>8192};
}
export function safeRpcExceptionType(value){
 if(typeof value!=='string'||value.length>180)return null;
 const className=/^(?:[A-Z][\w$]*)?(?:Exception|Error|Throwable)$/;
 if(className.test(value))return value;
 if(!/^(?:[A-Za-z_$][\w$]*\.)+(?:[A-Z][\w$]*)?(?:Exception|Error|Throwable)$/.test(value))return null;
 return value;
}
const typeName=value=>typeof value==='string'&&/^[\w.$]+\/\d+$/.test(value)?value.slice(0,value.indexOf('/')):null;
function category(types){
 const has=pattern=>types.some(type=>pattern.test(type));
 if(has(/\.(?:SessionExpiredException|NotAuthenticatedException|UnauthenticatedException|AuthenticationException|LoginRequiredException)$/))return 'authentication_exception';
 if(has(/^com\.google\.gwt\.user\.client\.rpc\.IncompatibleRemoteServiceException$/))return 'rpc_contract_mismatch';
 if(has(/^com\.google\.gwt\.user\.client\.rpc\.(?:SerializationException|SerializedTypeViolationException)$/))return 'rpc_serialization_error';
 if(has(/^com\.google\.gwt\.user\.client\.rpc\.RpcTokenException$/))return 'rpc_token_rejected';
 if(has(/^net\.customware\.gwt\.dispatch\.shared\.UnsupportedActionException$/))return 'rpc_action_unsupported';
 if(has(/^com\.genesyslabs\.shared\.exception\.AccessDeniedException$/))return 'rpc_access_denied';
 if(has(/^java\.lang\.(?:IllegalArgumentException|NullPointerException|IllegalStateException)$/))return 'rpc_server_error';
 if(has(/^com\.genesyslabs\.shared\.exception\.ClientException$/)||has(/^net\.customware\.gwt\.dispatch\.shared\.ActionException$/))return 'rpc_application_error';
 return 'unclassified_rpc_exception';
}
function authenticationHint(strings){
 const messages=strings.filter(value=>typeof value==='string'&&!typeName(value));
 if(messages.some(value=>/\bsession\s+(?:has\s+)?(?:expired|timed\s+out)\b/i.test(value)))return 'session_expired';
 if(messages.some(value=>/\b(?:invalid\s+session|session\s+(?:is\s+)?invalid)\b/i.test(value)))return 'session_invalid';
 if(messages.some(value=>/\b(?:no\s+(?:active\s+)?session|session\s+(?:not\s+found|does\s+not\s+exist))\b/i.test(value)))return 'session_missing';
 if(messages.some(value=>/\b(?:not\s+authenticated|not\s+logged\s+in)\b/i.test(value)))return 'not_authenticated';
 if(messages.some(value=>/\b(?:login\s+required|authentication\s+required|please\s+(?:log\s*in|sign\s*in))\b/i.test(value)))return 'login_required';
 return 'none';
}
export function describeRpcException(text){
 const result={reason:'unclassified_rpc_exception',rpcDecode:'invalid_json',exceptionType:'unrecognized',exceptionTypes:[],authenticationHint:'unavailable',...exceptionResponse(text)};
 let data;
 try{data=JSON.parse(text.slice(4));}catch{
  // Some GWT failures use JavaScript escapes that JSON cannot decode. Extract
  // only standalone serialized class tokens; never evaluate the response.
  const tokens=[...text.matchAll(/[\[,]\s*"([\w.$]+)\/\d+"(?=\s*[,\]])/g)].map(match=>match[1]);
  result.exceptionTypes=[...new Set(tokens.map(safeRpcExceptionType).filter(Boolean))].slice(0,8);
  // Keep malformed responses unclassified even if a recognizable token exists.
  return result;
 }
 if(!Array.isArray(data)||data.length<4){result.rpcDecode='invalid_envelope';return result;}
 if(Number.isSafeInteger(data.at(-1))&&data.at(-1)>=0&&data.at(-1)<=20)result.rpcStreamVersion=data.at(-1);
 if(Number.isSafeInteger(data.at(-2))&&data.at(-2)>=0&&data.at(-2)<=255)result.rpcFlags=data.at(-2);
 const strings=data.at(-3);
 if(!Array.isArray(strings)){result.rpcDecode='missing_string_table';return result;}
 const types=strings.map(typeName).filter(Boolean),root=data.at(-4);
 result.exceptionMessages=strings.filter(value=>typeof value==='string'&&!typeName(value)).slice(0,16).map(value=>redactRpcDiagnosticText(value,4096));
 result.fieldCount=data.length-3;result.stringCount=strings.length;
 result.exceptionReferenceValid=Number.isSafeInteger(root)&&root>0&&root<=strings.length;
 const rootType=Number.isSafeInteger(root)&&root>0?typeName(strings[root-1]):null;
 result.rpcDecode='decoded';result.reason=category(rootType?[rootType]:[]);
 result.exceptionType=Number.isSafeInteger(root)&&root>0?safeRpcExceptionType(typeName(strings[root-1]))??'unrecognized':'unrecognized';
 result.exceptionTypes=[...new Set(types.map(safeRpcExceptionType).filter(Boolean))].slice(0,8);
 result.authenticationHint=authenticationHint(strings);
 return result;
}
