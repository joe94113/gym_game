import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createFloorProgram} from '../src/classes/floor-programs.js';
import {createWarmupProgram} from '../src/classes/warmup-program.js';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';

// Keep the production skeleton and skin. Only texture loading is unnecessary
// in this CPU qualification; no replacement limb lengths or capsule-only rig.
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),''),metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics,results=[];
for(const kind of ['warmup','dance','barbell','pilates']){
 const group=new THREE.Group();scene.add(group);const program=kind==='warmup'?createWarmupProgram({metrics}):createFloorProgram({THREE,kind,metrics,group});
 for(const motionId of program.getCourseMotionIds()){
  const result={kind,motionId,frames:0,maxReach:0,maxContact:0,minSurfaceY:Infinity,maxJointStep:0,collisions:[],self:[],skin:[],skinPairs:0,completeError:0};
  for(const intensity of [.35,1])for(const blendMode of ['steady','envelope']){
   let previous=null;
   for(let i=0;i<=100;i++){
    const phase=i/100,frame={motionId,repPhase:phase,intensity,envelope:blendMode==='steady'?1:Math.sin(Math.PI*phase)**2,progress:phase,localSeconds:phase*30,block:{seconds:30,durationSeconds:30}},pose=program.sampleCourse(frame);character.pose(pose);const body=character.getContactPoints(),volumes=program.getCollisionVolumes(),flags=program.getCourseContacts(),targets=program.getActualContacts();
    result.frames++;if(body.maxReachError>result.maxReach){result.maxReach=body.maxReachError;result.worstReach={phase,intensity,blendMode,pose};}
    for(let side=0;side<2;side++)if(flags?.hands?.[side])result.maxContact=Math.max(result.maxContact,Math.hypot(...body.hands[side].map((v,j)=>v-targets.hands[side][j])));
    if(previous)for(const key of ['hands','feet','elbows','knees'])for(let side=0;side<2;side++)result.maxJointStep=Math.max(result.maxJointStep,Math.hypot(...body[key][side].map((v,j)=>v-previous[key][side][j])));previous=body;
    const record=(key,items)=>{for(const hit of items)if(!result[key].some(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId))result[key].push({...hit,phase,intensity,blendMode});};
    record('collisions',evaluateExerciseClearance(body,volumes).collisions);record('self',evaluateSelfClearance(body).collisions);
    const samples=character.getSurfaceSamples({stride:20});result.minSurfaceY=Math.min(result.minSurfaceY,...samples.map(s=>s.position[1]));result.skinPairs+=samples.length*volumes.length;record('skin',evaluateSurfaceClearance(samples,volumes).collisions);
   }
  }
  const done=program.sampleCourse({complete:true,motionId}),ready=program.sample(0);for(const key of ['hip','shoulder','head'])result.completeError=Math.max(result.completeError,Math.hypot(...done[key].map((v,i)=>v-ready[key][i])));for(const key of ['hands','feet'])for(let side=0;side<2;side++)result.completeError=Math.max(result.completeError,Math.hypot(...done[key][side].map((v,i)=>v-ready[key][side][i])));
  results.push(result);console.log(JSON.stringify({...result,worstReach:undefined}));
 }
}
writeFileSync('artifacts/floor-course-motion-qualification.json',JSON.stringify({stride:20,results},null,2));
if(results.some(r=>r.maxReach>.015||r.maxContact>.015||r.minSurfaceY<-.008||r.collisions.length||r.self.length||r.skin.length||r.completeError>.000001))process.exitCode=1;
