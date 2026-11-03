import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

async function boot(page,{missingLod=false}={}){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 if(missingLod)await page.route('**/models/athlete/lod-v010/manifest.json',r=>r.fulfill({status:404,body:'missing'}));
 await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
 await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;window.__FORM__.world.setGraphicsQuality('flow');});
 return errors;
}

test('平躺與上斜的拿放手腕、握持、全身對位與紅橘標色一起保留',async({page},testInfo)=>{
 test.setTimeout(300000);const errors=await boot(page);
 const results=await page.evaluate(()=>{
  const a=window.__FORM__,w=a.world,results=[];
  for(const angle of [0,30]){
   if(!w.setEquipmentSettings('dumbbell-bench-press',{benchAngle:angle}).ok)throw Error('Cannot configure bench');
   a.openExercise('dumbbell-bench-press');if(!w.advanceUntilReady(180,false))throw Error('Cannot start bench');w.setAnimationPaused(true);
   const report={angle,maxHeldWristDegrees:0,maxReach:0,collisions:[],self:[]};
   for(const direction of ['enter','exit'])for(let i=0;i<=240;i++){
    const sample=w.inspectLifecycle(direction,i/240),hands=w.getHandDiagnostics(),contact=w.getContactDiagnostics();
    report.maxReach=Math.max(report.maxReach,contact.maxReachError);
    for(let side=0;side<2;side++)if(sample.frame.contacts.hands[side])report.maxHeldWristDegrees=Math.max(report.maxHeldWristDegrees,hands[side].wristBendRadians*180/Math.PI);
    if(i%12===0){report.collisions.push(...(w.getClearanceDiagnostics()?.collisions||[]));report.self.push(...(w.getSelfClearanceDiagnostics()?.collisions||[]));}
   }
   w.seekExercise(.3);report.highlights=w.getMuscleHighlights();report.playerDetail=w.getNpcLodDiagnostics().player;
   w.stopExercise();report.exited=w.advanceUntilIdle(180,false);results.push(report);
  }
  return results;
 });
 for(const result of results){expect(result.maxHeldWristDegrees).toBeLessThan(22);expect(result.maxReach).toBeLessThan(.015);expect(result.collisions).toEqual([]);expect(result.self).toEqual([]);expect(result.highlights.primary).toContain('chest');expect(result.highlights.secondary.length).toBeGreaterThan(0);expect(result.playerDetail.level).toBe(0);expect(result.exited).toBe(true);}
 expect(errors).toEqual([]);await testInfo.attach('production-wrist-lifecycles',{body:JSON.stringify(results),contentType:'application/json'});
});

test('遠處真人會員確實少畫三角形，拉近相機及團課保留完整模型',async({page},testInfo)=>{
 test.setTimeout(240000);const errors=await boot(page);
 await page.waitForFunction(()=>window.__FORM__.world.getNpcLodDiagnostics().crowd.actors.some(a=>a.available),null,{timeout:30000});
 const result=await page.evaluate(()=>{
  const a=window.__FORM__,w=a.world;w.placePlayerAtStation('chest-press');w.inspectView({position:[5,6,6],target:[-5,1,-4]});for(let i=0;i<120;i++)w.update(1/60,false);
  w.setNpcLodEnabled(false);w.update(0);const before={render:w.getRenderStats(),detail:w.getNpcLodDiagnostics(),body:w.getBodyWorldPoints(),muscles:w.getMuscleHighlights()};
  w.setNpcLodEnabled(true);w.update(0);const after={render:w.getRenderStats(),detail:w.getNpcLodDiagnostics(),body:w.getBodyWorldPoints(),muscles:w.getMuscleHighlights()};
  const actor=after.detail.crowd.actors.find(a=>a.level>0),position=w.getCrowdDiagnostics().actors.find(a=>a.id===actor?.id)?.position;
  if(!position)throw Error('No simplified actor');w.inspectView({position:[position[0],position[1]+1.5,position[2]+4],target:[position[0],position[1]+1,position[2]]});
  const close=w.getNpcLodDiagnostics().crowd.actors.find(a=>a.id===actor.id);
  w.inspectView(null);a.openExercise('class-dance');const courseReady=w.advanceUntilReady(180,false),classActors=w.getNpcLodDiagnostics().social.actors.filter(a=>a.id.startsWith('class-'));
  return{before,after,close,courseReady,classActors};
 });
 expect(result.after.render.triangles).toBeLessThan(result.before.render.triangles);expect(result.after.body).toEqual(result.before.body);expect(result.after.muscles).toEqual(result.before.muscles);expect(result.after.detail.player.level).toBe(0);expect(result.close.level).toBe(0);expect(result.courseReady).toBe(true);expect(result.classActors).toHaveLength(3);for(const actor of result.classActors){expect(actor.level).toBe(0);expect(actor.triangles).toBe(actor.fullTriangles);}
 expect(errors).toEqual([]);await testInfo.attach('geometry-lod-frame-comparison',{body:JSON.stringify(result),contentType:'application/json'});
});

test('選配簡化模型下載失敗仍可用原真人角色探索與使用器材',async({page})=>{
 const errors=await boot(page,{missingLod:true});
 await page.waitForFunction(()=>window.__FORM__.world.getNpcLodDiagnostics().crowd.actors.every(a=>a.status==='failed'));
 const result=await page.evaluate(()=>{
  const a=window.__FORM__,w=a.world;w.inspectView({position:[5,6,6],target:[-5,1,-4]});w.setNpcLodEnabled(true);w.update(0);
  const detail=w.getNpcLodDiagnostics();a.openExercise('machine-chest-press');const ready=w.advanceUntilReady(180,false);w.setAnimationPaused(true);w.inspectExercise(.3);return{detail,ready,contact:w.getContactDiagnostics(),highlights:w.getMuscleHighlights()};
 });
 for(const actor of [...result.detail.crowd.actors,...result.detail.social.actors]){expect(actor.level).toBe(0);expect(actor.triangles).toBe(actor.fullTriangles);}
 expect(result.ready).toBe(true);expect(result.contact.maxReachError).toBeLessThan(.015);expect(result.highlights.primary).toContain('chest');expect(errors).toEqual([]);
});
