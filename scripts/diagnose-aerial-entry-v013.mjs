import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({...config.use.launchOptions,args:['--use-gl=angle','--use-angle=d3d11'],headless:true});
try{
 const page=await browser.newPage();await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});
 const report=await page.evaluate(()=>{const a=window.__FORM__,w=a.world;document.querySelector('[data-action=free]').click();a.openExercise('class-aerial');const trace=[];for(let t=0;t<240;t+=5){for(let i=0;i<100;i++)w.update(.05,false);const state=w.getActivityState(),classes=w.getClassDiagnostics();trace.push({t:t+5,state,position:w.getPlayerPosition(),classes,history:w.getActivityHistory()});if(state.stage==='exercising')break;}const meta=w.getLifecycleMetadata();let roundTrip=null;if(w.getActivityState().stage==='exercising'){w.stopExercise();const left=w.advanceUntilIdle(240,false),exitPosition=w.getPlayerPosition();a.openExercise('machine-chest-press');const started=w.getActivityState(),navigation=w.getFrameWorkDiagnostics().navigation,ready=w.advanceUntilReady(180,false);roundTrip={left,exitPosition,started,navigation,ready,ended:w.getActivityState()};}return{trace,meta,roundTrip};});
 writeFileSync('artifacts/aerial-v013/native-entry-diagnostics.json',JSON.stringify(report,null,2));console.log(JSON.stringify({meta:report.meta,last:report.trace.at(-1)?.state,roundTrip:report.roundTrip}));
}finally{await browser.close();}
