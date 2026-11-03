import test from 'node:test';
import assert from 'node:assert/strict';
import {createMocapFixtureV018} from '../scripts/mocap-fixture-v018.mjs';
import {createActivityRig} from '../src/extended-rig.js';
import {solveHandContactFrame} from '../src/hand-contact-frame.js';
import {equipmentAdjustmentsFor} from '../src/equipment-calibration-v013.js';

const f=await createMocapFixtureV018(),id='cable-straight-arm-pulldown',distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const angle=(a,b,c)=>{const x=a.map((v,i)=>v-b[i]),y=c.map((v,i)=>v-b[i]);return Math.acos(Math.max(-1,Math.min(1,x.reduce((s,v,i)=>s+v*y[i],0)/(Math.hypot(...x)*Math.hypot(...y)))))*180/Math.PI;};
test.after(()=>f.character.dispose());

test('straight-arm loop maintains a small model elbow bend with actual GLB contacts and retained muscle colors',()=>{
 f.rig.prepare(id);f.character.setMuscleHighlights(['lats'],['triceps']);f.character.setMuscleOverlayEnabled(true);const muscles=f.character.getMuscleHighlights();
 for(let i=0;i<=200;i++){
  f.character.pose(f.rig.sample(id,i/200,0));const body=f.character.getContactPoints(),contacts=f.rig.getActualContacts(id);
  assert.ok(body.maxReachError<.001);
  for(let side=0;side<2;side++){
   assert.ok(Math.abs(angle(body.shoulders[side],body.elbows[side],body.wrists[side])-165)<.02,'included elbow angle');
   assert.ok(distance(body.hands[side],contacts.hands[side])<.001);assert.ok(distance(body.feet[side],contacts.feet[side])<.001);
   assert.ok(Math.abs(distance(body.shoulders[side],body.elbows[side])-f.metrics.arms[side].upper)<1e-6);
   assert.ok(Math.abs(distance(body.elbows[side],body.wrists[side])-f.metrics.arms[side].lower)<1e-6);
   assert.ok(f.character.getHandDiagnostics()[side].wristBendRadians*180/Math.PI<22);
  }
  assert.equal(f.character.getMuscleOverlayEnabled(),true);assert.deepEqual(f.character.getMuscleHighlights(),muscles);
 }
 f.rig.end({keepVisible:false});
});

test('reach derives from arm and palm metrics rather than a fixed world radius',()=>{
 for(const scale of [.85,1.15]){
  const metrics=structuredClone(f.metrics);for(const arm of metrics.arms){arm.upper*=scale;arm.lower*=scale;arm.palmLength*=scale;arm.palmOffset=arm.palmOffset.map(v=>v*scale);}
  const rig=createActivityRig({THREE:f.THREE,scene:new f.THREE.Scene(),characterMetrics:metrics});
  for(const phase of [0,.2,.43,.8,1]){
   const pose=rig.sample(id,phase,0);
   for(let side=0;side<2;side++){const h=solveHandContactFrame(metrics,pose,side),root=metrics.neutral.shoulder.map((v,i)=>v+metrics.arms[side].shoulderOffset[i]);assert.ok(Math.abs(angle(root,h.elbow,h.wrist)-165)<.02);}
  }
  rig.end({keepVisible:false});
 }
});

test('all valid pulley and selector settings retain the same shoulder motion while moving the real cable and pin',()=>{
 const rules=equipmentAdjustmentsFor(id),range=key=>{const r=rules.find(x=>x.key===key);return Array.from({length:1+(r.max-r.min)/r.step},(_,i)=>r.min+i*r.step);},original=f.rig.getEquipmentSettings(id),golden=new Map();let combinations=0;
 for(const pulleyHeightCm of range('pulleyHeightCm'))for(const weightKg of range('weightKg')){
  f.rig.end({keepVisible:false});assert.equal(f.rig.setEquipmentSettings(id,{pulleyHeightCm,weightKg}).ok,true);f.rig.prepare(id);
  for(const phase of [0,.25,.5,.75,1]){
   const pose=f.rig.sample(id,phase,0);if(!golden.has(phase))golden.set(phase,pose);else assert.deepEqual(pose,golden.get(phase));
   f.character.pose(pose);assert.ok(f.character.getContactPoints().maxReachError<.001);
   const state=f.rig.getEquipmentCalibrationState(id);assert.equal(state.pulleyAnchor[1],pulleyHeightCm/100);assert.equal(state.weightKg,weightKg);
   assert.ok(Math.abs(state.selectorPin[1]-(.24+(11-weightKg/5)*.072))<1e-9);
   const root=f.rig.getVisualRoot(id),cable=root.getObjectByName('calibrated-cable');root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),ends=[-.5,.5].map(y=>new f.THREE.Vector3(0,y,0).applyMatrix4(cable.matrixWorld).applyMatrix4(inverse));
   assert.ok(ends.some(p=>distance(p.toArray(),state.pulleyAnchor)<1e-6));
  }
  const state=structuredClone(f.rig.getLifecycleState(id));assert.equal(f.rig.setEquipmentSettings(id,{weightKg:weightKg===30?35:30}).reason,'busy');assert.deepEqual(f.rig.getLifecycleState(id),state);combinations++;
 }
 assert.equal(combinations,55);f.rig.end({keepVisible:false});assert.equal(f.rig.setEquipmentSettings(id,original).ok,true);
 for(const settings of [{pulleyHeightCm:205},{pulleyHeightCm:229},{weightKg:0},{weightKg:60},{weightKg:12}])assert.equal(f.rig.setEquipmentSettings(id,settings).ok,false);
});
