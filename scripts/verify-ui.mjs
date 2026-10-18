import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';
import {start,init,fixture,NOW} from './browser-harness.mjs';
import './reference-composite.mjs';
const env=await start(),report={visual:[],checks:[],errors:[]};
await mkdir('verification',{recursive:true});
const check=(name,fn)=>fn().then(()=>{report.checks.push(name);console.log('PASS '+name);});
async function shot(page,selector,name){const el=page.locator(selector);return el.screenshot({path:'verification/'+name+'.png',animations:'disabled'});}
async function compare(name,a,b){
 const x=PNG.sync.read(a),y=PNG.sync.read(b);
 assert.equal(x.width,y.width,name+' width');assert.equal(x.height,y.height,name+' height');
 const diff=new PNG({width:x.width,height:x.height});const pixels=pixelmatch(x.data,y.data,diff.data,x.width,x.height,{threshold:0,includeAA:true});
 await writeFile('verification/'+name+'-diff.png',PNG.sync.write(diff));
 const result={name,width:x.width,height:x.height,differingPixels:pixels,totalPixels:x.width*x.height};report.visual.push(result);console.log(result);
 assert.equal(pixels,0,name+' must match every pixel');
}
try{
 const page=await env.browser.newPage({viewport:{width:300,height:600},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));await init(page);
 await page.goto(env.base+'/extension/popup.html');await page.waitForSelector('.ev');
 await page.screenshot({path:'verification/popup.png',fullPage:true});
 const ref=await env.browser.newPage({viewport:{width:300,height:600},deviceScaleFactor:1});
 await ref.goto(env.base+'/verification/reference-combined.html');
 const referenceTimeline=await shot(ref,'#list','reference-journey');
 const actualTimeline=await shot(page,'#list','actual-journey');
 await compare('journey',referenceTimeline,actualTimeline);
 await compare('filter',await shot(ref,'.tabs','reference-filter'),await shot(page,'.tabs','actual-filter'));
 await compare('header',await shot(ref,'#view-schedule .top','reference-header'),await shot(page,'.top','actual-header'));
 await compare('alert-link',await shot(ref,'.alert-link','reference-alert-link'),await shot(page,'.alert-link','actual-alert-link'));
 const dayref=ref;
 // The design's .panel and the embedded .week-picker both have 16px vertical
 // and 10px outer horizontal padding. Capture that exact component region.
 const rrect=await dayref.locator('.week-picker').boundingBox(),arect=await page.locator('.week-picker').boundingBox();
 const rday=await dayref.screenshot({path:'verification/reference-days.png',clip:{x:0,y:rrect.y,width:300,height:rrect.height}});
 const aday=await page.screenshot({path:'verification/actual-days.png',clip:{x:0,y:arect.y,width:300,height:arect.height}});
 await compare('days',rday,aday);
 await check('Journey ticks preserve the same DOM nodes and move the live rail marker',async()=>{
  await page.evaluate(()=>{window.__journeyCard=document.querySelector('.card');window.__journeyFill=document.querySelector('.fill.now');window.__journeyHeight=window.__journeyFill.style.height;});
  await page.clock.setFixedTime(new Date('2026-10-18T10:41:00Z'));
  await page.waitForFunction(()=>document.querySelector('.fill.now')?.dataset.t==='1:41');
  assert.equal(await page.evaluate(()=>window.__journeyCard===document.querySelector('.card')&&window.__journeyFill===document.querySelector('.fill.now')),true);
  assert.notEqual(await page.evaluate(()=>window.__journeyHeight),await page.locator('.fill.now').evaluate(el=>el.style.height));
 });
 await page.clock.setFixedTime(new Date('2026-10-18T11:10:00Z'));await page.waitForSelector('.ev.live');
 await ref.locator('#sim').fill('850');
 await compare('journey-live',await shot(ref,'#list','reference-journey-live'),await shot(page,'#list','actual-journey-live'));
 await page.clock.setFixedTime(new Date(NOW));await page.waitForSelector('.fill.now');
 await check('Previous/next weeks and Today preserve selection without WFM fetches',async()=>{
  await page.click('#prev');assert.equal(await page.locator('#range').textContent(),'Oct 5 – 11');assert.equal(await page.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-10-11');
  assert.match(await page.locator('#empty').textContent(),/No saved schedule/);
  await page.click('#next');assert.equal(await page.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-10-18');
  await page.click('#next');assert.equal(await page.locator('#range').textContent(),'Oct 19 – 25');
  await page.click('#today');assert.equal(await page.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-10-18');
  assert.equal(await page.evaluate(()=>window.__fetches.length),0);
 });
 await check('Arrow keys cross week boundaries and maintain focus',async()=>{
  await page.locator('.day[aria-pressed=true]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.day:focus').getAttribute('data-date'),'2026-10-19');
  await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('.day:focus').getAttribute('data-date'),'2026-10-18');
 });
 await check('Week navigation spans months and years with valid date labels',async()=>{
  for(let i=0;i<11;i++)await page.click('#next');
  assert.equal(await page.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2027-01-03');
  assert.equal(await page.locator('#range').textContent(),'Dec 28 2026 – Jan 3 2027');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),300);
  await page.click('#today');
 });
 await check('Day off, queues, and All show real schedule states',async()=>{
  await page.click('[data-date="2026-10-17"]');assert.match(await page.locator('#summary').textContent(),/day off/);assert.equal(await page.locator('.ev').count(),0);
  await ref.locator('#track .day').nth(5).click();
  await compare('days-off',await shot(ref,'.week-picker','reference-days-off'),await shot(page,'.week-picker','actual-days-off'));
  await page.click('#today');await page.click('[data-filter="queues"]');assert.match(await page.locator('#empty').textContent(),/No queue changes/);
  await page.click('[data-filter="all"]');assert.ok(await page.locator('.ev').count()>3);await page.click('[data-filter="special"]');
 });
 await page.click('#settings');await page.waitForFunction(()=>document.querySelector('#diag-health')?.textContent==='All clear');
 await ref.click('[data-go="settings"]');
 // Match only illustrative content to the live fixture. No reference styling,
 // element sizing, positioning, or visibility is changed for comparisons.
 await ref.evaluate(()=>{document.querySelector('.preview span').innerHTML="For Lunch Break you'll be alerted at <b id='alert-at'>1:50 PM</b>";});
 await ref.screenshot({path:'verification/reference-settings.png',fullPage:true});
 await page.screenshot({path:'verification/actual-settings.png',fullPage:true});
 await compare('settings',await shot(ref,'#view-settings','reference-settings-component'),await shot(page,'#view-settings','actual-settings-component'));
 await check('Settings save presets, custom values and every switch',async()=>{
  await page.click('[data-min="2"]');await page.waitForFunction(()=>window.__storage.local.wfm_companion_state_v1.settings.leadMinutes===2);
  await page.locator('#lead').fill('17');await page.locator('#lead').blur();await page.waitForFunction(()=>window.__storage.local.wfm_companion_state_v1.settings.leadMinutes===17);
  await page.locator('#lead').fill('0');await page.locator('#lead').blur();assert.equal(await page.locator('#lead').inputValue(),'17');
  for(const b of await page.locator('[data-setting]').all()){const key=await b.getAttribute('data-setting'),before=await b.getAttribute('aria-checked');await b.click();await page.waitForFunction(({key,before})=>Boolean(window.__storage.local.wfm_companion_state_v1.settings[key])===(before!=='true'),{key,before});}
 });
 await check('Diagnostics export, copy and clear use real handlers',async()=>{
  const downloadPromise=page.waitForEvent('download');await page.click('#export');const download=await downloadPromise;assert.match(download.suggestedFilename(),/wfm-diagnostics/);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.click('#copy');await page.waitForFunction(()=>document.querySelector('#diag-status').textContent==='Copied as JSON');assert.ok(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())).companionEvents);
  await page.click('#clear');await page.waitForFunction(()=>document.querySelector('#diag-summary').textContent==='0 logs · 0 anomalies · 0 diffs');
 });
 await check('Manual refresh sends selected week and keeps cached data on failure',async()=>{
  await page.click('#back');await page.click('#next');await page.click('#refresh');await page.waitForFunction(()=>window.__messages.some(m=>m.type==='WFM_REFRESH'));
  assert.equal(await page.evaluate(()=>window.__messages.find(m=>m.type==='WFM_REFRESH').date),'2026-10-25');
  await page.waitForFunction(()=>document.querySelector('#refresh')?.textContent==='Refresh');await page.click('#today');assert.equal(await page.locator('.ev').count(),3);
 });
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{await writeFile('verification/ui-report.json',JSON.stringify(report,null,2));await env.close();}
