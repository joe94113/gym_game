import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

const errors=new WeakMap();
test.beforeEach(async({page})=>{
  const list=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));page.on('console',message=>{if(message.type()==='error')list.push(message.text());});
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:90_000});
  await page.locator('[data-action="free"]').click();
});
test.afterEach(async({page})=>{expect(errors.get(page),'新增人物、教練照片與互動設施不可出現載入或著色錯誤').toEqual([]);});
const advance=(page,seconds)=>page.evaluate(seconds=>{const world=window.__FORM__.world;for(let t=0;t<seconds;t+=.05)world.update(.05,false);world.update(0,true);},seconds);
async function useStation(page,id){await page.evaluate(id=>{const world=window.__FORM__.world;world.placePlayerAtStation(id);world.update(.05,false);world.update(0,true);},id);await expect.poll(()=>page.evaluate(()=>window.__FORM__.state.nearby?.id)).toBe(id);await page.keyboard.press('e');if(id==='group-class')await page.locator('[data-demo="group-class"]').click();}

test('櫃台、內勤教練與坐談人物都有真人模型，教練牆有十六張不同照片',async({page})=>{
  const result=await page.evaluate(async()=>{
    const world=window.__FORM__.world,{coachRoster}=await import('/src/reception-scenes.js');
    return{social:world.getSocialDiagnostics(),facilities:world.getFacilityDiagnostics(),coaches:coachRoster};
  });
  expect(result.social.count).toBe(20);expect(result.social.coachCount).toBe(16);expect(result.social.poseHz).toBe(15);
  expect(new Set(result.social.actors.filter(actor=>actor.coachId).map(actor=>actor.coachId)).size).toBe(16);
  for(const coach of result.coaches)expect(result.social.actors.find(actor=>actor.id===coach.actorId)?.coachId).toBe(coach.id);
  for(const role of ['receptionist','trainer-desk','coach','student','class-instructor'])expect(result.social.actors.some(actor=>actor.role===role)).toBe(true);
  expect(result.social.actors.filter(actor=>actor.seated)).toHaveLength(2);
  for(const actor of result.social.actors){expect(actor.modelKind).toBe('skinned-human');expect(actor.contactError).toBeLessThan(.015);expect(actor.overlayEnabled).toBe(false);expect(actor.selfCollisions).toEqual([]);expect(actor.collisions).toEqual([]);if(['receptionist','trainer-desk','coach','student'].includes(actor.role))expect(actor.testedPairs).toBeGreaterThan(0);}
  expect(result.facilities.coachCount).toBe(16);expect(result.facilities.trophyCount).toBeGreaterThanOrEqual(6);expect(result.facilities.trainerDesk).toBe(true);
  expect(result.coaches).toHaveLength(16);expect(new Set(result.coaches.map(coach=>coach.name)).size).toBe(16);expect(new Set(result.coaches.map(coach=>coach.portraitIndex)).size).toBe(16);
  for(const coach of result.coaches){expect(coach.fictional).toBe(true);expect(coach.specialty.length).toBeGreaterThan(0);}
  const portrait=await page.evaluate(async()=>{
    const image=new Image();image.src=window.__FORM__.world.getFacilityDiagnostics().portraitAtlas;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const context=canvas.getContext('2d');context.drawImage(image,0,0,512,512);const hashes=[];
    for(let row=0;row<4;row++)for(let col=0;col<4;col++){
      const pixels=context.getImageData(col*128+32,row*128+24,64,80).data;let hash=2166136261;
      for(let index=0;index<pixels.length;index+=4)hash=Math.imul(hash^pixels[index]^pixels[index+1]<<8^pixels[index+2]<<16,16777619);hashes.push(hash>>>0);
    }
    return{width:image.naturalWidth,height:image.naturalHeight,distinct:new Set(hashes).size};
  });
  expect(portrait.width).toBeGreaterThanOrEqual(1024);expect(portrait.height).toBeGreaterThanOrEqual(1024);expect(portrait.distinct).toBe(16);
  await page.locator('.header-actions [data-action="coaches"]').click();await expect(page.getByRole('dialog',{name:'教練團隊'})).toBeVisible();await expect(page.locator('.coach-roster-card')).toHaveCount(16);
  for(let index=0;index<result.coaches.length;index++)await expect(page.locator('.coach-roster-card').nth(index)).toContainText(result.coaches[index].name);
  await page.keyboard.press('Escape');
  const cutaway=await page.evaluate(()=>{
    const world=window.__FORM__.world;
    world.inspectView({position:[-4.5,3,22],target:[-4.5,1.1,14.8]});const behind=world.getFacilityDiagnostics().receptionCutaway;
    world.inspectView({position:[-4.5,3,22],target:[-4.5,2.8,16.37]});const portrait=world.getFacilityDiagnostics().receptionCutaway;
    world.inspectView(null);return {behind,portrait};
  });
  expect(cutaway).toEqual({behind:true,portrait:false});
});

test('三排有氧器材留有空台，銀髮會員使用時可以按 E 接手',async({page})=>{
  const result=await page.evaluate(()=>({cardio:window.__FORM__.stations.filter(station=>station.category==='cardio'),crowd:window.__FORM__.world.getCrowdDiagnostics()}));
  expect(result.cardio).toHaveLength(18);expect(new Set(result.cardio.map(station=>station.position.z)).size).toBeGreaterThanOrEqual(3);
  expect(result.cardio.some(station=>station.type==='stairClimber')).toBe(true);
  const seniors=result.crowd.actors.filter(actor=>actor.ageGroup==='senior');expect(seniors).toHaveLength(6);
  expect(new Set(seniors.map(actor=>actor.genderPresentation)).size).toBe(2);
  for(const actor of seniors){expect(actor.appearance.age).toBeGreaterThanOrEqual(55);expect(actor.appearance.grayHair).toBeGreaterThanOrEqual(.8);expect(actor.modelKind).toBe('skinned-human');expect(actor.contactError).toBeLessThan(.015);}
  expect(result.cardio.length-result.crowd.actors.filter(actor=>result.cardio.some(station=>station.id===actor.stationId)).length).toBeGreaterThanOrEqual(8);
  await advance(page,2);
  const after=await page.evaluate(()=>window.__FORM__.world.getCrowdDiagnostics().actors.filter(actor=>actor.ageGroup==='senior'));
  for(const actor of after)expect(actor.contactError).toBeLessThan(.015);
  await useStation(page,'bike-2');expect(await page.evaluate(()=>window.__FORM__.world.getOccupancy('bike-2').state)).toBe('leaving');
  await page.evaluate(()=>window.__FORM__.world.advanceUntilReady());
  const final=await page.evaluate(()=>({activity:window.__FORM__.world.getActivityState(),npc:window.__FORM__.world.getCrowdDiagnostics().actors.find(actor=>actor.stationId==='bike-2')}));
  expect(final.activity.stationId).toBe('bike-2');expect(final.activity.waitingForOccupant).toBe(false);expect(final.npc.state).toBe('free');
  const before=seniors.find(actor=>actor.stationId==='bike-2');expect(Math.hypot(...before.position.map((value,index)=>value-final.npc.position[index]))).toBeGreaterThan(1.5);
});

test('InBody 站位握把對準，顯示遊戲示範結果並明確標示不是玩家量測',async({page})=>{
  await useStation(page,'inbody');await expect(page.locator('.facility-panel')).toContainText('InBody');
  await page.evaluate(()=>window.__FORM__.world.advanceUntilReady());
  const contacts=await page.evaluate(()=>window.__FORM__.world.getContactDiagnostics());expect(contacts.maxContactError).toBeLessThan(.015);expect(contacts.maxReachError).toBeLessThan(.015);
  const initial=await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics().inbody);expect(initial.active).toBe(true);expect(initial.complete).toBe(false);
  await advance(page,8.5);
  const complete=await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics().inbody);expect(complete.complete).toBe(true);expect(complete.progress).toBe(1);expect(complete.report.label).toContain('非玩家量測');
  await expect(page.locator('#inbody-measurement')).toContainText('示範報告');await expect(page.locator('#inbody-measurement')).toContainText('68.4 kg');await expect(page.locator('#inbody-measurement')).toContainText('不是你的身體資料');
  await expect(page.locator('.facility-panel')).toContainText('遊戲');
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle());expect(await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics().inbody.active)).toBe(false);
});

test('團體教室可實際加入課程，教練與學員跟著同一套動作',async({page})=>{
  await useStation(page,'group-class');await expect(page.locator('.class-panel')).toContainText('全身活動課');await page.evaluate(()=>window.__FORM__.world.advanceUntilReady());
  await page.evaluate(()=>{const world=window.__FORM__.world;world.setAnimationPaused(true);world.seekExercise(.3);});await advance(page,.2);
  const result=await page.evaluate(()=>({social:window.__FORM__.world.getSocialDiagnostics(),facilities:window.__FORM__.world.getFacilityDiagnostics(),contacts:window.__FORM__.world.getContactDiagnostics(),clearance:window.__FORM__.world.getClearanceDiagnostics()}));
  expect(result.facilities.classroom.active).toBe(true);expect(result.facilities.classroom.mats).toBeGreaterThanOrEqual(6);expect(result.social.followingPlayer).toBe(true);
  const instructor=result.social.actors.find(actor=>actor.role==='class-instructor');expect(instructor.classPhase).toBeCloseTo(.3,4);
  const participants=result.social.actors.filter(actor=>actor.role==='class-participant');expect(participants).toHaveLength(2);for(const actor of participants){expect(actor.classPhase).toBeGreaterThan(.24);expect(actor.classPhase).toBeLessThan(.3);expect(actor.selfCollisions).toEqual([]);}
  expect(result.contacts.maxContactError).toBeLessThan(.015);expect(result.contacts.maxReachError).toBeLessThan(.015);expect(result.clearance.testedPairs).toBeGreaterThan(0);expect(result.clearance.collisions).toEqual([]);
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle());expect(await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics().classroom.active)).toBe(false);
});

test('不同跑步機記錄同一個學習動作，不會重複增加完成數',async({page})=>{
  const before=await page.evaluate(()=>[...window.__FORM__.state.learned]);
  for(const stationId of ['treadmill-5','treadmill-6']){
    await useStation(page,stationId);await page.evaluate(()=>window.__FORM__.world.advanceUntilReady());
    await page.locator('[data-action="learned"]').click();await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle());
  }
  const result=await page.evaluate(()=>({learned:[...window.__FORM__.state.learned],saved:JSON.parse(localStorage.getItem('form.exercise-progress.v1')),knowledge:[...window.__FORM__.state.knowledge],movement:window.__FORM__.activities.find(activity=>activity.stationId==='treadmill-5').movementId}));
  expect(result.learned).toHaveLength(before.length+1);expect(result.learned).toContain(result.movement);expect(result.saved).toEqual(result.learned);expect(result.knowledge).toContain('treadmill-5');expect(result.knowledge).toContain('treadmill-6');
});
