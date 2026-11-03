import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:.65});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const advance=async(seconds=3)=>page.evaluate(seconds=>{for(let i=0;i<seconds/.05;i++)window.__FORM__.world.update(.05,false);window.__FORM__.world.update(0);},seconds);
const capture=async name=>{await page.screenshot({path:`artifacts/club-${name}.png`});console.log(`captured ${name}`);};
try{
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();await advance(3);await capture('entrance');
  await page.locator('.header-actions [data-action="coaches"]').click();await capture('coach-roster');
  await page.locator('[data-action="close-modal"]').click();
  for(const id of ['inbody','group-class']){
    await page.evaluate(id=>window.__FORM__.openExercise(id),id);await advance(id==='inbody'?11:4);await capture(id);
  }
  await page.locator('[data-action="close-teaching"]').first().click();await advance(2);
  const hasView=await page.evaluate(()=>typeof window.__FORM__.world.inspectView==='function');
  if(hasView){
    for(const [name,position,target]of [
      ['reception',[1.2,3.4,23.7],[-5.4,2.25,16.8]],
      ['consultation',[10.4,2.45,16.9],[5.2,1,13.3]],
      ['trainer-desk',[-1.8,2.35,14.4],[-5.5,1.15,10.8]],
      ['cardio',[4.5,7.6,-6.8],[-6,1.2,-23]],
    ]){await page.evaluate(({position,target})=>window.__FORM__.world.inspectView({position,target}),{position,target});await capture(name);}
  }
  const diagnostics=await page.evaluate(()=>({facility:window.__FORM__.world.getFacilityDiagnostics(),social:window.__FORM__.world.getSocialDiagnostics(),crowd:window.__FORM__.world.getCrowdDiagnostics(),nav:window.__FORM__.world.getNavigationDiagnostics(),stats:window.__FORM__.world.getRenderStats()}));
  writeFileSync('artifacts/club-life-visual-qa.json',JSON.stringify({errors,hasView,...diagnostics},null,2));console.log(JSON.stringify({errors,hasView,socialCount:diagnostics.social.count,cardioNPC:diagnostics.crowd.actors?.filter(actor=>actor.age>=55).length}));
}finally{await browser.close();}
