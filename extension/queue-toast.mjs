// Pure schedule projection and pausable visibility timer. No WFM requests.
import {buildDaySegments,dayForDate,localDate} from './companion-core.mjs';

export function queueSwitches(week, settings, now=Date.now()) {
  if (!week) return [];
  const date=localDate(now,settings.timeZone);
  const day=dayForDate(week,date);
  if (!day || day.kind==='day_off' || day.kind==='unknown') return [];
  const segments=buildDaySegments(day,settings).sort((a,b)=>a.start-b.start || a.end-b.end);
  let previous=null;
  const changes=[];
  for (const segment of segments) {
    if (segment.type!=='queue') continue;
    if (previous && previous.name!==segment.name) {
      changes.push({
        id:`${date}:${segment.start}:${segment.id}`,
        at:segment.start,
        from:previous.name,
        to:segment.name,
      });
    }
    previous=segment;
  }
  return changes;
}

// A tab must already be active when the transition happens. A late timer
// callback or return from a hidden tab must not replay stale queue switches.
export function dueQueueSwitch(changes,previousTick,now,{graceMs=2000}={}) {
  if (!Number.isFinite(previousTick) || !Number.isFinite(now) || now<=previousTick) return null;
  return changes.findLast(change=>change.at>previousTick && change.at<=now && now-change.at<=graceMs)??null;
}

export class PausableToastTimer {
  constructor({onExpire,now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),durationMs=4000}) {
    this.onExpire=onExpire;
    this.now=now;
    this.setTimer=setTimer;
    this.clearTimer=clearTimer;
    this.durationMs=durationMs;
    this.active=false;
    this.inView=true;
    this.hovered=false;
    this.remaining=0;
    this.startedAt=0;
    this.timeout=null;
  }
  show() {
    this.pause();
    this.active=true;
    this.remaining=this.durationMs;
    this.sync();
  }
  setHovered(value) {this.hovered=Boolean(value);this.sync();}
  setInView(value) {this.inView=Boolean(value);this.sync();}
  pause() {
    if(this.timeout!==null) {
      this.clearTimer(this.timeout);
      this.timeout=null;
      this.remaining=Math.max(0,this.remaining-(this.now()-this.startedAt));
    }
  }
  sync() {
    if(!this.active)return;
    if(this.hovered||!this.inView){this.pause();return;}
    if(this.timeout!==null)return;
    if(this.remaining<=0){this.expire();return;}
    this.startedAt=this.now();
    this.timeout=this.setTimer(()=>{this.timeout=null;this.remaining=0;this.expire();},this.remaining);
  }
  expire() {
    if(!this.active)return;
    this.active=false;
    this.pause();
    this.remaining=0;
    this.onExpire();
  }
  cancel(){this.pause();this.active=false;this.remaining=0;}
}
