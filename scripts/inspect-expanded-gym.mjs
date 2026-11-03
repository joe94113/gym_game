import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:.75});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();
  const diagnostics=await page.evaluate(()=>({model:window.__FORM__.world.getModelInfo().kind,activityCount:window.__FORM__.activities.length,nav:window.__FORM__.world.getNavigationDiagnostics(),facilities:window.__FORM__.world.getFacilityDiagnostics(),crowd:window.__FORM__.world.getCrowdDiagnostics(),stats:window.__FORM__.world.getRenderStats()}));
  console.log(JSON.stringify({errors,...diagnostics}));
  await page.screenshot({path:'artifacts/gym-expanded-entrance.png'});
  if(process.argv.includes('--facilities')){
    for(const id of ['sauna','steam-room','cold-plunge','shower-1','toilet-1']){
      await page.evaluate(id=>window.__FORM__.openExercise(id),id);
      await page.waitForFunction(()=>!window.__FORM__.world.getActivityState().transitioning&&window.__FORM__.world.getActivityState().stage==='exercising',null,{timeout:60000});
      await page.screenshot({path:`artifacts/gym-facility-${id}.png`});
    }
  }
  writeFileSync('artifacts/gym-expanded-smoke.json',JSON.stringify({errors,...diagnostics},null,2));
}finally{await browser.close();}
