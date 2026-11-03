import * as THREE from 'three';
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
const result={count:crowd.getDiagnostics().count,actors:[],updateCpuMs:0,simulationFrames:0};
const stationFilter=(process.env.FORM_CROWD_STATIONS||'').split(',').filter(Boolean);
for(const initial of crowd.getDiagnostics().actors.filter(actor=>!stationFilter.length||stationFilter.includes(actor.stationId))){
  const record={id:initial.id,stationId:initial.stationId,initialState:initial.state,freeTime:null,maxReachError:0,maxPenetration:0,maxCullingOverflow:0,collisions:[],selfCollisions:[],surfaceCollisions:[],stages:[]};
  crowd.requestHandoff(initial.stationId);const machine=machines.get(initial.stationId),index=crowd.getDiagnostics().actors.findIndex(item=>item.id===initial.id),actor=clones[index];
  const handoffLimit=initial.stationId==='squat-rack'?30:12;record.handoffLimitSeconds=handoffLimit;
  for(let frame=0;frame<handoffLimit/.02;frame++){
    const frameStart=performance.now();crowd.update(.02,null,{forceFullPose:true});result.updateCpuMs+=performance.now()-frameStart;result.simulationFrames++;
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
writeFileSync(new URL('../artifacts/crowd-qualification.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(result.actors.some(item=>item.freeTime===null||item.freeTime>item.handoffLimitSeconds||item.maxReachError>.02||item.maxCullingOverflow>.001||item.collisions.length||item.selfCollisions.length||item.surfaceCollisions.length))process.exitCode=1;
