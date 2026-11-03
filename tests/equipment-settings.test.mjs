import test from 'node:test';
import assert from 'node:assert/strict';
import {rig,character} from '../scripts/dumbbell-test-helpers.mjs';
import {equipmentOptionsFor,equipmentPresentationFor} from '../src/equipment-options.js';
import {activityById} from '../src/activity-catalog.js';

const bench='dumbbell-bench-press',pushdown='rope-pushdown';
test.after(()=>character.dispose());
test('only qualified angles and compatible handle/movement combinations are offered',()=>{
 assert.deepEqual(equipmentOptionsFor(bench).benchAngles.map(x=>x.value),Array.from({length:46},(_,angle)=>angle));
 assert.deepEqual(equipmentOptionsFor(bench).benchAngleRange,{min:0,max:45,step:1});
 for(const id of [pushdown,'cable-straight-bar-curl','cable-ez-bar-curl','single-arm-cable-row','cable-v-bar-row'])for(const option of equipmentOptionsFor(id).handleOptions)assert.ok(activityById(option.exerciseId));
 assert.equal(equipmentOptionsFor('machine-chest-press').benchAngles.length,0);
 assert.equal(equipmentPresentationFor(bench,{benchAngle:30}).name,'上斜啞鈴臥推');
 assert.equal(equipmentPresentationFor(pushdown,{handle:'straight-bar'}).attachmentId,'straight-bar');
});
test('invalid and unqualified settings are rejected without changing active defaults',()=>{
 for(const value of [-1,46,30.5,NaN,'30'])assert.equal(rig.setEquipmentSettings(bench,{benchAngle:value}).ok,false);
 assert.equal(rig.setEquipmentSettings(pushdown,{handle:'ankle-strap'}).ok,false);
 assert.deepEqual(rig.getEquipmentSettings(bench),{benchAngle:0});assert.deepEqual(rig.getEquipmentSettings(pushdown),{handle:'triceps-rope',pulleyHeightCm:224,weightKg:30});
});
test('changing a held apparatus is refused and preserves the actual prop pose',()=>{
 rig.prepare(bench);rig.sampleLifecycle(bench,'enter',.86);const before=rig.getLifecycleState(bench);
 assert.equal(rig.setEquipmentSettings(bench,{benchAngle:30}).reason,'busy');assert.equal(rig.setEquipmentSettings(pushdown,{handle:'straight-bar'}).reason,'busy');assert.deepEqual(rig.getLifecycleState(bench),before);
 assert.equal(rig.setEquipmentSettings(bench,{benchAngle:0}).changed,false);rig.end({keepVisible:true});
});
test('changing bench angle while idle hides the previous root and does not duplicate racks',()=>{
 const flat=rig.getVisualRoot(bench),flatChildren=flat.children.length,flatVolumes=rig.getNavigationVolumes(bench).length;
 assert.equal(rig.setEquipmentSettings(bench,{benchAngle:30}).ok,true);assert.equal(flat.visible,false);rig.prepare(bench);const incline=rig.getVisualRoot(bench),inclineChildren=incline.children.length;
 assert.notEqual(flat,incline);assert.ok(Math.abs(incline.children[0].rotation.x-Math.PI/6)<1e-12);assert.equal(incline.visible,true);assert.equal(flat.visible,false);
 rig.end({keepVisible:true});assert.equal(rig.setEquipmentSettings(bench,{benchAngle:0}).ok,true);assert.equal(incline.visible,false);rig.prepare(bench);assert.equal(rig.getVisualRoot(bench),flat);assert.equal(flat.children.length,flatChildren);assert.equal(rig.getNavigationVolumes(bench).length,flatVolumes);
 rig.end({keepVisible:true});rig.setEquipmentSettings(bench,{benchAngle:30});rig.prepare(bench);assert.equal(rig.getVisualRoot(bench).children.length,inclineChildren);rig.end({keepVisible:false});rig.setEquipmentSettings(bench,{benchAngle:0});
});
test('the new straight bar is physical and restores the existing rope profile on idle switch',()=>{
 assert.equal(rig.setEquipmentSettings(pushdown,{handle:'straight-bar'}).ok,true);rig.prepare(pushdown);rig.sample(pushdown,.44,.44);const bar=rig.getVisualRoot(pushdown),collider=rig.getCollisionVolumes(pushdown).find(v=>v.id==='straight-pushdown-bar');
 assert.ok(collider);assert.equal(collider.radius,.016);assert.ok(bar.children.some(m=>m.isMesh&&m.geometry.parameters?.radiusTop===.016));assert.equal(rig.setEquipmentSettings(pushdown,{handle:'triceps-rope'}).reason,'busy');
 rig.end({keepVisible:true});assert.equal(rig.setEquipmentSettings(pushdown,{handle:'triceps-rope'}).ok,true);assert.equal(bar.visible,false);rig.prepare(pushdown);assert.notEqual(rig.getVisualRoot(pushdown),bar);rig.end({keepVisible:false});
});
