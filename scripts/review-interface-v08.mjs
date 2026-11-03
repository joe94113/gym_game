import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/ergonomics-review';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({deviceScaleFactor:1}),errors=[],layouts=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.setViewportSize({width:1280,height:800});await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 for(const [width,height]of [[1280,800],[1440,1000]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>window.__FORM__.world.update(0));await page.screenshot({path:`${dir}/welcome-${width}.png`});
  layouts.push(await page.evaluate(()=>({view:[innerWidth,innerHeight],cardBottom:document.querySelector('.welcome-card').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,start:[...document.querySelectorAll('[data-action="start"],[data-action="free"]')].map(e=>{const r=e.getBoundingClientRect();return{label:e.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom};})})));
 }
 const pass=!errors.length&&layouts.every(l=>!l.overflow&&l.start.every(r=>r.top>=0&&r.bottom<=Math.min(l.view[1],l.cardBottom)&&r.left>=0&&r.right<=l.view[0]));writeFileSync(`${dir}/interface-layout.json`,JSON.stringify({pass,errors,layouts},null,2));console.log(JSON.stringify({pass,errors,layouts}));if(!pass)process.exitCode=1;
}finally{await browser.close();}
