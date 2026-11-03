import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {coursePlanFor} from '../src/classes/class-timeline.js';

const folder='artifacts/full-course-review';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[],screens=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();await page.locator('.header-actions [data-action="classes"]').click();
  await page.screenshot({path:`${folder}/ui-course-menu.png`});
  await page.locator('[data-demo="class-barbell"]').click();
  await page.evaluate(()=>{const w=window.__FORM__.world;if(!w.advanceUntilReady(180,false))throw new Error('Cannot join lesson');w.setAnimationPaused(true);});
  const b=coursePlanFor('barbell').blocks.find(b=>b.motionId==='biceps-curl'),time=b.startSeconds+(Math.floor(b.repetitions/2)+.5)*b.seconds/b.repetitions;
  await page.evaluate(phase=>{const w=window.__FORM__.world;w.seekExercise(phase);w.update(0);},time/1800);
  async function capture(name){
    await page.screenshot({path:`${folder}/${name}.png`});
    screens.push(await page.evaluate(name=>{const rect=selector=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};return{name,width:innerWidth,height:innerHeight,panel:rect('.class-panel'),controls:rect('.class-controls'),footer:rect('.class-panel .station-footer'),completion:rect('#class-completion'),completionActions:rect('.class-completion-actions'),scrollArea:rect('.class-panel .station-scroll'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,elapsed:document.querySelector('#class-time-elapsed')?.textContent,remaining:document.querySelector('#class-time-remaining')?.textContent,title:document.querySelector('#class-completion-title')?.textContent};},name));
  }
  await capture('ui-class-in-progress');await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>window.__FORM__.world.update(0));await capture('ui-class-compact');
  await page.evaluate(()=>{const w=window.__FORM__.world;w.seekExercise(1);w.update(0);});await capture('ui-class-completed');
  writeFileSync(`${folder}/ui-layout.json`,JSON.stringify({errors,screens},null,2));
  if(errors.length||screens.some(s=>s.horizontalOverflow||s.footer.bottom>s.height+1||s.panel.right>s.width+1||s.controls.bottom>s.height+1||(s.completion.width>0&&s.completionActions&&(s.completionActions.bottom>s.scrollArea.bottom+1||s.completionActions.y<s.scrollArea.y-1))))process.exitCode=1;
  console.log(JSON.stringify({errors,screens}));
}finally{await browser.close();}
