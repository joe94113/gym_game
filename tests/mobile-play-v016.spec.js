import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {viteClientShim} from './vite-client-shim.js';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const artifactDir=join(process.cwd(),process.env.FORM_TEST_ARTIFACT_ROOT||'artifacts/mobile-v016','play');
const errors=new WeakMap();

test.beforeEach(async({page})=>{
  mkdirSync(artifactDir,{recursive:true});
  const list=[];errors.set(page,list);
  page.on('pageerror',error=>list.push(error.message));
  page.on('console',message=>{if(message.type()==='error')list.push(message.text());});
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('/');
  await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120_000});
  await page.locator('[data-action="free"]').tap();
  await expect(page.locator('[data-mobile-stick]')).toBeVisible();
  expect(await page.evaluate(()=>window.__FORM__.mobileControls.getDiagnostics().mobile)).toBe(true);
});
test.afterEach(async({page})=>{expect(errors.get(page),'手機瀏覽器不得出現模型、骨架或 GLSL 錯誤').toEqual([]);});

async function center(locator){const rect=await locator.boundingBox();expect(rect).not.toBeNull();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2,width:rect.width,height:rect.height};}
async function snapshot(page){return page.evaluate(()=>{const api=window.__FORM__;return{input:api.mobileControls.getDiagnostics(),touch:api.world.getTouchDiagnostics(),view:api.world.getViewDiagnostics(),position:api.world.getPlayerPosition(),performance:api.world.getPerformanceDiagnostics()};});}
async function cleared(page){await expect.poll(async()=>{const d=await snapshot(page);return[d.touch.x,d.touch.y,d.touch.running,d.input.pointerId,d.input.runPointerId,d.view.pointers];}).toEqual([0,0,false,null,null,0]);}
async function canvasPoint(page){return page.evaluate(()=>{
  for(const y of [.38,.46,.55,.64])for(const x of [.5,.65,.35]){
    const point={x:innerWidth*x,y:innerHeight*y};if(document.elementFromPoint(point.x,point.y)?.id==='gym-canvas')return point;
  }
  throw new Error('手機畫面沒有可拖曳的 3D 場景空位');
});}
function touchDriver(cdp){
  const points=new Map();
  const send=type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...points.values()].map(point=>({...point,radiusX:3,radiusY:3,force:1}))});
  return{
    async start(id,point){points.set(id,{id,x:point.x,y:point.y});await send('touchStart');},
    async move(id,point){expect(points.has(id)).toBe(true);points.set(id,{id,x:point.x,y:point.y});await send('touchMove');},
    async moveMany(items){for(const [id,point]of items){expect(points.has(id)).toBe(true);points.set(id,{id,x:point.x,y:point.y});}await send('touchMove');},
    async end(){points.clear();await send('touchEnd');},
    async cancel(){points.clear();await send('touchCancel');},
  };
}
async function fixtureNearby(page,id){
  // Placement only shortens travel. Every input assertion below uses native
  // CDP touch events and normal requestAnimationFrame updates, never update().
  expect(await page.evaluate(id=>window.__FORM__.world.placePlayerAtStation(id),id)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__FORM__.state.nearby?.id)).toBe(id);
}
async function evidence(testInfo,name,value){
  const body=JSON.stringify(value,null,2);writeFileSync(join(artifactDir,`${name}.json`),body);
  await testInfo.attach(name,{body,contentType:'application/json'});
}

test('手機真實多指：類比走路、奔跑與視角可同時操作，放手與中斷後不鬼跑',async({page},testInfo)=>{
  await fixtureNearby(page,'stretch-zone');
  const cdp=await page.context().newCDPSession(page),touch=touchDriver(cdp),report={};
  try{
    const stick=await center(page.locator('[data-mobile-stick]'));
    const radius=Math.max(18,Math.min(48,Math.min(stick.width,stick.height)/2-22));
    report.before=await snapshot(page);
    await touch.start(11,stick);await touch.move(11,{x:stick.x,y:stick.y-radius*.5});
    await expect.poll(async()=>(await snapshot(page)).touch.y).toBeGreaterThan(.3);
    await page.waitForTimeout(350);report.half=await snapshot(page);
    expect(report.half.touch.y).toBeLessThan(.6);
    expect(report.half.performance.movingSpeed).toBeGreaterThan(.4);
    expect(report.half.performance.movingSpeed).toBeLessThan(1.2);
    await touch.move(11,{x:stick.x,y:stick.y-radius});
    await page.waitForTimeout(450);report.full=await snapshot(page);
    expect(report.full.touch.y).toBeCloseTo(1,3);
    expect(report.full.performance.movingSpeed).toBeGreaterThan(1.6);
    expect(Math.hypot(report.full.position.x-report.before.position.x,report.full.position.z-report.before.position.z)).toBeGreaterThan(.1);
    await page.waitForTimeout(400);report.held=await snapshot(page);
    expect(Math.hypot(report.held.position.x-report.full.position.x,report.held.position.z-report.full.position.z)).toBeGreaterThan(.1);
    const run=await center(page.locator('[data-mobile-run]'));
    await touch.start(12,run);await page.waitForTimeout(450);report.running=await snapshot(page);
    expect(report.running.touch.running).toBe(true);expect(report.running.performance.movingSpeed).toBeGreaterThan(3.8);
    const point=await canvasPoint(page);await touch.start(13,point);
    await expect.poll(async()=>(await snapshot(page)).view.pointers).toBe(1);
    await touch.move(13,{x:point.x+42,y:point.y+16});
    await expect.poll(async()=>Math.abs((await snapshot(page)).view.yaw-report.running.view.yaw)).toBeGreaterThan(.1);
    report.threeFingers=await snapshot(page);
    expect(Math.abs(report.threeFingers.view.yaw-report.running.view.yaw)).toBeGreaterThan(.1);
    expect(report.threeFingers.touch.y).toBeCloseTo(1,3);expect(report.threeFingers.touch.running).toBe(true);
    await page.screenshot({path:join(artifactDir,'three-finger-run-look.png')});
    await touch.end();await cleared(page);report.released=await snapshot(page);

    await touch.start(21,stick);await touch.move(21,{x:stick.x+radius,y:stick.y});await touch.start(22,run);
    await touch.cancel();await cleared(page);report.cancelled=await snapshot(page);

    await touch.start(31,stick);await touch.move(31,{x:stick.x,y:stick.y-radius});
    // The menu cleanup guard is activated directly while an actual finger is
    // held. This is not used as evidence of native touch movement or clicking.
    await page.locator('[data-mobile-menu-toggle]').evaluate(button=>button.click());
    await expect(page.locator('body')).toHaveClass(/mobile-menu-open/);await cleared(page);
    await expect(page.locator('.mobile-controls')).toBeHidden();report.menu=await snapshot(page);
    await touch.end();await page.locator('[data-mobile-menu-toggle]').tap();
    await expect(page.locator('[data-mobile-stick]')).toBeVisible();

    await touch.start(41,stick);await touch.move(41,{x:stick.x,y:stick.y-radius});
    await page.setViewportSize({width:844,height:390});await cleared(page);await touch.cancel();
    report.resized=await snapshot(page);await page.screenshot({path:join(artifactDir,'explore-landscape.png')});
    await page.setViewportSize({width:390,height:844});await cleared(page);
    await page.screenshot({path:join(artifactDir,'explore-portrait.png')});
    await evidence(testInfo,'native-touch-input',report);
  }finally{await touch.cancel().catch(()=>{});await cdp.detach();}
});

test('手機場景單指轉動、雙指縮放使用獨立手勢並正確結束',async({page},testInfo)=>{
  const cdp=await page.context().newCDPSession(page),touch=touchDriver(cdp),report={};
  try{
    const point=await canvasPoint(page);report.before=await snapshot(page);
    await touch.start(51,point);await expect.poll(async()=>(await snapshot(page)).view.pointers).toBe(1);
    await touch.move(51,{x:point.x+50,y:point.y+22});
    await expect.poll(async()=>Math.abs((await snapshot(page)).view.yaw-report.before.view.yaw)).toBeGreaterThan(.15);
    report.rotated=await snapshot(page);
    expect(Math.abs(report.rotated.view.yaw-report.before.view.yaw)).toBeGreaterThan(.15);
    expect(Math.abs(report.rotated.view.pitch-report.before.view.pitch)).toBeGreaterThan(.04);
    expect(report.rotated.touch.x).toBe(0);expect(report.rotated.touch.y).toBe(0);
    await touch.end();await cleared(page);
    await touch.start(61,{x:point.x-30,y:point.y});await touch.start(62,{x:point.x+30,y:point.y});
    await expect.poll(async()=>(await snapshot(page)).view.pointers).toBe(2);
    await touch.moveMany([[61,{x:point.x-65,y:point.y}],[62,{x:point.x+65,y:point.y}]]);
    await expect.poll(async()=>Math.abs((await snapshot(page)).view.distance-report.rotated.view.distance)).toBeGreaterThan(.3);
    report.pinched=await snapshot(page);expect(report.pinched.view.pointers).toBe(2);
    expect(Math.abs(report.pinched.view.distance-report.rotated.view.distance)).toBeGreaterThan(.3);
    await touch.end();await cleared(page);report.released=await snapshot(page);
    await evidence(testInfo,'native-camera-gestures',report);
  }finally{await touch.cancel().catch(()=>{});await cdp.detach();}
});

test('手機點用普通胸推機再返回探索，保留紅橘肌群與手腳接觸',async({page},testInfo)=>{
  await fixtureNearby(page,'chest-press');
  await expect(page.locator('[data-mobile-interact]')).toBeEnabled();
  await page.locator('[data-mobile-interact]').tap();
  await expect.poll(()=>page.evaluate(()=>window.__FORM__.world.getActivityState().stage),{timeout:90_000}).toBe('exercising');
  await expect(page.locator('.station-panel')).toContainText('胸推');
  await expect(page.locator('[data-mobile-stick]')).toBeHidden();
  await expect(page.locator('[data-mobile-exit]')).toBeVisible();
  const report=await page.evaluate(()=>{
    const {world,state}=window.__FORM__;
    return{activity:world.getActivityState(),touch:world.getTouchDiagnostics(),actual:world.getMuscleHighlights(),expected:{primary:state.active.muscleKeys,secondary:state.active.secondaryMuscleKeys},contact:world.getContactDiagnostics(),clearance:world.getClearanceDiagnostics(),self:world.getSelfClearanceDiagnostics(),colors:{primary:[...new Set([...document.querySelectorAll('.muscle-map [data-activation="primary"]')].map(el=>getComputedStyle(el).fill))],secondary:[...new Set([...document.querySelectorAll('.muscle-map [data-activation="secondary"]')].map(el=>getComputedStyle(el).fill))]}};
  });
  expect(report.activity.exerciseId).toBe('machine-chest-press');expect(report.contact.stationId).toBe('chest-press');
  expect([...report.actual.primary].sort()).toEqual([...report.expected.primary].sort());
  expect([...report.actual.secondary].sort()).toEqual([...report.expected.secondary].sort());
  expect(report.actual.primary.length).toBeGreaterThan(0);expect(report.actual.secondary.length).toBeGreaterThan(0);
  expect(report.colors.primary).toContain('rgb(220, 104, 85)');expect(report.colors.secondary).toContain('rgb(226, 162, 97)');
  expect(report.contact.maxContactError).toBeLessThan(.015);expect(report.contact.maxReachError).toBeLessThan(.015);
  expect(report.contact.gearHands.length).toBeGreaterThan(0);expect(report.clearance.collisions).toEqual([]);expect(report.self.collisions).toEqual([]);
  expect([report.touch.x,report.touch.y,report.touch.running]).toEqual([0,0,false]);
  await page.screenshot({path:join(artifactDir,'chest-press-compact.png')});

  await page.locator('[data-mobile-menu-toggle]').tap();
  await expect(page.locator('body')).toHaveClass(/mobile-menu-open/);
  await expect(page.locator('.mobile-controls')).toBeHidden();
  const cdp=await page.context().newCDPSession(page),touch=touchDriver(cdp);
  try{
    const point=await canvasPoint(page);report.cameraMenu={before:(await snapshot(page)).view};
    await touch.start(71,point);await touch.move(71,{x:point.x+35,y:point.y+18});await touch.end();
    await touch.start(81,{x:point.x-25,y:point.y});await touch.start(82,{x:point.x+25,y:point.y});
    await touch.moveMany([[81,{x:point.x-60,y:point.y}],[82,{x:point.x+60,y:point.y}]]);await touch.end();
    // Observe two normal frames after the native events; no simulated game
    // updates are used to claim that a blocked gesture was handled.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    report.cameraMenu.after=(await snapshot(page)).view;
    for(const key of ['yaw','pitch','distance'])expect(report.cameraMenu.after[key],`功能選單開啟時 ${key} 必須固定`).toBeCloseTo(report.cameraMenu.before[key],12);
    expect(report.cameraMenu.after.pointers).toBe(0);
  }finally{await touch.cancel().catch(()=>{});await cdp.detach();}
  await page.locator('[data-mobile-menu-toggle]').tap();
  await expect(page.locator('body')).not.toHaveClass(/mobile-menu-open/);
  await expect(page.locator('[data-mobile-exit]')).toBeVisible();

  await page.locator('[data-mobile-panel-toggle]').tap();
  await expect(page.locator('[data-mobile-panel-toggle]')).toHaveAttribute('aria-expanded','true');
  await page.screenshot({path:join(artifactDir,'chest-press-teaching.png')});
  await page.locator('[data-mobile-exit]').tap();
  await expect.poll(()=>page.evaluate(()=>window.__FORM__.world.getActivityState().stage),{timeout:90_000}).toBe('idle');
  await expect(page.locator('[data-mobile-stick]')).toBeVisible();await cleared(page);
  expect(await page.evaluate(()=>window.__FORM__.world.getMuscleHighlights())).toEqual({primary:[],secondary:[]});
  await evidence(testInfo,'ordinary-machine-touch',report);
});
