// Passive observation: only the WFM page the user actually opens.
// Never clicks WFM controls, changes weeks, probes sessions or fetches data.
(async()=>{
 if(location.origin!=='http://svdt1ipccwfm09:8070')return;
 if(/\/wfm\/login\/?$/i.test(location.pathname))return;
 const send=message=>new Promise(resolve=>{
  try { chrome.runtime.sendMessage(message,r=>resolve(chrome.runtime.lastError?null:r)); }
  catch {resolve(null);}
 });
 let reader,compare,core;
 try{
  [reader,compare,core]=await Promise.all([
   import(chrome.runtime.getURL('wfm-dom-reader.mjs')),
   import(chrome.runtime.getURL('wfm-dom-compare.mjs')),
   import(chrome.runtime.getURL('companion-core.mjs')),
  ]);
 }catch{
  await send({type:'WFM_UI_DIAGNOSTIC',code:'wfm_banner_error',reason:'module_import_failed'});
  return;
 }
 const host=document.createElement('div');
 host.style.cssText='position:fixed;z-index:2147483647;left:0;right:0;top:0;pointer-events:none';
 const shadow=host.attachShadow({mode:'closed'});
 shadow.innerHTML=`<style>:host{--bg:#F3F5F9;--sf:#fff;--ln:#E3E8F0;--tx:#0F1B2E;--mu:#5B6679;--ac:#2F5BEA;--as:#E8EEFE;--on:#fff;--qb:#E8EEFE;--qt:#1D3FAE;--bb:#FFEFC0;--bt:#7A4A00;--eb:#F1E6FF;--et:#5B21B6;--wn:#FFF3CF;--wt:#6B4200;--sky:#FFF0D2;--sun:#FBBF5C;--h1:#BFE6D6;--h2:#7FD0B2;--h3:#4FB394}
@media (prefers-color-scheme:dark){:host{--bg:#0D121C;--sf:#151C2A;--ln:#263044;--tx:#E8EDF6;--mu:#9AA7BD;--ac:#8AA5FF;--as:#1F2B4D;--on:#0D121C;--qb:#1F2B4D;--qt:#B7C7FF;--bb:#3A2D0E;--bt:#FFD479;--eb:#2E2150;--et:#D5BEFF;--wn:#3A2D0E;--wt:#FFD479;--sky:#1E2436;--sun:#E9B25A;--h1:#1F3F44;--h2:#1B5A57;--h3:#14706A}}
body{margin:0;font-family:Figtree,system-ui,sans-serif;color:var(--tx)}button{font:inherit;cursor:pointer} .w{width:1280px;height:520px;background:var(--bg);overflow:hidden}.bn{display:flex;align-items:center;gap:18px;padding:14px 32px;background:var(--as);border-bottom:1px solid var(--ln)}.bn p{margin:0;font-size:15px;font-weight:700}.bn label{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px;color:var(--mu)}.bn input{width:18px;height:18px;margin:0}
.go{margin-left:auto;height:44px;padding:0 22px;border-radius:10px;border:0;background:var(--ac);color:var(--on);font-weight:700;font-size:14px}.x{width:44px;height:44px;border:0;background:transparent;color:var(--mu)}.nv{display:flex;gap:24px;align-items:center;height:56px;padding:0 32px;background:var(--sf);border-bottom:1px solid var(--ln);font-size:14px;color:var(--mu);font-weight:600}
.gr{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;padding:28px 32px}.dy{background:var(--sf);border-radius:10px;padding:12px;height:290px;display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:700;color:var(--mu)}.dy i{display:block;border-radius:6px;background:var(--ln)}*{scrollbar-width:thin;scrollbar-color:var(--ln) transparent}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--ln);border-radius:6px}::-webkit-scrollbar-thumb:hover{background:var(--mu)}.bn input{appearance:none;-webkit-appearance:none;width:18px;height:18px;flex:none;border:1.5px solid var(--mu);border-radius:5px;background:var(--sf);display:grid;place-content:center;cursor:pointer;transition:background .12s,border-color .12s}.bn input:checked{background:var(--ac);border-color:var(--ac)}.bn input::after{content:'';width:9px;height:5px;border:2px solid var(--on);border-top:0;border-right:0;transform:rotate(-45deg) translate(1px,-1px);opacity:0}.bn input:checked::after{opacity:1}.bn input:focus-visible{outline:2px solid var(--ac);outline-offset:2px}.bn label{cursor:pointer;color:var(--tx)}.bn{margin:16px 32px 0;padding:14px 16px 14px 14px;gap:16px;border:1px solid var(--ln);border-radius:16px;background:var(--sf);box-shadow:0 6px 20px rgba(15,27,46,.14)}.bn>svg{box-sizing:content-box;padding:10px;background:var(--as);border-radius:14px}.bn p{font-size:15px;line-height:1.3}.bn label{font-size:13px;margin-top:7px}.bn input{background:transparent;border:1.5px solid var(--mu);border-radius:6px}.bn input:hover{border-color:var(--ac)}.bn input:checked{background:var(--ac);border-color:var(--ac)}.go{height:40px;padding:0 20px;border-radius:12px;font-size:14px}.go:hover{filter:brightness(1.08)}.x{width:36px;height:36px;border-radius:10px;flex:none}.x:hover{background:var(--as);color:var(--tx)}.nv{margin-top:16px;border-top:1px solid var(--ln)}.w{position:relative;background:#dde1ea}.bn{position:absolute;z-index:10;top:14px;left:50%;transform:translateX(-50%);margin:0;width:760px;box-sizing:border-box;box-shadow:0 0 0 1px var(--ln),0 14px 36px rgba(10,20,40,.34)}.gh{font:13px Figtree,system-ui,sans-serif;color:#44506a;height:100%}.gt{height:56px;background:#cfd5e2;display:flex;align-items:flex-end;gap:28px;padding:0 24px;border-bottom:1px solid #b9c0d0}.gt u{text-decoration:none;font-size:20px;font-weight:700;color:#555;margin-right:auto;align-self:center}.gt span{padding:8px 4px}.gs{display:flex;gap:24px;padding:14px 24px 8px}.gs .on,.gt .on{color:#1d4ed8;font-weight:600}.gm{margin:0 14px;padding:6px 8px;font-weight:700;background:#e9ecf4;border:1px solid #c9ced9}.gl{margin:0 14px;background:#fff;border:1px solid #c9ced9;border-top:0}.g2{display:flex;height:34px;align-items:center;border-top:1px solid #dfe3ec}.g2 b{width:200px;padding-left:46px;font:600 12px ui-monospace,monospace;color:#44506a}.g2 em{flex:1;position:relative;height:100%}.g2 s{position:absolute;top:5px;height:24px;border-radius:6px;background:#0b35b8}.g2 s.o{background:#8fe38f}

:host{all:initial;font-family:Figtree,system-ui,sans-serif;pointer-events:none}
#banner{position:fixed;z-index:2147483647;display:none;pointer-events:auto;max-width:calc(100vw - 24px)}#banner.show{display:flex}
#banner{color:var(--tx)!important}
#banner #title{color:var(--tx)!important;line-height:1.35}
#banner .go{color:#0d121c!important;background:#8aa5ff!important}
#banner .x{color:var(--mu)!important}
#banner button:focus-visible,#banner input:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
</style><div class="bn" id="banner"><svg aria-hidden="true" height="36" viewBox="0 0 36 36" width="36"><circle cx="18" cy="18" fill="none" r="14" stroke="var(--ln)" stroke-width="5"></circle><circle cx="18" cy="18" fill="none" r="14" stroke="#30D6AC" stroke-dasharray="58 88" stroke-linecap="round" stroke-width="5" transform="rotate(-90 18 18)"></circle></svg><div><p id="title">New schedule detected for today, Monday 19th.</p></div><button class="go" id="apply">Refresh schedule</button><button aria-label="Close" class="x" id="close"><svg aria-hidden="true" fill="none" height="18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="18"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div>`;
 (document.documentElement??document.body).append(host);
 const banner=shadow.querySelector('#banner');

 const shortDate=date=>{
  const d=new Date(`${date}T12:00:00Z`);
  const weekday=new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:'UTC'}).format(d);
  return `${weekday} ${core.ordinal(date)}`;
 };
 let visibleSchedule=false;
 async function refreshBanner(){
  const response=await send({type:'WFM_GET_STATE'});
  if(!response?.ok)return;
  const {domChange,bannerHiddenFingerprint,settings}=response.state;
  const show=visibleSchedule&&Boolean(domChange?.fingerprint)&&domChange.fingerprint!==bannerHiddenFingerprint;
  banner.classList.toggle('show',show);
  if(show){const today=core.localDate(Date.now(),settings.timeZone);shadow.querySelector('#title').textContent=`New schedule detected for today, ${shortDate(today)}.`;}
 }
 shadow.querySelector('#apply').addEventListener('click',async()=>{
  const btn=shadow.querySelector('#apply');btn.disabled=true;btn.textContent='Refreshing…';
  // This is a deliberate user action; no RPC is performed merely by visiting WFM.
  const result=await send({type:'WFM_REFRESH'});
  if(result?.ok){shadow.querySelector('#title').textContent='Schedule refreshed ✓';btn.textContent='Done';setTimeout(()=>{banner.classList.remove('show');btn.textContent='Refresh schedule';btn.disabled=false;},2500);}
  else{btn.textContent='Try again';btn.disabled=false;}
 });
 shadow.querySelector('#close').addEventListener('click',async()=>{
  await send({type:'WFM_DISMISS_BANNER'});await refreshBanner();
 });
 chrome.runtime.onMessage.addListener(message=>{if(message?.type==='WFM_COMPANION_CHANGED')refreshBanner();});
 chrome.storage.onChanged.addListener((change,area)=>{if(area==='local'&&change.wfm_companion_state_v1)refreshBanner();});
 let settings=null,lastSignature='',stable=null,scheduled=null,lastObservationAt=0,lastStatus='';
 async function observe(){
  scheduled=null;
  if(document.hidden || !/^\/wfm\/Agent\/?$/i.test(location.pathname))return;
  const response=await send({type:'WFM_GET_STATE'});
  if(!response?.ok)return;
  settings=response.state.settings;
  const today=core.localDate(Date.now(),settings.timeZone);
  const startDate=new Date(`${today}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate()-(startDate.getUTCDay()+6)%7);
  const reading=reader.readScheduleDom(document);
  visibleSchedule=Boolean(reading.ok);
  if(!reading.ok){
   banner.classList.remove('show');
   if(reading.status!==lastStatus){lastStatus=reading.status;await send({type:'WFM_DOM_STATUS',reason:reading.status});}
   return;
  }
  const observed=compare.safeDomObservation(reading,startDate.toISOString().slice(0,10));
  if(!observed){
   banner.classList.remove('show');
   if(lastStatus!=='incomplete_or_other_week'){lastStatus='incomplete_or_other_week';await send({type:'WFM_DOM_STATUS',reason:lastStatus});}
   return;
  }
  if(lastStatus!=='rendered'){lastStatus='rendered';await send({type:'WFM_DOM_STATUS',reason:'rendered'});}
  const fingerprint=compare.observationId(observed);
  if(fingerprint===lastSignature){await refreshBanner();return;}
  // Wait for two identical rendered snapshots, avoiding observations mid-GWT repaint.
  if(stable!==fingerprint){stable=fingerprint;scheduleObservation(650);return;}
  lastSignature=fingerprint;lastObservationAt=Date.now();
  await send({type:'WFM_DOM_OBSERVED',observation:observed});
  await refreshBanner();
 }
 function scheduleObservation(delay=450){
  if(scheduled!==null)clearTimeout(scheduled);
  scheduled=setTimeout(()=>{observe().catch(()=>send({type:'WFM_UI_DIAGNOSTIC',code:'wfm_banner_error',reason:'dom_observation_failed'}));},delay);
 }
 const observer=new MutationObserver(()=>{
  // Only DOM changes are observed. The extension does not poll WFM.
  if(Date.now()-lastObservationAt<1500)return;
  scheduleObservation();
 });
 observer.observe(document.body??document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','aria-pressed','aria-hidden','title']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleObservation(400);});
 window.addEventListener('hashchange',()=>scheduleObservation(400));
 scheduleObservation(900);
 await refreshBanner();
})();
