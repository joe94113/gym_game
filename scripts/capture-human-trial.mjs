import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import config from '../playwright.config.js';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,...config.use.launchOptions});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:90000});
  const quick=process.argv.includes('--quick');
  if(!quick)await page.screenshot({path:'artifacts/human-trial-welcome.png'});
  await page.locator('[data-action="free"]').click();
  for(const [id,phase]of (quick?[['dumbbell-curl',.3]]:[['dumbbell-curl',.3],['dumbbell-bench-press',.3],['rope-pushdown',.4],['single-arm-cable-row',.35],['kneeling-hip-flexor-stretch',.5]])){
    await page.evaluate(id=>window.__FORM__.openExercise(id),id);
    await page.locator('[data-action="pause"]').click();
    await page.locator('#pose-scrub').evaluate((input,phase)=>{input.value=String(phase);input.dispatchEvent(new Event('input',{bubbles:true}));},phase);
    await page.waitForFunction(()=>!window.__FORM__.world.getActivityState().transitioning,null,{timeout:20000});
    await page.screenshot({path:`artifacts/human-trial-${id}.png`});
    if(quick)console.log(JSON.stringify(await page.evaluate(()=>{const input=document.querySelector('#pose-scrub'),panel=document.querySelector('.station-controls');return{zone:window.__FORM__.state.zone,phase:window.__FORM__.world.getActivityState().phase,sliderVisible:input.getBoundingClientRect().bottom<=panel.getBoundingClientRect().bottom};})));
    await page.keyboard.press('Escape');
  }
  if(!quick){await page.locator('.header-actions [data-action="library"]').click();await page.screenshot({path:'artifacts/human-trial-library.png'});}
  console.log(JSON.stringify({errors,model:await page.evaluate(()=>{const info=window.__FORM__.world.getModelInfo();return{kind:info.kind,height:info.metrics.height,bones:info.boneCount,meshes:info.skinnedMeshCount};})}));
}finally{await browser.close();}
