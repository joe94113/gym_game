import * as THREE from 'three';
import {createPressMachineLifecycle} from '../src/additional-press-lifecycle.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createAdditionalEquipment,ADDITIONAL_EQUIPMENT_TYPES} from '../src/additional-equipment.js';
import {stations} from '../src/data.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';

// Exercise the production skeleton and mechanism without loading GPU textures.
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]);
const gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata});
const metrics=character.getAssetInfo().metrics;
globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
const materials={};for(const key of ['graphite','steel','chrome','black','accent'])materials[key]=new THREE.MeshStandardMaterial();
const stationFixtures=[...stations.filter(s=>ADDITIONAL_EQUIPMENT_TYPES.has(s.type)),{...stations.find(s=>s.id==='pec-deck'),id:'reverse-fly',type:'reverseFly'}];
const {machines}=createAdditionalEquipment({THREE,scene,stations:stationFixtures,materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});
const results=[];const phaseCount=Number(process.env.FORM_PHASE_COUNT||101);
const transformPoint=(point,frame)=>new THREE.Vector3(...point).applyAxisAngle(new THREE.Vector3(0,1,0),frame.rotation||0).add(new THREE.Vector3(...frame.offset)).toArray();
const transformBody=(body,frame)=>Object.fromEntries(Object.entries(body).map(([key,value])=>[key,Array.isArray(value)&&Array.isArray(value[0])?value.map(point=>transformPoint(point,frame)):value]));
for(const [id,machine] of machines){if(!['lyingChestPress','declineChestPress'].includes(machine.type))continue;const press=createPressMachineLifecycle({machine,metrics,restPose:machine.sampleActivity(0)});machine.sampleLifecycle=press.sample;
 if(process.env.FORM_MACHINE_IDS&&!process.env.FORM_MACHINE_IDS.split(',').includes(id))continue;
 for(const direction of ['entry','exit']){
  if(id==='dumbbell-curl')continue;
  if(process.env.FORM_PLATE_LOAD)machine.setPlateLoad?.(Number(process.env.FORM_PLATE_LOAD));
  const result={id,direction,maxContactError:0,maxReachError:0,maxPenetration:0,contacts:{hands:0,feet:0},collisions:[],selfCollisions:[],surfaceCollisions:[],maxStepSurfaceError:0,maxPlacementError:0,maxJointStep:0};let previousBody=null;
  const atFloor=machine.getCollisionVolumes(),floorById=new Map(atFloor.map(volume=>[volume.id,volume]));
  machine.group.position.y+=.047;
  for(const volume of machine.getCollisionVolumes())for(const key of ['position','start','end'])if(volume[key]&&floorById.get(volume.id)?.[key])result.maxPlacementError=Math.max(result.maxPlacementError,Math.hypot(...volume[key].map((value,index)=>value-floorById.get(volume.id)[key][index])));
  for(let index=0;index<phaseCount;index++){
    const phase=index/(phaseCount-1),frame=machine.sampleLifecycle(direction,phase),pose=frame.pose;
    character.pose(pose);const actual=character.getContactPoints(),body=transformBody(actual,frame),targets={hands:pose.hands.map(point=>transformPoint(point,frame)),feet:pose.feet.map(point=>transformPoint(point,frame))},volumes=machine.getCollisionVolumes?.()||[];if(index===0&&process.env.FORM_DEBUG_VOLUMES)result.volumes=volumes;
    if(previousBody)for(const key of ['hands','feet','shoulders','elbows','hips','knees'])for(let side=0;side<2;side++){const difference=Math.hypot(...body[key][side].map((v,i)=>v-previousBody[key][side][i]));if(difference>result.maxJointStep){result.maxJointStep=difference;result.maxJointDetail={phase,key,side,from:previousBody[key][side],to:body[key][side]};}}previousBody=body;
    for(const kind of ['hands','feet'])for(let side=0;side<2;side++){const error=Math.hypot(...targets[kind][side].map((v,i)=>v-body[kind][side][i]));result.maxContactError=Math.max(result.maxContactError,error);result.contacts[kind]=Math.max(result.contacts[kind],error);}
    const mechanism=machine.inspectMechanism?.();
    if(mechanism?.type==='revolving-staircase')for(let side=0;side<2;side++){
      const footPhase=((phase+side*.5)%1+1)%1;
      if(footPhase<=.62){const foot=body.feet[side],closest=Math.min(...mechanism.steps.map(step=>Math.hypot(foot[1]-mechanism.footContactHeight-step.surfaceHeight,foot[2]-step.centerZ)));result.maxStepSurfaceError=Math.max(result.maxStepSurfaceError,closest);}
    }
    result.maxReachError=Math.max(result.maxReachError,body.maxReachError);
    for(const [kind,evaluation] of [['collisions',evaluateExerciseClearance(body,volumes)],['selfCollisions',evaluateSelfClearance(body)]]){
      result.maxPenetration=Math.max(result.maxPenetration,evaluation.maxPenetration);
      for(const item of evaluation.collisions)if(!result[kind].some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId))result[kind].push({...item,phase});
    }
    if(process.env.FORM_SURFACE==='1'){
      const samples=character.getSurfaceSamples({stride:Number(process.env.FORM_SURFACE_STRIDE||20)}).map(sample=>({...sample,position:transformPoint(sample.position,frame)}));
      const feet=character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}).map(sample=>({...sample,position:transformPoint(sample.position,frame)})),footVolumes=volumes.map(v=>({...v,allowedBodyParts:(v.allowedBodyParts||[]).filter(p=>p!=='leftFoot'&&p!=='rightFoot')})),strictFoot=evaluateSurfaceClearance(feet,footVolumes);for(const item of strictFoot.collisions)if(!result.surfaceCollisions.some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId))result.surfaceCollisions.push({...item,phase,strictFoot:true});const evaluation=evaluateSurfaceClearance(samples,volumes);
      result.surfaceTestedPairs=(result.surfaceTestedPairs||0)+evaluation.testedPairs;
      for(const item of evaluation.collisions)if(!result.surfaceCollisions.some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId))result.surfaceCollisions.push({...item,phase});
    }
  }
  results.push(result);
 }
}
const reportPrefix=process.env.FORM_REPORT_PREFIX||'press-lifecycle-qualification';
mkdirSync(new URL('../artifacts',import.meta.url),{recursive:true});const report=JSON.stringify({phaseCount,results},null,2);writeFileSync(new URL(`../artifacts/${reportPrefix}.json`,import.meta.url),report);writeFileSync(new URL(`../artifacts/${reportPrefix}-${process.env.FORM_SURFACE==='1'?'surface':'contacts'}.json`,import.meta.url),report);
console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.maxContactError>.015||r.maxReachError>.015||r.maxStepSurfaceError>.002||r.maxPlacementError>.000001||r.collisions.length||r.selfCollisions.length||r.surfaceCollisions.length))process.exitCode=1;
