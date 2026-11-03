import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import config from '../playwright.config.js';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,...config.use.launchOptions});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.goto('http://127.0.0.1:5173');
await page.waitForFunction(()=>window.__FORM__?.state.loaded,{timeout:60000});
await page.screenshot({path:'artifacts/upgrade-welcome.png'});
await page.click('[data-action="free"]');
await page.waitForTimeout(1000);
await page.screenshot({path:'artifacts/upgrade-explore.png'});
for(const id of ['chest-press','plate-incline-press','hack-squat','hip-thrust']){
  await page.evaluate(stationId=>{const api=window.__FORM__;api.openStation(api.stations.find(s=>s.id===stationId));api.world.setAnimationPaused(true);},id);
  await page.waitForTimeout(1400);
  await page.evaluate(()=>{window.__FORM__.world.inspectExercise(.55,.55);});
  // Force a render of the sampled pose while keeping the standard camera update.
  await page.mouse.move(560,420);
  await page.mouse.wheel(0,-65);
  await page.waitForTimeout(400);
  await page.screenshot({path:`artifacts/upgrade-${id}.png`});
  console.log(id,JSON.stringify(await page.evaluate(()=>window.__FORM__.world.getContactDiagnostics())));
  await page.keyboard.press('Escape');
}
await page.click('[data-action="catalog"]');
await page.click('[data-catalog-category="plate-loaded"]');
await page.screenshot({path:'artifacts/upgrade-catalog.png'});
console.log(JSON.stringify({errors}));
await browser.close();
