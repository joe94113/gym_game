import test from 'node:test';
import assert from 'node:assert/strict';
import {createBenchFixtureV011} from '../scripts/bench-fixture-v011.mjs';
import {equipmentOptionsFor,equipmentPresentationFor} from '../src/equipment-options.js';
import {evaluateExerciseClearance} from '../src/collision-validation.js';

const {THREE,rig,character}=await createBenchFixtureV011(),id='dumbbell-bench-press';
test.after(()=>character.dispose());
function set(angle){rig.end({keepVisible:false});assert.equal(rig.setEquipmentSettings(id,{benchAngle:angle}).ok,true);rig.prepare(id);}

test('every whole degree has matching visible pad, collision pad, supported pose and teaching angle',()=>{
 for(let angle=0;angle<=45;angle++){
  set(angle);const pose=rig.sample(id,0,0);character.pose(pose);const root=rig.getVisualRoot(id),volume=rig.getCollisionVolumes(id).find(v=>v.id==='bench-pad');
  assert.ok(Math.abs(root.children[0].rotation.x-angle*Math.PI/180)<1e-10);
  assert.ok(Math.abs((volume.rotation?.[0]||0)-angle*Math.PI/180)<1e-10);
  if(angle>0){const seat=root.children[7],contact=rig.getCollisionVolumes(id).find(v=>v.id==='incline-seat-pad');assert.deepEqual(seat.position.toArray(),contact.position);assert.ok(Math.abs(seat.rotation.x-(contact.rotation?.[0]||0))<1e-10);}
  const body=character.getContactPoints();assert.equal(evaluateExerciseClearance(body,rig.getCollisionVolumes(id)).collisions.length,0,`${angle} degrees`);
  for(const side of [0,1])assert.ok(new THREE.Vector3(...body.feet[side]).distanceTo(new THREE.Vector3(...pose.feet[side]))<1e-6);
  if(angle>0)assert.ok(equipmentPresentationFor(id,{benchAngle:angle}).setupLabel.includes(`${angle}°`));
 }
});

test('adjustment is refused while holding weights and revisiting angles reuses one visible bench',()=>{
 set(17);rig.sampleLifecycle(id,'enter',.8);const before=rig.getLifecycleState(id);assert.equal(rig.setEquipmentSettings(id,{benchAngle:18}).reason,'busy');assert.deepEqual(rig.getLifecycleState(id),before);
 const original=rig.getVisualRoot(id),count=original.children.length;set(18);const other=rig.getVisualRoot(id);assert.equal(original.visible,false);set(17);assert.equal(rig.getVisualRoot(id),original);assert.equal(original.children.length,count);assert.equal(other.visible,false);
});

test('range metadata is isolated from caller edits and rejects non-integer or out-of-range settings',()=>{
 const options=equipmentOptionsFor(id);options.benchAngleRange.max=90;options.benchAngles.pop();assert.equal(equipmentOptionsFor(id).benchAngleRange.max,45);assert.equal(equipmentOptionsFor(id).benchAngles.length,46);
 rig.end({keepVisible:false});for(const angle of [-1,46,.5,44.5,Infinity,'15',null])assert.equal(rig.setEquipmentSettings(id,{benchAngle:angle}).ok,false);
});

test('flat sitting lands on the actual rounded cushion instead of hovering over its front edge',()=>{
 set(0);const meta=rig.getLifecycle(id);let elapsed=0;for(const stage of meta.stages){elapsed+=stage.duration;if(stage.label==='啞鈴先穩放大腿上')break;}
 character.pose(rig.sampleLifecycle(id,'enter',elapsed/meta.entryDuration).pose);const root=rig.getVisualRoot(id),pad=root.children[0],ray=new THREE.Raycaster();root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();let nearest=Infinity,hits=0;
 const candidates=character.getSurfaceSamples({stride:1,parts:['pelvis']}).filter(s=>Math.abs(s.position[0])<.24&&s.position[2]<.22).sort((a,b)=>a.position[1]-b.position[1]).slice(0,250);
 for(const sample of candidates){const p=new THREE.Vector3(...sample.position),origin=p.clone().add(new THREE.Vector3(0,.2,0)).applyMatrix4(root.matrixWorld),direction=new THREE.Vector3(0,-1,0).transformDirection(root.matrixWorld);ray.set(origin,direction);ray.near=0;ray.far=.4;const top=ray.intersectObject(pad,false).find(h=>h.face.normal.clone().transformDirection(pad.matrixWorld).y>.6);if(top){hits++;nearest=Math.min(nearest,p.y-top.point.clone().applyMatrix4(inverse).y);}}
 assert.ok(hits>0);assert.ok(nearest>=-.001&&nearest<.006,`rounded-pad support gap ${nearest}m`);
});
