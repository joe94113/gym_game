import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';
async function boot(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.evaluate(()=>{document.querySelector('[data-action=free]').click();window.__FORM__.world.setGraphicsQuality('flow');});return errors;}

test('實際真人只上傳一份骨架，運動與拿放的手腳和肌群保留',async({page},testInfo)=>{
 const errors=await boot(page),records=await page.evaluate(()=>{
  const a=window.__FORM__,w=a.world,records=[];
  for(const id of ['dumbbell-bench-press','cable-rope-crunch','machine-leg-press']){
   a.openExercise(id);if(!w.advanceUntilReady(180,false))throw Error(`not ready ${id}`);w.setAnimationPaused(true);
   for(const direction of ['enter','exit'])for(const phase of [0,.35,.65,1]){const sample=w.inspectLifecycle(direction,phase);records.push({id,direction,phase,contact:w.getContactDiagnostics(),clearance:sample.clearance,highlights:w.getMuscleHighlights()});}
   w.inspectExercise(.5);w.update(0);records.push({id,work:w.getFrameWorkDiagnostics(),contact:w.getContactDiagnostics(),clearance:w.getClearanceDiagnostics(),highlights:w.getMuscleHighlights()});w.stopExercise();if(!w.advanceUntilIdle(180,false))throw Error('exit not complete');
  }return records;
 });
 for(const record of records){expect(record.contact.maxReachError).toBeLessThan(.015);expect(record.clearance.collisions).toEqual([]);expect(record.highlights.primary.length).toBeGreaterThan(0);expect(record.highlights.secondary.length).toBeGreaterThan(0);if(record.work){expect(record.work.skeleton.originalSkeletonCount).toBe(8);expect(record.work.skeleton.uniqueSkeletonCount).toBe(1);expect(record.work.skeleton.allocatedBoneTextures).toBe(1);}}
 expect(errors).toEqual([]);await testInfo.attach('skeleton-production-v012',{body:JSON.stringify(records),contentType:'application/json'});
});

test('視野外電視與閒置InBody停止重畫，轉回來同幀播放目前進度',async({page},testInfo)=>{
 const errors=await boot(page),result=await page.evaluate(()=>{
  const w=window.__FORM__.world;w.inspectView({position:[0,5,30],target:[0,5,55]});w.update(0);const hidden=w.getFacilityDiagnostics();for(let i=0;i<60;i++)w.update(.05,false);w.update(0);const afterHidden=w.getFacilityDiagnostics();
  w.inspectView({position:[5,4,-15],target:[5,3.6,-28.7]});w.update(0);const revealed=w.getFacilityDiagnostics();w.update(0);const sameTime=w.getFacilityDiagnostics();
  return{hidden,afterHidden,revealed,sameTime};
 });
 expect(result.afterHidden.canvasUpdates.sports.redraws).toBe(result.hidden.canvasUpdates.sports.redraws);expect(result.afterHidden.inbody.canvas.redraws).toBe(result.hidden.inbody.canvas.redraws);
 expect(result.revealed.canvasUpdates.sports.redraws).toBeGreaterThan(result.afterHidden.canvasUpdates.sports.redraws);expect(result.revealed.canvasUpdates.sports.screens.some(screen=>screen.visible&&screen.lastDrawTime>=2.99)).toBe(true);expect(result.sameTime.canvasUpdates.sports.redraws).toBe(result.revealed.canvasUpdates.sports.redraws);
 expect(errors).toEqual([]);await testInfo.attach('visible-canvas-production-v012',{body:JSON.stringify(result),contentType:'application/json'});
});
