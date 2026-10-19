import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {start,init,NOW} from './browser-harness.mjs';
const env=await start(),report={checks:[],errors:[]};
await mkdir('verification',{recursive:true});
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
try{
 const page=await env.browser.newPage({viewport:{width:380,height:600},colorScheme:'dark',reducedMotion:'reduce'});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.clock.install({time:new Date(NOW)});await page.clock.pauseAt(new Date(Date.parse(NOW)+60000));await init(page);
 await page.goto(env.base+'/extension/popup.html');await page.waitForSelector('.ev');
 await page.evaluate(()=>window.__wfmStatus=401);
 const refresh=async()=>{await page.locator('.hd .btn').click();await page.waitForSelector('#popup-toast.visible .toast-action');};
 await check('Expired-session toast offers Log in and stays visible while hovered',async()=>{
  await refresh();assert.equal(await page.locator('.toast-action').textContent(),'Log in');
  await page.clock.runFor(2000);await page.locator('#popup-toast').hover();await page.clock.runFor(10000);
  assert.equal(await page.locator('#popup-toast.visible').count(),1);
  await page.screenshot({path:'verification/session-toast.png',animations:'disabled'});
  const toast=await page.locator('#popup-toast').boundingBox(),footer=await page.locator('.ft').boundingBox();assert.ok(toast.y+toast.height<footer.y);
  await page.mouse.move(2,2);await page.clock.runFor(1500);assert.equal(await page.locator('#popup-toast.visible').count(),1);
  await page.clock.runFor(1000);assert.equal(await page.locator('#popup-toast.visible').count(),0);
 });
 await check('Keyboard focus pauses the toast and blur resumes its remaining lifetime',async()=>{
  await refresh();await page.locator('.toast-action').focus();await page.clock.runFor(10000);
  assert.equal(await page.locator('#popup-toast.visible').count(),1);
  await page.locator('.ft button').focus();await page.clock.runFor(4300);assert.equal(await page.locator('#popup-toast.visible').count(),0);
 });
 await check('Log in runs the existing login workflow once and stays visible while checking',async()=>{
  await refresh();await page.evaluate(()=>window.__wfmDelayMs=10000);
  await page.locator('.toast-action').click();await page.locator('.toast-action').evaluate(b=>b.click());
  assert.equal(await page.locator('.toast-action').getAttribute('aria-busy'),'true');
  await page.mouse.move(2,2);await page.clock.runFor(5000);
  assert.equal(await page.locator('#popup-toast.visible').count(),1);
  assert.equal(await page.evaluate(()=>window.__messages.filter(m=>m.type==='WFM_LOGIN_CHECK').length),1);
  await page.clock.runFor(5000);await page.waitForFunction(()=>document.querySelector('#popup-toast .toast-message')?.textContent==='WFM opened for sign-in.');
  assert.equal(await page.locator('#popup-toast.visible').count(),1);
  await page.clock.runFor(3200);assert.equal(await page.locator('#popup-toast.visible').count(),0);
 });
 await check('RPC format rejection shows troubleshooting feedback without falsely offering login',async()=>{
  const rpcPage=await env.browser.newPage({viewport:{width:380,height:600},reducedMotion:'reduce'});
  rpcPage.on('pageerror',e=>report.errors.push(e.message));await init(rpcPage);
  await rpcPage.addInitScript(()=>{
   window.__wfmStatus=200;
   const originalFetch=window.fetch;
   window.fetch=(url,options)=>{
    if(!String(url).startsWith('http://svdt1ipccwfm09'))return originalFetch(url,options);
    const response=new Response('//EX[1,["com.google.gwt.user.client.rpc.IncompatibleRemoteServiceException/3936916533"],0,7]',{status:200});
    Object.defineProperty(response,'url',{value:String(url)});return Promise.resolve(response);
   };
  });
  await rpcPage.goto(env.base+'/extension/popup.html');await rpcPage.waitForSelector('.ev');
  const before=await rpcPage.evaluate(()=>structuredClone(window.__storage.local.wfm_companion_state_v1));
  await rpcPage.locator('.hd .btn').click();await rpcPage.waitForSelector('#popup-toast.visible');
  assert.equal(await rpcPage.locator('#popup-toast .toast-message').textContent(),'WFM rejected the extension RPC format. Export diagnostics for troubleshooting.');
  assert.equal(await rpcPage.locator('#popup-toast .toast-action').count(),0);
  const after=await rpcPage.evaluate(()=>window.__storage.local.wfm_companion_state_v1);
  assert.deepEqual(after.week,before.week);assert.equal(after.lastUpdated,before.lastUpdated);
  assert.equal(after.lastError.reason,'rpc_error');
  await rpcPage.close();
 });
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{await writeFile('verification/toast-report.json',JSON.stringify(report,null,2));await env.close();}
