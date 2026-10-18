import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';
import {start,init,fixture,NOW} from './browser-harness.mjs';

await mkdir('verification',{recursive:true});
await writeFile('verification/original.html','<!doctype html><html><head><base href="/extension/"><link id="visual-css" rel="stylesheet" href="design-today.css"><link rel="stylesheet" href="popup-integration.css"></head><body><div id="app"></div><script type="module">await import("/extension/background.mjs");await import("/scripts/fixtures/v0417-popup.mjs");</script></body></html>');
const env=await start(),report={visual:[],checks:[],errors:[]};
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
async function compare(name,ref,page,selector){
 const a=PNG.sync.read(await ref.locator(selector).screenshot({path:`verification/reference-${name}.png`,animations:'disabled'}));
 const b=PNG.sync.read(await page.locator(selector).screenshot({path:`verification/actual-${name}.png`,animations:'disabled'}));
 assert.equal(a.width,b.width,name+' width');assert.equal(a.height,b.height,name+' height');
 const diff=new PNG({width:a.width,height:a.height});const pixels=pixelmatch(a.data,b.data,diff.data,a.width,a.height,{threshold:0,includeAA:true});
 await writeFile(`verification/${name}-diff.png`,PNG.sync.write(diff));
 report.visual.push({name,width:a.width,height:a.height,differingPixels:pixels,totalPixels:a.width*a.height});
 console.log(name+': '+pixels+' differing pixels');assert.equal(pixels,0,name+' must preserve the original');
}
try{
 const page=await env.browser.newPage({viewport:{width:380,height:600},deviceScaleFactor:1,colorScheme:'dark'});
 const ref=await env.browser.newPage({viewport:{width:380,height:600},deviceScaleFactor:1,colorScheme:'dark'});
 for(const p of [page,ref]){p.on('pageerror',e=>report.errors.push(e.message));await init(p);}
 await Promise.all([page.goto(env.base+'/extension/popup.html'),ref.goto(env.base+'/verification/original.html')]);
 await page.waitForSelector('.ev');await ref.waitForSelector('.tb .row');
 await page.waitForTimeout(300);
 await page.screenshot({path:'verification/popup.png'});await ref.screenshot({path:'verification/original-popup.png'});
 await compare('footer',ref,page,'.ft');
 await check('The popup keeps its size and footer with one schedule scrollbar',async()=>{
  assert.deepEqual(await page.locator('.pop').evaluate(e=>({width:e.offsetWidth,height:e.offsetHeight})),{width:380,height:600});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),380);
  assert.equal(await page.locator('.schedule-footer,.alert-link').count(),0);
  assert.equal(await page.locator('.hero').count(),1);
  assert.equal(await page.locator('.ft').boundingBox().then(b=>b.y+b.height),600);
  assert.equal(await page.locator('.schedule-scroll').evaluate(e=>getComputedStyle(e).overflowY),'auto');
  assert.equal(await page.locator('.journey').evaluate(e=>getComputedStyle(e).overflowY),'visible');
 });
 await check('Both ring sizes share live progress, uniform proportions, and clean inactive transitions',async()=>{
  const info=()=>page.evaluate(()=>[document.querySelector('.hd .lg .countdown-svg'),document.querySelector('#shared-countdown .countdown-svg')].map(svg=>{
   const track=svg.querySelector('.ring-track'),arc=svg.querySelector('.live-stroke'),m=svg.getScreenCTM();
   return {dash:arc.getAttribute('stroke-dasharray'),offset:arc.getAttribute('stroke-dashoffset'),weight:Number(arc.getAttribute('stroke-width'))/Number(arc.getAttribute('r')),square:Math.abs(m.a-m.d)<.001,filter:getComputedStyle(arc).filter,track:track.getAttribute('stroke-width'),stroke:arc.getAttribute('stroke-width')};
  }));
  const [small,big]=await info();assert.equal(small.dash,big.dash);assert.equal(small.offset,big.offset);assert.equal(small.weight,big.weight);
  for(const ring of [small,big]){assert.equal(ring.square,true);assert.equal(ring.filter,'none');assert.equal(ring.track,ring.stroke);}
  await page.clock.setFixedTime(new Date('2026-10-18T10:59:00Z'));await page.waitForFunction(()=>document.querySelector('#shared-countdown .ct b')?.textContent==='01:00');
  await page.screenshot({path:'verification/rings-nearly-complete.png',animations:'disabled'});
  const [nearSmall,nearBig]=await info();assert.equal(nearSmall.dash,nearBig.dash);assert.notEqual(nearBig.dash,big.dash);
  await page.clock.setFixedTime(new Date('2026-10-18T11:00:00Z'));await page.waitForFunction(()=>document.querySelector('#shared-countdown .ct b')?.textContent==='40:00');
  assert.equal(await page.locator('#shared-countdown .live-stroke').getAttribute('opacity'),'0');
  assert.equal(await page.locator('.hd .lg .live-stroke').getAttribute('opacity'),'0');
  await page.clock.setFixedTime(new Date('2026-10-18T07:00:00Z'));await page.waitForFunction(()=>document.querySelector('#shared-countdown').hidden);
  assert.equal(await page.locator('.hero .ring').evaluate(e=>getComputedStyle(e).visibility),'visible');
  assert.equal(await page.locator('.hd .lg').evaluate(e=>e.classList.contains('idle-header-ring')),true);
  await page.screenshot({path:'verification/rings-idle.png',animations:'disabled'});
  await page.clock.setFixedTime(new Date('2026-10-18T08:01:00Z'));await page.waitForFunction(()=>!document.querySelector('#shared-countdown').hidden);
  assert.equal(await page.locator('.hd .lg').evaluate(e=>e.classList.contains('idle-header-ring')),false);
  assert.equal(await page.locator('.hd .lg .live-stroke').getAttribute('opacity'),'1');
  await page.clock.setFixedTime(new Date(NOW));await page.waitForFunction(()=>document.querySelector('#shared-countdown .ct b')?.textContent==='20:00');
 });
 await check('The journey retains its cards and travelling marker on clock ticks',async()=>{
  await page.evaluate(()=>{window.__card=document.querySelector('.journey .card');window.__marker=document.querySelector('.journey .fill.now');window.__height=window.__marker.style.height;});
  await page.clock.setFixedTime(new Date('2026-10-18T10:41:00Z'));
  await page.waitForFunction(()=>document.querySelector('.fill.now')?.dataset.t==='1:41');
  assert.equal(await page.evaluate(()=>window.__card===document.querySelector('.journey .card')&&window.__marker===document.querySelector('.fill.now')),true);
  assert.notEqual(await page.evaluate(()=>window.__height),await page.locator('.fill.now').evaluate(e=>e.style.height));
  await page.clock.setFixedTime(new Date(NOW));
 });
 await check('Changing days moves the original single countdown into the header and back',async()=>{
  await page.evaluate(()=>window.__ring=document.querySelector('#shared-countdown'));
  await page.click('[data-date="2026-10-12"]');await page.waitForTimeout(600);
  assert.equal(await page.locator('.hero').count(),0);assert.equal(await page.locator('#shared-countdown.docked').count(),1);
  assert.equal(await page.evaluate(()=>window.__ring===document.querySelector('#shared-countdown')),true);
  assert.equal(await page.locator('.journey .ev.done').count(),0);
  await page.screenshot({path:'verification/other-day.png',animations:'disabled'});
  await page.click('#today');await page.waitForTimeout(300);
  assert.equal(await page.locator('.hero').count(),1);assert.equal(await page.locator('#shared-countdown.docked').count(),0);
  assert.equal(await page.evaluate(()=>window.__ring===document.querySelector('#shared-countdown')),true);
 });
 await check('The day-picker thumb survives day selection for its spring transition',async()=>{
  await page.evaluate(()=>window.__thumb=document.querySelector('#thumb'));
  await page.click('[data-date="2026-10-13"]');assert.equal(await page.evaluate(()=>window.__thumb===document.querySelector('#thumb')),true);
  assert.equal(await page.locator('#thumb').evaluate(e=>e.style.transform),'translateX(100%)');await page.click('#today');
 });
 await check('Previous/next weeks load on opening, keyboard boundaries and Today retain cached weeks',async()=>{
  await page.evaluate(()=>window.__scheduleDelayMs=300);
  await page.click('#prev');assert.equal(await page.locator('#range').textContent(),'Oct 5 – 11');assert.equal(await page.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-10-11');
  assert.equal(await page.locator('.journey .empty-hint').textContent(),'Loading schedule…');
  await page.waitForSelector('.journey .ev');
  await page.click('#next');await page.locator('.day[aria-pressed=true]').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.day:focus').getAttribute('data-date'),'2026-10-19');await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.day:focus').getAttribute('data-date'),'2026-10-18');
  await page.click('#next');await page.screenshot({path:'verification/week-navigation.png',animations:'disabled'});await page.click('#today');
  assert.equal(await page.evaluate(()=>window.__messages.filter(m=>m.type==='WFM_REFRESH'&&m.date==='2026-10-18').length),0);
  await page.evaluate(()=>window.__scheduleDelayMs=0);
 });
 await check('Week navigation crosses year boundaries',async()=>{
  for(let i=0;i<11;i++)await page.click('#next');
  assert.equal(await page.locator('#range').textContent(),'Dec 28 2026 – Jan 3 2027');await page.click('#today');
 });
 await check('Original day-off illustration and event filtering still work',async()=>{
  await page.click('[data-date="2026-10-17"]');assert.equal(await page.locator('.dc').count(),1);assert.equal(await page.locator('.ev').count(),0);
  await page.click('#today');await page.locator('.seg button').nth(1).click();assert.equal(await page.locator('.empty-hint').textContent(),'No schedule detected.');
  await page.locator('.seg button').nth(2).click();assert.ok(await page.locator('.ev').count()>3);
  await page.locator('.seg button').first().click();
 });
 await page.clock.setFixedTime(new Date('2026-10-18T11:10:00Z'));await page.waitForSelector('.ev.live');
 await page.screenshot({path:'verification/journey-live.png'});
 await page.locator('.schedule-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:'verification/journey-scrolled.png'});
 await page.clock.setFixedTime(new Date(NOW));
 await Promise.all([page.locator('.ft button').click(),ref.locator('.ft button').click()]);
 await page.waitForFunction(()=>/\d+ logs/.test(document.querySelector('#diag-summary')?.textContent));await page.waitForTimeout(250);
 await page.screenshot({path:'verification/actual-settings.png'});
 await check('HTML settings show only presets and persist presets, switches and diagnostics',async()=>{
  assert.equal(await page.locator('.settings-reference').count(),1);
  assert.equal(await page.locator('input[type=number],.cust,.lead-manual').count(),0);
  assert.equal(await page.locator('[data-lead]').count(),3);
  for(const minutes of [2,5,10]){await page.click(`[data-lead="${minutes}"]`);await page.waitForFunction(n=>window.__storage.local.wfm_companion_state_v1.settings.leadMinutes===n,minutes);assert.equal(await page.locator(`[data-lead="${minutes}"]`).getAttribute('aria-pressed'),'true');}
  for(const toggle of await page.locator('[data-setting]').all()){
   const key=await toggle.getAttribute('data-setting'),before=await toggle.getAttribute('aria-checked');await toggle.click();
   await page.waitForFunction(({key,before})=>Boolean(window.__storage.local.wfm_companion_state_v1.settings[key])===(before!=='true'),{key,before});
  }
  const downloadPromise=page.waitForEvent('download');await page.click('#export');assert.match((await downloadPromise).suggestedFilename(),/wfm-diagnostics/);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.click('#copy-json');await page.waitForFunction(()=>document.querySelector('#diag-status').textContent==='Copied as JSON');
  await page.click('#clear');await page.waitForFunction(()=>document.querySelector('#diag-summary').textContent.includes('0 logs'));
 });
 await check('Manual refresh loads the selected week and retains the cached schedule on failure',async()=>{
  await page.click('#back');await page.click('#next');await page.evaluate(()=>window.__scheduleError='network_error');await page.locator('.hd .btn').click();await page.waitForFunction(()=>window.__messages.some(m=>m.type==='WFM_REFRESH'&&m.trigger==='manual'));
  assert.equal(await page.evaluate(()=>window.__messages.findLast(m=>m.type==='WFM_REFRESH'&&m.trigger==='manual').date),'2026-10-25');
  await page.waitForFunction(()=>document.querySelector('.hd .btn')?.textContent.includes('Refresh')&&!document.querySelector('.hd .btn').disabled);await page.click('#today');assert.equal(await page.locator('.ev').count(),3);
 });
 await check('Light mode renders a light schedule surface',async()=>{
  const light=await env.browser.newPage({viewport:{width:380,height:600},colorScheme:'light'});await init(light);await light.goto(env.base+'/extension/popup.html');await light.waitForSelector('.ev');
  assert.equal(await light.locator('.pop').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(243, 245, 249)');await light.screenshot({path:'verification/popup-light.png'});await light.close();
 });
 await check('Long schedules scroll the header away, keep the ring aligned, and preserve reading position',async()=>{
  const state=fixture(),day=state.week.days[3],date=day.date;
  const time=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  day.shift={start:'08:00',end:'17:30'};day.events.find(e=>e.source==='SchAgentDay').start='08:00';
  const names=['02. HVC1_Stats','03. U LVC Stats','07. Safaricom Dealer','05. Lipa Na Mpesa Dealer'];
  day.events.push(...Array.from({length:38},(_,i)=>({source:'SchCoverage',activityId:i+100,name:names[i%names.length],startDate:date,endDate:date,start:time(480+i*15),end:time(495+i*15)})));
  const dense=await env.browser.newPage({viewport:{width:380,height:600},colorScheme:'dark'});dense.on('pageerror',e=>report.errors.push(e.message));await init(dense,state);
  await dense.goto(env.base+'/extension/popup.html');await dense.waitForSelector('.ev');await dense.click('[data-date="2026-10-15"]');await dense.locator('.seg button').nth(2).click();await dense.waitForTimeout(600);
  assert.ok(await dense.locator('.ev').count()>30);await dense.screenshot({path:'verification/long-schedule-top.png',animations:'disabled'});
  await dense.mouse.move(250,350);await dense.mouse.wheel(0,320);await dense.waitForFunction(()=>document.querySelector('.schedule-scroll').scrollTop>250);
  assert.ok((await dense.locator('.hd').boundingBox()).y<0);assert.ok((await dense.locator('.week-picker').boundingBox()).y<0);
  assert.equal(await dense.locator('.journey').evaluate(e=>e.scrollTop),0);
  assert.equal(await dense.locator('#shared-countdown').evaluate(e=>getComputedStyle(e).position),'absolute');
  const aligned=()=>dense.evaluate(()=>{const ring=document.querySelector('#shared-countdown').getBoundingClientRect(),slot=document.querySelector('.hd .lg').getBoundingClientRect();return Math.abs(ring.y-slot.y)<1;});
  assert.equal(await aligned(),true);await dense.clock.setFixedTime(new Date('2026-10-18T10:41:00Z'));await dense.waitForTimeout(1100);assert.equal(await aligned(),true);
  await dense.screenshot({path:'verification/long-schedule-scrolled.png',animations:'disabled'});
  const saved=await dense.locator('.schedule-scroll').evaluate(e=>e.scrollTop);
  await dense.evaluate(async()=>{window.__oldScroller=document.querySelector('.schedule-scroll');await chrome.storage.local.set({wfm_companion_state_v1:{...window.__storage.local.wfm_companion_state_v1,lastUpdated:Date.now()}});});
  await dense.waitForFunction(()=>document.querySelector('.schedule-scroll')!==window.__oldScroller);assert.equal(await dense.locator('.schedule-scroll').evaluate(e=>e.scrollTop),saved);
  await dense.locator('.ft button').click();await dense.waitForSelector('.settings-reference');await dense.click('#back');assert.equal(await dense.locator('.schedule-scroll').evaluate(e=>e.scrollTop),saved);
  await dense.locator('.schedule-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);const last=await dense.locator('.ev').last().boundingBox();assert.ok(last.y>=0&&last.y+last.height<=554);
  assert.equal(await dense.locator('.ft').boundingBox().then(b=>b.y+b.height),600);await dense.screenshot({path:'verification/long-schedule-end.png',animations:'disabled'});await dense.close();
 });
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{await writeFile('verification/ui-report.json',JSON.stringify(report,null,2));await env.close();}
