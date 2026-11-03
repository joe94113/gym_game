import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';
const errors=new WeakMap();
test.beforeEach(async({page})=>{
  const list=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();
});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));

test('從走道就位、取物、使用到放回離開，全程連續且沒有淡出瞬移',async({page},testInfo)=>{
  test.setTimeout(300000);
  const report=await page.evaluate(()=>{
    const a=window.__FORM__,w=a.world,results=[];
    const distance=(x,y)=>Math.hypot(...x.map((v,i)=>v-y[i]));
    for(const id of ['machine-chest-press','machine-bench-press','machine-leg-press','dumbbell-bench-press','cable-ez-bar-curl','inbody']){
      const before=w.getBodyWorldPoints();a.openExercise(id);const after=w.getBodyWorldPoints();
      const r={id,startJump:distance(before.hip,after.hip),maxJump:0,maxReach:0,collisions:[],states:[],actions:[]};let previous=after,previousState=w.getActivityState(),exerciseFrames=0;
      for(let step=0;step<3600;step++){
        w.update(.05,false);const state=w.getActivityState(),body=w.getBodyWorldPoints();
        for(const [part,points,oldPoints]of [['hip',[body.hip],[previous.hip]],['hands',body.hands,previous.hands],['feet',body.feet,previous.feet]])points.forEach((point,i)=>{const jump=distance(point,oldPoints[i]);if(jump>r.maxJump){r.maxJump=jump;r.maxJumpDetail={part,side:i,step,previousState,state,from:oldPoints[i],to:point,contact:w.getContactDiagnostics()?.frame};}});previous=body;previousState=state;
        if(!r.states.includes(state.stage))r.states.push(state.stage);
        if(['entering','exiting','returning','exercising'].includes(state.stage)){
          const contact=w.getContactDiagnostics();r.maxReach=Math.max(r.maxReach,contact.maxReachError);
          if(contact.frame?.stage&&!r.actions.includes(contact.frame.stage))r.actions.push(contact.frame.stage);
          if(step%5===0)r.collisions.push(...(w.getClearanceDiagnostics()?.collisions||[]));
        }
        if(state.stage==='exercising'&&++exerciseFrames>=12)w.stopExercise();
        if(!state.exerciseId){r.completed=w.getLastCompletedActivity();break;}
      }
      r.fade=Number(getComputedStyle(document.querySelector('#scene-fade')).opacity);results.push(r);
    }
    w.update(0);return results;
  });
  await testInfo.attach('continuous-player-lifecycles',{body:JSON.stringify(report),contentType:'application/json'});
  for(const r of report){
    expect(r.startJump,`${r.id}不能瞬移到器材`).toBeLessThan(.001);
    expect(r.maxJump,`${r.id}手腳或身體突跳`).toBeLessThan(.25);
    expect(r.maxReach,`${r.id}肢段可達`).toBeLessThan(.015);
    expect(r.collisions,`${r.id}進出器材穿模`).toEqual([]);
    for(const stage of ['approaching','entering','exercising','returning','exiting','idle'])expect(r.states).toContain(stage);
    expect(r.completed.id).toBe(r.id);expect(r.completed.position).toEqual(r.completed.gate);expect(r.fade).toBe(0);
  }
  const db=report.find(r=>r.id==='dumbbell-bench-press');expect(db.actions.some(s=>s.includes('啞鈴'))).toBe(true);expect(db.actions.some(s=>s.includes('椅墊'))).toBe(true);
});

test('入座途中取消會收回器材，切換動作先離開再開始下一個',async({page})=>{
  const result=await page.evaluate(()=>{
    const a=window.__FORM__,w=a.world;a.openExercise('dumbbell-bench-press');
    for(let i=0;i<3000;i++){w.update(.05,false);const s=w.getActivityState();if(s.stage==='entering'&&s.lifecyclePhase>.55)break;}
    const midway=w.getActivityState();w.stopExercise();const cancelState=w.getActivityState();const canceled=w.advanceUntilIdle(),first=w.getLastCompletedActivity();
    a.openExercise('rope-pushdown');const started=w.advanceUntilReady();a.openExercise('dumbbell-hammer-curl');const queued=w.getActivityState();const nextReady=w.advanceUntilReady(),next=w.getActivityState(),previous=w.getLastCompletedActivity();w.stopExercise();const finished=w.advanceUntilIdle();
    a.openExercise('rope-pushdown');w.advanceUntilReady();a.openExercise('dumbbell-curl');const queuedBeforeCancel=w.getActivityState().queuedExerciseId;w.stopExercise();const manualCancel=w.advanceUntilIdle(),afterCancel=w.getActivityState();
    a.openExercise('rope-pushdown');w.advanceUntilReady();w.stopExercise();w.advanceUntilIdle();const parked=w.getLifecyclePropState('rope-pushdown');a.openExercise('machine-cable-fly');const machineReady=w.advanceUntilReady(),hidden=w.getLifecyclePropState('rope-pushdown');w.stopExercise();w.advanceUntilIdle();
    return{midway,cancelState,canceled,first,started,queued,nextReady,next,previous,finished,queuedBeforeCancel,manualCancel,afterCancel,parked,machineReady,hidden};
  });
  expect(result.midway.stage).toBe('entering');expect(result.cancelState.stage).toBe('canceling');expect(result.canceled).toBe(true);expect(result.first.history).toContain('canceling');
  expect(result.started).toBe(true);expect(result.queued.queuedExerciseId).toBe('dumbbell-hammer-curl');expect(result.nextReady).toBe(true);expect(result.next.exerciseId).toBe('dumbbell-hammer-curl');
  expect(result.previous.id).toBe('rope-pushdown');expect(result.previous.history).toContain('exiting');expect(result.finished).toBe(true);
  expect(result.queuedBeforeCancel).toBe('dumbbell-curl');expect(result.manualCancel).toBe(true);expect(result.afterCancel.exerciseId).toBeNull();expect(result.afterCancel.queuedExerciseId).toBeNull();
  expect(result.parked.visible).toBe(true);expect(result.parked.ownership).toBe('park');expect(result.machineReady).toBe(true);expect(result.hidden.visible).toBe(false);
});

test('新增機型與蝴蝶機雙模式可以實際使用，槓片和紅橘標色保留',async({page},testInfo)=>{
  test.setTimeout(300000);
  const result=await page.evaluate(()=>{
    const a=window.__FORM__,w=a.world,ids=['machine-assisted-pullup','machine-assisted-dip','machine-hip-abduction','machine-hip-adduction','machine-back-extension','machine-preacher-curl','machine-lying-chest-press','machine-decline-chest-press','machine-pec-deck','machine-reverse-fly','machine-plate-incline-press','machine-leg-press'];
    return{stationCount:a.stations.length,catalogCount:a.catalogActivities.length,results:ids.map(id=>{
      a.openExercise(id);const ready=w.advanceUntilReady();w.setAnimationPaused(true);const meta=w.getLifecycleMetadata(),poses=[0,.22,.44,.72,1].map(p=>{w.inspectExercise(p,p);return{contact:w.getContactDiagnostics()?.maxContactError,reach:w.getContactDiagnostics()?.maxReachError,collisions:w.getClearanceDiagnostics()?.collisions};});const highlights=w.getMuscleHighlights();w.stopExercise();const exited=w.advanceUntilIdle();return{id,ready,exited,poses,highlights,entry:meta?.entryDuration,exit:meta?.exitDuration};
    })};
  });
  await testInfo.attach('expanded-machine-variants',{body:JSON.stringify(result),contentType:'application/json'});
  expect(result.stationCount).toBe(56);expect(result.catalogCount).toBe(73);
  for(const r of result.results){expect(r.ready,r.id).toBe(true);expect(r.exited,r.id).toBe(true);expect(r.entry).toBeGreaterThan(1);expect(r.exit).toBeGreaterThan(1);expect(r.highlights.primary.length).toBeGreaterThan(0);for(const p of r.poses){expect(p.contact).toBeLessThan(.015);expect(p.reach).toBeLessThan(.015);expect(p.collisions).toEqual([]);}}
  expect(result.results.find(r=>r.id==='machine-hip-adduction').highlights.primary).toContain('adductors');
  await page.evaluate(()=>window.__FORM__.openStation(window.__FORM__.stations.find(s=>s.id==='pec-deck')));await expect(page.locator('.trial-exercise-card')).toHaveCount(2);await expect(page.locator('[data-demo="machine-reverse-fly"]')).toBeVisible();
});
