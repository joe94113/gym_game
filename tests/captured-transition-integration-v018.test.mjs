import test from 'node:test';import assert from 'node:assert/strict';
import {createMocapFixtureV017} from '../scripts/mocap-fixture-v017.mjs';
import {createActivityRig} from '../src/extended-rig.js';
import {createMachineLifecycle} from '../src/machine-lifecycle.js';
import {inverseAuthoredSmooth} from '../src/captured-transition-v018.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
const fixture=await createMocapFixtureV017(),{THREE,metrics,character}=fixture;
const smooth=x=>x*x*(3-2*x),body=frame=>{character.pose(frame.pose);return transformBody(character.getContactPoints(),frame);};
function matchedPhase(frame,mode){const meta=frame.transitionTiming,[a,b]=meta.segmentRange,stored=a+(b-a)*inverseAuthoredSmooth(meta.pathProgress);return mode===meta.storedPathDirection?stored:1-stored;}
function verify(sample,reference){let found=0;for(const mode of ['enter','exit'])for(let i=1;i<100;i++){const frame=sample(mode,i/100),m=frame.transitionTiming;if(!m||m.pathProgress<.05||m.pathProgress>.95||Math.abs(m.pathProgress-smooth(m.storedPhase))<.05)continue;const actual=body(frame),original=reference(mode,matchedPhase(frame,mode)),expected=body(original);assert.equal(original.transitionTiming,undefined);assert.deepEqual(frame.contacts,original.contacts);for(const key of ['hands','feet','elbows','knees'])for(let side=0;side<2;side++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(actual[key][side][axis]-expected[key][side][axis])<1e-6,key);found++;break;}assert.equal(found,2,'both directions must actually use a nontrivial captured profile');}
test.after(()=>character.dispose());

test('dumbbell timing changes the tempo while preserving the authored actual GLB path in both directions',()=>{
 const current=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics}),plain=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics,capturedTransitionTiming:false}),id='dumbbell-shoulder-press';current.prepare(id);plain.prepare(id);verify((m,p)=>current.sampleLifecycle(id,m,p),(m,p)=>plain.sampleLifecycle(id,m,p));
});
test('seated-machine timing is applied once and uses the independently captured sit and stand directions',()=>{
 const machine=fixture.machines.get('chest-press'),current=createMachineLifecycle({THREE,machine,metrics}),plain=createMachineLifecycle({THREE,machine,metrics,capturedTransitionTiming:false});verify((m,p)=>current.sample(m,p),(m,p)=>plain.sample(m,p));
 const roles=current.getCapturedTransitionCoverage().segments.flatMap(s=>[s.enter,s.exit]).filter(s=>s.applied).map(s=>s.role);assert.ok(roles.includes('sit-down'));assert.ok(roles.includes('stand-up'));
});

test('seated-row shoes lift before crossing the rail, with planted contacts unchanged',()=>{
 const machine=fixture.machines.get('seated-row'),life=createMachineLifecycle({THREE,machine,metrics,capturedTransitionTiming:false});
 for(const direction of ['enter','exit'])for(const enterPhase of [.16,.165,.17,.1725,.175,.18,.2,.21,.22,.23,.25,.27,.3]){
  const frame=life.sample(direction,direction==='enter'?enterPhase:1-enterPhase);character.pose(frame.pose);const world=transformBody(character.getContactPoints(),frame),feet=transformSurface(character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),frame),volumes=machine.getCollisionVolumes();
  assert.equal(evaluateExerciseClearance(world,volumes).collisions.length,0);assert.equal(evaluateSelfClearance(world).collisions.length,0);assert.equal(evaluateSurfaceClearance(feet,volumes,{tolerance:.001}).collisions.length,0,`${direction} ${enterPhase}`);
 }
});
