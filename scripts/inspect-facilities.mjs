import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:.5});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();
  await page.screenshot({path:'artifacts/architecture-palette-entrance.png'});
  for(const id of (process.argv.includes('--quick')?['sauna','shower-1']:['sauna','cold-plunge','shower-1','toilet-1'])){
    await page.evaluate(id=>window.__FORM__.openExercise(id),id);
    await page.waitForFunction(()=>!window.__FORM__.world.getActivityState().transitioning&&window.__FORM__.world.getActivityState().stage==='exercising',null,{timeout:90000});
    await page.screenshot({path:`artifacts/architecture-${id}.png`});
    console.log(JSON.stringify({id,state:await page.evaluate(()=>window.__FORM__.world.getActivityState()),errors}));
  }
}finally{await browser.close();}
