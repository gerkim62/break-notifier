import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {chromium} from 'playwright';
export const NOW='2026-10-18T10:40:00.000Z';
export function fixture(){
 const days=Array.from({length:7},(_,i)=>{
  const date='2026-10-'+(12+i),event=(source,name,start,end,stateType,stateId)=>({source,name,start,end,startDate:date,endDate:date,stateType,stateId});
  return {date,kind:i===5?'day_off':'work',shift:i===5?null:{start:'11:00',end:'17:30'},events:i===5?[]:[event('SchAgentDay','Shift','11:00','17:30'),event('SchState','Tea Break 1','11:25','11:35',4,1),event('SchState','Lunch Break','14:00','14:40',5,2),event('SchState','Tea Break 2','16:50','17:00',4,3)]};
 });
 return {settings:{leadMinutes:10,queueSwitchToast:false},week:{weekStart:'2026-10-12',weekEnd:'2026-10-18',days,warnings:[]},lastUpdated:Date.parse(NOW),snoozes:{},dismissed:{}};
}
export async function start(){
 const root=resolve('.');
 const server=createServer(async(req,res)=>{
  try{
   let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(path==='/harness.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0;background:#f3f5f9;min-height:100vh"><h1 style="padding:24px;font:20px system-ui">Snooze interaction verification</h1></body></html>');return;}
   const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('Invalid path');
   let body=await readFile(file);
   if(path==='/extension/popup.html')body=Buffer.from(body.toString().replace('<script type="module" src="popup.js"></script>','<script type="module">await import("./background.mjs");await import("./popup.js");</script>'));
   res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]??'application/octet-stream');res.end(body);
  }catch{res.statusCode=404;res.end('Not found');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 return {browser,base,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
export async function init(page,state=fixture()){
 await page.clock.setFixedTime(new Date(NOW));
 await page.addInitScript(({state})=>{
  const listeners=[],storageListeners=[],data={local:{wfm_companion_state_v1:state},session:{wfm_companion_ui_logs_v1:Array.from({length:45},()=>({code:'schedule_applied'}))}};
  const event=()=>({addListener(){}});
  window.__messages=[];window.__fetches=[];window.__storage=data;
  const area=name=>({
   async get(keys){if(typeof keys==='string')return {[keys]:data[name][keys]};if(Array.isArray(keys))return Object.fromEntries(keys.map(k=>[k,data[name][k]]));return structuredClone(data[name]);},
   async set(patch){const changes={};for(const [key,value] of Object.entries(patch)){changes[key]={oldValue:data[name][key],newValue:structuredClone(value)};data[name][key]=structuredClone(value);}queueMicrotask(()=>storageListeners.forEach(fn=>fn(changes,name)));},
   async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[name][key];}
  });
  window.chrome={runtime:{lastError:null,getURL:path=>location.origin+'/extension/'+path,getManifest:()=>({version:'0.4.18'}),onMessage:{addListener:fn=>listeners.push(fn)},onInstalled:event(),onStartup:event(),sendMessage(message,callback){window.__messages.push(message);let answered=false;for(const fn of listeners){const handled=fn(message,{url:location.href},r=>{if(!answered){answered=true;callback?.(r);}});if(handled===true)break;} }},
   storage:{local:area('local'),session:area('session'),onChanged:{addListener:fn=>storageListeners.push(fn)}},
   alarms:{clear:async()=>{},create:async()=>{},onAlarm:event()},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
   tabs:{query:async()=>[],sendMessage:async()=>{},create:async()=>({id:1}),update:async()=>{}},windows:{update:async()=>{}}};
  const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=original.call(this,options);window.__closedShadow=root;return root;};
  const realFetch=window.fetch;window.fetch=(url,options)=>{if(String(url).startsWith('http://svdt1ipccwfm09')){window.__fetches.push(String(url));return Promise.reject(new TypeError('WFM fixture offline'));}return realFetch(url,options);};
 },{state});
}
