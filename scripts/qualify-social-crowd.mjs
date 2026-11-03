import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createSocialCrowd} from '../src/social-crowd.js';
import {receptionSceneAnchors} from '../src/reception-scenes.js';

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
const social=createSocialCrowd({THREE,scene,character,anchors:receptionSceneAnchors});
const records=new Map();let updateCpuMs=0;
for(let frame=0;frame<=300;frame++){
  const start=performance.now();social.update(.05,{classPhase:frame/300});updateCpuMs+=performance.now()-start;
  for(const actor of social.getDiagnostics({surfaceStride:frame%10===0?32:0}).actors){
    if(!records.has(actor.id))records.set(actor.id,{id:actor.id,role:actor.role,maxContactError:0,selfCollisions:[],collisions:[],surfaceCollisions:[],appearance:actor.appearance});
    const record=records.get(actor.id);record.maxContactError=Math.max(record.maxContactError,actor.contactError);
    for(const collision of actor.selfCollisions)if(!record.selfCollisions.some(item=>item.bodyPart===collision.bodyPart&&item.volumeId===collision.volumeId))record.selfCollisions.push({...collision,phase:frame/300});
    for(const collision of actor.collisions)if(!record.collisions.some(item=>item.bodyPart===collision.bodyPart&&item.volumeId===collision.volumeId))record.collisions.push({...collision,phase:frame/300});
    for(const collision of actor.surface?.collisions||[])if(!record.surfaceCollisions.some(item=>item.bodyPart===collision.bodyPart&&item.volumeId===collision.volumeId))record.surfaceCollisions.push({...collision,phase:frame/300});
    if(actor.surface)record.surfaceTestedPairs=(record.surfaceTestedPairs||0)+actor.surface.testedPairs;
  }
}
const result={samples:301,count:social.getDiagnostics().count,averageUpdateCpuMs:updateCpuMs/301,actors:[...records.values()]};
social.dispose();character.dispose();result.resourcesReleased=pool.instances===0&&pool.disposed;
writeFileSync(new URL('../artifacts/social-crowd-qualification.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(result.count!==7||!result.resourcesReleased||result.actors.some(actor=>actor.maxContactError>.015||actor.selfCollisions.length||actor.collisions.length||actor.surfaceCollisions.length))process.exitCode=1;
