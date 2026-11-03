import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('artifacts/release',{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:.75});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const requested=new Set(process.argv.slice(2));
const cases=[['dumbbell-goblet-squat',.43],['dumbbell-romanian-deadlift',.43],['dumbbell-single-arm-row',.43],['seated-glute-stretch',.5],['cable-rope-face-pull',.43],['cable-ankle-kickback',.43],['machine-stair-climber',.28],['machine-bench-press',.43]].filter(([id])=>!requested.size||requested.has(id));
try{
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();
  for(const [id,phase]of cases){
    await page.evaluate(({id,phase})=>{const a=window.__FORM__;a.world.inspectView(null);a.openExercise(id);a.world.advanceUntilReady();a.world.setAnimationPaused(true);a.world.seekExercise(phase);for(let t=0;t<.9;t+=.05)a.world.update(.05,false);a.world.update(0);},{id,phase});
    await page.screenshot({path:`artifacts/release/${id}.png`});
    const result=await page.evaluate(()=>({state:window.__FORM__.world.getActivityState(),contacts:window.__FORM__.world.getContactDiagnostics(),clearance:window.__FORM__.world.getClearanceDiagnostics()}));
    if(result.state.exerciseId!==id)throw new Error(`Failed to start ${id}`);
    console.log(JSON.stringify({id,maxContactError:result.contacts.maxContactError,collisions:result.clearance?.collisions?.length}));
  }
  await page.keyboard.press('Escape');await page.evaluate(()=>{window.__FORM__.world.advanceUntilIdle();window.__FORM__.world.update(0);});
  await page.locator('.header-actions [data-action="coaches"]').click();await page.screenshot({path:'artifacts/release/coach-roster.png'});
  writeFileSync('artifacts/release/capture-errors.json',JSON.stringify(errors));
  if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
