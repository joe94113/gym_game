import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

const errors=new WeakMap();
test.beforeEach(async({page})=>{const list=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));page.on('console',message=>{if(message.type()==='error')list.push(message.text());});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120_000});});
test.afterEach(async({page})=>{expect(errors.get(page),'瀏覽器不可出現模型、骨架或GLSL錯誤').toEqual([]);});
const open=(page,id)=>page.evaluate(id=>{window.__FORM__.openExercise(id);return window.__FORM__.world.advanceUntilReady();},id);
const finish=page=>page.evaluate(()=>window.__FORM__.world.advanceUntilIdle());

test('實際載入具蒙皮、骨架與貼圖的真人模型，初頁提供推薦動作',async({page})=>{
  const info=await page.evaluate(()=>window.__FORM__.world.getModelInfo());
  expect(info.kind).toBe('skinned-human');expect(info.skinnedMeshCount).toBeGreaterThan(0);expect(info.boneCount).toBeGreaterThanOrEqual(40);
  expect(info.metrics.height).toBeGreaterThan(1.7);expect(info.metrics.height).toBeLessThan(1.9);
  expect(info.modelUrl).toBe('/models/athlete/athlete.glb');
  expect(await page.evaluate(()=>window.__FORM__.exercises.length)).toBe(5);
  await expect(page.getByRole('button',{name:'開始試做'})).toBeEnabled();
  await page.getByRole('button',{name:'開始試做'}).click();
  await expect(page.locator('.station-panel')).toContainText('站姿啞鈴彎舉');
});

test('動作清單可逐項快速試玩，啞鈴與龍門架提供多動作選擇',async({page})=>{
  await page.locator('[data-action="free"]').click();
  const list=await page.evaluate(()=>window.__FORM__.exercises.map(e=>({id:e.id,name:e.name})));
  const count=await page.evaluate(()=>window.__FORM__.catalogActivities.length);
  for(const e of list){await page.locator('.header-actions [data-action="library"]').click();await expect(page.locator('.trial-exercise-card')).toHaveCount(count);await page.locator(`[data-demo="${e.id}"]`).click();await expect(page.locator('.station-panel')).toContainText(e.name);expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().exerciseId)).toBe(e.id);await page.evaluate(()=>window.__FORM__.world.advanceUntilReady());await page.keyboard.press('Escape');await finish(page);}
  for(const [id,count]of [['dumbbell-curl',8],['cable-fly',12],['stretch-zone',6]]){await page.evaluate(id=>window.__FORM__.openStation(window.__FORM__.stations.find(s=>s.id===id)),id);await expect(page.locator('.trial-exercise-card')).toHaveCount(count);await page.keyboard.press('Escape');}
});

test('紅橘肌群、伸展圖例與人物標色開關均保留',async({page})=>{
  await page.locator('[data-action="free"]').click();
  for(const id of ['dumbbell-curl','dumbbell-bench-press','rope-pushdown','single-arm-cable-row','kneeling-hip-flexor-stretch']){
    await open(page,id);
    const result=await page.evaluate(()=>{const {world,state}=window.__FORM__,e=state.active;return{expected:{primary:[...e.muscleKeys].sort(),secondary:[...e.secondaryMuscleKeys].sort()},actual:world.getMuscleHighlights(),colors:[...new Set([...document.querySelectorAll('.muscle-map [data-activation="primary"]')].map(path=>getComputedStyle(path).fill))]};});
    expect([...result.actual.primary].sort()).toEqual(result.expected.primary);expect([...result.actual.secondary].sort()).toEqual(result.expected.secondary);expect(result.colors).toEqual(['rgb(220, 104, 85)']);
    if(id.includes('stretch')){await expect(page.locator('.station-panel')).toContainText('伸展目標');await expect(page.locator('.station-panel')).toContainText('不表示出力大小');}
    await page.keyboard.press('Escape');await finish(page);expect(await page.evaluate(()=>window.__FORM__.world.getMuscleHighlights())).toEqual({primary:[],secondary:[]});
  }
  await open(page,'dumbbell-curl');await page.locator('[data-action="overlay"]').click();await expect(page.locator('[data-action="overlay"]')).toHaveAttribute('aria-pressed','false');await page.locator('[data-action="overlay"]').click();await expect(page.locator('[data-action="overlay"]')).toHaveAttribute('aria-pressed','true');
});

test('暫停、慢速、逐格觀察與動作學習保存正常',async({page})=>{
  await page.locator('[data-action="free"]').click();await open(page,'rope-pushdown');
  await page.locator('[data-action="pause"]').click();
  await page.locator('#pose-scrub').evaluate(input=>{input.value='.37';input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().phase)).toBeCloseTo(.37,5);
  const before=await page.evaluate(()=>window.__FORM__.world.getContactDiagnostics().body.hands);
  await page.evaluate(()=>{for(let i=0;i<10;i++)window.__FORM__.world.update(.05);});
  expect(await page.evaluate(()=>window.__FORM__.world.getContactDiagnostics().body.hands)).toEqual(before);
  await page.locator('[data-speed="0.5"]').click();await expect(page.locator('[data-speed="0.5"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-action="learned"]').click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('form.exercise-progress.v1')))).toContain('rope-pushdown');
  await page.reload();await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:90_000});expect(await page.evaluate(()=>[...window.__FORM__.state.learned])).toContain('rope-pushdown');
});

test('五動作全行程的實際掌心／鞋底和機構接點相符，固定骨段不拉長',async({page},testInfo)=>{
  test.setTimeout(240_000);await page.locator('[data-action="free"]').click();
  const report=await page.evaluate(()=>{const api=window.__FORM__,report=[];for(const e of api.exercises){api.openExercise(e.id);api.world.advanceUntilReady();api.world.setAnimationPaused(true);const samples=[];for(let i=0;i<=80;i++){const d=api.world.inspectExercise(i/80,i/80);const rendered=api.world.getRigContacts();samples.push({phase:i/80,contact:d,rendered});}report.push({id:e.id,samples});}return report;});
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  for(const e of report){let lengths=null;for(const s of e.samples){const d=s.contact;expect(d.maxContactError,`${e.id}@${s.phase}實際接觸`).toBeLessThan(.015);expect(d.maxReachError,`${e.id}@${s.phase}可達`).toBeLessThan(.015);for(let side=0;side<2;side++){expect(distance(s.rendered.hands[side],d.hands[side].expected)).toBeLessThan(.001);expect(distance(s.rendered.feet[side],d.feet[side].expected)).toBeLessThan(.001);}const b=d.body,current=[...b.shoulders.map((p,i)=>distance(p,b.elbows[i])),...b.elbows.map((p,i)=>distance(p,b.wrists[i])),...b.hips.map((p,i)=>distance(p,b.knees[i])),...b.knees.map((p,i)=>distance(p,b.ankles[i]))];if(!lengths)lengths=current;current.forEach((value,i)=>expect(value,`${e.id}骨段${i}`).toBeCloseTo(lengths[i],4));}}
  await testInfo.attach('five-motion-full-cycle-contacts',{body:JSON.stringify(report),contentType:'application/json'});
});

test('五動作全行程檢查肢段體積與變形後皮膚／衣物表面',async({page},testInfo)=>{
  test.setTimeout(240_000);await page.locator('[data-action="free"]').click();
  const report=await page.evaluate(()=>{const api=window.__FORM__,report=[];for(const e of api.exercises){api.openExercise(e.id);api.world.advanceUntilReady();api.world.setAnimationPaused(true);const samples=[];for(let i=0;i<=100;i++){api.world.inspectExercise(i/100,i/100);const proxy=api.world.getClearanceDiagnostics(),self=api.world.getSelfClearanceDiagnostics();const surface=i%10===0?api.world.getSurfaceDiagnostics({stride:20}):null;samples.push({phase:i/100,proxy,self,surface});}report.push({id:e.id,samples});}return report;});
  await testInfo.attach('five-motion-volume-and-surface-clearance',{body:JSON.stringify(report),contentType:'application/json'});
  for(const e of report)for(const s of e.samples){expect(s.proxy.volumeCount,`${e.id}必須有設備碰撞體`).toBeGreaterThan(0);expect(s.proxy.testedPairs).toBeGreaterThan(0);expect(s.proxy.collisions,`${e.id}@${s.phase}肢段穿模`).toEqual([]);expect(s.self.testedPairs).toBeGreaterThan(0);expect(s.self.collisions,`${e.id}@${s.phase}前臂／手穿入軀幹`).toEqual([]);if(s.surface){expect(s.surface.sampleCount).toBeGreaterThan(100);expect(s.surface.testedPairs).toBeGreaterThan(0);expect(s.surface.collisions,`${e.id}@${s.phase}蒙皮表面穿模`).toEqual([]);}}
});

test('自由走動、地圖與五動作訓練點導航保持可用',async({page})=>{
  await page.locator('[data-action="free"]').click();const start=await page.evaluate(()=>window.__FORM__.world.getPlayerPosition());await page.keyboard.down('w');try{await expect.poll(async()=>{const p=await page.evaluate(()=>window.__FORM__.world.getPlayerPosition());return Math.hypot(p.x-start.x,p.z-start.z);}).toBeGreaterThan(.3);}finally{await page.keyboard.up('w');}
  await page.keyboard.press('m');await expect(page.getByRole('dialog',{name:'場館地圖'})).toBeVisible();await page.locator('[data-map-station="stretch-zone"]').click();expect(await page.evaluate(()=>window.__FORM__.state.targetId)).toBe('stretch-zone');
  const nav=await page.evaluate(()=>window.__FORM__.world.getNavigationDiagnostics().filter(d=>['dumbbell-curl','cable-fly','stretch-zone'].includes(d.id)));expect(nav).toHaveLength(3);for(const d of nav){expect(d.blocked).toBe(false);expect(d.reachable).toBe(true);}
});
