import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {start,init,fixture} from './browser-harness.mjs';
const env=await start(),report={checks:[],errors:[]};
await mkdir('verification',{recursive:true});
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
async function open(options={},state=fixture()){
 const page=await env.browser.newPage({viewport:{width:380,height:600},colorScheme:'dark',...options});
 page.on('pageerror',error=>report.errors.push(error.message));await init(page,state);return page;
}
const freeze=async(page,selector,time)=>page.locator(selector).evaluate((node,time)=>{
 const animations=node.getAnimations();for(const animation of animations){animation.pause();animation.currentTime=time;}
 const m=new DOMMatrix(getComputedStyle(node).transform);return {x:m.m41,y:m.m42,scale:m.a,count:animations.length};
},time);
try{
 const page=await open();await page.goto(env.base+'/extension/popup.html');await page.waitForSelector('.ev');
 await page.waitForFunction(()=>document.querySelector('.hd .btn').getAttribute('aria-busy')==='false');
 await check('Popup opening refreshes once, and gaps describe intervals without claiming free time',async()=>{
  assert.equal(await page.evaluate(()=>window.__messages.filter(message=>message.type==='WFM_REFRESH').length),1);
  assert.equal(await page.evaluate(()=>window.__messages.find(message=>message.type==='WFM_REFRESH').trigger),'popup');
  const gaps=await page.locator('.gtext').allTextContents();assert.ok(gaps.some(text=>text.includes('until Lunch Break')));
  assert.ok(gaps.some(text=>text.includes('between activities')));assert.ok(gaps.every(text=>!text.includes('free')));
 });
 await check('Underline selection animates through intermediate frames and retargets without jumping',async()=>{
  await page.evaluate(()=>{window.__underline=document.querySelector('.filter-underline');document.querySelectorAll('.seg button')[1].click();});
  const middle=await freeze(page,'.filter-underline',100);assert.equal(middle.count,1);assert.ok(middle.x>0&&middle.x<120);
  assert.equal(await page.locator('.empty-hint').textContent(),'No schedule detected.');
  await page.screenshot({path:'verification/underline-mid.png'});
  const continuity=await page.evaluate(()=>{
   const before=new DOMMatrix(getComputedStyle(window.__underline).transform).m41;
   document.querySelectorAll('.seg button')[2].click();const animation=window.__underline.getAnimations()[0];animation.pause();animation.currentTime=0;
   return {before,after:new DOMMatrix(getComputedStyle(window.__underline).transform).m41,same:window.__underline===document.querySelector('.filter-underline')};
  });assert.equal(continuity.same,true);assert.ok(Math.abs(continuity.before-continuity.after)<.5);
  const end=await freeze(page,'.filter-underline',380);assert.ok(end.x>220&&end.x<240);
  await page.screenshot({path:'verification/underline-settled.png'});
  await page.locator('.seg [role=tab]').last().focus();await page.keyboard.press('Home');
  assert.equal(await page.locator('.seg [aria-selected=true]').textContent(),'Breaks & events');
  assert.equal(await page.locator('.seg :focus').getAttribute('aria-selected'),'true');
 });
 await check('Picker and ring share interruptible motion and settle correctly after rapid day changes',async()=>{
  await page.evaluate(()=>{window.__ring=document.querySelector('#shared-countdown');window.__thumb=document.querySelector('#thumb');document.querySelector('[data-date="2026-10-12"]').click();});
  const middle=await freeze(page,'#thumb',100),ring=await freeze(page,'#shared-countdown',100);
  assert.equal(middle.count,1);assert.ok(middle.x>0&&middle.x<290);assert.equal(ring.count,1);assert.ok(ring.scale>.38&&ring.scale<1);
  await page.screenshot({path:'verification/day-ring-mid.png'});
  const continuity=await page.evaluate(()=>{
   const nodes=[window.__thumb,window.__ring],before=nodes.map(node=>getComputedStyle(node).transform);
   document.querySelector('#today').click();
   return nodes.map((node,i)=>{const animation=node.getAnimations()[0];animation.pause();animation.currentTime=0;return {before:before[i],after:getComputedStyle(node).transform};});
  });for(const frame of continuity)assert.equal(frame.before,frame.after);
  await freeze(page,'#thumb',380);await freeze(page,'#shared-countdown',380);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>window.__ring===document.querySelector('#shared-countdown')&&window.__thumb===document.querySelector('#thumb')),true);
  const aligned=await page.evaluate(()=>{const a=document.querySelector('#shared-countdown').getBoundingClientRect(),b=document.querySelector('.hero .ring').getBoundingClientRect();return Math.abs(a.x-b.x)<1&&Math.abs(a.y-b.y)<1;});assert.equal(aligned,true);
  await page.screenshot({path:'verification/day-ring-settled.png'});
 });
 await check('Queue cards have readable spacing and remain inside the popup',async()=>{
  await page.evaluate(()=>document.querySelectorAll('.seg button')[2].click());await page.waitForTimeout(400);
  const cards=await page.locator('.ev .card').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,top:r.top,bottom:r.bottom};}));
  assert.ok(cards.every(card=>card.x>=0&&card.right<=380));
  for(let i=1;i<cards.length;i++)assert.ok(cards[i].top-cards[i-1].bottom>=8);
 });
 await check('Reduced motion switches tabs and docks the ring immediately',async()=>{
  const reduced=await open({reducedMotion:'reduce'});await reduced.goto(env.base+'/extension/popup.html');await reduced.waitForSelector('.ev');
  await reduced.evaluate(()=>{document.querySelector('[data-date="2026-10-12"]').click();document.querySelectorAll('.seg button')[2].click();});
  for(const selector of ['#thumb','#shared-countdown','.filter-underline'])assert.equal(await reduced.locator(selector).evaluate(node=>node.getAnimations().length),0);
  await reduced.screenshot({path:'verification/reduced-motion.png'});await reduced.close();
  await page.evaluate(()=>document.querySelector('[data-date="2026-10-12"]').click());
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);
  assert.equal(await page.locator('#shared-countdown').evaluate(node=>node.getAnimations().length),0);
  await page.emulateMedia({reducedMotion:'no-preference'});
 });
 await check('An empty cache loads automatically and late week responses preserve the selected day',async()=>{
  const state=fixture();state.week=null;state.lastUpdated=null;const loading=await open({},state);
  await loading.addInitScript(week=>{window.__fixtureWeek=week;window.__scheduleDelayMs=700;},fixture().week);
  await loading.goto(env.base+'/extension/popup.html');await loading.waitForSelector('.empty-hint[aria-busy=true]');
  assert.equal(await loading.locator('.empty-hint').textContent(),'Loading schedule…');
  assert.equal(await loading.locator('.hero').count(),0);await loading.screenshot({path:'verification/schedule-loading.png'});
  await loading.waitForSelector('.ev');await loading.waitForFunction(()=>document.querySelector('.hd .btn').getAttribute('aria-busy')==='false');
  await loading.click('#next');await loading.waitForSelector('.empty-hint[aria-busy=true]');await loading.click('#today');
  await loading.waitForFunction(()=>window.__storage.local.wfm_companion_state_v1.weeks?.['2026-10-19']);
  assert.equal(await loading.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-10-18');
  assert.equal(await loading.evaluate(()=>window.__storage.local.wfm_companion_state_v1.week.weekStart),'2026-10-12');
  assert.equal(await loading.evaluate(()=>window.__messages.filter(message=>message.type==='WFM_REFRESH').length),2);
  await loading.screenshot({path:'verification/schedule-loaded.png'});
  await loading.evaluate(()=>{window.__scheduleError='network_error';window.__scheduleDelayMs=0;});
  await loading.click('#next');await loading.click('#next');await loading.waitForSelector('.missing-week .btn');
  assert.match(await loading.locator('.missing-week').textContent(),/Could not reach WFM/);await loading.waitForTimeout(400);await loading.screenshot({path:'verification/schedule-load-error.png'});
  await loading.locator('.missing-week .btn').focus();await loading.waitForTimeout(1100);assert.equal(await loading.locator('.missing-week .btn:focus').count(),1);
  await loading.evaluate(()=>window.__scheduleError=null);await loading.locator('.missing-week .btn').click();await loading.waitForSelector('.ev');
  assert.equal(await loading.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-11-01');await loading.close();
 });
 await check('A successfully loaded empty week says No schedule detected',async()=>{
  const empty=await open({}, {...fixture(),week:null});await empty.goto(env.base+'/extension/popup.html');
  await empty.waitForSelector('.journey .empty-hint');await empty.waitForFunction(()=>document.querySelector('.hd .btn').getAttribute('aria-busy')==='false');
  assert.equal(await empty.locator('.empty-hint').textContent(),'No schedule detected.');assert.equal(await empty.locator('.hero').count(),0);
  await empty.screenshot({path:'verification/no-schedule.png'});await empty.close();
 });
 await check('Signed-out automatic loading offers Log in without opening WFM until requested',async()=>{
  const signedOut=await open({}, {...fixture(),week:null,lastUpdated:null});await signedOut.addInitScript(()=>window.__wfmStatus=401);
  await signedOut.goto(env.base+'/extension/popup.html');await signedOut.waitForSelector('.missing-week .btn');
  assert.equal(await signedOut.locator('.missing-week .btn').textContent(),'Log in');
  assert.equal(await signedOut.evaluate(()=>window.__messages.some(message=>message.type==='WFM_LOGIN_CHECK')),false);
  await signedOut.screenshot({path:'verification/schedule-login.png'});
  await signedOut.locator('.missing-week .btn').click();await signedOut.waitForSelector('#popup-toast.visible');
  assert.equal(await signedOut.evaluate(()=>window.__messages.filter(message=>message.type==='WFM_LOGIN_CHECK').length),1);
  assert.equal(await signedOut.locator('#popup-toast .toast-message').textContent(),'WFM opened for sign-in.');await signedOut.close();
 });
 await check('A successful login check resumes loading the selected week',async()=>{
  const login=await open();await login.goto(env.base+'/extension/popup.html');await login.waitForSelector('.ev');
  await login.waitForFunction(()=>document.querySelector('.hd .btn').getAttribute('aria-busy')==='false');
  await login.evaluate(()=>window.__wfmStatus=401);await login.click('#next');await login.waitForSelector('.missing-week .btn');
  await login.evaluate(()=>window.__wfmStatus=0);await login.locator('.missing-week .btn').click();await login.waitForSelector('.ev');
  assert.equal(await login.locator('.day[aria-pressed=true]').getAttribute('data-date'),'2026-10-25');
  assert.ok(await login.evaluate(()=>window.__storage.local.wfm_companion_state_v1.weeks?.['2026-10-19']));await login.close();
 });
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile('verification/polish-report.json',JSON.stringify(report,null,2));await env.close();}
