import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {settingsWithDefaults} from '../extension/companion-core.mjs';
import {start,init,fixture} from './browser-harness.mjs';
const env=await start(),report={checks:[],contrasts:[],errors:[]};
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
async function open(state=fixture(),colorScheme='light',path='/extension/popup.html'){
 const page=await env.browser.newPage({viewport:{width:380,height:600},colorScheme,reducedMotion:'reduce'});
 page.on('pageerror',error=>report.errors.push(error.message));await init(page,state);await page.goto(env.base+path);return page;
}
const color=value=>(value.match(/[\d.]+/g)??[]).map(Number).slice(0,3);
const luminance=rgb=>rgb.map(channel=>{const v=channel/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(foreground,background)=>{const a=luminance(color(foreground)),b=luminance(color(background));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
async function readable(page,name,selector,background,minimum=4.5,property='color'){
 const sample=await page.evaluate(({selector,background,property})=>({foreground:getComputedStyle(document.querySelector(selector))[property],background:getComputedStyle(document.querySelector(background)).backgroundColor}),{selector,background,property});
 const ratio=contrast(sample.foreground,sample.background);report.contrasts.push({name,...sample,ratio:Number(ratio.toFixed(2)),minimum});assert.ok(ratio>=minimum,`${name}: ${ratio.toFixed(2)} < ${minimum}`);
}
const waitTheme=async(page,value)=>page.waitForFunction(value=>window.__storage.local.wfm_companion_state_v1.settings.theme===value&&![...document.querySelectorAll('input[name=theme]')].some(input=>input.disabled),value);
try{
 await check('Theme preferences default to System and reject invalid stored values',()=>{
  assert.equal(settingsWithDefaults().theme,'system');assert.equal(settingsWithDefaults({theme:'invalid'}).theme,'system');
  for(const theme of ['system','light','dark'])assert.equal(settingsWithDefaults({theme}).theme,theme);
 });
 const page=await open();await page.waitForSelector('.ev');
 await check('Light schedule keeps dates, completed events, metadata, selected labels and the ring readable',async()=>{
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.equal(await page.locator('.ev.done .card').first().evaluate(node=>getComputedStyle(node).opacity),'1');
  await readable(page,'Schedule title','.hd .tt .t','.top');
  await readable(page,'Completed activity','.ev.done .name','.ev.done .card');
  await readable(page,'Completed time','.ev.done .time','.pop');
  await readable(page,'Activity metadata','.ev.next .meta','.ev.next .card');
  await readable(page,'Selected date','.day[aria-pressed=true] .num','.thumb');
  await readable(page,'Selected weekday','.day[aria-pressed=true] .dow','.thumb');
  await readable(page,'Day-off date','.day.off .num','.track');
  await readable(page,'Countdown arc','#shared-countdown .live-stroke','.hero',3,'stroke');
  await page.screenshot({path:'verification/theme-light-schedule.png'});
 });
 await page.locator('.ft button').click();await page.waitForFunction(()=>document.querySelector('#diag-health')?.textContent==='All clear');
 await check('Light settings use readable preset, diagnostic and destructive-action colors',async()=>{
  assert.equal(await page.getByRole('radio',{name:'System',exact:true}).isChecked(),true);
  await readable(page,'Selected reminder','.preset[aria-pressed=true]','.preset[aria-pressed=true]');
  await readable(page,'Settings description','.opt .meta','.list');
  await readable(page,'Diagnostic status','#diag-health','.diag');
  await readable(page,'Clear action','#clear','.diag');
  await readable(page,'Theme selection','.theme-options label:has(input:checked) span','.theme-options label:has(input:checked)');
  const knobs=await page.locator('.sw i').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor));assert.ok(knobs.every(value=>value==='rgb(255, 255, 255)'));
  await page.screenshot({path:'verification/theme-light-settings.png'});
  await page.locator('.settings-body').evaluate(node=>node.scrollTop=node.scrollHeight);await page.screenshot({path:'verification/theme-light-diagnostics.png'});
  await page.locator('.settings-body').evaluate(node=>node.scrollTop=0);
 });
 await check('Dark overrides a light OS, persists through reopening, and does not fetch WFM',async()=>{
  await page.getByRole('radio',{name:'Dark',exact:true}).check();await waitTheme(page,'dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal(await page.locator('.pop').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(13, 18, 28)');
  await page.emulateMedia({colorScheme:'dark'});await page.emulateMedia({colorScheme:'light'});assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:'verification/theme-dark-settings.png'});
  const state=await page.evaluate(()=>structuredClone(window.__storage.local.wfm_companion_state_v1));
  const reopened=await open(state,'light');await reopened.waitForSelector('.ev');assert.equal(await reopened.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await reopened.evaluate(()=>window.__fetches.length),0);await reopened.screenshot({path:'verification/theme-forced-dark.png'});await reopened.close();
  assert.equal(await page.evaluate(()=>window.__fetches.length),0);
 });
 await check('Light overrides a dark OS throughout settings, schedule and Day Off',async()=>{
  await page.emulateMedia({colorScheme:'dark'});await page.getByRole('radio',{name:'Light',exact:true}).check();await waitTheme(page,'light');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await readable(page,'Forced-light destructive action','#clear','.diag');
  await page.screenshot({path:'verification/theme-forced-light-settings.png'});
  await page.locator('#back').click();await page.waitForSelector('.ev');assert.equal(await page.locator('.pop').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(243, 245, 249)');
  await readable(page,'Forced-light selected weekday','.day[aria-pressed=true] .dow','.thumb');await page.click('[data-date="2026-10-17"]');
  assert.equal(await page.locator('.dc').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 240, 210)');await page.screenshot({path:'verification/theme-light-day-off.png'});
 });
 await check('System follows live OS changes and theme selection works from the keyboard',async()=>{
  await page.locator('.ft button').click();await page.getByRole('radio',{name:'System',exact:true}).check();await waitTheme(page,'system');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.getByRole('radio',{name:'System',exact:true}).focus();await page.keyboard.press('ArrowRight');await waitTheme(page,'light');
  assert.equal(await page.getByRole('radio',{name:'Light',exact:true}).evaluate(node=>node===document.activeElement),true);assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 });
 await check('A rejected theme save restores the saved appearance and selection',async()=>{
  await page.evaluate(()=>{const send=chrome.runtime.sendMessage;chrome.runtime.sendMessage=(message,callback)=>message.type==='WFM_SETTINGS_UPDATE'?queueMicrotask(()=>callback({ok:false})):send(message,callback);});
  await page.locator('.theme-options label:has(input[value=dark])').click();await page.waitForFunction(()=>![...document.querySelectorAll('input[name=theme]')].some(input=>input.disabled));
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');assert.equal(await page.getByRole('radio',{name:'Light',exact:true}).isChecked(),true);
 });
 await check('Snooze overlays follow the saved theme and System changes without changing the underlying website',async()=>{
  const state=fixture();state.settings.theme='dark';const overlay=await open(state,'light','/harness.html');
  await overlay.clock.setFixedTime(new Date('2026-10-18T10:56:00Z'));
  const background=await overlay.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor);
  await overlay.evaluate(()=>import('/extension/background.mjs'));await overlay.addScriptTag({url:env.base+'/extension/ring.js'});
  await overlay.waitForFunction(()=>window.__closedShadow?.querySelector('#control.visible'));
  const host=overlay.locator('#wfm-companion-edge-alert');assert.equal(await host.getAttribute('data-theme'),'dark');
  await overlay.evaluate(()=>window.__closedShadow.querySelector('#snooze-toggle').click());await overlay.screenshot({path:'verification/theme-dark-snooze.png'});
  await overlay.evaluate(()=>new Promise(resolve=>chrome.runtime.sendMessage({type:'WFM_SETTINGS_UPDATE',patch:{theme:'light'}},resolve)));
  await overlay.waitForFunction(()=>document.getElementById('wfm-companion-edge-alert').dataset.theme==='light');
  const button=await overlay.evaluate(()=>{const button=window.__closedShadow.querySelector('.op:not(:disabled)');return {foreground:getComputedStyle(button.querySelector('b')).color,meta:getComputedStyle(button.querySelector('span')).color,background:getComputedStyle(button).backgroundColor};});
  assert.equal(button.background,'rgb(243, 245, 249)');assert.ok(contrast(button.foreground,button.background)>=4.5);assert.ok(contrast(button.meta,button.background)>=4.5);
  await overlay.screenshot({path:'verification/theme-light-snooze.png'});
  assert.equal(await overlay.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),background);assert.equal(await overlay.locator('html').getAttribute('data-theme'),null);
  await overlay.evaluate(()=>new Promise(resolve=>chrome.runtime.sendMessage({type:'WFM_SETTINGS_UPDATE',patch:{theme:'system'}},resolve)));await overlay.emulateMedia({colorScheme:'dark'});
  await overlay.waitForFunction(()=>document.getElementById('wfm-companion-edge-alert').dataset.theme==='dark');await overlay.close();
 });
 await check('The WFM banner applies theme tokens to its own host and keeps action contrast',async()=>{
  const state=fixture();state.settings.theme='light';const banner=await open(state,'dark','/harness.html');await banner.evaluate(()=>import('/extension/background.mjs'));
  // Allow only the local harness origin at the script's entry boundary. All
  // banner/settings code runs unchanged; no WFM DOM or authenticated RPC is used.
  const source=(await readFile('extension/wfm-banner.js','utf8')).replace("if(location.origin!=='http://svdt1ipccwfm09:8070')return;",'');
  await banner.addScriptTag({content:source});await banner.waitForFunction(()=>window.__closedShadow?.host.dataset.theme==='light');
  const colors=await banner.evaluate(()=>{const button=window.__closedShadow.querySelector('.go'),style=getComputedStyle(button);return {foreground:style.color,background:style.backgroundColor};});
  assert.ok(contrast(colors.foreground,colors.background)>=4.5);assert.equal(await banner.locator('html').getAttribute('data-theme'),null);await banner.close();
 });
 await page.close();assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile('verification/theme-report.json',JSON.stringify(report,null,2));await env.close();}
