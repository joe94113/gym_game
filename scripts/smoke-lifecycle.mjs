import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:.5});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();
  console.log(JSON.stringify(await page.evaluate(()=>({stations:window.__FORM__.stations.length,activities:window.__FORM__.activities.length,unreachable:window.__FORM__.world.getNavigationDiagnostics().filter(p=>!p.reachable||p.blocked)}))));
  const reports=[];
  for(const id of process.argv.slice(2).length?process.argv.slice(2):['machine-leg-press','dumbbell-bench-press','rope-pushdown','facility-cold-plunge']){
    const report=await page.evaluate(id=>{
      const a=window.__FORM__,w=a.world;a.openExercise(id);const started=w.getActivityState();const ready=w.advanceUntilReady();
      const state=w.getActivityState(),contact=w.getContactDiagnostics(),clearance=w.getClearanceDiagnostics();
      w.stopExercise();const exited=w.advanceUntilIdle();
      return{id,started,ready,state,contact:contact?{reach:contact.maxReachError,error:contact.maxContactError}:null,collisions:clearance?.collisions,exited};
    },id);reports.push(report);console.log(JSON.stringify(report));
  }
  writeFileSync('artifacts/lifecycle-smoke.json',JSON.stringify({errors,reports},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
