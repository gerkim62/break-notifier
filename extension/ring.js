// All-page, isolated shadow-root alert ring. No page JS access or injected eval.
(async()=>{
 let core,theme;
 try{[core,theme]=await Promise.all([import(chrome.runtime.getURL('companion-core.mjs')),import(chrome.runtime.getURL('theme.mjs'))]);}catch(error){
  chrome.runtime.sendMessage({type:'WFM_UI_DIAGNOSTIC',code:'overlay_error',reason:'module_import_failed'});return;
 }
 let queueToastLogic;
 try{queueToastLogic=await import(chrome.runtime.getURL('queue-toast.mjs'));}catch{
  chrome.runtime.sendMessage({type:'WFM_UI_DIAGNOSTIC',code:'overlay_error',reason:'queue_module_import_failed'});return;
 }
 if(!document.documentElement)return;
 const host=document.createElement('div');host.id='wfm-companion-edge-alert';
 host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
 const setOverlayTheme=theme.bindTheme(host);
 const shadow=host.attachShadow({mode:'closed'});
 shadow.innerHTML=`<style>:host{--bg:#F3F5F9;--sf:#fff;--ln:#E3E8F0;--tx:#0F1B2E;--mu:#5B6679;--ac:#2F5BEA;--as:#E8EEFE;--on:#fff;--qb:#E8EEFE;--qt:#1D3FAE;--bb:#FFEFC0;--bt:#7A4A00;--eb:#F1E6FF;--et:#5B21B6;--wn:#FFF3CF;--wt:#6B4200;--sky:#FFF0D2;--sun:#FBBF5C;--h1:#BFE6D6;--h2:#7FD0B2;--h3:#4FB394}
@media (prefers-color-scheme:dark){:host{--bg:#0D121C;--sf:#151C2A;--ln:#263044;--tx:#E8EDF6;--mu:#9AA7BD;--ac:#8AA5FF;--as:#1F2B4D;--on:#0D121C;--qb:#1F2B4D;--qt:#B7C7FF;--bb:#3A2D0E;--bt:#FFD479;--eb:#2E2150;--et:#D5BEFF;--wn:#3A2D0E;--wt:#FFD479;--sky:#1E2436;--sun:#E9B25A;--h1:#1F3F44;--h2:#1B5A57;--h3:#14706A}}
body{margin:0;font-family:Figtree,system-ui,sans-serif;color:var(--tx)}button{font:inherit;cursor:pointer} .pg{position:relative;width:1280px;height:720px;background:var(--bg);overflow:hidden;display:flex}.sb{width:220px;background:var(--sf);padding:28px 20px;display:flex;flex-direction:column;gap:14px}.mn{flex:1;padding:32px 40px;display:flex;flex-direction:column;gap:16px}
.k{height:12px;border-radius:6px;background:var(--ln)}.cd{background:var(--sf);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px}
.glow{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 30px 14px #FBBF24;animation:br 4s ease-in-out infinite}@keyframes br{0%,100%{opacity:.25}50%{opacity:.52}}@media (prefers-reduced-motion:reduce){.glow{animation:none;opacity:.4}}
.pill{color:var(--tx);position:absolute;left:50%;bottom:36px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;height:48px;padding:0 8px 0 8px;border-radius:999px;background:var(--sf);border:1px solid var(--ln);box-shadow:0 10px 30px rgba(15,27,46,.25);font-size:14px;font-weight:600;white-space:nowrap}
.pill i{width:10px;height:10px;border-radius:50%;background:#FBBF24}.pill b{font:600 15px 'IBM Plex Mono',monospace}.sp{width:1px;height:22px;background:var(--ln)}
.sz{cursor:pointer;display:flex;align-items:center;gap:4px;height:34px;padding:0 12px;border:0;border-radius:999px;background:var(--as);color:var(--ac);font-weight:700;font-size:13px}.xx{cursor:pointer;width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:var(--mu);display:grid;place-items:center}
.po{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);padding:12px;border-radius:16px;background:var(--sf);border:1px solid var(--ln);box-shadow:0 10px 30px rgba(15,27,46,.25)}.po .l{font-size:11px;font-weight:700;color:var(--mu);margin-bottom:8px}.po .g{display:flex;gap:6px}
.op{min-width:62px;height:36px;border-radius:10px;border:1px solid var(--ac);background:var(--as);color:var(--ac);font-weight:700;font-size:13px}.op:disabled{border:1px dashed var(--ln);background:transparent;color:var(--mu);opacity:.75;cursor:not-allowed}.po .n{font-size:11px;color:var(--mu);margin-top:8px}*{scrollbar-width:thin;scrollbar-color:var(--ln) transparent}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--ln);border-radius:6px}::-webkit-scrollbar-thumb:hover{background:var(--mu)}.po{padding:14px;border-radius:18px;width:300px;box-sizing:border-box}.po .l{font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}.po .g{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.op{min-width:0;height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px;border:1px solid var(--ln);background:var(--bg);color:var(--tx);transition:border-color .12s,background .12s}.op b{font-size:18px;font-weight:700;line-height:1.1}.op span{font-size:10.5px;color:var(--mu);font-weight:600}.op:hover:not(:disabled){border-color:var(--ac);background:var(--as)}.op:hover:not(:disabled) b{color:var(--ac)}.op:disabled{border:1px solid var(--ln);background:transparent;opacity:.4}.po .n{display:flex;gap:6px;align-items:flex-start;font-size:11.5px;line-height:1.35;margin-top:12px;padding-top:10px;border-top:1px solid var(--ln)}

:host{all:initial;pointer-events:none;font-family:Figtree,system-ui,sans-serif}
#edge{position:fixed;inset:0;display:none;pointer-events:none;z-index:1;animation:none!important;opacity:1!important;
 --edge-color:#34d399;--edge-alpha:.32;--edge-core-alpha:.24;--edge-spread:18px;
 /* A single uniform perimeter: the corner is part of the same rounded inset shadow. */
 box-shadow:inset 0 0 var(--edge-spread) calc(var(--edge-spread) / 3) color-mix(in srgb,var(--edge-color) calc(var(--edge-alpha) * 100%),transparent),
 inset 0 0 0 2px color-mix(in srgb,var(--edge-color) calc(var(--edge-core-alpha) * 100%),transparent)}
#edge.visible{display:block}
#control{position:fixed;z-index:3;pointer-events:auto;display:none}
#control.visible{display:flex}
/* Dynamic-Island morph: retain the same element throughout. No display:none on children. */
#control{box-sizing:border-box;width:var(--pill-width,570px);max-width:calc(100vw - 32px);overflow:hidden;transform:translateX(-50%);transition:width 240ms cubic-bezier(.25,.85,.3,1),height 240ms cubic-bezier(.25,.85,.3,1),padding 240ms cubic-bezier(.25,.85,.3,1),border-radius 240ms cubic-bezier(.25,.85,.3,1),background-color 200ms ease;will-change:width,height}
#control>*{transition:opacity 120ms ease,transform 200ms cubic-bezier(.25,.85,.3,1)}
#control.collapsed{width:22px;height:22px;padding:0;border-radius:50%;gap:0;justify-content:center;cursor:pointer}
#control.collapsed>*:not(#dot){opacity:0;transform:scale(.8);pointer-events:none}
#control.collapsed #dot{display:block;position:absolute;left:50%;top:50%;width:8px;height:8px;min-width:8px;min-height:8px;margin:0;opacity:1;transform:translate(-50%,-50%)}
#control.collapsed:hover,#control.collapsed:focus-within{cursor:pointer}
@media(prefers-reduced-motion:reduce){#control,#control>*{transition:none!important}}
#control{color:var(--tx)} #control .sz{color:var(--ac)}#control #label{display:inline-block}#control #label b{font-weight:700}
#snooze-menu{position:fixed;z-index:4;pointer-events:auto;display:none}
#snooze-menu.visible{display:block}
/* Invisible 16px pointer bridge spans the gap to the Snooze trigger. */
#snooze-menu::after{content:"";position:absolute;top:100%;left:0;right:0;height:16px;pointer-events:auto}
#page-toast{position:fixed;z-index:4;top:18px;left:50%;transform:translateX(-50%);display:none;background:var(--sf);color:var(--tx);border:1px solid var(--ln);box-shadow:0 10px 30px rgba(15,27,46,.25);padding:10px 14px;border-radius:12px;font:12px Figtree,system-ui,sans-serif}#page-toast.visible{display:block}
/* QuickHLR-style queue toast: independent of the page-edge ring. */
#queue-toast{position:fixed;z-index:5;left:50%;bottom:calc(20px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);max-width:calc(100vw - 32px);padding:8px 16px;border-radius:99px;background:#181d21;color:#eef1f4;font:13.5px/1.45 system-ui,sans-serif;text-align:center;overflow-wrap:anywhere;box-shadow:0 4px 12px rgb(0 0 0 / 25%);pointer-events:auto;display:none;cursor:default}
#queue-toast.visible{display:block;animation:toast-pop 120ms ease-out}
/* Independent confirmation, remains visible when snooze hides the edge alert. */
#snooze-feedback{position:fixed;z-index:6;left:50%;bottom:calc(20px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);max-width:calc(100vw - 32px);padding:9px 16px;border-radius:99px;background:#181d21;color:#eef1f4;box-shadow:0 4px 14px rgba(0,0,0,.25);font:600 13px/1.45 system-ui,sans-serif;text-align:center;pointer-events:none;display:none}
#snooze-feedback.visible{display:block;animation:toast-pop 120ms ease-out}
@media(prefers-color-scheme:dark){#snooze-feedback{background:#e9edf0;color:#0e1318}}
#queue-toast:empty{display:none}
@keyframes toast-pop{from{opacity:0;transform:translateX(-50%) scale(.97)}to{opacity:1;transform:translateX(-50%) scale(1)}}
@media(prefers-color-scheme:dark){#queue-toast{background:#e9edf0;color:#0e1318}}
/* Geometry may morph, but palette changes must switch text and surfaces
   together rather than leaving dark buttons beneath light-theme text. */
#control{transition-property:width,height,padding,border-radius}
#snooze-menu .op{transition:none}
#queue-toast,#snooze-feedback{background:var(--tx);color:var(--bg)}
@media(prefers-reduced-motion:reduce){#queue-toast.visible{animation:none}}
#sr{position:absolute;clip:rect(0,0,0,0);width:1px;height:1px;overflow:hidden}
@media (prefers-reduced-motion:reduce){#edge{animation:none!important}}
#hold-widget{position:fixed;z-index:10;pointer-events:auto;display:none;width:68px;height:68px;right:28px;bottom:84px;user-select:none;-webkit-user-select:none;touch-action:none;font-family:Figtree,system-ui,sans-serif}
#hold-widget.visible{display:block;animation:hold-in 180ms cubic-bezier(.25,.85,.3,1)}
@keyframes hold-in{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
#hold-action{all:unset;box-sizing:border-box;position:absolute;inset:0;border-radius:50%;background:var(--sf);border:1px solid var(--ln);box-shadow:0 10px 28px rgba(15,27,46,.22),0 2px 6px rgba(15,27,46,.12);cursor:pointer;display:grid;place-items:center;transition:transform 150ms cubic-bezier(.25,.85,.3,1),box-shadow 200ms,background-color 200ms,border-color 200ms}
#hold-action:hover{transform:scale(1.05)}
#hold-action:active{transform:scale(.95)}
#hold-action:focus-visible{outline:2px solid var(--ac);outline-offset:3px}
#hold-widget.dragging #hold-action{cursor:grabbing;transform:scale(1.08);box-shadow:0 18px 40px rgba(15,27,46,.32),0 4px 10px rgba(15,27,46,.16);transition:none}
#hold-widget .hold-svg{position:absolute;inset:4px;width:calc(100% - 8px);height:calc(100% - 8px);pointer-events:none;transform:rotate(-90deg)}
#hold-widget .hold-track{stroke:var(--ln)}
#hold-widget .hold-live{stroke:var(--ac);transition:stroke-dashoffset 200ms linear,stroke 300ms,opacity 200ms}
#hold-widget .hold-core{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
#hold-widget .hold-time{font:700 15px/1 'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--tx);letter-spacing:-.02em}
#hold-widget .hold-hint{display:flex;align-items:center;gap:3px;font:800 8.5px/1 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
#hold-widget .hold-hint svg{width:7px;height:7px;fill:currentColor}
#hold-widget.idle .hold-live{opacity:.4}
#hold-widget.idle .hold-hint{color:var(--ac)}
#hold-widget.running .hold-hint{color:var(--mu)}
#hold-widget.warn .hold-live{stroke:#f59e0b}
#hold-widget.warn .hold-time{color:#d97706}
#hold-widget.overdue #hold-action{border-color:#f43f5e;background:color-mix(in srgb,#f43f5e 10%,var(--sf));animation:hold-pulse 1.1s ease-in-out infinite}
#hold-widget.overdue .hold-live{stroke:#f43f5e}
#hold-widget.overdue .hold-time,#hold-widget.overdue .hold-hint{color:#f43f5e}
@keyframes hold-pulse{0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,.45),0 10px 28px rgba(15,27,46,.22)}50%{box-shadow:0 0 0 9px rgba(244,63,94,0),0 10px 28px rgba(15,27,46,.3)}}
#hold-widget .hold-close{all:unset;box-sizing:border-box;position:absolute;top:-3px;right:-3px;width:20px;height:20px;border-radius:50%;background:var(--sf);border:1px solid var(--ln);color:var(--mu);display:grid;place-items:center;cursor:pointer;opacity:0;transform:scale(.6);box-shadow:0 2px 6px rgba(15,27,46,.18);transition:opacity 140ms,transform 160ms cubic-bezier(.25,.85,.3,1),color 140ms,background-color 140ms}
#hold-widget .hold-close svg{width:10px;height:10px}
#hold-widget:hover .hold-close,#hold-widget .hold-close:focus-visible{opacity:1;transform:scale(1)}
#hold-widget.dragging .hold-close{opacity:0}
#hold-widget .hold-close:hover{color:var(--tx);background:var(--bg)}
@media(prefers-reduced-motion:reduce){#hold-widget.visible,#hold-widget.overdue #hold-action{animation:none}#hold-action,#hold-widget .hold-live{transition:none}}
#tool-toast{position:fixed;z-index:7;left:50%;top:calc(18px + env(safe-area-inset-top, 0px));transform:translateX(-50%);display:none;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:8px 8px 8px 12px;border-radius:999px;background:var(--sf);color:var(--tx);border:1px solid var(--ln);box-shadow:0 12px 32px rgba(15,27,46,.22);font:600 13.5px/1.3 Figtree,system-ui,sans-serif;pointer-events:auto}
#tool-toast.visible{display:flex;animation:tool-toast-in 220ms cubic-bezier(.25,.85,.3,1)}
#tool-toast .tt-ico{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,#8b5cf6 16%,transparent);color:#8b5cf6;flex:none}
#tool-toast .tt-ico svg{width:15px;height:15px}
#tool-toast .tt-x{all:unset;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:var(--mu);cursor:pointer}
#tool-toast .tt-x:hover{background:var(--bg);color:var(--tx)}
@keyframes tool-toast-in{from{opacity:0;transform:translate(-50%,-8px) scale(.97)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
@media(prefers-reduced-motion:reduce){#tool-toast.visible{animation:none}}
</style><div class="glow" id="edge"></div><div aria-label="Snooze for" class="po" id="snooze-menu" role="menu"><div class="l">Snooze for</div><div class="g"><button class="op" data-min="1" title="Snooze 1 minute(s)"><b>1</b><span>min</span></button><button class="op" data-min="2" title="Snooze 2 minute(s)"><b>2</b><span>min</span></button><button class="op" data-min="5" disabled="" title="Snooze 5 minute(s)"><b>5</b><span>min</span></button><button class="op" data-min="10" disabled="" title="Snooze 10 minute(s)"><b>10</b><span>min</span></button></div><div class="n"><svg aria-hidden="true" fill="none" height="13" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" style="flex:none;margin-top:1px" viewBox="0 0 24 24" width="13"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h0"></path></svg><span>5 and 10 min are longer than the time left.</span></div></div><div aria-label="Break alert" class="pill" id="control" role="group"><i id="dot"></i><span id="label">Tea Break 2 in <b>2:10</b></span><span class="sp"></span><button class="sz" id="snooze-toggle" aria-expanded="false" aria-controls="snooze-menu">Snooze<svg aria-hidden="true" fill="none" height="12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="12"><path d="M6 15l6-6 6 6"></path></svg></button><button aria-label="Close island" title="Close island" class="xx" id="dismiss"><svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div><div id="page-toast" role="status"></div><div id="queue-toast" role="status" aria-live="polite" aria-atomic="true"></div><div id="snooze-feedback" role="status" aria-live="polite" aria-atomic="true"></div><span id="sr" aria-live="polite"></span><div id="hold-widget" role="group" aria-label="Hold timer"><button type="button" id="hold-action" aria-label="Start 1 minute hold timer"><svg class="hold-svg" viewBox="0 0 36 36" aria-hidden="true"><circle class="hold-track" cx="18" cy="18" r="16" fill="none" stroke-width="2.5"></circle><circle class="hold-live" cx="18" cy="18" r="16" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="100.53 100.53" stroke-dashoffset="0"></circle></svg><span class="hold-core"><span class="hold-time" id="hold-time">1:00</span><span class="hold-hint" id="hold-hint"></span></span></button><button type="button" class="hold-close" id="hold-close" aria-label="Hide hold timer" title="Hide hold timer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div><div id="tool-toast" role="status" aria-live="polite"><span class="tt-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"></path><rect x="3" y="14" width="4" height="6" rx="1.5"></rect><rect x="17" y="14" width="4" height="6" rx="1.5"></rect></svg></span><span class="tt-text" id="tool-toast-text"></span><button type="button" class="tt-x" id="tool-toast-close" aria-label="Dismiss"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div>`
 document.documentElement.appendChild(host);
 const edge=shadow.querySelector('#edge'),menu=shadow.querySelector('#snooze-menu'),pill=shadow.querySelector('#control'),label=shadow.querySelector('#label'),dot=shadow.querySelector('#dot'),sr=shadow.querySelector('#sr'),pageToast=shadow.querySelector('#page-toast'),queueToast=shadow.querySelector('#queue-toast'),snoozeFeedback=shadow.querySelector('#snooze-feedback'),holdWidget=shadow.querySelector('#hold-widget'),holdTime=shadow.querySelector('#hold-time'),holdHint=shadow.querySelector('#hold-hint'),holdBtn=shadow.querySelector('#hold-action'),holdClose=shadow.querySelector('#hold-close'),holdArc=shadow.querySelector('.hold-live'),toolToast=shadow.querySelector('#tool-toast'),toolToastText=shadow.querySelector('#tool-toast-text');
 const request=message=>new Promise(resolve=>chrome.runtime.sendMessage(message,result=>{if(chrome.runtime.lastError)resolve(null);else resolve(result);}));
 let forceCompactAlertId=null, compactUntilPointerLeaves=false, snoozePending=false, snoozeErrorUntil=0;
 let snoozeFeedbackTimer=null;
 function showSnoozeFeedback(message){
  clearTimeout(snoozeFeedbackTimer);
  snoozeFeedback.textContent=message;
  snoozeFeedback.classList.remove('visible');
  void snoozeFeedback.offsetWidth;
  snoozeFeedback.classList.add('visible');
  snoozeFeedbackTimer=setTimeout(()=>{snoozeFeedback.classList.remove('visible');snoozeFeedback.textContent='';},3500);
 }

 let state=null,lastAlert=null,afterglowUntil=0,lastInteraction=Date.now(),lastAnnouncement='',cachedAlert=null,cachedAlertAt=0;
 let previousQueueTick=null,lastQueueSwitchId=null,queueEvents=[],queueEventsDate='';
 const toastClock=new queueToastLogic.PausableToastTimer({onExpire:()=>{queueToast.textContent='';queueToast.classList.remove('visible');}});
 const inView=()=>document.visibilityState==='visible'&&document.hasFocus();
 const updateVisibility=()=>{
  toastClock.setInView(inView());
  // Never turn a queue switch from a hidden/minimized tab into a late notification.
  previousQueueTick=null;
 };
 queueToast.addEventListener('mouseenter',()=>toastClock.setHovered(true));
 queueToast.addEventListener('mouseleave',()=>toastClock.setHovered(false));
 document.addEventListener('visibilitychange',updateVisibility);
 window.addEventListener('focus',updateVisibility);
 window.addEventListener('blur',updateVisibility);
 toastClock.setInView(inView());
 function showQueueToast(change){
  if(!change||!inView())return;
  queueToast.textContent=`${change.from} → ${change.to}`;
  queueToast.classList.remove('visible');
  void queueToast.offsetWidth; // Restart only the 120 ms entrance animation.
  queueToast.classList.add('visible');
  toastClock.show();
 }
 function evaluateQueueChange(now,settings){
  if(!settings.queueSwitchToast||!state?.week){previousQueueTick=null;if(toastClock.active){toastClock.cancel();queueToast.textContent='';queueToast.classList.remove('visible');}return;}
  const date=core.localDate(now,settings.timeZone);
  if(queueEventsDate!==date){
   queueEvents=queueToastLogic.queueSwitches(state.week,settings,now);
   queueEventsDate=date;
   previousQueueTick=null;
  }
  if(!inView()){previousQueueTick=null;return;}
  const change=queueToastLogic.dueQueueSwitch(queueEvents,previousQueueTick,now);
  previousQueueTick=now;
  if(change&&change.id!==lastQueueSwitchId){lastQueueSwitchId=change.id;showQueueToast(change);}
 }
 async function reload(){const result=await request({type:'WFM_GET_STATE'});if(result?.ok){state=result.state;cachedAlertAt=0;queueEventsDate='';paint();}}
 function color(p){
  // Saturated bridge from teal to amber avoids the muddy yellow-green midpoint.
  const c=core.alertColor(p);const f=Math.round(c.fraction*100);
  if(p>.35&&p<.6){
   const checkpoints=[{p:.35,c:'#2dd4bf'},{p:.45,c:'#64a9ff'},{p:.52,c:'#ff9ab4'},{p:.6,c:'#fbbf24'}];
   for(let i=1;i<checkpoints.length;i++)if(p<=checkpoints[i].p){const a=checkpoints[i-1],b=checkpoints[i],n=Math.round((p-a.p)/(b.p-a.p)*100);return `color-mix(in oklch, ${a.c} ${100-n}%, ${b.c} ${n}%)`;}
  }
  return `color-mix(in oklch, ${c.from} ${100-f}%, ${c.to} ${f}%)`;
 }
 let breathPreviousTime=0,breathPhaseValue=0;
 function breathPhase(now,period){
  const delta=breathPreviousTime?Math.min(250,Math.max(0,now-breathPreviousTime)):0;
  breathPreviousTime=now;
  breathPhaseValue=(breathPhaseValue+delta*2*Math.PI/(1000*period))%(Math.PI*2);
  return breathPhaseValue;
 }
 const CIRCUMFERENCE = 100.53;
 let isHoldDragging=false, holdDragStartX=0, holdDragStartY=0, holdWidgetStartX=0, holdWidgetStartY=0, holdHasDragged=false;
 holdWidget.addEventListener('pointerdown',e=>{
  if(e.target.closest('#hold-close'))return;
  holdHasDragged=false;
  holdDragStartX=e.clientX;holdDragStartY=e.clientY;
  const rect=holdWidget.getBoundingClientRect();
  holdWidgetStartX=rect.left;holdWidgetStartY=rect.top;
 });
 holdWidget.addEventListener('pointermove',e=>{
  if(e.buttons===0){if(isHoldDragging)finishHoldDrag(e);return;}
  const dx=e.clientX-holdDragStartX, dy=e.clientY-holdDragStartY;
  if(!holdHasDragged&&Math.hypot(dx,dy)>4){
   holdHasDragged=true;
   isHoldDragging=true;
   try{holdWidget.setPointerCapture(e.pointerId);}catch{}
   holdWidget.classList.add('dragging');
  }
  if(!isHoldDragging)return;
  const maxX=Math.max(10,window.innerWidth-holdWidget.offsetWidth-10);
  const maxY=Math.max(10,window.innerHeight-holdWidget.offsetHeight-10);
  const newX=Math.max(10,Math.min(maxX,holdWidgetStartX+dx));
  const newY=Math.max(10,Math.min(maxY,holdWidgetStartY+dy));
  holdWidget.style.left=`${newX}px`;
  holdWidget.style.top=`${newY}px`;
  holdWidget.style.right='auto';
  holdWidget.style.bottom='auto';
 });
 const finishHoldDrag=async e=>{
  if(!isHoldDragging)return;
  isHoldDragging=false;
  try{holdWidget.releasePointerCapture(e.pointerId);}catch{}
  holdWidget.classList.remove('dragging');
  if(holdHasDragged){
   const rect=holdWidget.getBoundingClientRect();
   await request({type:'WFM_TOOLS',action:'hold_position',position:{x:Math.round(rect.left),y:Math.round(rect.top)}});
   setTimeout(()=>{holdHasDragged=false;},60);
  }
 };
 holdWidget.addEventListener('pointerup',finishHoldDrag);
 holdWidget.addEventListener('pointercancel',finishHoldDrag);

 holdBtn.addEventListener('click',async()=>{
  if(holdHasDragged){holdHasDragged=false;return;}
  const running=Boolean(state?.holdEndsAt);
  await request({type:'WFM_TOOLS',action:running?'hold_stop':'hold_start'});
  await reload();
 });

 if(holdClose){
  holdClose.addEventListener('click',async e=>{
   e.stopPropagation();
   await request({type:'WFM_TOOLS',action:'toggle_hold_timer',enabled:false});
   await reload();
  });
 }

 let toolToastTimer=null;
 function showToolToast(text,duration=6000){
  clearTimeout(toolToastTimer);
  if(toolToastText)toolToastText.textContent=text;
  if(!toolToast)return;
  toolToast.classList.remove('visible');
  void toolToast.offsetWidth;
  toolToast.classList.add('visible');
  toolToastTimer=setTimeout(()=>{toolToast.classList.remove('visible');if(toolToastText)toolToastText.textContent='';},duration);
 }
 const toolToastClose=shadow.querySelector('#tool-toast-close');
 if(toolToastClose){
  toolToastClose.addEventListener('click',()=>{
   clearTimeout(toolToastTimer);
   if(toolToast)toolToast.classList.remove('visible');
   if(toolToastText)toolToastText.textContent='';
  });
 }

 function paintHoldWidget(now, settings){
  const timer=state?.holdTimer;
  const inShift=core.isDuringShift(state?.week, settings, now);
  if(!timer?.enabled || !inShift){
   holdWidget.classList.remove('visible');
   return;
  }
  holdWidget.classList.add('visible');
  if(!isHoldDragging&&timer.position&&typeof timer.position.x==='number'&&typeof timer.position.y==='number'){
   const maxX=Math.max(10,window.innerWidth-holdWidget.offsetWidth-10);
   const maxY=Math.max(10,window.innerHeight-holdWidget.offsetHeight-10);
   const posX=Math.max(10,Math.min(maxX,timer.position.x));
   const posY=Math.max(10,Math.min(maxY,timer.position.y));
   holdWidget.style.left=`${posX}px`;
   holdWidget.style.top=`${posY}px`;
   holdWidget.style.right='auto';
   holdWidget.style.bottom='auto';
  }
  const ends=state?.holdEndsAt;
  if(!ends){
   holdWidget.className='visible idle';
   if(isHoldDragging)holdWidget.classList.add('dragging');
   holdTime.textContent='1:00';
   if(holdHint)holdHint.innerHTML='<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"></polygon></svg><span>Start</span>';
   holdArc.setAttribute('stroke-dashoffset','0');
   holdBtn.setAttribute('aria-label','Start 1 minute hold timer');
   return;
  }
  if(now<ends){
   const remaining=ends-now;
   const seconds=Math.ceil(remaining/1000);
   const m=Math.floor(seconds/60),s=seconds%60;
   holdWidget.className='visible running'+(seconds<=15?' warn':'');
   if(isHoldDragging)holdWidget.classList.add('dragging');
   holdTime.textContent=`${m}:${String(s).padStart(2,'0')}`;
   if(holdHint)holdHint.innerHTML='<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg><span>Stop</span>';
   const p=Math.max(0,Math.min(1,remaining/60000));
   const offset=(1-p)*CIRCUMFERENCE;
   holdArc.setAttribute('stroke-dashoffset',String(offset));
   holdBtn.setAttribute('aria-label',`Stop hold timer (${seconds} seconds left)`);
  }else{
   const overdue=Math.floor((now-ends)/1000);
   const m=Math.floor(overdue/60),s=overdue%60;
   holdWidget.className='visible overdue';
   if(isHoldDragging)holdWidget.classList.add('dragging');
   holdTime.textContent=`-${m}:${String(s).padStart(2,'0')}`;
   if(holdHint)holdHint.innerHTML='<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg><span>Stop</span>';
   holdArc.setAttribute('stroke-dashoffset',String(CIRCUMFERENCE));
   holdBtn.setAttribute('aria-label',`Stop hold timer (${overdue} seconds overdue)`);
  }
 }
 function hide(){edge.classList.remove('visible');pill.classList.remove('visible');menu.classList.remove('visible');pageToast.classList.remove('visible');}
 function paint(){
  const now=Date.now();const settings=core.settingsWithDefaults(state?.settings);
  setOverlayTheme(settings.theme);
  paintHoldWidget(now, settings);
  evaluateQueueChange(now,settings);
  if(!settings.showRing){hide();lastAlert=null;return;}
  if(now-cachedAlertAt>=1000||cachedAlertAt===0){cachedAlert=core.selectedAlert(state?.week,settings,state,now);cachedAlertAt=now;}
  const alert=cachedAlert?{...cachedAlert,remaining:cachedAlert.at-now}:null;
  if(!alert||alert.remaining<=0){
   pill.classList.remove('visible');menu.classList.remove('visible');pageToast.classList.remove('visible');
   if(lastAlert&&lastAlert.at<=now&&lastAlert.at+2000>now)afterglowUntil=lastAlert.at+2000;
   lastAlert=null;
   if(afterglowUntil>now){edge.classList.add('visible');edge.style.setProperty('--edge-color','#f43f5e');edge.style.setProperty('--edge-spread','42px');edge.style.setProperty('--edge-alpha','0.95');edge.style.setProperty('--edge-core-alpha','0.85');return;}
   edge.classList.remove('visible');return;
  }
  const p=1-alert.remaining/alert.lead;
  const eased=Math.pow(Math.max(0,Math.min(1,p)),2.2);
  const period=5.5-4.6*eased;
  const min=.14+.49*eased,max=.33+.71*eased;
  const reduced=settings.reducedMotion==='on'||(settings.reducedMotion==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Integrate phase over elapsed clock time: changing frequency must not jump the wave.
  // Within each frame the breathing speed smoothly follows remaining time.
  const wave=reduced?1:(1+Math.sin(breathPhase(now,period)))/2;
  const alpha=min+(max-min)*wave;
  const spread=18+46*eased;
  const c=color(p);
  edge.classList.add('visible');
  edge.style.setProperty('--edge-color',c);
  edge.style.setProperty('--edge-spread',`${spread.toFixed(1)}px`);
  edge.style.setProperty('--edge-alpha',String(alpha));
  edge.style.setProperty('--edge-core-alpha',String(Math.max(.18,alpha*.82)));
  pill.classList.add('visible');
  const toast=state.toast?.expiresAt>now?state.toast:null;pageToast.textContent=toast?.text??'';pageToast.classList.toggle('visible',Boolean(toast));
  if(lastAlert?.id!==alert.id){lastInteraction=now;forceCompactAlertId=null;compactUntilPointerLeaves=false;menu.classList.remove('visible');pill.classList.remove('collapsed');pill.style.removeProperty('--pill-width');}
  label.replaceChildren(document.createTextNode(`${alert.name} in `), Object.assign(document.createElement('b'),{textContent:core.formatDuration(alert.remaining,{seconds:true})}));
  dot.style.background=c;
  // Measure once per alert, not on every 125ms tick. Repeated width writes
  // while the pill is expanding restart its transition and cause a slow creep.
  if(!pill.style.getPropertyValue('--pill-width')&&!pill.classList.contains('collapsed')){
   // Settle the initial geometry before it can receive pointer input. Otherwise
   // the Snooze trigger moves sideways between pointerdown and click.
   pill.style.transition='none';
   const children=[...pill.children];
   const gap=Number.parseFloat(getComputedStyle(pill).columnGap)||10;
   const desired=children.reduce((width,child)=>width+child.getBoundingClientRect().width,0)+gap*Math.max(0,children.length-1)+18;
   pill.style.setProperty('--pill-width',`${Math.min(innerWidth-32,Math.ceil(desired))}px`);
   void pill.offsetWidth;
   pill.style.removeProperty('transition');
  }
  const shouldCollapse=forceCompactAlertId===alert.id || (now-lastInteraction>6000&&!pill.matches(':hover')&&!pill.matches(':focus-within')&&!menu.classList.contains('visible'));
  pill.classList.toggle('collapsed',shouldCollapse);
  if(shouldCollapse&&menu.classList.contains('visible'))setSnoozeMenu(false);
  for(const b of shadow.querySelectorAll('button[data-min]'))b.disabled=Number(b.dataset.min)*60000>=alert.remaining;
  const disabledMinutes=[...menu.querySelectorAll('button[data-min]:disabled')].map(b=>b.dataset.min);
  const note=menu.querySelector('.n span');
  if(note&&!snoozePending&&Date.now()>snoozeErrorUntil)note.textContent=disabledMinutes.length?`${disabledMinutes.join(' and ')} min ${disabledMinutes.length===1?'is':'are'} longer than the time left.`:'Choose how many minutes to snooze the alert.';
  if(alert.id!==lastAnnouncement||Math.round(alert.remaining/60000)!==Math.round(lastAlert?.remaining/60000)){
   if(alert.id!==lastAnnouncement)sr.textContent=`${alert.name} approaching`;lastAnnouncement=alert.id;
  }
  lastAlert=alert;
 }
 function expandIsland(){
  if(compactUntilPointerLeaves)return;
  forceCompactAlertId=null;lastInteraction=Date.now();pill.classList.remove('collapsed');
 }
 pill.addEventListener('pointerenter',expandIsland);
 pill.addEventListener('pointermove',expandIsland);
 pill.addEventListener('focusin',expandIsland);
 pill.addEventListener('pointerleave',()=>{compactUntilPointerLeaves=false;});
 // Hover previews Snooze. A short exit grace lets the pointer cross the gap
 // between the pill and its independently positioned menu without flicker.
 const snoozeToggle=shadow.querySelector('#snooze-toggle');
 let menuCloseTimer=null;
 function cancelMenuClose(){if(menuCloseTimer!==null){clearTimeout(menuCloseTimer);menuCloseTimer=null;}}
 function setSnoozeMenu(open){
  cancelMenuClose();
  if(!pill.classList.contains('visible')||pill.classList.contains('collapsed'))open=false;
  menu.classList.toggle('visible',open);
  snoozeToggle.setAttribute('aria-expanded',String(open));
  if(open)lastInteraction=Date.now();
 }
 function scheduleMenuClose(){
  cancelMenuClose();
  // Pointer gaps are bridged by #snooze-menu::after. The fallback delay
  // tolerates diagonal movement without keeping the menu stuck open.
  menuCloseTimer=setTimeout(()=>{
   menuCloseTimer=null;
   if(snoozePending)return;
   // Mouse clicks give buttons focus too; only keyboard-visible focus should
   // keep a menu open after the mouse leaves it.
   const keyboardFocus=snoozeToggle.matches(':focus-visible')||Boolean(menu.querySelector(':focus-visible'));
   if(!snoozeToggle.matches(':hover')&&!menu.matches(':hover')&&!keyboardFocus)setSnoozeMenu(false);
  },280);
 }
 snoozeToggle.addEventListener('pointerenter',()=>setSnoozeMenu(true));
 snoozeToggle.addEventListener('pointerleave',scheduleMenuClose);
 // Focus alone must not open the menu: Enter/Space generates a click, which
 // previously toggled an already focus-opened menu shut again.
 menu.addEventListener('pointerenter',()=>{cancelMenuClose();lastInteraction=Date.now();});
 menu.addEventListener('pointermove',()=>{lastInteraction=Date.now();});
 menu.addEventListener('pointerleave',scheduleMenuClose);
 menu.addEventListener('focusin',cancelMenuClose);
 menu.addEventListener('focusout',scheduleMenuClose);
 // The root is closed: document-level composedPath() intentionally hides
 // #snooze-menu and #control, so checking those nodes there dismisses the menu
 // even when the pointer is inside it. Inspect internal clicks at the shadow
 // root, and use the host boundary at document level for genuine outside clicks.
 shadow.addEventListener('pointerdown',event=>{
  const path=event.composedPath();
  if(menu.classList.contains('visible')&&!path.includes(menu)&&!path.includes(pill))setSnoozeMenu(false);
 });
 document.addEventListener('pointerdown',event=>{
  if(menu.classList.contains('visible')&&!event.composedPath().includes(host))setSnoozeMenu(false);
 });
 pill.addEventListener('click',async(event)=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.id==='snooze-toggle'){
   // Hover may have already opened the menu before mouse click. Never turn
   // that click into an accidental close; keyboard activation can toggle.
   setSnoozeMenu(true);
   if(event.detail===0)menu.querySelector('button:not(:disabled)')?.focus();
   return;
  }
  if(button.id!=='dismiss')return;
  const active=core.selectedAlert(state?.week,core.settingsWithDefaults(state?.settings),state,Date.now());if(!active)return;
  forceCompactAlertId=active.id;compactUntilPointerLeaves=true;
  setSnoozeMenu(false);
  pill.classList.add('collapsed');
  // X is purely a visual morph. It does not dismiss or snooze the alert.
 });
 menu.addEventListener('click',async(event)=>{
  const button=event.target.closest('button[data-min]');if(!button||button.disabled||snoozePending)return;
  const active=core.selectedAlert(state?.week,core.settingsWithDefaults(state?.settings),state,Date.now());if(!active)return;
  snoozePending=true;
  cancelMenuClose();
  button.setAttribute('aria-busy','true');
  try{
   const response=await request({type:'WFM_SNOOZE',id:active.id,minutes:Number(button.dataset.min)});
   if(response?.ok){
    setSnoozeMenu(false);
    pill.classList.remove('visible');
    showSnoozeFeedback(`Snoozed for ${button.dataset.min} min`);
    await reload();
   }else{
    const note=menu.querySelector('.n span');
    snoozeErrorUntil=Date.now()+3500;
    if(note)note.textContent=response?.reason==='snooze_exceeds_remaining'?'Not enough time left to snooze that long.':'Could not snooze. Please try again.';
    await reload();
    // reload() repaints but leaves the menu open so the failure is visible.
    menu.classList.add('visible');lastInteraction=Date.now();
   }
  }finally{button.removeAttribute('aria-busy');snoozePending=false;}
 });
 for(const b of menu.querySelectorAll('button[data-min]')){b.type='button';b.setAttribute('role','menuitem');b.tabIndex=-1;}
 snoozeToggle.setAttribute('aria-haspopup','menu');
 shadow.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&menu.classList.contains('visible')){event.preventDefault();setSnoozeMenu(false);snoozeToggle.focus();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const target=event.target;
  if(target!==snoozeToggle&&!menu.contains(target))return;
  event.preventDefault();setSnoozeMenu(true);
  const options=[...menu.querySelectorAll('button:not(:disabled)')];if(!options.length)return;
  const index=options.indexOf(target),next=event.key==='Home'?0:event.key==='End'?options.length-1:index<0?(event.key==='ArrowUp'?options.length-1:0):(index+(event.key==='ArrowUp'?-1:1)+options.length)%options.length;
  options[next].focus();
 });
 window.addEventListener('resize',()=>{pill.style.removeProperty('--pill-width');paint();});
 chrome.runtime.onMessage.addListener(message=>{
  if(message?.type==='WFM_COMPANION_CHANGED')reload();
  if(message?.type==='WFM_PAGE_TOAST')showToolToast(message.text||'Reminder');
 });
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.wfm_companion_state_v1){state=changes.wfm_companion_state_v1.newValue;cachedAlertAt=0;queueEventsDate='';paint();}});
 await reload();
 // The page timer only draws CSS; the service worker handles network and persisted snoozes.
 setInterval(paint,125);
 chrome.runtime.sendMessage({type:'WFM_UI_DIAGNOSTIC',code:'content_script_loaded'});
})();
