import test from 'node:test';import assert from 'node:assert/strict';
import {planCapturedTransition,capturedTransitionProgress,inverseAuthoredSmooth,capturedTransitionScope} from '../src/captured-transition-v018.js';
import {sampleTransitionCapture} from '../src/captured-transition-data-v018.js';
const pose=(y=1,handY=.8)=>({hip:[0,y,0],shoulder:[0,y+.45,0],feet:[[-.18,.013,.1],[.18,.013,.1]],hands:[[-.3,handY,.2],[.3,handY,.2]],handGripStrength:[0,0],gripping:false});
const seat=()=>({domain:'machine',type:'chestPress',id:'chest-press',stage:'standing',from:pose(.6),to:pose(1),stateA:{open:0},stateB:{open:0}});

test('real sit and stand captures are selected independently for actual playback direction',()=>{
 const up=planCapturedTransition(seat()),down=planCapturedTransition({...seat(),from:pose(1),to:pose(.6)});
 assert.equal(up.role,'stand-up');assert.equal(down.role,'sit-down');assert.notEqual(up.captureId,down.captureId);assert.equal(up.sourceDirection,'forward-capture');
 assert.equal(capturedTransitionProgress(down,.25,{reversePath:true}),1-sampleTransitionCapture(down.captureId,.75));
});
test('walk, foot placement, grip changes, mechanisms and unsupported rigs keep the authored timeline',()=>{
 for(const patch of [{kind:'walk'},{kind:'step'},{kind:'turn'},{to:{...pose(1),feet:[[-.18,.013,.2],[.18,.013,.1]]}},{gripChange:[1,0]},{stateB:{open:1}},{type:'squat'},{type:'bike'}])assert.equal(planCapturedTransition({...seat(),...patch}).applied,false);
 assert.equal(capturedTransitionProgress({applied:false},.5),null);
});
test('measured held raise and lower are timing references, not captured rack pickup or release',()=>{
 const from={...pose(1,.8),handGripStrength:[1,1]},to={...pose(1,1.3),handGripStrength:[1,1]},up=planCapturedTransition({domain:'dumbbell',id:'dumbbell-shoulder-press',stage:'把啞鈴帶到肩旁',from,to,fromHeld:true,toHeld:true}),down=planCapturedTransition({domain:'dumbbell',id:'dumbbell-shoulder-press',stage:'把啞鈴帶到肩旁',from:to,to:from,fromHeld:true,toHeld:true});
 assert.equal(up.role,'held-raise');assert.equal(down.role,'held-lower');assert.match(up.sourceAction,/not rack pickup/);assert.equal(capturedTransitionScope.sourcePoseApplied,false);assert.equal(capturedTransitionScope.humanApproval,false);
});
test('all selected profile progress is monotone bounded with rest endpoints and zero endpoint slope',()=>{
 const profiles=[planCapturedTransition(seat()),planCapturedTransition({...seat(),from:pose(1),to:pose(.6)}),planCapturedTransition({domain:'dumbbell',id:'dumbbell-curl',from:pose(1),to:pose(.85)})];
 for(const profile of profiles)for(const reversePath of [false,true]){let previous=0;for(let i=0;i<=2000;i++){const value=capturedTransitionProgress(profile,i/2000,{reversePath});assert.ok(value>=previous-1e-12&&value>=0&&value<=1);previous=value;}const h=1e-7;assert.ok(capturedTransitionProgress(profile,h,{reversePath})/h<.001);assert.ok((1-capturedTransitionProgress(profile,1-h,{reversePath}))/h<.001);}
 for(let i=0;i<=100;i++){const x=i/100,y=inverseAuthoredSmooth(x);assert.ok(Math.abs(y*y*(3-2*y)-x)<1e-12);}
});
