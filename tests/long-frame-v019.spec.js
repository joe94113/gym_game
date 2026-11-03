import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

// This is a deterministic hitch regression, not an FPS or physical-phone test.
// A real main-thread stall exercises the application's ordinary RAF catch-up;
// its clock is neither replaced nor advanced by the test.
function installHitchObserver(){
  const nativeRAF=window.requestAnimationFrame.bind(window);
  const observer={armed:false,current:null,completed:null,before:null,observedFrames:[]};
  window.__LONG_FRAME_V019__=observer;
  window.requestAnimationFrame=callback=>nativeRAF(function(timestamp){
    const gameFrame=callback.name==='frame'&&String(callback).includes('recordFrameTiming');
    const frame=gameFrame&&observer.armed?{timestamp,calls:[]}:null;
    if(frame)observer.current=frame;
    try{return callback.call(window,timestamp);}
    finally{
      if(frame){
        observer.current=null;
        observer.observedFrames.push(frame);
        // A queued callback can carry an earlier RAF timestamp: the real
        // 165ms stall can be observed across more than one callback. Test the
        // first actual >50ms catch-up rather than requiring a fixed step count.
        if(frame.calls.some(call=>call.deferAmbient)){
          observer.armed=false;
          const w=window.__FORM__.world;
          observer.completed={...frame,work:w.getFrameWorkDiagnostics(),state:w.getActivityState(),position:w.getPlayerPosition()};
        }
      }
    }
  });
}

async function triggerHitch(page){
  await page.evaluate(()=>{
    const w=window.__FORM__.world,o=window.__LONG_FRAME_V019__;
    o.before={work:w.getFrameWorkDiagnostics(),state:w.getActivityState(),position:w.getPlayerPosition()};
    o.completed=null;o.observedFrames=[];o.armed=true;
    const until=performance.now()+165;
    while(performance.now()<until){/* Intentionally block one real RAF. */}
  });
  await page.waitForFunction(()=>window.__LONG_FRAME_V019__.completed,null,{timeout:20000});
  return page.evaluate(()=>{
    const w=window.__FORM__.world,o=window.__LONG_FRAME_V019__,state=w.getActivityState();
    const social=w.getSocialDiagnostics(),contact=w.getContactDiagnostics();
    const swatch=selector=>{const node=document.querySelector(selector);return node?getComputedStyle(node).backgroundColor:null;};
    return{
      before:o.before,frame:o.completed,observedFrames:o.observedFrames,state,
      contact:{maxContactError:contact.maxContactError,maxReachError:contact.maxReachError,gearHands:contact.gearHands,gearFeet:contact.gearFeet},
      clearance:w.getClearanceDiagnostics(),self:w.getSelfClearanceDiagnostics(),
      classes:w.getClassDiagnostics(),classActors:social.actors.filter(actor=>actor.role.startsWith('class-')),
      highlights:w.getMuscleHighlights(),materials:w.getNpcMaterialDiagnostics(),
      colors:{primary:swatch('.muscle-legend .primary-swatch'),secondary:swatch('.muscle-legend .secondary-swatch')},
      renderer:w.getPerformanceDiagnostics().renderer,
    };
  });
}

function verifyHitch(result){
  const calls=result.frame.calls;
  expect(calls.length,'The actual main RAF must catch up the forced stall').toBeGreaterThanOrEqual(2);
  expect(calls.at(-1).renderFrame).toBe(true);
  expect(calls.at(-1).deferAmbient).toBe(false);
  for(const call of calls.slice(0,-1)){
    expect(call.renderFrame).toBe(false);expect(call.deferAmbient).toBe(true);
    expect(call.delta).toBeCloseTo(.05,10);
  }
  expect(calls.reduce((sum,call)=>sum+call.delta,0)).toBeLessThanOrEqual(.150000001);
  expect(calls.reduce((sum,call)=>sum+call.delta,0)).toBeGreaterThan(.05);
  let deferred=0;
  for(const key of ['npcPose','social']){
    const before=result.before.work[key],after=result.frame.work[key];
    expect(after.pendingPoses,`${key}: no hidden intermediate pose may remain after the displayed frame`).toBe(0);
    expect(after.deferredPoseUpdates).toBeGreaterThanOrEqual(before.deferredPoseUpdates);
    deferred+=after.deferredPoseUpdates-before.deferredPoseUpdates;
    expect(after.flushedPoseUpdates,`${key}: the last scheduled intermediate pose must be presented`).toBeGreaterThanOrEqual(before.flushedPoseUpdates);
  }
  expect(deferred,'The observed intermediate RAF steps must actually defer background poses').toBeGreaterThan(0);
  expect(result.contact.maxContactError).toBeLessThan(.015);
  expect(result.contact.maxReachError).toBeLessThan(.015);
  for(const point of [...(result.contact.gearHands||[]),...(result.contact.gearFeet||[])])expect(point.error).toBeLessThan(.015);
  expect(result.renderer).not.toMatch(/swiftshader|llvmpipe|lavapipe|software/i);
}

for(const device of [
  {name:'desktop',use:{viewport:{width:1280,height:800},deviceScaleFactor:1,isMobile:false,hasTouch:false}},
  {name:'phone-emulation',use:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}},
])test.describe(`long-frame catch-up / ${device.name}`,()=>{
  test.use(device.use);
  test('background poses coalesce while walking, using dumbbells and following a class',async({page},testInfo)=>{
    test.setTimeout(240000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(installHitchObserver);
    await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
    await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
    await page.locator('[data-action="free"]').click();
    await page.evaluate(()=>{
      const w=window.__FORM__.world,update=w.update;
      w.setGraphicsQuality('flow');
      w.update=function(delta,renderFrame=true,options={}){
        const frame=window.__LONG_FRAME_V019__.current;
        if(frame)frame.calls.push({delta,renderFrame,deferAmbient:options.deferAmbient===true});
        return update.call(this,delta,renderFrame,options);
      };
      if(!w.placePlayerAtStation('stretch-zone'))throw Error('Walking fixture is missing');
    });
    await page.waitForTimeout(250);
    await page.keyboard.down('w');
    let walking;
    try{walking=await triggerHitch(page);}finally{await page.keyboard.up('w');}
    verifyHitch(walking);
    const walkedSeconds=walking.observedFrames.reduce((sum,frame)=>sum+frame.calls.reduce((dt,call)=>dt+call.delta,0),0);
    const walkedDistance=Math.hypot(walking.frame.position.x-walking.before.position.x,walking.frame.position.z-walking.before.position.z);
    // This fixture holds W on a clear path without Shift. The recorded physics
    // steps determine the distance, including any queued frame before catch-up.
    expect(walkedDistance).toBeCloseTo(walkedSeconds*1.8,6);

    const results=[{kind:'walking',...walking}];
    for(const [kind,id]of [['dumbbells','dumbbell-bench-press'],['class','class-dance']]){
      expect(await page.evaluate(id=>{
        const a=window.__FORM__,w=a.world;a.openExercise(id);
        const ready=w.advanceUntilReady(180,false);w.setAnimationPaused(false);return ready;
      },id)).toBe(true);
      await page.waitForTimeout(250);
      const result=await triggerHitch(page);verifyHitch(result);results.push({kind,...result});
      expect(result.state.exerciseId).toBe(id);expect(result.state.stage).toBe('exercising');
      expect(result.clearance.collisions,`${kind}: fixture clearance after catch-up`).toEqual([]);
      expect(result.self.collisions,`${kind}: body self-clearance after catch-up`).toEqual([]);
      expect(result.highlights.primary.length).toBeGreaterThan(0);
      expect(result.materials.player.overlayEnabled).toBe(true);
      expect(result.colors).toEqual({primary:'rgb(220, 104, 85)',secondary:'rgb(226, 162, 97)'});
      if(kind==='class'){
        expect(result.classActors).toHaveLength(3);
        for(const actor of result.materials.social.actors.filter(actor=>actor.role.startsWith('class-')))expect(actor.backgroundActive).toBe(false);
        for(const actor of result.classes.npcs){expect(actor.status).toBe('using');expect(actor.kind).toBe('dance');}
        for(const actor of result.classActors){
          const lag=actor.id==='class-instructor'?0:actor.id==='class-participant-1'?.10:.18;
          expect(actor.classKind).toBe('dance');
          expect(actor.classPhase).toBeCloseTo(Math.max(0,result.state.phase-lag/result.state.course.duration),8);
          expect(actor.contactError).toBeLessThan(.015);
          expect(actor.collisions).toEqual([]);expect(actor.selfCollisions).toEqual([]);
        }
      }
      expect(await page.evaluate(()=>{const w=window.__FORM__.world;w.stopExercise();return w.advanceUntilIdle(180,false);})).toBe(true);
      await page.waitForTimeout(150);
    }
    await testInfo.attach(`long-frame-${device.name}`,{body:JSON.stringify({scope:'Deliberate real main-thread stalls under native Chromium; no altered clock, no FPS claim, no physical-phone claim.',results,errors},null,2),contentType:'application/json'});
    expect(errors).toEqual([]);
  });
});
