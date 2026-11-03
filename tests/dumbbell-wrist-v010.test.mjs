import test from 'node:test';
import assert from 'node:assert/strict';
import {THREE,rig,character,metrics} from '../scripts/dumbbell-test-helpers.mjs';
import {DUMBBELL_IDS} from '../src/dumbbell-grip.js';
import {cylinderHandMeasure} from '../scripts/equipment-grip-test-helpers.mjs';

const shaftIds=DUMBBELL_IDS.filter(id=>id!=='dumbbell-goblet-squat'),V=p=>new THREE.Vector3(...p),degrees=r=>r*180/Math.PI;
test.after(()=>character.dispose());
function prepare(id,angle=0){rig.end({keepVisible:false});if(id==='dumbbell-bench-press')rig.setEquipmentSettings(id,{benchAngle:angle});rig.prepare(id);}
function at(id,label){const meta=rig.getLifecycle(id);let elapsed=0;for(const stage of meta.stages){elapsed+=stage.duration;if(stage.label===label)return rig.sampleLifecycle(id,'enter',elapsed/meta.entryDuration);}throw new Error(label);}
function pose(frame){character.pose(frame.pose);return character.getContactPoints();}

test('free carried weights stay closed around their real shafts with aligned wrists and fixed bone lengths',()=>{
 for(const id of shaftIds){prepare(id);const frame=at(id,'先在身側轉成自然垂握'),body=pose(frame),hands=character.getHandDiagnostics(),props=rig.getLifecycleState(id),indices=id==='dumbbell-single-arm-row'?[1]:[0,1];
  for(const [weightIndex,side] of indices.entries()){
   assert.equal(frame.pose.handGripStrength[side],1);assert.ok(degrees(hands[side].wristBendRadians)<.02,`${id}: wrist`);
   assert.ok(Math.abs(V(body.shoulders[side]).distanceTo(V(body.elbows[side]))-metrics.arms[side].upper)<1e-6);
   const axis=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion(...props.propQuaternions[weightIndex]));
   assert.ok(Math.abs(axis.dot(V(body.wrists[side]).sub(V(body.elbows[side])).normalize()))<.0003,`${id}: physical shaft`);
   const skin=character.getSurfaceSamples({stride:1,parts:[side?'rightHand':'leftHand']}).map(s=>({...s,position:s.position.map((v,i)=>v+frame.offset[i])}));
   const grip=cylinderHandMeasure(skin,{center:props.propPositions[weightIndex],axis:axis.toArray(),halfLength:.12,radius:.016});
   assert.ok(grip.wraps,`${id}: open or detached grip`);assert.equal(grip.count,0,`${id}: hand through shaft`);
  }
 }
});

test('both bench angles keep vertical thigh support, then release that allowance when reclining',()=>{
 for(const angle of [0,30]){prepare('dumbbell-bench-press',angle);let frame=at('dumbbell-bench-press','啞鈴先穩放大腿上');pose(frame);
  for(const hand of character.getHandDiagnostics())assert.ok(degrees(hand.wristBendRadians)<8);
  for(const q of rig.getLifecycleState('dumbbell-bench-press').propQuaternions)assert.ok(new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion(...q)).y>.999999);
  assert.ok(rig.getCollisionVolumes('dumbbell-bench-press').some(v=>v.allowedBodyParts?.includes('leftThigh')));
  frame=at('dumbbell-bench-press','收緊身體帶鈴慢慢後躺');pose(frame);
  assert.equal(rig.getCollisionVolumes('dumbbell-bench-press').filter(v=>v.id.includes('weight')||v.id.includes('dumbbell')).some(v=>v.allowedBodyParts?.some(p=>p==='leftThigh'||p==='rightThigh')),false);
 }
});

test('approaching the canonical ready pose has no elbow or palm jump, and joins the original exercise exactly',()=>{
 for(const id of shaftIds){for(const angle of id==='dumbbell-bench-press'?[0,30]:[0]){prepare(id,angle);const duration=rig.getLifecycle(id).entryDuration,near=pose(rig.sampleLifecycle(id,'enter',1-.0001/duration)),end=pose(rig.sampleLifecycle(id,'enter',1));
  for(const key of ['hands','elbows','wrists','shoulders'])for(let side=0;side<2;side++)assert.ok(V(near[key][side]).distanceTo(V(end[key][side]))<.001,`${id}: near-ready ${key}`);
  character.pose(rig.sample(id,0,0));const loop=character.getContactPoints();
  for(const key of ['hands','feet','elbows','wrists','shoulders','hips','knees','ankles'])for(let side=0;side<2;side++)assert.ok(V(loop[key][side]).distanceTo(V(end[key][side]))<1e-7,`${id}: ready ${key}`);
 }}
});

test('the final regrip moves actual elbows gradually instead of changing the elbow plane in one frame',()=>{
 for(const id of shaftIds){prepare(id);const meta=rig.getLifecycle(id),settle=meta.stages.at(-1).duration,start=meta.entryDuration-settle;let previous=null,maxSpeed=0;
  const count=Math.ceil(settle*240);
  for(let i=0;i<=count;i++){const body=pose(rig.sampleLifecycle(id,'enter',(start+settle*i/count)/meta.entryDuration));
   if(previous)for(let side=0;side<2;side++)maxSpeed=Math.max(maxSpeed,V(body.elbows[side]).distanceTo(V(previous.elbows[side]))/(settle/count));previous=body;
  }
  // This is a deliberate animation pacing budget, not a human joint safety
  // limit. The previous centre-first IK path exceeded 8 m/s in this stage.
  assert.ok(maxSpeed<1.5,`${id}: final regrip elbow ${maxSpeed} m/s`);
 }
});
