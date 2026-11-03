import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createFloorProgram} from '../src/classes/floor-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),''),metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));

const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics,results=[];
const quick=process.argv.includes('--quick'),dense=process.argv.includes('--dense'),subdivisions=dense?1000:100,program=createFloorProgram({THREE,kind:'barbell',metrics,group:new THREE.Group()}),modes=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',')||(quick?['loop','enter','biceps-curl']:['loop','enter','exit',...program.getCourseMotionIds(),'put-down-rest-to-curl','put-down-rest-from-curl','exit-supinated']);
for(const mode of modes){
 const result={mode,frames:0,handVertexChecks:0,maxDepth:0,maxHeldGap:0,minRadial:Infinity,maxReach:0,maxContact:0,collisions:[],self:[],skin:[]};
 for(const intensity of quick?[1]:[.35,1])for(const envelopeMode of quick&&mode!=='biceps-curl'?['steady']:['steady','ramp'])for(let i=0;i<=subdivisions;i++){
  const u=i/subdivisions;if(mode==='exit-supinated'&&i===0)program.sampleCourse({motionId:'biceps-curl',repPhase:0,intensity,envelope:0});
  const frame=['enter','exit','exit-supinated'].includes(mode)?program.sampleLifecycle(mode==='exit-supinated'?'exit':mode,u):{pose:mode==='loop'?program.sample(u):program.sampleCourse({motionId:mode.startsWith('put-down-rest')?'put-down-rest':mode,repPhase:u,intensity,envelope:envelopeMode==='ramp'?Math.sin(Math.PI*u)**2:1,localSeconds:u*30,progress:u,block:{seconds:30},previousBlock:mode==='put-down-rest-from-curl'?{motionId:'biceps-curl'}:null,nextBlock:mode==='put-down-rest-to-curl'?{motionId:'biceps-curl'}:null}),offset:[0,0,0],rotation:0,contacts:mode==='loop'?{hands:[true,true]}:program.getCourseContacts()},pose=frame.pose;character.pose(pose);
  const body=character.getContactPoints(),volumes=program.getCollisionVolumes(),shaft=volumes.find(v=>v.id==='class-barbell-shaft'),point=program.getPropState().barPosition,targets=program.getActualContacts(),samples=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']});
  result.frames++;result.maxReach=Math.max(result.maxReach,body.maxReachError);result.handVertexChecks+=samples.length;
  for(const side of [0,1]){
   const handSamples=samples.filter(s=>s.part===(side?'rightHand':'leftHand'));
   const distances=handSamples.filter(s=>Math.abs(s.position[0])<.76).map(s=>Math.hypot(s.position[1]-point[1],s.position[2]-point[2]));
   const min=Math.min(...distances),skin=handSamples.filter(s=>Math.abs(s.position[0])<.76).reduce((a,b)=>Math.hypot(a.position[1]-point[1],a.position[2]-point[2])<Math.hypot(b.position[1]-point[1],b.position[2]-point[2])?a:b);result.minRadial=Math.min(result.minRadial,min);const depth=Math.max(0,shaft.radius-min);if(depth>result.maxDepth){result.maxDepth=depth;result.worst={u,intensity,envelopeMode,side,min,skin,point,pose};}
   if(frame.contacts?.hands?.[side]){result.maxHeldGap=Math.max(result.maxHeldGap,min-shaft.radius);result.maxContact=Math.max(result.maxContact,Math.hypot(...body.hands[side].map((v,j)=>v-targets.hands[side][j])));}
  }
  const record=(key,hits)=>{for(const hit of hits)if(!result[key].some(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId))result[key].push({...hit,u,intensity,envelopeMode});};record('collisions',evaluateExerciseClearance(body,volumes).collisions);record('self',evaluateSelfClearance(body).collisions);record('skin',evaluateSurfaceClearance(character.getSurfaceSamples({stride:20}),volumes).collisions);
 }
 results.push(result);console.log(JSON.stringify({...result,worst:undefined}));
}
writeFileSync(`artifacts/barbell-grip-${dense?'dense-':quick?'inspection-':''}qualification.json`,JSON.stringify({skinStride:1,shaftRadius:.016,depthTolerance:.001,heldGapTolerance:.005,subdivisions,results},null,2));
if(results.some(r=>r.maxDepth>.001||r.maxHeldGap>.005||r.maxReach>.015||r.maxContact>.015||r.collisions.length||r.self.length||r.skin.length))process.exitCode=1;

