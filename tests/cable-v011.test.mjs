import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {THREE,scene,character,metrics,rig} from '../scripts/dumbbell-test-helpers.mjs';
import {createActivityRig} from '../src/extended-rig.js';
import {exercises} from '../src/exercises.js';
import {extendedExercises} from '../src/extended-exercises.js';
import {cableExercisesV011,CABLE_IDS_V011} from '../src/cable-exercises-v011.js';
import {activitiesForStation,catalogActivities} from '../src/activity-catalog.js';
import {CHANGED_DB_GRIPS_V013,protectedDumbbellPoseV013,protectedDumbbellFrameV013,physicalDumbbellStateV013} from '../scripts/legacy-grip-contract-v013.mjs';

const V=p=>new THREE.Vector3(...p),distance=(a,b)=>V(a).distanceTo(V(b));
test.after(()=>character.dispose());

test('all three cable actions use the existing station and retain separate learned movement IDs and sourced instruction',()=>{
  const listed=activitiesForStation('cable-fly');
  for(const exercise of cableExercisesV011){
    assert.equal(listed.filter(item=>item.id===exercise.id).length,1);
    assert.equal(catalogActivities.filter(item=>item.movementId===exercise.id).length,1);
    assert.ok(exercise.muscleKeys.length&&exercise.secondaryMuscleKeys.length);
    assert.equal(exercise.steps.length,3);assert.ok(exercise.source.url.startsWith('https://'));
  }
  assert.equal(new Set(CABLE_IDS_V011).size,3);
});

test('resource inventory reads only constructed roots and does not build every movement',()=>{
  const fresh=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics});
  assert.deepEqual(fresh.getInventoryRoots(),[]);
  fresh.getSetup(CABLE_IDS_V011[0]);const roots=fresh.getInventoryRoots();
  assert.equal(roots.length,1);assert.equal(fresh.getInventoryRoots()[0],roots[0]);
  fresh.getSetup(CABLE_IDS_V011[0]);assert.equal(fresh.getInventoryRoots().length,1);
});

test('new loops use true palm and foot targets with fixed length bones and controlled wrists',()=>{
  for(const id of CABLE_IDS_V011){rig.prepare(id);for(let i=0;i<=30;i++){
    character.pose(rig.sample(id,i/30));const body=character.getContactPoints(),target=rig.getActualContacts(id);
    assert.ok(body.maxReachError<.001,`${id}: reach`);
    for(let side=0;side<2;side++){
      assert.ok(distance(body.hands[side],target.hands[side])<.001,`${id}: palm`);
      assert.ok(distance(body.feet[side],target.feet[side])<.001,`${id}: foot`);
      assert.ok(Math.abs(distance(body.shoulders[side],body.elbows[side])-metrics.arms[side].upper)<1e-6);
      assert.ok(Math.abs(distance(body.elbows[side],body.wrists[side])-metrics.arms[side].lower)<1e-6);
      assert.ok(character.getHandDiagnostics()[side].wristBendRadians*180/Math.PI<22,`${id}: wrist`);
    }
  }}
});

test('standing cable crunch bends all three spine bones while keeping the pelvis stable',()=>{
  const id='cable-rope-crunch',bones=['pelvis','spine_01','spine_02','spine_03'].map(name=>scene.getObjectByName(name));
  assert.ok(metrics.spine.anchors.length===3&&bones.every(Boolean));
  character.pose(rig.sample(id,0));const rotations=bones.map(bone=>bone.getWorldQuaternion(new THREE.Quaternion())),start=character.getContactPoints();
  character.pose(rig.sample(id,.48));const end=character.getContactPoints();
  assert.ok(bones[0].getWorldQuaternion(new THREE.Quaternion()).angleTo(rotations[0])<1e-6);
  for(let i=1;i<4;i++)assert.ok(Math.abs(bones[i].getWorldQuaternion(new THREE.Quaternion()).angleTo(rotations[i])-.38*i/3)<1e-5);
  assert.ok(end.shoulders[0][2]>start.shoulders[0][2]+.08);
  assert.ok(end.shoulders[0][1]<start.shoulders[0][1]-.01);
  for(let side=0;side<2;side++)assert.ok(distance(start.hips[side],end.hips[side])<1e-7);
});

test('release retraces the held and parked equipment path without teleporting or losing its props',()=>{
  for(const id of CABLE_IDS_V011){rig.prepare(id);for(const p of [0,.15,.35,.55,.7,.9,1]){
    const enter=rig.sampleLifecycle(id,'enter',p),a=rig.getLifecycleState(id),exit=rig.sampleLifecycle(id,'exit',1-p),b=rig.getLifecycleState(id);
    for(const key of ['hip','shoulder','head'])assert.ok(distance(enter.pose[key],exit.pose[key])<1e-8);
    for(const key of ['hands','feet'])for(let side=0;side<2;side++)assert.ok(distance(enter.pose[key][side],exit.pose[key][side])<1e-8);
    assert.ok(a.propPositions.length);for(let index=0;index<a.propPositions.length;index++)assert.ok(distance(a.propPositions[index],b.propPositions[index])<1e-8);
    assert.deepEqual(enter.contacts,exit.contacts);
  }}
});

test('legacy loops stay exact outside calibrated grips and the two explicitly retimed paths',()=>{
  // Historical hashes describe the authored poses and original clock. Current
  // captured defaults are verified separately by the v018 source qualifiers.
  const previous=JSON.parse(readFileSync(new URL('./fixtures/legacy-rig-v011.json',import.meta.url))),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),candidate=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics,capturedPose:false,capturedTransitionTiming:false});
  const protectedFixture=JSON.parse(readFileSync(new URL('./fixtures/legacy-grip-protected-v013.json',import.meta.url)));
  assert.equal(createHash('sha256').update(readFileSync(new URL('./fixtures/legacy-rig-v011.json',import.meta.url))).digest('hex'),protectedFixture.originalFixture.sha256,'the original full-hash fixture has not been rewritten');
  assert.deepEqual(protectedFixture.phases,previous.phases);
  for(const exercise of [...exercises,...extendedExercises]){
    const id=exercise.id,loops=previous.phases.map(phase=>candidate.sample(id,phase,phase)),changedGrip=CHANGED_DB_GRIPS_V013.includes(id);
    const retimed=['dumbbell-shoulder-press','dumbbell-goblet-squat'].includes(id);
    // Retimed movements have a committed actual-archive pose/gear fixture and
    // inverse-time comparison in retimed-path-v015.test.mjs. Same-phase hashes
    // would forbid the intended tempo change; metadata and lifecycles remain exact.
    if(retimed){
      const timingFixture=JSON.parse(readFileSync(new URL('./fixtures/retimed-path-v015.json',import.meta.url)));assert.equal(timingFixture.sourceVersion,'0.14.0');assert.ok(timingFixture.motions[id]?.length);
    }else if(changedGrip){
      const expected=protectedFixture.motions[id];
      // This projection was extracted from the archived source only after
      // reproducing the existing full hashes. It still protects hip, head,
      // shoulders, feet, directions, strength and every other non-hand field.
      assert.equal(hash(loops.map(pose=>protectedDumbbellPoseV013(pose))),expected.protectedLoop,`${id}: protected loop fields`);
      assert.notEqual(hash(loops.map(pose=>pose.handFingerFlex)),expected.originalHandProfile,`${id}: the intentional new grip is actually applied`);
      assert.equal(hash(previous.phases.map(phase=>{candidate.sample(id,phase,phase);return physicalDumbbellStateV013(candidate,id);})),expected.physicalLoops,`${id}: real shafts, plates, collars and their canonical transforms stay exact`);
    }else assert.equal(hash(loops),previous.motions[id].loop,`${id}: complete legacy loop`);
    assert.equal(hash(candidate.getLifecycle(id)),previous.motions[id].metadata,`${id}: lifecycle`);
    // The existing flat-bench seat correction remains its original narrow
    // exception. Every other frame keeps its original fields outside the
    // hand/forearm adapter; dense skin/metal release has a separate test.
    if(id!=='dumbbell-bench-press'){
      const frames=['enter','exit'].flatMap(mode=>previous.phases.map(phase=>candidate.sampleLifecycle(id,mode,phase)));
      if(changedGrip)assert.equal(hash(frames.map(protectedDumbbellFrameV013)),protectedFixture.motions[id].protectedLifecycle,`${id}: protected complete entry/exit frames`);
      else assert.equal(hash(frames),previous.motions[id].lifecycle,`${id}: complete legacy entry/exit`);
    }
  }
  candidate.end({keepVisible:false});assert.ok(candidate.setEquipmentSettings('dumbbell-bench-press',{benchAngle:30}).ok);
  assert.equal(hash(previous.phases.map(phase=>protectedDumbbellPoseV013(candidate.sample('dumbbell-bench-press',phase,phase)))),protectedFixture.bench30.protectedLoop,'30° bench protected loop');
  assert.equal(hash(previous.phases.map(phase=>{candidate.sample('dumbbell-bench-press',phase,phase);return physicalDumbbellStateV013(candidate,'dumbbell-bench-press');})),protectedFixture.bench30.physicalLoops,'30° bench actual dumbbell geometry');
});

test('entry and exit retain relaxed wrists during reach and a stable grasp under load',()=>{
  for(const id of CABLE_IDS_V011){rig.prepare(id);for(const mode of ['enter','exit'])for(let i=0;i<=80;i++){
    const frame=rig.sampleLifecycle(id,mode,i/80);character.pose(frame.pose);
    for(const [side,hand]of character.getHandDiagnostics().entries()){
      const degrees=hand.wristBendRadians*180/Math.PI;assert.ok(degrees<32,`${id}: ${frame.stage} wrist ${degrees}`);
      if(frame.contacts.hands[side])assert.ok(degrees<25,`${id}: loaded wrist ${degrees}`);
    }
  }}
});
