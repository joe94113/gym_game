import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { readFileSync,writeFileSync } from 'node:fs';
import { createSkinnedCharacterFromModel } from '../src/skinned-character.js';
import { buildLocomotionPose } from '../src/locomotion.js';
import { evaluateSelfClearance } from '../src/collision-validation.js';

// Keep geometry/weights exact; texture decoding requires a DOM and is omitted
// only from this in-memory CPU qualification asset.
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){
  material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};
  delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;
}
delete json.images;delete json.textures;delete json.samplers;
let bytes=Buffer.from(JSON.stringify(json));
if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
const remainder=source.subarray(20+jsonLength),header=Buffer.alloc(20);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,bytes,remainder]);
const gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const pool={geometryCache:new WeakMap(),geometries:new Set(),textures:new Set(),instances:0,disposed:false};
const character=createSkinnedCharacterFromModel({THREE,model:cloneSkeleton(gltf.scene),metadata,sharedResources:pool});
const clone=createSkinnedCharacterFromModel({THREE,model:cloneSkeleton(gltf.scene),metadata,sharedResources:pool,appearance:{shirt:'#4d8297'}});
const metrics=character.getAssetInfo().metrics;
const result={samples:0,maxReachError:0,maxWristBendRadians:0,minInwardPalmDot:1,selfCollisions:[],sharedGeometry:true,independentBones:true,independentMaterials:true};
for(const speed of [0,1,1.6])for(let step=0;step<161;step++){
  character.pose(buildLocomotionPose(metrics,step/40,speed));
  const body=character.getContactPoints(),hands=character.getHandDiagnostics();
  result.samples++;result.maxReachError=Math.max(result.maxReachError,body.maxReachError);
  hands.forEach((hand,index)=>{
    result.maxWristBendRadians=Math.max(result.maxWristBendRadians,hand.wristBendRadians);
    result.minInwardPalmDot=Math.min(result.minInwardPalmDot,hand.palmNormal[0]*(index?-1:1));
  });
  const clearance=evaluateSelfClearance(body);
  for(const collision of clearance.collisions)if(!result.selfCollisions.some(old=>old.bodyPart===collision.bodyPart&&old.volumeId===collision.volumeId))result.selfCollisions.push({...collision,speed,time:step/40});
}
const a=[],b=[];character.group.traverse(object=>{if(object.isSkinnedMesh)a.push(object);});clone.group.traverse(object=>{if(object.isSkinnedMesh)b.push(object);});
a.forEach((mesh,index)=>{
  result.sharedGeometry&&=mesh.geometry===b[index].geometry;
  result.independentBones&&=mesh.skeleton.bones.every((bone,i)=>bone!==b[index].skeleton.bones[i]);
  result.independentMaterials&&=mesh.material!==b[index].material;
});
const cloneBefore=clone.getContactPoints();character.pose(buildLocomotionPose(metrics,.37,1));
result.independentPose=JSON.stringify(cloneBefore)===JSON.stringify(clone.getContactPoints());
const supportHands=[[-.28,1.10,.32],[.28,.89,.05]];
character.pose({hands:supportHands,handAdvances:[[0,0,1],null],handNormals:[[0,-1,0],[-1,0,0]],elbowHints:[[-.6,-.4,.35],[.3,-.4,-1]],handGripping:[false,false],gripping:false,relaxedHands:true});
const support=character.getHandDiagnostics()[0],supportBody=character.getContactPoints();
result.flatSupport={advance:support.advance,palmNormal:support.palmNormal,wristBendRadians:support.wristBendRadians,contactError:Math.hypot(...supportHands[0].map((value,index)=>value-supportBody.hands[0][index]))};
clone.dispose();result.remainingInstances=pool.instances;result.protagonistResourcesAlive=!pool.disposed;
character.dispose();result.allResourcesReleased=pool.disposed&&pool.instances===0;
writeFileSync(new URL('../artifacts/locomotion-qualification.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(result.maxReachError>.015||result.maxWristBendRadians>.65||result.minInwardPalmDot<.95||result.selfCollisions.length||!result.sharedGeometry||!result.independentBones||!result.independentMaterials||!result.independentPose||!result.protagonistResourcesAlive||!result.allResourcesReleased||result.flatSupport.advance[2]<.999||result.flatSupport.palmNormal[1]>-.999||result.flatSupport.contactError>.015||result.flatSupport.wristBendRadians>1.3)process.exitCode=1;
