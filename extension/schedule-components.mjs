import {buildDaySegments} from './companion-core.mjs';
import {icon} from './ui-icons.mjs';

const make=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
export const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const label=(date,options)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...options}).format(new Date(date+'T12:00:00Z'));
const duration=ms=>{const m=Math.max(0,Math.round(ms/60000));return m<60?m+' min':Math.floor(m/60)+'h'+(m%60?' '+String(m%60).padStart(2,'0')+'m':'');};
const special=s=>!['queue','work','shift'].includes(s.type);

export function weekPicker(container,{start,selected,today,week,settings,onSelect}){
 container.className='week-picker';
 const reuse=container.querySelector('#track')?.dataset.week===start;
 if(!reuse)container.innerHTML=`<div class="week-bar"><div class="week-range"><span id="range"></span></div><button type="button" class="today-chip" id="today">Today</button><button class="arrow" id="prev" type="button" aria-label="Previous week">${icon('back',16,2)}</button><button class="arrow" id="next" type="button" aria-label="Next week">${icon('next',16,2)}</button></div><div class="track" id="track" role="group" aria-label="Days of the week"><div class="thumb" id="thumb" aria-hidden="true"></div></div>`;
 const end=addDays(start,6),crossYear=start.slice(0,4)!==end.slice(0,4);
 container.querySelector('#range').textContent=label(start,{month:'short'})+' '+Number(start.slice(8))+(crossYear?' '+start.slice(0,4):'')+' – '+(start.slice(0,7)===end.slice(0,7)?'':label(end,{month:'short'})+' ')+Number(end.slice(8))+(crossYear?' '+end.slice(0,4):'');
 const track=container.querySelector('#track');
 track.dataset.week=start;
 for(let i=0;i<7;i++){
  const date=addDays(start,i),day=week?.days?.find(d=>d.date===date),off=day?.kind==='day_off',unknown=!day||day.kind==='unknown';
  const b=reuse?track.querySelector(`[data-date="${date}"]`):make('button');b.className='day'+(off?' off':'')+(unknown?' unknown':'')+(date===today?' today':'');b.type='button';b.dataset.date=date;
  b.setAttribute('aria-pressed',String(date===selected));
  if(date===today)b.setAttribute('aria-current','date');
  const breaks=buildDaySegments(day,settings).filter(s=>s.type==='break').length;
  b.setAttribute('aria-label',label(date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(off?', day off':unknown?', schedule not detected':`, ${breaks} breaks`)+(date===today?', today':''));
  if(!reuse)b.append(make('span','dow',label(date,{weekday:'short'})),make('span','num',String(Number(date.slice(8)))),make('span','pip'));
  b.onclick=()=>onSelect(date,false);if(!reuse)track.append(b);
 }
 const thumb=container.querySelector('#thumb');if(reuse)void thumb.offsetWidth;
 thumb.style.transform=`translateX(${Math.round((Date.parse(selected)-Date.parse(start))/86400000)*100}%)`;
 container.querySelector('#today').hidden=selected===today;
 container.querySelector('#today').onclick=()=>onSelect(today,true);
 const navigateWeek=direction=>{
  const targetStart=addDays(start,direction*7),targetEnd=addDays(targetStart,6);
  onSelect(today>=targetStart&&today<=targetEnd?today:direction>0?targetStart:targetEnd,false);
 };
 container.querySelector('#prev').onclick=()=>navigateWeek(-1);
 container.querySelector('#next').onclick=()=>navigateWeek(1);
 track.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();onSelect(e.key==='Home'?start:e.key==='End'?end:addDays(selected,e.key==='ArrowRight'?1:-1),true);};
 let x=null;
 track.ontouchstart=e=>{x=e.touches[0].clientX;};
 track.ontouchend=e=>{if(x!==null&&Math.abs(e.changedTouches[0].clientX-x)>=30)onSelect(addDays(selected,e.changedTouches[0].clientX<x?1:-1),false);x=null;};
}

// Preserve event/rail nodes on clock ticks so progress animates continuously.
function reconcile(target,next){
 for(let i=0;i<next.childNodes.length;i++){
  const incoming=next.childNodes[i],old=target.childNodes[i];
  if(!old){target.append(incoming.cloneNode(true));continue;}
  if(old.nodeType!==incoming.nodeType||old.nodeName!==incoming.nodeName){old.replaceWith(incoming.cloneNode(true));continue;}
  if(old.nodeType===Node.TEXT_NODE){if(old.data!==incoming.data)old.data=incoming.data;continue;}
  for(const attr of [...old.attributes])if(!incoming.hasAttribute(attr.name))old.removeAttribute(attr.name);
  for(const attr of incoming.attributes)if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
  reconcile(old,incoming);
 }
 while(target.childNodes.length>next.childNodes.length)target.lastChild.remove();
}

export function journey(container,{day,settings,filter,isToday,isPast,now=Date.now()}){
 container.classList.add('journey');
 let timeline=container.querySelector('.timeline');if(!timeline){container.replaceChildren();timeline=make('div','timeline');container.append(timeline);}
 const all=buildDaySegments(day,settings),events=filter==='special'?all.filter(special):filter==='queues'?all.filter(s=>s.type==='queue'):all;
 const stamp=t=>new Intl.DateTimeFormat('en-US',{timeZone:settings.timeZone,hour:'numeric',minute:'2-digit'}).format(t);
 const next=make('div');
 events.forEach((s,i)=>{
  const done=isPast||(isToday&&now>=s.end),live=isToday&&now>=s.start&&now<s.end,p=done?1:live?(now-s.start)/(s.end-s.start):0;
  if(i>0&&s.start>events[i-1].end){
   const gs=events[i-1].end,ge=s.start,gp=isPast?1:!isToday?0:Math.max(0,Math.min(1,(now-gs)/(ge-gs))),inGap=isToday&&now>gs&&now<ge;
   const row=make('div','row gap-row '+(gp===1?'done':''));
   row.innerHTML=`<div class="time"></div><div class="grail"><i><b class="fill${inGap?' now':''}"></b></i></div><div class="gtext${inGap?' on':''}"></div>`;
   const fill=row.querySelector('.fill');fill.style.height=inGap?`calc(12px + ${gp} * (100% - 30px))`:`${gp*100}%`;fill.dataset.t=stamp(now).replace(/ [AP]M$/,'');
   row.querySelector('.gtext').textContent=inGap?duration(ge-now)+' until '+s.name:duration(ge-gs)+' between activities';next.append(row);
  }
  const meal=s.stateType===5||/lunch|meal/i.test(s.name);
  const [color,rgb,symbol,text]=s.type==='break'?(meal?['coral','255,155,122','meal','Meal']:['amber','246,189,75','cup','Break']):s.type==='exception'?['violet','182,156,255','people','Event']:s.type==='queue'?['sky','108,196,240','queue','Queue']:['green','91,214,164','flag',s.type==='time_off'?'Time off':'Work'];
  const row=make('div','row ev '+(done?'done':live?'live':'next'));row.dataset.eventId=s.id;row.style.cssText=`--c:var(--${color});--tint:rgba(${rgb},.14);--glow:rgba(${rgb},.45)`;
  row.innerHTML=`<div class="time"><b></b><small></small></div><div class="rail"><div class="dot">${done?icon('check',8,4):''}</div>${i<events.length-1?`<div class="tail"><b class="fill" style="height:${p*100}%"></b></div>`:''}</div><div class="card"><div class="tile">${icon(symbol)}</div><div class="t"><div class="name"></div><div class="meta"></div></div><div class="chip"></div>${live?`<div class="bar"><b style="width:${p*100}%"></b></div>`:''}</div>`;
  const parts=stamp(s.start).split(' ');row.querySelector('.time b').textContent=parts[0];row.querySelector('.time small').textContent=parts[1];
  row.querySelector('.name').textContent=s.name;row.querySelector('.meta').textContent=done?text+' · done':live?'Ends '+stamp(s.end):text+' · ends '+stamp(s.end);
  row.querySelector('.chip').textContent=live?duration(s.end-now)+' left':duration(s.end-s.start);next.append(row);
 });
 if(events.length){const breaks=events.filter(s=>s.type==='break');next.append(make('div','total',filter==='special'?`${breaks.length} breaks · ${Math.round(breaks.reduce((n,s)=>n+s.end-s.start,0)/60000)} min total${isToday?' today':''}`:`${events.length} ${filter==='queues'?'queue activities':'activities'} · ${duration(events.reduce((n,s)=>n+s.end-s.start,0))} total`));}
 else next.append(make('div','empty-hint','No schedule detected.'));
 reconcile(timeline,next);
}
