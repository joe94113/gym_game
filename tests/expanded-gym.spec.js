import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

const errors=new WeakMap();
test.beforeEach(async({page})=>{
  const list=[];errors.set(page,list);
  page.on('pageerror',error=>list.push(error.message));
  page.on('console',message=>{if(message.type()==='error')list.push(message.text());});
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('/');
  await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:90_000});
  await page.locator('[data-action="free"]').click();
});
test.afterEach(async({page})=>{expect(errors.get(page),'器材、NPC、蒙皮與著色器不可在瀏覽器發生錯誤').toEqual([]);});

const advance=(page,seconds)=>page.evaluate(seconds=>{for(let t=0;t<seconds;t+=.05)window.__FORM__.world.update(.05,false);window.__FORM__.world.update(0,true);},seconds);
async function goToStation(page,id){
  await page.evaluate(id=>{window.__FORM__.world.placePlayerAtStation(id);window.__FORM__.world.update(.05);},id);
  await expect.poll(()=>page.evaluate(()=>window.__FORM__.state.nearby?.id)).toBe(id);
}
async function closeActivity(page){
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle());
  expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().exerciseId)).toBeNull();
}

test('走近普通器材按 E 會直接使用，槓片設定與實際接點同步',async({page})=>{
  await goToStation(page,'leg-press');
  await expect(page.locator('.interaction-prompt')).toContainText('使用這台器材');
  await page.keyboard.press('e');
  await expect(page.locator('.station-panel')).toContainText('腿推');
  expect(await page.evaluate(()=>window.__FORM__.state.active.runtime)).toBe('machine');
  await page.evaluate(()=>window.__FORM__.world.advanceUntilReady());
  expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().stage)).toBe('exercising');
  await page.locator('[data-load="20"]').click();
  await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false));
  await page.waitForFunction(()=>!window.__FORM__.state.pendingEquipment);
  expect(await page.evaluate(()=>window.__FORM__.world.advanceUntilReady(180,false))).toBe(true);
  expect(await page.evaluate(()=>window.__FORM__.world.getPlateState('leg-press'))).toMatchObject({kgPerSide:20,visiblePlates:{left:2,right:2}});
  const contacts=await page.evaluate(()=>{const world=window.__FORM__.world;world.setAnimationPaused(true);return [0,.25,.5,.75,1].map(phase=>world.inspectExercise(phase,phase));});
  for(const contact of contacts){expect(contact.stationId).toBe('leg-press');expect(contact.maxContactError).toBeLessThan(.015);expect(contact.maxReachError).toBeLessThan(.015);}
});

test('五位運動中的路人會放手離開，整個人走出器材後才換玩家使用',async({page},testInfo)=>{
  test.setTimeout(240_000);await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.waitForTimeout(100);
  const initial=await page.evaluate(()=>window.__FORM__.world.getCrowdDiagnostics());
  expect(initial.count).toBeGreaterThanOrEqual(5);
  for(const actor of initial.actors){expect(actor.state).toBe('exercising');expect(actor.modelKind).toBe('skinned-human');expect(actor.overlayEnabled).toBe(false);}
  const handoffs=[];
  for(const actor of initial.actors.slice(0,5)){
    await goToStation(page,actor.stationId);
    await expect(page.locator('.interaction-prompt')).toContainText('有人使用');
    const playerBefore=await page.evaluate(()=>window.__FORM__.world.getPlayerPosition());
    await page.keyboard.press('e');
    const waiting=await page.evaluate(()=>window.__FORM__.world.getActivityState());
    expect(['approaching','waiting','aligning']).toContain(waiting.stage);
    expect(await page.evaluate(()=>window.__FORM__.world.getPlayerPosition())).toEqual(playerBefore);
    expect(await page.evaluate(id=>window.__FORM__.world.getOccupancy(id).state,actor.stationId)).toBe('leaving');
    const result=await page.evaluate(stationId=>{
      const world=window.__FORM__.world,stages=[];let activatedAfterClear=false;
      for(let frame=0;frame<1000;frame++){
        world.update(.05,false);const occupancy=world.getOccupancy(stationId),state=world.getActivityState(),npc=world.getCrowdDiagnostics().actors.find(actor=>actor.stationId===stationId);
        if(!stages.includes(npc.stage))stages.push(npc.stage);
        if(state.stage==='entering'||state.stage==='exercising'){activatedAfterClear=occupancy.state==='free';break;}
      }
      world.update(0,true);return{activatedAfterClear,stages,state:world.getActivityState(),npc:world.getCrowdDiagnostics().actors.find(actor=>actor.stationId===stationId)};
    },actor.stationId);
    expect(result.activatedAfterClear).toBe(true);expect(result.stages).toContain('release');expect(result.stages).toContain('stand');expect(result.stages).toContain('walk');
    expect(result.state.stationId).toBe(actor.stationId);expect(result.state.waitingForOccupant).toBe(false);
    expect(Math.hypot(...actor.position.map((value,index)=>value-result.npc.position[index]))).toBeGreaterThan(1.5);
    expect(result.npc.overlayEnabled).toBe(false);handoffs.push({stationId:actor.stationId,...result});
    await closeActivity(page);
  }
  await testInfo.attach('npc-handoffs',{body:JSON.stringify(handoffs),contentType:'application/json'});
});

test('真人走路手掌朝向身體，手腕自然，骨段長度保持固定',async({page})=>{
  const report=await page.evaluate(()=>{
    const world=window.__FORM__.world,result=[];
    for(const speed of [0,1,1.6])for(let step=0;step<=24;step++)result.push({speed,time:step/12,...world.inspectLocomotion(step/12,speed)});
    return result;
  });
  const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));let lengths;
  for(const sample of report){
    expect(sample.body.maxReachError).toBeLessThan(.015);
    sample.hands.forEach((hand,index)=>{expect(hand.palmNormal[0]*(index?-1:1)).toBeGreaterThan(.95);expect(hand.wristBendRadians).toBeLessThan(.65);expect(hand.fingerCount).toBe(15);});
    const body=sample.body,current=[...body.shoulders.map((point,index)=>distance(point,body.elbows[index])),...body.elbows.map((point,index)=>distance(point,body.wrists[index])),...body.hips.map((point,index)=>distance(point,body.knees[index])),...body.knees.map((point,index)=>distance(point,body.ankles[index]))];
    if(!lengths)lengths=current;current.forEach((value,index)=>expect(value).toBeCloseTo(lengths[index],4));
  }
});

test('場館分區與地圖使用相同配置，全館器材及浴室設施都找得到路',async({page})=>{
  const result=await page.evaluate(()=>({layout:window.__FORM__.world.getLayout(),navigation:window.__FORM__.world.getNavigationDiagnostics(),stationCount:window.__FORM__.stations.length,facilities:window.__FORM__.world.getFacilityDiagnostics()}));
  expect(result.stationCount).toBeGreaterThanOrEqual(32);expect(result.navigation).toHaveLength(result.stationCount);
  for(const item of result.navigation){expect(item.blocked,`${item.id} 互動點不可被擋住`).toBe(false);expect(item.reachable,`${item.id} 必須從入口走得到`).toBe(true);}
  const freeWeight=result.layout.zones.find(zone=>zone.id==='free-weight');expect(freeWeight.w*freeWeight.d).toBeGreaterThanOrEqual(500);
  expect(result.facilities.freeWeightArea).toBe(freeWeight.w*freeWeight.d);expect(new Set(result.layout.zones.map(zone=>zone.id)).size).toBeGreaterThanOrEqual(7);
  await page.keyboard.press('m');await expect(page.getByRole('dialog',{name:'場館地圖'})).toBeVisible();
  await expect(page.locator('[data-map-station]')).toHaveCount(result.stationCount);
  await page.locator('[data-map-station="sauna"]').click();
  expect(await page.evaluate(()=>window.__FORM__.state.targetId)).toBe('sauna');
});

test('啞鈴、草皮與龍門架列出已實作的動作及各自相容的握把',async({page})=>{
  const expected={
    'dumbbell-curl':['dumbbell-curl','dumbbell-bench-press','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-goblet-squat','dumbbell-romanian-deadlift'],
    'stretch-zone':['kneeling-hip-flexor-stretch','standing-hamstring-stretch','seated-glute-stretch','standing-chest-shoulder-stretch','standing-calf-stretch','standing-thoracic-rotation'],
    'cable-fly':['rope-pushdown','single-arm-cable-row','cable-straight-bar-curl','cable-ez-bar-curl','cable-v-bar-row','cable-rope-face-pull','cable-single-arm-lateral-raise','cable-ankle-kickback','cable-rope-hammer-curl','cable-straight-arm-pulldown','cable-rope-crunch','machine-cable-fly'],
  };
  for(const [stationId,ids] of Object.entries(expected)){
    await goToStation(page,stationId);await page.keyboard.press('e');
    await expect(page.locator('.trial-exercise-card')).toHaveCount(ids.length);
    for(const id of ids)await expect(page.locator(`[data-demo="${id}"]`)).toBeVisible();
    await page.keyboard.press('Escape');
  }
  const attachments=await page.evaluate(()=>[...new Set(window.__FORM__.activities.filter(item=>item.stationId==='cable-fly').map(item=>item.attachmentId))]);
  for(const attachment of ['triceps-rope','single-d-handle','straight-bar','ez-bar','v-bar','ankle-strap'])expect(attachments).toContain(attachment);
  await page.evaluate(()=>{window.__FORM__.openExercise('kneeling-hip-flexor-stretch');window.__FORM__.world.advanceUntilReady();});
  await expect(page.locator('.station-panel')).toContainText('伸展目標');
  const colors=await page.evaluate(()=>({primary:getComputedStyle(document.querySelector('.primary-swatch')).backgroundColor,secondary:getComputedStyle(document.querySelector('.secondary-swatch')).backgroundColor}));
  expect(colors).toEqual({primary:'rgb(220, 104, 85)',secondary:'rgb(226, 162, 97)'});
});

test('浴室有可使用的獨立隔間，門與水流會切換，體育電視持續播放',async({page})=>{
  const before=await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics());
  expect(before.facilityCount).toBeGreaterThanOrEqual(7);expect(before.posterCount).toBeGreaterThanOrEqual(3);expect(before.screenCount).toBeGreaterThanOrEqual(2);
  await goToStation(page,'shower-1');await page.keyboard.press('e');
  await expect(page.locator('.facility-panel')).toContainText('獨立淋浴間 A');await page.evaluate(()=>window.__FORM__.world.advanceUntilReady());
  let diagnostics=await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics());
  expect(diagnostics.activeFacility).toBe('shower-1');expect(diagnostics.waterRunning).toEqual(['shower-1']);
  expect(diagnostics.doors.find(door=>door.id==='shower-1').open).toBe(true);
  await advance(page,2.8);diagnostics=await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics());
  expect(diagnostics.doors.find(door=>door.id==='shower-1')).toMatchObject({open:false,blocked:true});
  expect(diagnostics.screenFrames).toBeGreaterThan(before.screenFrames);
  await closeActivity(page);diagnostics=await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics());
  expect(diagnostics.waterRunning).toEqual([]);expect(diagnostics.doors.find(door=>door.id==='shower-1').open).toBe(true);
  for(const id of ['sauna','steam-room','cold-plunge','toilet-1']){
    await goToStation(page,id);await page.keyboard.press('e');await page.evaluate(()=>window.__FORM__.world.advanceUntilReady());
    expect(await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics().activeFacility)).toBe(id);
    expect(await page.evaluate(()=>window.__FORM__.state.active.runtime)).toBe('facility');
    expect(await page.evaluate(()=>window.__FORM__.world.getMuscleHighlights())).toEqual({primary:[],secondary:[]});
    await closeActivity(page);
  }
});
