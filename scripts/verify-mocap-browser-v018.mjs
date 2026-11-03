import {activityById} from '../src/activity-catalog.js';
import {chromium,expect} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashMobileSources,changedHashes} from './mobile-performance-common-v016.mjs';

const directory=process.argv.find(x=>x.startsWith('--output='))?.slice(9)||'artifacts/mocap-v018/browser';mkdirSync(directory,{recursive:true});
const sourceHashes=hashMobileSources(),errors=[],images=[],cases=[],startedAt=new Date().toISOString();
const browser=await chromium.launch({...config.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[]});
try{
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{polling:100,timeout:120000});await page.locator('[data-action=free]').click();
  for(const id of ['dumbbell-shoulder-press','dumbbell-goblet-squat','dumbbell-curl','dumbbell-hammer-curl','dumbbell-lateral-raise','dumbbell-romanian-deadlift','cable-straight-bar-curl','cable-ez-bar-curl','cable-rope-hammer-curl','machine-preacher-curl','machine-squat-rack','machine-smith-squat','machine-hack-squat','machine-leg-press','machine-leg-extension','machine-leg-curl','machine-calf-raise','machine-seated-row']){
    await page.evaluate(id=>{const a=window.__FORM__,w=a.world;if(w.getActivityState().exerciseId){w.seekExercise(0);w.stopExercise();if(!w.advanceUntilIdle(180,false))throw Error('Cannot finish previous');}a.openExercise(id);if(!w.advanceUntilReady(180,false))throw Error('Cannot enter '+id);w.setAnimationPaused(false);},id);
    if(id!=='machine-seated-row')await expect(page.locator(`[data-mocap-source="${id}"]`)).toBeVisible();
    const before=await page.evaluate(()=>({body:window.__FORM__.world.getBodyWorldPoints(),activity:window.__FORM__.world.getActivityState()}));
    await page.waitForTimeout(6500);
    const live=await page.evaluate(()=>{const w=window.__FORM__.world;return{body:w.getBodyWorldPoints(),activity:w.getActivityState(),source:w.getMotionSource(),contact:w.getContactDiagnostics(),self:w.getSelfClearanceDiagnostics(),clearance:w.getClearanceDiagnostics(),muscles:w.getMuscleHighlights(),quality:w.getPerformanceDiagnostics()};});
    expect(JSON.stringify(live.body)).not.toBe(JSON.stringify(before.body));expect(live.activity.stage).toBe('exercising');if(id!=='machine-seated-row'){expect(live.source.humanApproval).toBe(false);expect(live.source.kind).toBeTruthy();}expect(live.contact.maxContactError).toBeLessThan(.015);expect(live.self.collisions).toEqual([]);expect(live.clearance.collisions).toEqual([]);expect(live.muscles.primary.length).toBeGreaterThan(0);expect([...live.muscles.secondary].sort()).toEqual([...(activityById(id).secondaryMuscleKeys||[])].sort());
    await page.locator('[data-action=pause]').click();
    for(const [direction,phase]of [['enter',id==='machine-seated-row'?.17:.35],['loop',.35],['exit',id==='machine-seated-row'?.83:.65]])for(const view of ['front','side','back']){
      const capture=await page.evaluate(({direction,phase,view})=>{const w=window.__FORM__.world;if(direction==='loop')w.inspectExercise(phase);else w.inspectLifecycle(direction,phase);const result=w.capturePoseReview(view,512);if(!result?.image)throw Error('No render');return{image:result.image,contact:w.getContactDiagnostics(),muscles:w.getMuscleHighlights()};},{direction,phase,view});
      const path=`${directory}/${id}-${direction}-${Math.round(phase*100)}-${view}.png`;writeFileSync(path,Buffer.from(capture.image.split(',')[1],'base64'));images.push({id,direction,phase,view,path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),contact:capture.contact});
    }
    cases.push({id,before,live});console.log(JSON.stringify({id,pass:true,images:9,contactError:live.contact.maxContactError}));
  }
  await context.close();
  const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}),pagePhone=await phone.newPage();pagePhone.on('pageerror',e=>errors.push(e.message));await pagePhone.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await pagePhone.goto('http://127.0.0.1:5173/?exercise=dumbbell-shoulder-press');await pagePhone.waitForFunction(()=>window.__FORM__?.state.loaded,null,{polling:100,timeout:120000});await pagePhone.evaluate(()=>{const w=window.__FORM__.world;if(!w.advanceUntilReady(180,false))throw Error('Cannot join mobile exercise');});
  await expect(pagePhone.locator('[data-mobile-exit]')).toBeVisible();await pagePhone.locator('[data-mobile-panel-toggle]').tap();await expect(pagePhone.locator('[data-mocap-source]')).toContainText('真人肩推');await pagePhone.screenshot({path:`${directory}/phone-source-note.png`});
  cases.push({id:'mobile-shoulder-press',quality:await pagePhone.evaluate(()=>window.__FORM__.world.getPerformanceDiagnostics())});await phone.close();
}catch(e){errors.push(e.stack||String(e));}finally{await browser.close();}
const changedSources=changedHashes(sourceHashes,hashMobileSources()),report={pass:!errors.length&&!changedSources.length&&cases.length===19&&images.length===162,startedAt,completedAt:new Date().toISOString(),sourceHashes,changedSources,cases,images,errors,scope:'Actual native desktop GPU renders and normal RAF animation. Manual setup/inspection is not FPS measurement. Mobile context is Chromium capability emulation, not physical phone. Images are static samples, not a trainer signoff.'};
writeFileSync(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,cases:cases.length,images:images.length,errors,changedSources}));if(!report.pass)process.exitCode=1;
