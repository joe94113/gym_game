import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

async function boot(page){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.requestAnimationFrame=()=>0;
  window.__GL_RESOURCE_AUDIT__={buffersDeleted:0,texturesDeleted:0,programsDeleted:0};
  for(const [method,check,key]of [['deleteBuffer','isBuffer','buffersDeleted'],['deleteTexture','isTexture','texturesDeleted'],['deleteProgram','isProgram','programsDeleted']]){
   const original=WebGL2RenderingContext.prototype[method];
   WebGL2RenderingContext.prototype[method]=function(object){if(object&&this[check](object))window.__GL_RESOURCE_AUDIT__[key]++;return original.call(this,object);};
  }
 });
 await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});
 await page.evaluate(()=>{document.querySelector('[data-action="free"]').click();window.__FORM__.world.setGraphicsQuality('flow');});
 return errors;
}

test('任意整數上斜角先預覽，套用後完整放回與重新就位',async({page},testInfo)=>{
 const errors=await boot(page);
 await page.evaluate(()=>{const a=window.__FORM__;a.openExercise('dumbbell-bench-press');if(!a.world.advanceUntilReady(180,false))throw Error('bench not ready');document.querySelector('.equipment-settings').open=true;});
 await page.getByLabel('拖曳調整椅背角度',{exact:true}).fill('17');
 await expect(page.getByLabel('椅背角度',{exact:true})).toHaveValue('17');
 await expect(page.locator('[data-bench-angle-output]')).toHaveText('17°');
 expect(await page.evaluate(()=>window.__FORM__.world.getEquipmentSettings('dumbbell-bench-press').benchAngle)).toBe(0);
 await page.locator('[data-action="apply-bench-angle"]').evaluate(button=>button.click());
 await expect(page.getByLabel('拖曳調整椅背角度',{exact:true})).toBeDisabled();
 await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false));
 await expect.poll(()=>page.evaluate(()=>window.__FORM__.state.pendingEquipment)).toBeNull();
 const reports=[];
 for(const angle of [17,45,0]){
  if(angle!==17){
   await page.evaluate(()=>{document.querySelector('.equipment-settings').open=true;});
   await page.getByLabel('椅背角度',{exact:true}).selectOption(String(angle));
   await page.locator('[data-action="apply-bench-angle"]').evaluate(button=>button.click());
   await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false));
   await expect.poll(()=>page.evaluate(()=>window.__FORM__.state.pendingEquipment)).toBeNull();
  }
  reports.push(await page.evaluate(()=>{const w=window.__FORM__.world;if(!w.advanceUntilReady(180,false))throw Error('bench not ready after setting');w.setAnimationPaused(true);w.inspectExercise(.45);return{settings:w.getEquipmentSettings('dumbbell-bench-press'),contact:w.getContactDiagnostics(),clearance:w.getClearanceDiagnostics(),self:w.getSelfClearanceDiagnostics(),highlights:w.getMuscleHighlights()};}));
 }
 for(const [i,result]of reports.entries()){expect(result.settings.benchAngle).toBe([17,45,0][i]);expect(result.contact.maxReachError).toBeLessThan(.015);expect(result.clearance.collisions).toEqual([]);expect(result.self.collisions).toEqual([]);expect(result.highlights.primary).toContain('chest');expect(result.highlights.secondary.length).toBeGreaterThan(0);}
 expect(errors).toEqual([]);await testInfo.attach('bench-angle-ui-v011',{body:JSON.stringify(reports),contentType:'application/json'});
});

test('取消角度更換會完成放回，原設定保持不變',async({page})=>{
 const errors=await boot(page);
 await page.evaluate(()=>{const a=window.__FORM__;a.openExercise('dumbbell-bench-press');a.world.advanceUntilReady(180,false);document.querySelector('.equipment-settings').open=true;});
 await page.getByLabel('椅背角度',{exact:true}).selectOption('23');await page.locator('[data-action="apply-bench-angle"]').evaluate(button=>button.click());
 await page.keyboard.press('Escape');await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false));
 const result=await page.evaluate(()=>({pending:window.__FORM__.state.pendingEquipment,activity:window.__FORM__.world.getActivityState(),settings:window.__FORM__.world.getEquipmentSettings('dumbbell-bench-press')}));
 expect(result.pending).toBeNull();expect(result.activity.exerciseId).toBeNull();expect(result.settings.benchAngle).toBe(0);expect(errors).toEqual([]);
});

test('新增滑輪動作能從清單開始，拿放接點與紅橘肌群保留',async({page},testInfo)=>{
 const errors=await boot(page);
 const result=await page.evaluate(()=>{
  const a=window.__FORM__,w=a.world,reports=[];
  for(const id of ['cable-rope-hammer-curl','cable-straight-arm-pulldown','cable-rope-crunch']){
   a.openExercise(id);if(!w.advanceUntilReady(180,false))throw Error(`not ready: ${id}`);w.setAnimationPaused(true);
   const report={id,contactMax:0,collisions:[],self:[],highlights:null};
   for(const direction of ['enter','exit'])for(const u of [0,.1,.25,.5,.75,.9,1]){w.inspectLifecycle(direction,u);report.contactMax=Math.max(report.contactMax,w.getContactDiagnostics().maxReachError);report.collisions.push(...w.getClearanceDiagnostics().collisions);report.self.push(...w.getSelfClearanceDiagnostics().collisions);}
   for(const phase of [0,.25,.5,.75,1]){w.inspectExercise(phase);report.contactMax=Math.max(report.contactMax,w.getContactDiagnostics().maxReachError);report.collisions.push(...w.getClearanceDiagnostics().collisions);report.self.push(...w.getSelfClearanceDiagnostics().collisions);}
   report.highlights=w.getMuscleHighlights();w.stopExercise();report.exited=w.advanceUntilIdle(180,false);reports.push(report);
  }return reports;
 });
 for(const report of result){expect(report.contactMax).toBeLessThan(.015);expect(report.collisions).toEqual([]);expect(report.self).toEqual([]);expect(report.highlights.primary.length).toBeGreaterThan(0);expect(report.highlights.secondary.length).toBeGreaterThan(0);expect(report.exited).toBe(true);}
 expect(errors).toEqual([]);await testInfo.attach('new-cable-ui-v011',{body:JSON.stringify(result),contentType:'application/json'});
});

test('房間冷卻後真正刪除 GL buffers，返回同幀上傳並可繼續使用',async({page},testInfo)=>{
 test.setTimeout(240000);const errors=await boot(page);
 const report=await page.evaluate(()=>{
  const a=window.__FORM__,w=a.world,gl=document.querySelector('#gym-canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const camera={main:{position:[5,6,6],target:[-5,1,-4]},classroom:{position:[-24,5,31],target:[-24,1,25]},bathroom:{position:[18,4.5,12],target:[25,1,15]}};
  w.placePlayerAtStation('chest-press');w.setRoomManagementEnabled(false);w.inspectView(camera.classroom);w.update(0);w.inspectView(camera.bathroom);w.update(0);
  const warm=w.getRoomResourceDiagnostics(),before={...window.__GL_RESOURCE_AUDIT__},navigation=w.getNavigationDiagnostics();
  w.inspectView(camera.main);w.setRoomManagementEnabled(true);for(let i=0;i<290;i++)w.update(.05,false);w.update(0);
  const cold=w.getRoomResourceDiagnostics(),coldGl={...window.__GL_RESOURCE_AUDIT__},roomState=w.getRoomDiagnostics();
  w.inspectView(camera.classroom);w.update(0);const classroomReturn=w.getRoomResourceDiagnostics(),activeEvictionRejected=w.evictDormantRoomGpuResources('classroom')===false;
  w.inspectView(camera.bathroom);w.update(0);const bathroomReturn=w.getRoomResourceDiagnostics();
  a.openExercise('class-dance');const classReady=w.advanceUntilReady(180,false);w.stopExercise();const classExit=w.advanceUntilIdle(180,false);
  const shower=a.catalogActivities.find(e=>e.facilityKind==='shower');a.openExercise(shower.id);const showerReady=w.advanceUntilReady(180,false);w.stopExercise();const showerExit=w.advanceUntilIdle(180,false);
  return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),warm,before,cold,coldGl,roomState,classroomReturn,bathroomReturn,activeEvictionRejected,classReady,classExit,showerReady,showerExit,navigationBefore:navigation,navigationAfter:w.getNavigationDiagnostics(),model:w.getModelInfo()};
 });
 expect(report.cold.lastError).toBeNull();for(const id of ['classroom','bathroom']){expect(report.roomState.rooms[id].visible).toBe(false);expect(report.cold.rooms[id].gpuEvictionRequested).toBe(true);expect(report.cold.rooms[id].releaseCount).toBeGreaterThan(0);}
 expect(report.coldGl.buffersDeleted).toBeGreaterThan(report.before.buffersDeleted);expect(report.cold.rendererMemory.geometries).toBeLessThan(report.warm.rendererMemory.geometries);
 expect(report.classroomReturn.rooms.classroom.gpuEvictionRequested).toBe(false);expect(report.bathroomReturn.rooms.bathroom.gpuEvictionRequested).toBe(false);expect(report.classroomReturn.rendererMemory.geometries).toBeGreaterThan(report.cold.rendererMemory.geometries);
 expect(report.activeEvictionRejected).toBe(true);expect(report.classReady&&report.classExit&&report.showerReady&&report.showerExit).toBe(true);expect(report.navigationBefore).toEqual(report.navigationAfter);expect(errors).toEqual([]);
 await testInfo.attach('actual-gl-room-cycle-v011',{body:JSON.stringify(report),contentType:'application/json'});
});
