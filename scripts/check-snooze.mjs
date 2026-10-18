import {mkdir,writeFile} from 'node:fs/promises';
import {start,init,fixture} from './browser-harness.mjs';
const env=await start();
try{
 const page=await env.browser.newPage({viewport:{width:1280,height:720}});await init(page);
 await page.goto(env.base+'/harness.html');await page.clock.setFixedTime(new Date('2026-10-18T10:56:00Z'));
 await page.evaluate(()=>import('/extension/background.mjs'));
 await page.addScriptTag({url:env.base+'/scripts/original-ring.js'});
 await page.waitForFunction(()=>window.__closedShadow?.querySelector('#control.visible'));
 await page.waitForTimeout(600);
 const box=await page.evaluate(()=>{const b=window.__closedShadow.querySelector('#snooze-toggle').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});
 await page.mouse.click(box.x,box.y);
 await page.waitForTimeout(400);
 const menu=await page.evaluate(()=>{const root=window.__closedShadow,menu=root.querySelector('#snooze-menu'),b=menu.querySelector('[data-min="1"]'),r=b.getBoundingClientRect();return {visible:menu.classList.contains('visible'),button:{x:r.x+r.width/2,y:r.y+r.height/2},html:root.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML};});
 await mkdir('verification',{recursive:true});await page.screenshot({path:'verification/snooze-before.png'});
 await page.mouse.click(menu.button.x,menu.button.y);await page.waitForTimeout(500);
 const result=await page.evaluate(()=>({snoozes:window.__storage.local.wfm_companion_state_v1.snoozes,messages:window.__messages.filter(m=>m.type==='WFM_SNOOZE'),menu:window.__closedShadow.querySelector('#snooze-menu').className}));
 const report={box,menu,result};await writeFile('verification/snooze-reproduction.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await env.close();}
