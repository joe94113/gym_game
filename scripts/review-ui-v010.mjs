import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const dir='artifacts/ui-v010';mkdirSync(dir,{recursive:true});
const sources=['src/trial-ui.js','src/training-route.js','src/training-ui.js','src/training-ui.css','src/training-plan.js'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),sourceHashes=hashes(),errors=[],layouts=[];
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
 await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;window.__FORM__.world.setGraphicsQuality('flow');});
 await page.locator('.header-actions [data-action="training-plan"]').click();await page.getByLabel('今天的訓練目標',{exact:true}).selectOption('mobility');await page.getByLabel('可用時間',{exact:true}).selectOption('15');await page.locator('[data-action="start-training-plan"]').click();
 await page.evaluate(()=>window.__FORM__.world.advanceUntilReady(180,false));await page.locator('[data-action="close-teaching"]').click();await page.evaluate(()=>{window.__FORM__.world.advanceUntilIdle(180,false);window.__FORM__.world.update(0);});
 for(const [width,height]of [[1280,800],[1440,1000]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>{window.__FORM__.world.resize();window.__FORM__.world.update(0);document.querySelector('.personal-route-panel').scrollTop=0;});
  layouts.push(await page.locator('.personal-route-panel').evaluate(panel=>{const r=panel.getBoundingClientRect();return{view:[innerWidth,innerHeight],panel:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},withinViewport:r.top>=0&&r.bottom<=innerHeight,horizontalOverflow:panel.scrollWidth>panel.clientWidth,font:Number.parseFloat(getComputedStyle(panel.querySelector('.mission-item strong')).fontSize),steps:panel.querySelectorAll('.mission-list>li').length};}));
  await page.screenshot({path:`${dir}/route-${width}-top.png`,animations:'disabled'});
  if(width===1280){await page.locator('.personal-route-panel').evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.screenshot({path:`${dir}/route-${width}-bottom.png`,animations:'disabled'});}
 }
 await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>window.__FORM__.world.resize());
 await page.locator('.mission-list [data-route-step]').last().click();await page.locator('.personal-route-panel [data-demo]').click();await page.evaluate(()=>{window.__FORM__.world.advanceUntilReady(180,false);window.__FORM__.world.update(0);});
 await page.screenshot({path:`${dir}/cooldown-context-1280.png`,animations:'disabled'});
 const context=await page.locator('.training-step-context').innerText(),final=hashes(),changedSources=sources.filter(p=>sourceHashes[p]!==final[p]);
 const pass=!errors.length&&!changedSources.length&&layouts.every(l=>l.withinViewport&&!l.horizontalOverflow&&l.font>=14&&l.steps===6)&&context.includes('緩和');
 writeFileSync(`${dir}/layout.json`,JSON.stringify({pass,errors,sourceHashes,changedSources,layouts,context,scope:'Actual desktop UI at 1280x800 and 1440x1000. Six exploration steps include separate warmup/cooldown visits. Internal vertical scrolling is intentional; no claim for all screen sizes.'},null,2));
 if(!pass)process.exitCode=1;console.log(JSON.stringify({pass,layouts}));
}finally{await browser.close();}
