import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparationFixture} from '../scripts/preparation-fixture-v013.mjs';
import {createAerialSuspensionProgram,aerialFlightState,AERIAL_MOTIONS} from '../src/classes/aerial-suspension-v013.js';
import {evaluateExerciseClearance,evaluateSelfClearance} from '../src/collision-validation.js';
import {coursePlanFor,courseTimelineAt} from '../src/classes/class-timeline.js';
import {evaluateAerialPouchOuterSkin} from '../scripts/aerial-outer-skin-validation-v013.mjs';
import {createReceptionScenes} from '../src/reception-scenes.js';
import {gymLayout,facilityStations} from '../src/gym-layout.js';
import {createNavigationSearch} from '../src/navigation-search-v012.js';
import {aerialNavigationRoundTrip} from '../scripts/aerial-navigation-fixture-v013.mjs';

const fixture=await createPreparationFixture(),{THREE,character,metrics}=fixture;
const create=()=>createAerialSuspensionProgram({metrics,group:new THREE.Group(),materials:{},geometries:new Set(),extraMaterials:new Set()});
const frame=(motionId,progress,extra={})=>({motionId,progress,repPhase:progress,envelope:1,intensity:1,block:{seconds:120},localSeconds:progress*120,...extra});
const coordinates=pose=>JSON.stringify(['hip','shoulder','head','hands','feet'].map(key=>pose[key]));

function authoredRoomColliders(){
 // Run the real room factory with CPU-only drawing stubs. Capture the same
 // collider calls used in the browser instead of copying stage dimensions.
 const colliders=[],volumes=[],scene=new THREE.Scene(),geometries=new Set(),extraMaterials=new Set(),textures=new Set(),material=new THREE.MeshStandardMaterial(),previousDocument=globalThis.document;
 const draw=parent=>{const object=new THREE.Group();object.material=material;parent.add(object);return object;};
 globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>({fillRect(){},fillText(){}})})};
 try {createReceptionScenes({THREE,scene,materials:new Proxy({},{get:()=>material}),geometries,extraMaterials,textures,box:draw,cylinder:draw,sphere:draw,rod:draw,label:draw,collider(x,z,w,d){colliders.push({x,z,hx:w/2,hz:d/2});},volumeBox(id,x,y,z,w,h,d){volumes.push({id,x,z,w,d});}});}
 finally {globalThis.document=previousDocument;for(const value of [...geometries,...extraMaterials,...textures,material])value.dispose();}
 return {colliders,volumes};
}

test('吊布坐姿真的離地，受支撐倒掛的頭低於髖且仍離地',()=>{
 const program=create(),seat=program.sampleCourse(frame('aerial-supported-seat',.5));assert.ok(seat.feet.every(point=>point[1]>.45));assert.deepEqual(program.getCourseContacts().feet,[false,false]);character.pose(seat);assert.ok(character.getContactPoints().maxReachError<.015);
 const inverted=program.sampleCourse(frame('aerial-supported-inversion',.5));assert.ok(inverted.shoulder[1]<inverted.hip[1]-.3);assert.ok(inverted.head[1]>.3);assert.ok(inverted.feet.every(point=>point[1]>1.5));character.pose(inverted);assert.ok(character.getContactPoints().maxReachError<.015);assert.equal(evaluateExerciseClearance(character.getContactPoints(),program.getCollisionVolumes()).collisions.length,0);assert.equal(evaluateSelfClearance(character.getContactPoints()).collisions.length,0);
});
test('倒掛先完整上布；回正完成後才落地，不在旋轉時把腳壓回地面',()=>{
 const before=aerialFlightState(frame('aerial-supported-inversion',.15)),turning=aerialFlightState(frame('aerial-supported-inversion',.35)),landing=aerialFlightState(frame('aerial-supported-inversion',.9));assert.ok(Math.abs(before.angle)<1e-9);assert.equal(turning.mount,1);assert.ok(turning.angle<-1.5);assert.ok(Math.abs(landing.angle)<1e-9);assert.ok(landing.mount<1);
 const source=frame('aerial-supported-inversion',.5),mid=aerialFlightState({...source,returning:true,returnProgress:.6});assert.ok(Math.abs(mid.angle)<1e-9);assert.equal(mid.mount,1);assert.equal(aerialFlightState({...source,returning:true,returnProgress:1}).mount,0);
 const joining=aerialFlightState({...source,joining:true,joinProgress:.3});assert.ok(Math.abs(joining.angle)<1e-9);assert.ok(joining.mount>0&&joining.mount<1);
});
test('布面固定端點和材料約束保留；承托豁免仍需避開真正的外皮',()=>{
 const program=create();for(const progress of Array.from({length:21},(_,i)=>i/20)){const pose=program.sampleCourse(frame('aerial-supported-inversion',progress));character.pose(pose);const diagnostics=program.getSuspensionDiagnostics();assert.equal(diagnostics.finite,true);assert.equal(diagnostics.anchorError,0);assert.equal(diagnostics.nodes,45);assert.ok(diagnostics.maxStretch<.04);const outer=evaluateAerialPouchOuterSkin({pose,cloth:program.getClothSurface(),samples:character.getSurfaceSamples({stride:1,parts:['pelvis','leftThigh','rightThigh']})});assert.equal(outer.hits.length,0,`outer skin at ${progress}`);assert.ok(outer.maxDepth<=.0005);}
 const surface=program.getClothSurface();assert.ok(surface.supportNodes.some(Boolean));assert.ok(surface.supportNodes.some(value=>!value));assert.ok(program.getCollisionVolumes().some(volume=>volume.id.includes('support-cloth')&&volume.allowedBodyParts.length===0));
 for(const volume of program.getCollisionVolumes())for(const part of volume.allowedBodyParts||[])if(volume.id.includes('support-cloth'))assert.ok(['pelvis','leftThigh','rightThigh'].includes(part));else assert.ok(['leftHand','rightHand'].includes(part));
 const pose=program.sampleCourse(frame('aerial-supported-seat',.5));character.pose(pose);const samples=character.getSurfaceSamples({stride:1,parts:['pelvis','leftThigh','rightThigh']}),corrupted=program.getClothSurface();for(let i=0;i<corrupted.loadPouchNodes.length;i++)if(corrupted.loadPouchNodes[i])corrupted.positions[i*3+1]+=.030;assert.ok(evaluateAerialPouchOuterSkin({pose,cloth:corrupted,samples}).hits.length>0,'the real-skin check catches an embedded support sheet despite allowed contact');
});
test('暫停、跳段與倒序查看可重現同一片布；相同姿勢不重跑解算',()=>{
 const program=create(),first=frame('aerial-supported-inversion',.35),pose=program.sampleCourse(first),surface=program.getClothSurface(),ticks=program.getSuspensionDiagnostics().solverTicks;program.sampleCourse(first);assert.equal(program.getSuspensionDiagnostics().solverTicks,ticks);program.sampleCourse(frame('aerial-supported-seat',.8));const again=program.sampleCourse(first);assert.equal(coordinates(pose),coordinates(again));assert.deepEqual(program.getClothSurface(),surface);
});
test('站姿進出完整可達，離開從共同站姿開始，空中退出先回正落地',()=>{
 const program=create(),start=program.sampleCourse(frame('aerial-supported-inversion',.5)),returning=program.sampleCourse(frame('aerial-supported-inversion',.5,{returning:true,returnProgress:0}));assert.equal(coordinates(start),coordinates(returning));const end=program.sampleCourse(frame('aerial-supported-inversion',.5,{returning:true,returnProgress:1})),ready=program.sample(0);assert.equal(coordinates(end),coordinates(ready));
 for(const direction of ['enter','exit'])for(let i=0;i<=40;i++){const sample=program.sampleLifecycle(direction,i/40);character.pose(sample.pose);assert.ok(character.getContactPoints().maxReachError<.015);}
 const {colliders,volumes}=authoredRoomColliders(),stage=volumes.find(volume=>volume.id==='classroom-stage');assert.ok(stage&&colliders.some(collider=>collider.x===stage.x&&collider.z===stage.z&&collider.hx===stage.w/2&&collider.hz===stage.d/2),'the stage collider came from the actual room factory');
 const placement=facilityStations.find(station=>station.id==='group-class').setup,toWorld=point=>new THREE.Vector3(...point).applyAxisAngle(new THREE.Vector3(0,1,0),placement.rotation||0).add(new THREE.Vector3(...placement.origin)),gate=toWorld(program.getMetadata().gateOffset),navigation=createNavigationSearch({THREE,bounds:gymLayout.bounds,colliders});
 assert.equal(navigation.blocked(gate.x,gate.z),false,'the real rotated classroom entrance clears the stage and navigation radius');assert.ok(navigation.findPath(new THREE.Vector3(gymLayout.spawn.x,0,gymLayout.spawn.z),gate).length>1,'the authored room door connects the spawn to the aerial entrance');
 const rejected=toWorld([0,0,1.55]);assert.equal(navigation.blocked(rejected.x,rejected.z),true,'the old front gate reproduces the real stage obstruction');
 const roundTrip=aerialNavigationRoundTrip(metrics);assert.ok(roundTrip.entry.length>1,'spawn reaches the entrance before the aerial rig becomes visible');assert.ok(roundTrip.obstacleCount>500,'the real four-person class geometry remains present after exit');assert.ok(roundTrip.cohort.every(actor=>actor.kind==='aerial'&&actor.status==='using'),'the actual NPC switch finishes');assert.ok(roundTrip.exit.length>1,'the player can leave for chest press while the aerial geometry remains visible');
});
test('三十分鐘空中課仍有暖身主訓緩和，六個離地段不重複短片；全七課仍159段',()=>{
 const plan=coursePlanFor('aerial');assert.equal(plan.duration,1800);assert.equal(plan.blocks.length,24);assert.deepEqual(plan.stageDurations,{warmup:300,main:1200,cooldown:300});
 const air=plan.blocks.filter(block=>['aerial-supported-seat','aerial-supported-inversion'].includes(block.motionId));assert.equal(air.length,6);assert.ok(air.every(block=>block.repetitions===1&&block.seconds===120));
 assert.equal(['warmup','dance','cycle','trx','barbell','aerial','pilates'].reduce((n,kind)=>n+coursePlanFor(kind).blocks.length,0),159);
 const motions=new Set(['warmup','dance','cycle','trx','barbell','aerial','pilates'].flatMap(kind=>coursePlanFor(kind).blocks.map(block=>`${kind}:${block.motionId}`)));assert.equal(motions.size,47);
 const program=create();for(const block of air){const sample=courseTimelineAt('aerial',block.startSeconds+block.seconds/2),pose=program.sampleCourse(sample);assert.ok(pose.feet.every(point=>point[1]>.18));assert.ok(AERIAL_MOTIONS.includes(sample.motionId));}
});
