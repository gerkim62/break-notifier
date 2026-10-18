import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {scheduleFreshness,scheduleRefreshDue} from '../extension/schedule-freshness.mjs';
import {start,init,fixture,NOW} from './browser-harness.mjs';
const env=await start(),report={checks:[],errors:[]};
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
const at=time=>Date.parse(time),date='2026-10-18',opens=at('2026-10-17T20:00:00Z'); // 23:00 Nairobi, 12h before 11:00 shift.
async function open(state,time=NOW,{error=null,delay=0}={}){
 const page=await env.browser.newPage({viewport:{width:380,height:600},colorScheme:'dark',reducedMotion:'reduce'});
 page.on('pageerror',error=>report.errors.push(error.message));await init(page,state);await page.clock.setFixedTime(new Date(time));
 await page.addInitScript(({error,delay})=>{window.__scheduleError=error;window.__scheduleDelayMs=delay;},{error,delay});
 await page.goto(env.base+'/extension/popup.html');await page.waitForSelector('.week-picker');return page;
}
const requests=page=>page.evaluate(()=>window.__fetches.length);
const saved=page=>page.evaluate(()=>structuredClone(window.__storage.local.wfm_companion_state_v1));
const old=()=>({...fixture(),lastUpdated:opens-1});
const settled=page=>page.waitForFunction(()=>!document.querySelector('.hd .btn').disabled);
try{
 await check('A cached shift is provisional before its exact 12-hour window and unconfirmed when the window opens',()=>{
  const state=old();assert.equal(scheduleFreshness(state,date,opens-1).status,'provisional');
  assert.equal(scheduleRefreshDue(state,date,opens-1),false);
  assert.equal(scheduleFreshness(state,date,opens).status,'stale');assert.equal(scheduleRefreshDue(state,date,opens),true);
  state.weekChecked={[state.week.weekStart]:at(NOW)};
  assert.equal(scheduleFreshness(state,date,at(NOW)).status,'stale');
  state.lastUpdated=opens;
  assert.equal(scheduleFreshness(state,date,opens).status,'confirmed');assert.equal(scheduleRefreshDue(state,date,opens),false);
 });
 await check('Confirmation survives midnight and stays valid until shift end regardless of cache age',()=>{
  const state=fixture(),day=state.week.days[2];
  day.shift={start:'22:00',end:'06:00'};day.events=[{source:'SchAgentDay',startDate:day.date,endDate:'2026-10-15',start:'22:00',end:'06:00'}];
  state.lastUpdated=at('2026-10-14T07:00Z');
  state.week.days[3]={date:'2026-10-15',kind:'day_off',shift:null,events:[]};
  const late=at('2026-10-15T02:59:59Z');
  assert.equal(scheduleFreshness(state,day.date,late).status,'confirmed');assert.equal(scheduleRefreshDue(state,day.date,late),false);
  assert.equal(scheduleRefreshDue(state,'2026-10-15',late),false);
  assert.equal(scheduleFreshness(state,day.date,at('2026-10-15T03:00Z')).status,'archived');
  assert.equal(scheduleRefreshDue(state,'2026-10-15',at('2026-10-15T03:00Z')),true);
 });
 await check('Native overnight dates, timezone changes and revised shift times determine the confirmation boundary',()=>{
  const state=old();state.settings.timeZone='UTC';assert.equal(scheduleFreshness(state,date,at(NOW)).opens,at('2026-10-17T23:00Z'));
  state.settings.timeZone='America/New_York';assert.equal(scheduleFreshness(state,date,at(NOW)).opens,at('2026-10-18T03:00Z'));
  state.settings.timeZone='Africa/Nairobi';const day=state.week.days[6];day.events[0].start='21:00';day.events[0].end='23:00';day.shift={start:'21:00',end:'23:00'};
  state.lastUpdated=opens;
  assert.equal(scheduleFreshness(state,date,opens).status,'provisional');
  assert.equal(scheduleRefreshDue(state,date,at('2026-10-18T06:00Z')),true);
  state.lastUpdated=at('2026-10-18T06:00Z');assert.equal(scheduleRefreshDue(state,date,at(NOW)),false);
 });
 await check('Fresh popup opens reuse confirmed shifts; provisional future weeks and past days do not refetch',async()=>{
  const state=fixture(),future={...state.week,weekStart:'2026-10-19',weekEnd:'2026-10-25',days:state.week.days.map((day,i)=>{const date='2026-10-'+(19+i);return {...day,date,events:day.events.map(event=>({...event,startDate:date,endDate:date}))};})};
  state.weeks={'2026-10-19':future};state.weekUpdated={'2026-10-19':opens-86400000};
  for(let i=0;i<2;i++){
   const page=await open(state);await page.waitForSelector('.ev');await page.click('#next');await page.click('#today');await page.click('[data-date="2026-10-12"]');
   assert.equal(await requests(page),0);assert.equal(await page.locator('.schedule-refresh-warning').count(),0);await page.close();
  }
 });
 await check('An unconfirmed cache refreshes once and subsequent opens reuse it throughout the shift',async()=>{
  const page=await open(old());await page.waitForFunction(()=>window.__storage.local.wfm_companion_state_v1.lastUpdated>=Date.now()&&!document.querySelector('.hd .btn').disabled);
  assert.equal(await requests(page),1);assert.equal(await page.locator('.schedule-refresh-warning').count(),0);
  const state=await saved(page);await page.close();
  const reopened=await open(state,'2026-10-18T14:29:00Z');await reopened.waitForSelector('.ev');assert.equal(await requests(reopened),0);
  await reopened.locator('.schedule-info-button').click();assert.match(await reopened.locator('.schedule-info-popover').textContent(),/Confirmed for this shift/);
  await reopened.screenshot({path:'verification/confirmed-shift.png'});await reopened.close();
 });
 await check('Failed confirmation retains cache and persistent amber stale UI until a successful manual retry',async()=>{
  const initial=old(),failed=await open(initial,NOW,{error:'network_error',delay:500});
  await failed.waitForFunction(()=>document.querySelector('.hd .btn').disabled);
  assert.equal(await failed.locator('.schedule-refresh-warning').count(),0);assert.match(await failed.locator('.hd .btn').textContent(),/Checking/);
  await failed.screenshot({path:'verification/shift-checking.png'});
  await failed.waitForSelector('.schedule-refresh-warning');await settled(failed);
  assert.equal(await failed.locator('#visual-css').getAttribute('href'),'design-stale.css');
  assert.equal(await failed.locator('.hd .s.w').count(),1);assert.equal(await failed.locator('.hd .btn.hot').count(),1);
  assert.equal(await failed.locator('.schedule-refresh-warning button').count(),0);
  assert.equal(await failed.getByRole('button',{name:'Refresh schedule',exact:true}).count(),1);
  assert.equal(await failed.getByText('Refresh',{exact:true}).count(),1);
  assert.equal(await failed.locator('.schedule-refresh-warning span').textContent(),'Couldn’t confirm this shift. Showing saved schedule.');
  const state=await saved(failed);assert.deepEqual(state.week,JSON.parse(JSON.stringify(initial.week)));assert.equal(state.lastUpdated,initial.lastUpdated);
  assert.equal(scheduleFreshness(state,date,at(NOW)).status,'stale');assert.equal(scheduleRefreshDue(state,date,at(NOW)),false);
  await failed.screenshot({path:'verification/unconfirmed-shift-dark.png'});await failed.emulateMedia({colorScheme:'light'});await failed.waitForTimeout(300);
  await failed.screenshot({path:'verification/unconfirmed-shift-light.png'});await failed.close();
  const reopened=await open(state);await reopened.waitForSelector('.schedule-refresh-warning');assert.equal(await requests(reopened),0);
  await reopened.locator('.hd .btn').click();await reopened.waitForSelector('#popup-toast.success.visible');
  assert.equal(await requests(reopened),1);assert.equal(await reopened.locator('.schedule-refresh-warning').count(),0);
  assert.equal(await reopened.locator('.hd .s.w').count(),0);await reopened.close();
 });
 await check('An open popup detects entry into the confirmation window without periodic WFM polling',async()=>{
  const time='2026-10-18T07:59:59Z',state=fixture(),day=state.week.days[6];
  day.shift={start:'23:00',end:'07:00',endDate:'2026-10-19'};day.events=[{source:'SchAgentDay',startDate:date,endDate:'2026-10-19',start:'23:00',end:'07:00'}];
  state.lastUpdated=at(time)-60000;
  const page=await open(state,time);await page.waitForSelector('.week-picker');assert.equal(await requests(page),0);
  await page.clock.setFixedTime(new Date('2026-10-18T08:00:00Z'));
  await page.waitForFunction(()=>window.__fetches.length===1&&!document.querySelector('.hd .btn').disabled);
  await page.waitForTimeout(1200);assert.equal(await requests(page),1);await page.close();
 });
 await check('A returned later shift gets its own confirmation window rather than inheriting confirmation for the old time',async()=>{
  const state=old(),page=await open(state,'2026-10-17T20:00:00Z');
  const changed=structuredClone(state.week),shift=changed.days[6].events[0];shift.start='21:00';shift.end='23:00';
  changed.days[6].shift={start:'21:00',end:'23:00'};changed.days[6].events=[shift];
  await page.evaluate(week=>window.__fixtureWeek=week,changed);await page.click('[data-date="2026-10-18"]');
  await page.waitForFunction(()=>window.__fetches.length===1&&!document.querySelector('.hd .btn').disabled);
  assert.equal(scheduleFreshness(await saved(page),date,opens).status,'provisional');
  await page.clock.setFixedTime(new Date('2026-10-18T06:00:00Z'));
  await page.waitForFunction(()=>window.__fetches.length===2&&!document.querySelector('.hd .btn').disabled);
  assert.equal(scheduleFreshness(await saved(page),date,at('2026-10-18T06:00:00Z')).status,'confirmed');await page.close();
 });
 await check('Days off get daily checks; failed attempts stay unconfirmed and daily success stops further reads',async()=>{
  const state=fixture();state.lastUpdated=at('2026-10-16T10:00Z');const time='2026-10-17T10:00:00Z';
  const page=await open(state,time,{error:'network_error'});await page.waitForSelector('.schedule-refresh-warning');
  assert.equal(await page.locator('.dc').count(),1);await page.screenshot({path:'verification/unconfirmed-day-off.png'});
  const failure=await saved(page);assert.equal(scheduleRefreshDue(failure,'2026-10-17',at(time)),false);
  assert.equal(scheduleFreshness(failure,'2026-10-17',at(time)).status,'stale');await page.close();
  state.week.days[6]={date,kind:'day_off',shift:null,events:[]};state.lastUpdated=at('2026-10-17T10:00Z');
  assert.equal(scheduleRefreshDue(state,date,at(NOW)),true);
  const success=await open(state);await success.waitForFunction(()=>window.__storage.local.wfm_companion_state_v1.lastUpdated>=Date.now()&&!document.querySelector('.hd .btn').disabled);
  const checked=await saved(success);assert.equal(scheduleRefreshDue(checked,date,at(NOW)),false);await success.close();
 });
 await check('Expired authentication keeps the stale warning actionable with Log in',async()=>{
  const state=old(),page=await env.browser.newPage({viewport:{width:380,height:600},reducedMotion:'reduce'});await init(page,state);
  await page.addInitScript(()=>window.__wfmStatus=401);await page.goto(env.base+'/extension/popup.html');await page.waitForSelector('.schedule-refresh-warning');
  assert.equal(await page.locator('.schedule-refresh-warning button').textContent(),'Log in');
  assert.equal(await page.locator('#popup-toast .toast-action').textContent(),'Log in');await page.close();
 });
 await check('Successful login retries a cached unconfirmed shift in another week and clears its old failure',async()=>{
  const state=fixture(),future={...state.week,weekStart:'2026-10-19',weekEnd:'2026-10-25',days:state.week.days.map((day,i)=>{const date='2026-10-'+(19+i);return {...day,date,events:day.events.map(event=>({...event,startDate:date,endDate:date}))};})};
  state.weeks={'2026-10-19':future};state.weekUpdated={'2026-10-19':at(NOW)};
  const page=await open(state,'2026-10-18T20:00:00Z');await page.evaluate(()=>window.__wfmStatus=401);
  await page.click('#next');await page.click('[data-date="2026-10-19"]');await page.waitForSelector('.schedule-refresh-warning');
  assert.equal(await page.locator('.schedule-refresh-warning button').textContent(),'Log in');
  await page.evaluate(()=>window.__wfmStatus=0);await page.locator('.schedule-refresh-warning button').click();
  await page.waitForFunction(()=>!document.querySelector('.schedule-refresh-warning')&&!document.querySelector('.hd .btn').disabled);
  assert.equal(await page.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-10-19');
  const checked=await saved(page);assert.equal(scheduleFreshness(checked,'2026-10-19',at('2026-10-18T20:00Z')).status,'confirmed');await page.close();
 });
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile('verification/refresh-report.json',JSON.stringify(report,null,2));await env.close();}
