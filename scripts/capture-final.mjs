import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import config from '../playwright.config.js';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,...config.use.launchOptions});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:60000});
  await page.click('[data-action="free"]');
  await page.screenshot({path:'artifacts/upgrade-explore-final.png'});
  await page.evaluate(()=>{const api=window.__FORM__;api.openStation(api.stations.find(s=>s.id==='plate-incline-press'));});
  await page.waitForFunction(()=>{const value=document.querySelector('#pose-progress')?.value;return value>.14&&value<.43;},null,{timeout:30000});
  await page.click('[data-action="pause"]');
  await page.click('[data-plate-load="20"]');
  await page.evaluate(()=>{document.querySelector('.station-scroll').scrollTop=0;});
  await page.mouse.move(610,420);
  await page.mouse.wheel(0,-100);
  await page.waitForTimeout(650);
  await page.screenshot({path:'artifacts/upgrade-plate-final.png'});
  console.log(JSON.stringify(await page.evaluate(()=>({contacts:window.__FORM__.world.getContactDiagnostics().maxContactError,plates:window.__FORM__.world.getPlateState('plate-incline-press')}))));
  await page.keyboard.press('Escape');
  await page.click('[data-action="catalog"]');
  await page.click('[data-catalog-category="plate-loaded"]');
  await page.screenshot({path:'artifacts/upgrade-catalog-final.png'});
  console.log(JSON.stringify({errors}));
} finally {
  await browser.close();
}
