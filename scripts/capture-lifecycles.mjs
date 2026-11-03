import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('artifacts/lifecycle-views',{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:.75}),errors=[],reports=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();
  for(const [id,direction,phase]of [['dumbbell-bench-press','enter',.68],['machine-decline-chest-press','enter',.72],['machine-leg-press','exit',.48],['machine-hip-adduction','enter',.65]]){
    const report=await page.evaluate(({id,direction,phase})=>{
      const a=window.__FORM__,w=a.world;w.inspectView(null);a.openExercise(id);if(!w.advanceUntilReady())throw new Error(`Cannot approach ${id}`);
      const inspected=w.inspectLifecycle(direction,phase),b=w.getBodyWorldPoints();return{id,direction,phase,stage:inspected.frame.stage,focus:b.hip.map((v,i)=>(v+b.shoulder[i])/2),heading:w.getHeading(),reach:inspected.contact.maxReachError,collisions:inspected.clearance.collisions};
    },{id,direction,phase});
    for(const [view,angle]of [['front',0],['side',Math.PI/2],['back',Math.PI]]){
      await page.evaluate(({focus,heading,angle})=>{const radius=4.4,yaw=heading+angle;window.__FORM__.world.inspectView({position:[focus[0]+Math.sin(yaw)*radius,focus[1]+1.25,focus[2]+Math.cos(yaw)*radius],target:focus});},{...report,angle});
      await page.screenshot({path:`artifacts/lifecycle-views/${id}-${view}.png`});
    }
    await page.evaluate(()=>{const w=window.__FORM__.world;w.inspectView(null);w.seekExercise(0);w.stopExercise();w.advanceUntilIdle();});reports.push(report);console.log(JSON.stringify(report));
  }
  await page.evaluate(()=>window.__FORM__.world.inspectView({position:[24,20,26],target:[0,0,-2]}));await page.screenshot({path:'artifacts/lifecycle-views/expanded-club.png'});
  writeFileSync('artifacts/lifecycle-views/report.json',JSON.stringify({errors,reports},null,2));if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
