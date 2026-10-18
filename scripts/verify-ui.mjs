import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';
import {start,init,NOW} from './browser-harness.mjs';

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
 await compare('header',ref,page,'.hd');await compare('footer',ref,page,'.ft');await compare('filter',ref,page,'.seg');
 await compare('countdown',ref,page,'.hero');
 await check('Original popup size and scroll boundaries are preserved',async()=>{
  assert.deepEqual(await page.locator('.pop').evaluate(e=>({width:e.offsetWidth,height:e.offsetHeight})),{width:380,height:600});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),380);
  assert.equal(await page.locator('.schedule-footer,.alert-link').count(),0);
  assert.equal(await page.locator('.hero').count(),1);
  assert.equal(await page.locator('.ft').boundingBox().then(b=>b.y+b.height),600);
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
 await check('Previous/next weeks, keyboard boundaries and Today navigate without WFM requests',async()=>{
  await page.click('#prev');assert.equal(await page.locator('#range').textContent(),'Oct 5 – 11');assert.equal(await page.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-10-11');
  assert.match(await page.locator('.journey .empty-hint').textContent(),/No saved schedule/);
  await page.click('#next');await page.locator('.day[aria-pressed=true]').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.day:focus').getAttribute('data-date'),'2026-10-19');await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.day:focus').getAttribute('data-date'),'2026-10-18');
  await page.click('#next');await page.screenshot({path:'verification/week-navigation.png',animations:'disabled'});await page.click('#today');
  assert.equal(await page.evaluate(()=>window.__fetches.length),0);
 });
 await check('Week navigation crosses year boundaries',async()=>{
  for(let i=0;i<11;i++)await page.click('#next');
  assert.equal(await page.locator('#range').textContent(),'Dec 28 2026 – Jan 3 2027');await page.click('#today');
 });
 await check('Original day-off illustration and event filtering still work',async()=>{
  await page.click('[data-date="2026-10-17"]');assert.equal(await page.locator('.dc').count(),1);assert.equal(await page.locator('.ev').count(),0);
  await page.click('#today');await page.locator('.seg button').nth(1).click();assert.match(await page.locator('.empty-hint').textContent(),/No queue changes/);
  await page.locator('.seg button').nth(2).click();assert.ok(await page.locator('.ev').count()>3);
  await page.locator('.seg button').first().click();
 });
 await page.clock.setFixedTime(new Date('2026-10-18T11:10:00Z'));await page.waitForSelector('.ev.live');
 await page.screenshot({path:'verification/journey-live.png'});
 await page.locator('.journey').evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:'verification/journey-scrolled.png'});
 await page.clock.setFixedTime(new Date(NOW));
 await Promise.all([page.locator('.ft button').click(),ref.locator('.ft button').click()]);
 await page.waitForFunction(()=>document.querySelector('#diag-summary')?.textContent.includes('45 logs'));await page.waitForTimeout(250);
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
  await page.click('#back');await page.click('#next');await page.locator('.hd .btn').click();await page.waitForFunction(()=>window.__messages.some(m=>m.type==='WFM_REFRESH'));
  assert.equal(await page.evaluate(()=>window.__messages.find(m=>m.type==='WFM_REFRESH').date),'2026-10-25');
  await page.waitForFunction(()=>document.querySelector('.hd .btn')?.textContent.includes('Refresh')&&!document.querySelector('.hd .btn').disabled);await page.click('#today');assert.equal(await page.locator('.ev').count(),3);
 });
 await check('Original light theme is preserved outside the changed components',async()=>{
  const light=await env.browser.newPage({viewport:{width:380,height:600},colorScheme:'light'});await init(light);await light.goto(env.base+'/extension/popup.html');await light.waitForSelector('.ev');
  assert.equal(await light.locator('body').evaluate(e=>getComputedStyle(e).getPropertyValue('--bg').trim()),'#F3F5F9');await light.screenshot({path:'verification/popup-light.png'});await light.close();
 });
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{await writeFile('verification/ui-report.json',JSON.stringify(report,null,2));await env.close();}
