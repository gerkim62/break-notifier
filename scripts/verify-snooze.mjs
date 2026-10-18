import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {start,init} from './browser-harness.mjs';
const env=await start(),report={checks:[],errors:[]};
async function setup(original=false,width=1280){
 const page=await env.browser.newPage({viewport:{width,height:720}});await init(page);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(env.base+'/harness.html');await page.clock.setFixedTime(new Date('2026-10-18T10:56:00Z'));
 await page.evaluate(()=>import('/extension/background.mjs'));
 await page.addScriptTag({url:env.base+(original?'/scripts/original-ring.js':'/extension/ring.js')});
 await page.waitForFunction(()=>window.__closedShadow?.querySelector('#control.visible'));return page;
}
async function point(page,selector){return page.evaluate(s=>{const r=window.__closedShadow.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},selector);}
async function click(page,selector){const p=await point(page,selector);await page.mouse.click(p.x,p.y);}
const visible=page=>page.evaluate(()=>window.__closedShadow.querySelector('#snooze-menu').classList.contains('visible'));
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
try{
 await check('Original keyboard bug reproduced; repaired Enter/Space activation stays open',async()=>{
  const old=await setup(true);await old.waitForTimeout(400);await old.keyboard.press('Tab');await old.keyboard.press('Enter');assert.equal(await visible(old),false);await old.close();
  for(const key of ['Enter','Space']){const page=await setup();await page.keyboard.press('Tab');await page.keyboard.press(key);assert.equal(await visible(page),true);assert.equal(await page.evaluate(()=>window.__closedShadow.activeElement?.dataset.min),'1');await page.keyboard.press('Escape');assert.equal(await visible(page),false);await page.close();}
 });
 await check('Initial mouse click opens Snooze without waiting for a width transition',async()=>{
  const page=await setup();await click(page,'#snooze-toggle');assert.equal(await visible(page),true);await page.close();
 });
 await check('Mouse selection persists snooze, hides edge and island, and shows confirmation',async()=>{
  const page=await setup();await click(page,'#snooze-toggle');await page.screenshot({path:'verification/snooze-menu.png'});
  await click(page,'[data-min="1"] b');await page.waitForFunction(()=>Object.values(window.__storage.local.wfm_companion_state_v1.snoozes).length===1);
  assert.equal(await page.evaluate(()=>window.__closedShadow.querySelector('#edge').classList.contains('visible')),false);
  assert.equal(await page.evaluate(()=>window.__closedShadow.querySelector('#control').classList.contains('visible')),false);
  assert.equal(await page.evaluate(()=>window.__closedShadow.querySelector('#snooze-feedback').textContent),'Snoozed for 1 min');
  assert.equal(await page.evaluate(()=>window.__messages.filter(m=>m.type==='WFM_SNOOZE').length),1);
  assert.equal(await page.evaluate(()=>window.__fetches.length),0);
  await page.waitForTimeout(160);await page.screenshot({path:'verification/snooze-confirmed.png',animations:'disabled'});
  // Persisted snooze is still applied after the content script reloads.
  await page.evaluate(()=>window.__closedShadow.querySelector('#snooze-feedback').textContent='');
  const current=await page.evaluate(()=>new Promise(r=>chrome.runtime.sendMessage({type:'WFM_GET_STATE'},r)));assert.ok(Object.values(current.state.snoozes)[0]>Date.parse('2026-10-18T10:56:00Z'));
  await page.clock.setFixedTime(new Date('2026-10-18T10:57:01Z'));await page.waitForFunction(()=>window.__closedShadow.querySelector('#edge').classList.contains('visible'));await page.close();
 });
 await check('Keyboard arrows skip disabled durations and Enter snoozes',async()=>{
  const page=await setup();await page.keyboard.press('Tab');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>window.__closedShadow.activeElement?.dataset.min),'2');
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>window.__closedShadow.activeElement?.dataset.min),'1');
  await page.keyboard.press('Enter');await page.waitForFunction(()=>Object.keys(window.__storage.local.wfm_companion_state_v1.snoozes).length===1);await page.close();
 });
 await check('Outside click closes menu; close island compacts and pointer return reopens',async()=>{
  const page=await setup();await click(page,'#snooze-toggle');await page.mouse.click(20,20);assert.equal(await visible(page),false);
  await click(page,'#dismiss');assert.equal(await page.evaluate(()=>window.__closedShadow.querySelector('#control').classList.contains('collapsed')),true);
  await page.mouse.move(100,100);await page.waitForTimeout(300);const p=await point(page,'#control');await page.mouse.move(p.x,p.y);await page.waitForFunction(()=>!window.__closedShadow.querySelector('#control').classList.contains('collapsed'));await page.close();
 });
 await check('Small viewport keeps active snooze choices clickable',async()=>{
  const page=await setup(false,360);await click(page,'#snooze-toggle');assert.equal(await visible(page),true);const p=await point(page,'[data-min="1"]');assert.ok(p.x>0&&p.x<360);await click(page,'[data-min="1"]');await page.waitForFunction(()=>Object.keys(window.__storage.local.wfm_companion_state_v1.snoozes).length===1);await page.close();
 });
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{await writeFile('verification/snooze-report.json',JSON.stringify(report,null,2));await env.close();}
