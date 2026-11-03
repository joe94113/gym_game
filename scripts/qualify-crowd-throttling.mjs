import * as THREE from 'three';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentSystem} from '../src/equipment.js';
import {createAdditionalEquipment,ADDITIONAL_EQUIPMENT_TYPES} from '../src/additional-equipment.js';
import {createGymCrowd} from '../src/crowd.js';
import {stations} from '../src/data.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';

const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]);
const gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const template=gltf.scene,scene=new THREE.Scene(),pool={geometryCache:new WeakMap(),geometries:new Set(),textures:new Set(),instances:0,disposed:false};
const character=createSkinnedCharacterFromModel({THREE,scene,model:cloneSkeleton(template),metadata,sharedResources:pool});
const clones=[];character.createClone=options=>{const clone=createSkinnedCharacterFromModel({THREE,scene,model:cloneSkeleton(template),metadata,sharedResources:pool,...options});clones.push(clone);return clone;};
const metrics=character.getAssetInfo().metrics;
globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
const materials={};for(const key of ['graphite','steel','chrome','black','accent'])materials[key]=new THREE.MeshStandardMaterial();
const {machines}=createEquipmentSystem({THREE,scene,stations:stations.filter(s=>!['stretchZone','facility'].includes(s.type)&&!ADDITIONAL_EQUIPMENT_TYPES.has(s.type)),materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});
const crowd=createGymCrowd({THREE,scene,character,machines,floorHeight:()=>.02});

const sourcePaths=['src/crowd.js','src/skinned-character.js','src/equipment.js','src/machine-lifecycle.js','src/barbell-lifecycle-paths.js','src/hand-contact-frame.js','src/locomotion.js','src/data.js','src/gym-layout.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json'],sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const preflight={checks:[],maxBodyMachineContact:0};
const target=()=>crowd.getDiagnostics().actors[0],viewer=new THREE.Vector3(...target().position);
let initial=target();for(let i=0;i<120;i++)crowd.update(1/60,null,{viewerPosition:viewer,quality:'clear'});
assert.equal(target().poseUpdates-initial.poseUpdates,120);preflight.checks.push('clear poses every frame');
initial=target();for(let i=0;i<120;i++)crowd.update(1/60,null,{viewerPosition:viewer,quality:'balanced'});
assert.equal(target().poseUpdates-initial.poseUpdates,60);assert.ok(Math.abs(target().elapsed-initial.elapsed-2)<1e-9);preflight.checks.push('near balanced 30Hz with continuous elapsed');
const farViewer=viewer.clone().add(new THREE.Vector3(27,0,0));initial=target();for(let i=0;i<120;i++)crowd.update(1/60,null,{viewerPosition:farViewer,quality:'balanced'});
assert.equal(target().poseUpdates-initial.poseUpdates,40);preflight.checks.push('far balanced 20Hz');
const absent=new THREE.Vector3(1000,0,1000);initial=target();for(let i=0;i<120;i++)crowd.update(1/60,null,{viewerPosition:absent,quality:'flow'});
assert.equal(target().poseUpdates-initial.poseUpdates,0);assert.equal(target().visible,false);assert.equal(crowd.getOccupancy(initial.stationId).state,'exercising');assert.ok(Math.abs(target().elapsed-initial.elapsed-2)<1e-9);preflight.checks.push('far cull retains occupancy and logical time');
crowd.update(0,null,{viewerPosition:viewer,quality:'balanced'});assert.equal(target().visible,true);assert.ok(Math.abs(target().lastSampledCycle-target().elapsed/6)<1e-8);preflight.checks.push('reappearance catches up on one synchronized tick');
initial=target();for(let i=0;i<120;i++)crowd.update(1/60,null,{viewerPosition:absent,quality:'flow',forceFullPose:true});assert.equal(target().poseUpdates-initial.poseUpdates,120);assert.equal(target().visible,true);preflight.checks.push('qualification forceFullPose bypasses cadence and culling');
for(let i=0;i<180;i++){
 crowd.update(1/60,null,{viewerPosition:viewer,quality:'balanced'});
 for(const state of crowd.getDiagnostics().actors){const actor=clones.find(c=>c.group.name==='gym-'+state.id),machine=machines.get(state.stationId);if(!actor)continue;const actual=machine.getActualContacts(),body=actor.getContactPoints();for(const part of ['hands','feet'])for(let side=0;side<2;side++){if(!actual?.[part]?.[side])continue;preflight.maxBodyMachineContact=Math.max(preflight.maxBodyMachineContact,new THREE.Vector3(...actual[part][side]).distanceTo(new THREE.Vector3(...body[part][side])));}}
}
assert.ok(preflight.maxBodyMachineContact<.02);preflight.checks.push('body and actual machine contacts share sampled phase');
const cpu={};for(const quality of ['clear','balanced','flow']){const options={viewerPosition:quality==='flow'?absent:viewer,quality};for(let i=0;i<60;i++)crowd.update(1/60,null,options);const t=performance.now(),a=crowd.getDiagnostics().actors.reduce((n,a)=>n+a.poseUpdates,0);for(let i=0;i<360;i++)crowd.update(1/60,null,options);cpu[quality]={averageCpuMs:(performance.now()-t)/360,poseUpdates:crowd.getDiagnostics().actors.reduce((n,a)=>n+a.poseUpdates,0)-a,frames:360};}
// All handoffs deliberately begin between sampled ticks, including hidden
// actors, then run at full pose frequency regardless of the renderer preset.
for(let i=0;i<3;i++)crowd.update(1/60,null,{viewerPosition:absent,quality:'flow'});
const result={pass:true,sourceHashes,preflight,cpu,count:crowd.getDiagnostics().count,actors:[],updateCpuMs:0,simulationFrames:0};
const stationFilter=(process.env.FORM_CROWD_STATIONS||'').split(',').filter(Boolean);
for(const initial of crowd.getDiagnostics().actors.filter(actor=>!stationFilter.length||stationFilter.includes(actor.stationId))){
  const record={id:initial.id,stationId:initial.stationId,initialState:initial.state,freeTime:null,maxReachError:0,maxPenetration:0,maxCullingOverflow:0,collisions:[],selfCollisions:[],surfaceCollisions:[],stages:[]};
  const beforePose=clones[crowd.getDiagnostics().actors.findIndex(a=>a.id===initial.id)].getContactPoints();crowd.requestHandoff(initial.stationId);crowd.update(0,null,{viewerPosition:absent,quality:'flow'});const afterPose=clones[crowd.getDiagnostics().actors.findIndex(a=>a.id===initial.id)].getContactPoints();assert.deepEqual(afterPose,beforePose,'handoff return begins at last displayed cycle');const machine=machines.get(initial.stationId),index=crowd.getDiagnostics().actors.findIndex(item=>item.id===initial.id),actor=clones[index];
  const handoffLimit=initial.stationId==='squat-rack'?30:12;record.handoffLimitSeconds=handoffLimit;
  for(let frame=0;frame<handoffLimit/.02;frame++){
    const frameStart=performance.now();crowd.update(.02,null,{viewerPosition:absent,quality:'flow'});result.updateCpuMs+=performance.now()-frameStart;result.simulationFrames++;
    const state=crowd.getDiagnostics().actors[index];
    if(!record.stages.includes(state.stage))record.stages.push(state.stage);
    const body=actor.getContactPoints(),offset=actor.group.position.clone().sub(new THREE.Vector3(...machine.getSetup().origin));
    const angle=actor.group.rotation.y-machine.group.rotation.y;
    const local={maxReachError:body.maxReachError};
    for(const key of ['hands','feet','shoulders','elbows','wrists','hips','knees','ankles'])local[key]=body[key].map(point=>new THREE.Vector3(...point).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(offset).toArray());
    record.maxReachError=Math.max(record.maxReachError,body.maxReachError);
    const clearance=evaluateExerciseClearance(local,machine.getCollisionVolumes());
    for(const item of clearance.collisions)if(!record.collisions.some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId&&old.stage===state.stage))record.collisions.push({...item,stage:state.stage,time:frame*.02});
    const self=evaluateSelfClearance(body);
    for(const item of self.collisions)if(!record.selfCollisions.some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId))record.selfCollisions.push({...item,stage:state.stage,time:frame*.02});
    record.maxPenetration=Math.max(record.maxPenetration,clearance.maxPenetration);
    if(process.env.FORM_SURFACE==='1'&&frame%Number(process.env.FORM_SURFACE_EVERY||10)===0){
      const samples=actor.getSurfaceSamples({stride:32}).map(sample=>({...sample,position:new THREE.Vector3(...sample.position).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(offset).toArray()}));
      const surface=evaluateSurfaceClearance(samples,machine.getCollisionVolumes());record.surfaceTestedPairs=(record.surfaceTestedPairs||0)+surface.testedPairs;
      for(const item of surface.collisions)if(!record.surfaceCollisions.some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId&&old.stage===state.stage))record.surfaceCollisions.push({...item,stage:state.stage,time:frame*.02});
      actor.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const point=new THREE.Vector3();for(let vertex=0;vertex<mesh.geometry.getAttribute('position').count;vertex+=128){mesh.getVertexPosition(vertex,point);record.maxCullingOverflow=Math.max(record.maxCullingOverflow,point.distanceTo(mesh.boundingSphere.center)-mesh.boundingSphere.radius);}});
    }
    if(state.state==='free'&&record.freeTime===null)record.freeTime=frame*.02;
  }
  record.finalState=crowd.getOccupancy(initial.stationId).state;result.actors.push(record);
}
crowd.dispose();character.dispose();
result.averageFrameCpuMs=result.updateCpuMs/result.simulationFrames;
writeFileSync(new URL('../artifacts/performance/crowd-throttling-qualification.json',import.meta.url),JSON.stringify(result,null,2));
result.changedSources=sourcePaths.filter(p=>createHash('sha256').update(readFileSync(p)).digest('hex')!==sourceHashes[p]);result.pass=!result.changedSources.length&&!result.actors.some(a=>a.collisions.length||a.selfCollisions.length||a.surfaceCollisions.length||a.freeTime===null||a.maxReachError>.02);writeFileSync(new URL('../artifacts/performance/crowd-throttling-qualification.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
if(!result.pass||result.actors.some(item=>item.freeTime===null||item.freeTime>item.handoffLimitSeconds||item.maxReachError>.02||item.maxCullingOverflow>.001||item.collisions.length||item.selfCollisions.length||item.surfaceCollisions.length))process.exitCode=1;
