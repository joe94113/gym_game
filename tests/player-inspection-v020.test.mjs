import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlayerActivity} from '../src/player-activity.js';
import {buildLocomotionPose} from '../src/locomotion.js';

function harness(){
 const metrics={neutral:{hip:[0,1,0],shoulder:[0,1.5,0],head:[0,1.75,0],hands:[[-.25,.8,0],[.25,.8,0]],feet:[[-.14,.013,0],[.14,.013,0]]}};
 const rest=buildLocomotionPose(metrics,0,0),poses=[],samples=[],frames=[],events=[];
 const character={group:new THREE.Group(),getAssetInfo:()=>({metrics}),pose:p=>poses.push(p),setMuscleHighlights(){}};
 const runtime={
  getSetup:()=>({origin:[0,0,0],duration:10}),getLifecycle:()=>({gateOffset:[0,0,0],entryDuration:.1,exitDuration:.1,restPhase:0}),
  prepare(){events.push('prepare');},begin(){events.push('begin');},beginExit(){events.push('beginExit');},end(){events.push('end');},
  sample(id,phase,cycle){const marker={kind:'loop',phase,cycle};samples.push(marker);return {...rest,marker};},
  sampleLifecycle(id,direction,phase){const marker={kind:direction,phase};samples.push(marker);return {pose:{...rest,marker},offset:[phase,0,0],stage:direction,contacts:{hands:[true,true],feet:[true,true]}};},
 };
 const activity=createPlayerActivity({THREE,character,runtime,crowd:{getOccupancy:()=>({state:'free'}),requestHandoff(){}},findPath:()=>[],floorHeight:()=>0,onFrame:frame=>frames.push(frame)});
 const ready=()=>{assert.equal(activity.start('dumbbell-curl'),true);for(let i=0;i<10&&activity.getState().stage!=='exercising';i++)activity.update(.2);assert.equal(activity.getState().stage,'exercising');};
 return {activity,ready,character,poses,samples,frames,events,last:()=>poses.at(-1).marker};
}

test('loop inspection survives ordinary animation updates and freezes the session clock without changing its saved phase',()=>{
 for(const paused of [false,true]){
  const h=harness(),a=h.activity;h.ready();a.seek(.17);a.setPaused(paused);const original=a.getState();
  assert.equal(a.inspect(.76,2.76),true);
  for(const dt of [1/60,1/30,0,.5,3]){
   const count=h.samples.length;a.update(dt);
   assert.deepEqual(h.last(),{kind:'loop',phase:.76,cycle:2.76});assert.equal(h.samples.length,count+1);
   assert.equal(a.getState().phase,original.phase);assert.equal(a.getState().paused,paused);assert.equal(a.getState().stage,'exercising');
   assert.deepEqual(a.getFrame().offset,[0,0,0]);
  }
  // Replacing a selection must also replace the sampled source repetition.
  a.inspect(.34);a.update(.25);assert.deepEqual(h.last(),{kind:'loop',phase:.34,cycle:.34});
 }
});

test('switching loop, entry and exit inspections keeps the selected pose and equipment path on later frames',()=>{
 const h=harness(),a=h.activity;h.ready();a.seek(.12);
 for(const [direction,phase]of [['enter',.31],['loop',.82],['exit',.64],['loop',.45]]){
  if(direction==='loop')assert.equal(a.inspect(phase,1+phase),true);else assert.ok(a.inspectLifecycle(direction,phase));
  for(let i=0;i<4;i++){
   a.update(.016);
   assert.deepEqual(h.last(),direction==='loop'?{kind:'loop',phase,cycle:1+phase}:{kind:direction,phase});
   assert.equal(h.character.group.position.x,direction==='loop'?0:phase);
   assert.equal(a.getState().phase,.12);
  }
 }
});

test('closing a preview with seek restores its saved phase, then ordinary playback can resume',()=>{
 for(const direction of ['loop','enter','exit']){
  const h=harness(),a=h.activity;h.ready();a.seek(.22);a.setPaused(true);const original=a.getState();
  if(direction==='loop')a.inspect(.91,3.91);else a.inspectLifecycle(direction,.91);a.update(.2);
  assert.equal(a.seek(original.phase),true);a.setPaused(original.paused);
  for(let i=0;i<3;i++){a.update(.016);assert.equal(h.last().kind,'loop');assert.equal(h.last().phase,original.phase);assert.ok(Math.abs(h.last().cycle-original.phase)<1e-12);}
  a.setPaused(false);a.update(1);assert.equal(h.last().kind,'loop');assert.ok(Math.abs(h.last().phase-.32)<1e-12);assert.ok(Math.abs(a.getState().phase-.32)<1e-12);
 }
});

test('stopping either preview uses the saved session phase and completes the normal return and exit sequence',()=>{
 for(const direction of ['loop','exit']){
  const h=harness(),a=h.activity;h.ready();a.seek(.6);
  if(direction==='loop')a.inspect(.95,5.95);else a.inspectLifecycle(direction,.95);a.update(.2);a.stop();
  assert.equal(a.getState().stage,'returning');a.update(.15);
  assert.equal(h.last().kind,'loop');assert.ok(h.last().phase>.6&&h.last().phase<.7,'return starts at the real session phase');
  a.update(4);assert.equal(a.getState().stage,'exiting');assert.deepEqual(h.last(),{kind:'exit',phase:0});
  a.update(.2);assert.equal(a.getState().stage,'idle');assert.ok(h.events.includes('beginExit'));assert.ok(h.events.includes('end'));
  h.ready();a.update(1);assert.deepEqual(h.last(),{kind:'loop',phase:.1,cycle:.1});
 }
});

test('loop inspection cannot lock a session before its ordinary entry has completed',()=>{
 const h=harness(),a=h.activity;assert.equal(a.inspect(.5),false);assert.equal(a.start('dumbbell-curl'),true);
 assert.equal(a.inspect(.5),false);a.update(.2);assert.equal(a.getState().stage,'entering');
 assert.equal(a.inspect(.5),false);a.update(.2);assert.equal(a.getState().stage,'exercising');a.update(1);assert.deepEqual(h.last(),{kind:'loop',phase:.1,cycle:.1});
});
