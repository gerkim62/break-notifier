// Passive WFM visible schedule reader. Never clicks, navigates or fetches.
// Genesys WFM 8.5.218.31, English My schedule DOM adapter.
// Run in a content script / page with DOM access, not a service worker.
const DAY = 86400000;
const daySelector = 'button[title^="Expand/collapse, "]';
const header = 'Paid hours|Start time|End time|Schedule details';
const fail = (status, message) => ({ok:false,status,message,source:'dom'});
export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Use YYYY-MM-DD');
  const d = new Date(value+'T00:00:00Z');
  if (!Number.isFinite(+d) || d.toISOString().slice(0,10)!==value) throw Error('Invalid date');
  return d;
}
const addDays = (date,n) => new Date(+isoDate(date)+n*DAY).toISOString().slice(0,10);
export function weekStart(value) {
  const d=isoDate(value); return addDays(value,-((d.getUTCDay()+6)%7));
}
function displayDate(value) {
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(value);
  if(!m) throw Error('Unsupported displayed date: '+value);
  // Observed UI uses two-digit years. Reject century-ambiguous target years at entry.
  const s=`20${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  isoDate(s); return s;
}
export function parseTime(raw) {
  const m=/^(\+)?(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(raw);
  if(!m || +m[2]<1 || +m[2]>12 || +m[3]>59) throw Error('Unsupported time: '+raw);
  return {minute:(+m[2]%12)*60+(m[4].toUpperCase()==='PM'?720:0)+ +m[3],dayOffset:m[1]?1:0};
}
export function normalizeRows(date, rows) {
  return rows.map((raw,index)=>{
    if(raw.length!==4) throw Error('Unexpected detail columns');
    const [paid,start,end,label]=raw;
    const a=parseTime(start),b=parseTime(end);
    const duration=b.dayOffset*1440+b.minute-a.dayOffset*1440-a.minute;
    if(duration<0) throw Error('End precedes start without next-day marker');
    if(paid && !/^\d+:\d{2}$/.test(paid)) throw Error('Unsupported paid hours');
    if(paid && +paid.split(':')[1]>59) throw Error('Invalid paid minutes');
    const stamp=t=>addDays(date,t.dayOffset)+'T'+String(Math.floor(t.minute/60)).padStart(2,'0')+':'+String(t.minute%60).padStart(2,'0')+':00';
    return {kind:index===0?'summary':'activity',label,startLocal:stamp(a),endLocal:stamp(b),
      startDayOffset:a.dayOffset,endDayOffset:b.dayOffset,wallClockMinutes:duration,
      paidMinutes:paid?+paid.split(':')[0]*60+ +paid.split(':')[1]:null,raw:[...raw]};
  });
}
const visible=e=>!!e && e.getClientRects().length>0 && getComputedStyle(e).visibility!=='hidden';
export function readScheduleDom(doc=document) {
  const all=s=>[...doc.querySelectorAll(s)];
  const dialogs=all('[role="alertdialog"]').filter(visible).map(e=>e.textContent.trim());
  if(/\/login\/?$/i.test(doc.location?.pathname||'') || all('input[type="password"]').some(visible) || dialogs.some(t=>/session has timed out|log in again/i.test(t)))
    return fail('not-authenticated','Sign in again. No cached schedule returned.');
  if(dialogs.length) return fail('blocked',dialogs.join('\n'));
  const my=all('button[title="My schedule"]').find(visible);
  if(!my || my.getAttribute('aria-pressed')!=='true') return fail('wrong-view','Open My schedule.');
    const controls=all(daySelector);
  if(!controls.length) return fail('loading-or-empty','No date rows available yet.');
  try {
    const days=controls.map(b=>{
      const date=displayDate(b.title.replace('Expand/collapse, ',''));
      // Unpublished dates retain a hidden button. Never ascend to a neighbouring day.
      if(b.getAttribute('aria-hidden')==='true'||b.style.display==='none') return {date,status:'unavailable',records:[]};
      let p=b.parentElement;
      while(p && p.querySelectorAll(daySelector).length===1){
        const h=[...p.querySelectorAll('div')].find(e=>!e.children.length && e.textContent.trim()==='Paid hours');
        if(h){
          const rows=[...h.parentElement.parentElement.parentElement.children].map(r=>[...r.children].slice(1).map(c=>c.textContent.trim()));
          if(rows.shift()?.join('|')!==header || !rows.length) throw Error('Unexpected details layout');
          return {date,status:'available',records:normalizeRows(date,rows)};
        }
        p=p.parentElement;
      }
      throw Error('No details found for '+date);
    });
    if(new Set(days.map(d=>d.date)).size!==days.length) throw Error('Duplicate date rows');
    days.sort((a,b)=>a.date.localeCompare(b.date));
    return {ok:true,status:'ok',source:'dom',timezone:null,
      authentication:'no-visible-login-or-timeout',freshness:'rendered-snapshot',days};
  } catch(e){return fail('unsupported-dom',e.message);}
}
