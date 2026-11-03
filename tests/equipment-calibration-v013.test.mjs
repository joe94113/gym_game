import test from 'node:test';
import assert from 'node:assert/strict';
import {THREE,character,rig,machines} from '../scripts/equipment-settings-v013-test-helpers.mjs';
import {equipmentOptionsFor} from '../src/equipment-options.js';
import {decomposePlateLoad} from '../src/equipment-calibration-v013.js';
test.after(()=>character.dispose());
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),copy=value=>structuredClone(value);

test('only calibrated equipment exposes adjustments and rejects impossible settings without mutation',()=>{
 assert.deepEqual(equipmentOptionsFor('machine-treadmill').adjustments,[]);
 assert.deepEqual(equipmentOptionsFor('machine-reverse-fly').adjustments,[]);
 const machine=machines.get('chest-press'),initial=machine.getEquipmentSettings();
 for(const patch of [{seatHeightCm:70},{seatHeightCm:64.5},{weightKg:NaN},{weightKg:'30'},{pulleyHeightCm:200},{}]){assert.equal(machine.setEquipmentSettings(patch).ok,false);assert.deepEqual(machine.getEquipmentSettings(),initial);}
 assert.equal(machines.get('lat-pulldown').setEquipmentSettings({gripWidthCm:83}).ok,false);
});

test('seat adjustment moves the actual support and torso while feet stay grounded, and rebuilds entry-ready pose',()=>{
 for(const id of ['chest-press','lat-pulldown','shoulder-press']){
  const machine=machines.get(id),initial=machine.getEquipmentSettings(),base=copy(machine.sampleActivity(.44,.44));
  assert.equal(machine.setEquipmentSettings({seatHeightCm:initial.seatHeightCm+2}).ok,true);
  const raised=machine.sampleActivity(.44,.44);near(raised.hip[1]-base.hip[1],.02);near(raised.shoulder[1]-base.shoulder[1],.02);assert.deepEqual(raised.feet,base.feet);
  near(machine.getCalibrationState().seatObjectPosition[1],.02);near(machine.getSetup().entryReadyPose.hip[1]-base.hip[1],.02);
  character.pose(raised);assert.ok(character.getContactPoints().maxReachError<.015);machine.setEquipmentSettings(initial);
 }
});

test('leg-extension support, knee hinge, hand grips and pedals follow the same seat adjustment',()=>{
 const machine=machines.get('leg-extension'),initial=machine.getEquipmentSettings(),base=copy(machine.sampleActivity(.44,.44));machine.setEquipmentSettings({seatHeightCm:initial.seatHeightCm+2});const raised=machine.sampleActivity(.44,.44);
 for(const key of ['hands','feet','knees'])for(let i=0;i<2;i++)near(raised[key][i][1]-base[key][i][1],.02);
 character.pose(raised);const actual=character.getContactPoints();assert.ok(actual.maxReachError<.015);machine.setEquipmentSettings(initial);
});

test('lat-pulldown grip width changes both physical grips and palm targets at seat-range corners',()=>{
 const machine=machines.get('lat-pulldown'),initial=machine.getEquipmentSettings();
 for(const seatHeightCm of [62,66])for(const gripWidthCm of [76,84]){
  machine.setEquipmentSettings({seatHeightCm,gripWidthCm});const pose=machine.sampleActivity(.22,.22),contacts=machine.getActualContacts();near(Math.abs(contacts.hands[1][0]-contacts.hands[0][0]),gripWidthCm/100);assert.deepEqual(contacts.hands,pose.hands);character.pose(pose);assert.ok(character.getContactPoints().maxReachError<.015);
 }
 machine.setEquipmentSettings(initial);
});

test('selector pin chooses real plates; unselected bottom plates remain still in one instanced draw',()=>{
 const machine=machines.get('chest-press'),initial=machine.getEquipmentSettings(),plates=machine.group.getObjectByName('插銷配重片'),matrix=new THREE.Matrix4();assert.equal(plates.isInstancedMesh,true);assert.equal(plates.count,11);
 machine.setEquipmentSettings({weightKg:10});machine.sampleActivity(.44,.44);plates.getMatrixAt(0,matrix);near(matrix.elements[13],.24);plates.getMatrixAt(10,matrix);assert.ok(Math.abs(matrix.elements[13]-(.24+10*.072+.22))<1e-6);assert.equal(machine.getCalibrationState().stacks[0].selectedPlates,2);
 machine.setEquipmentSettings({weightKg:55});machine.sampleActivity(.44,.44);plates.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[13]-(.24+.22))<1e-6);assert.equal(machine.getCalibrationState().stacks[0].selectedPlates,11);machine.setEquipmentSettings(initial);
});

test('arbitrary qualified plate loads are represented by equal real disc mass on both sides, including empty horns',()=>{
 assert.deepEqual(decomposePlateLoad(13.75),[10,2.5,1.25]);for(const value of [-1,41,3,NaN,'10'])assert.equal(decomposePlateLoad(value),null);
 for(const id of ['leg-press','plate-incline-press','lying-chest-press','decline-chest-press','preacher-curl']){
  const machine=machines.get(id);assert.ok(machine);const initial=machine.getEquipmentSettings();assert.equal(machine.setEquipmentSettings({plateLoadKg:13.75}).ok,true);assert.deepEqual(machine.getPlateState().plateKg,{left:13.75,right:13.75});assert.deepEqual(machine.getPlateState().visiblePlates,{left:3,right:3});assert.equal(machine.setEquipmentSettings({plateLoadKg:0}).ok,true);assert.deepEqual(machine.getPlateState().visiblePlates,{left:0,right:0});machine.setEquipmentSettings(initial);
 }
});

test('pulley height moves the real main cable endpoint and selector pin without teleporting a held attachment',()=>{
 for(const [id,height]of [['rope-pushdown',204],['single-arm-cable-row',113],['cable-rope-hammer-curl',36],['cable-rope-crunch',204]]){
  const initial=rig.getEquipmentSettings(id);assert.equal(rig.setEquipmentSettings(id,{pulleyHeightCm:height,weightKg:45}).ok,true);rig.prepare(id);rig.sample(id,.44,.44);
  const state=rig.getEquipmentCalibrationState(id);near(state.pulleyAnchor[1],height/100);assert.equal(state.weightKg,45);
  const root=rig.getVisualRoot(id),cable=root.getObjectByName('calibrated-cable');root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),endpoints=[-.5,.5].map(y=>new THREE.Vector3(0,y,0).applyMatrix4(cable.matrixWorld).applyMatrix4(inverse));assert.ok(endpoints.some(point=>point.distanceTo(new THREE.Vector3(...state.pulleyAnchor))<1e-6));
  const before=copy(rig.getLifecycleState(id));assert.equal(rig.setEquipmentSettings(id,{pulleyHeightCm:initial.pulleyHeightCm}).reason,'busy');assert.deepEqual(rig.getLifecycleState(id),before);rig.end({keepVisible:false});rig.setEquipmentSettings(id,initial);
 }
});

test('repeated idle pulley changes rebuild the entry route without accumulating duplicate trays, clips or collision solids',()=>{
 const id='single-arm-cable-row',initial=rig.getEquipmentSettings(id);rig.prepare(id);const root=rig.getVisualRoot(id),children=root.children.length,volumes=rig.getCollisionVolumes(id).length;rig.end({keepVisible:false});
 for(let i=0;i<8;i++){
  assert.equal(rig.setEquipmentSettings(id,{pulleyHeightCm:i%2?103:113}).ok,true);rig.prepare(id);rig.sampleLifecycle(id,'enter',.5);assert.equal(root.children.length,children);assert.equal(rig.getCollisionVolumes(id).length,volumes);rig.end({keepVisible:false});
 }
 rig.setEquipmentSettings(id,initial);
});
