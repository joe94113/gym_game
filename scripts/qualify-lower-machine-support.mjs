import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentSystem} from '../src/equipment.js';
import {createMachineLifecycle} from '../src/machine-lifecycle.js';
import {stations} from '../src/data.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';

const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
const remainder=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics;
globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
const materials={};for(const key of ['graphite','steel','chrome','black','accent'])materials[key]=new THREE.MeshStandardMaterial();
const types=new Set(['chestPress','latPulldown','seatedRow','legPress','legExtension','shoulderPress','cableFly','squat','benchPress','dumbbellCurl','treadmill','bike','plateInclinePress','plateHighRow','plateShoulderPress','hackSquat','hipThrust','calfRaise','smithSquat','legCurl','pecDeck','lateralRaise','elliptical','rower','stairClimber']);
const {machines}=createEquipmentSystem({THREE,scene,stations:stations.filter(station=>types.has(station.type)),materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});

const results=[];
const rules={legPress:volume=>volume.shape==='box'&&(Math.abs(volume.size[0]-1.12)<.001||Math.abs(volume.size[0]-.025)<.001)&&Math.abs(volume.rotation?.[0]+.9273)<.001,hackSquat:volume=>volume.shape==='box'&&Math.abs(volume.size[0]-1)<.001&&Math.abs(volume.size[1]-.10)<.001,hipThrust:volume=>volume.shape==='box'&&((Math.abs(volume.size[0]-1.2)<.001&&Math.abs(volume.size[1]-.09)<.001)||(Math.abs(volume.size[0]-.024)<.001&&Math.abs(volume.size[1]-.009)<.001))};
for(const machine of machines.values())if(rules[machine.type]){
 const profile=createMachineLifecycle({THREE,machine,metrics});
 for(const mode of ['loop','enter','exit']){const r={id:machine.station.id,type:machine.type,mode,minSupportGap:Infinity,maxSupportGap:0,strictShoeCollisions:[],surfacePairs:0};
  for(let i=0;i<=100;i++){
   const phase=i/100,frame=mode==='loop'?{pose:machine.sampleActivity(phase,phase),offset:[0,0,0],rotation:0,contacts:{feet:[true,true]}}:profile.sample(mode,phase);character.pose(frame.pose);
   const tr=p=>new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0,1,0),frame.rotation||0).add(new THREE.Vector3(...frame.offset)).toArray(),samples=character.getSurfaceSamples({stride:1}).filter(p=>p.part?.endsWith('Foot')).map(p=>({...p,position:tr(p.position)})),volumes=machine.getCollisionVolumes(),strict=volumes.map(v=>({...v,allowedBodyParts:[]})),hits=evaluateSurfaceClearance(samples,strict,{tolerance:.004});r.surfacePairs+=hits.testedPairs;
   for(const hit of hits.collisions)if(!r.strictShoeCollisions.some(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId))r.strictShoeCollisions.push({...hit,phase});
   for(const volume of volumes.filter(rules[machine.type])){
    const inverse=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0]))).invert(),center=new THREE.Vector3(...volume.position),half=volume.size.map(v=>v/2);
    for(let side=0;side<2;side++){
     const expected=tr(frame.pose.feet[side]),normal=new THREE.Vector3(...(frame.pose.footNormals?.[side]||[0,1,0])).applyAxisAngle(new THREE.Vector3(0,1,0),frame.rotation||0).applyQuaternion(inverse),target=new THREE.Vector3(...expected).sub(center).applyQuaternion(inverse);
     if(mode!=='loop'&&(!frame.contacts?.feet?.[side]||normal.y<.9||Math.abs(target.y-half[1])>.06))continue;
     const over=samples.filter(p=>p.part===(side?'rightFoot':'leftFoot')).map(p=>new THREE.Vector3(...p.position).sub(center).applyQuaternion(inverse)).filter(p=>Math.abs(p.x)<half[0]&&Math.abs(p.z)<half[2]);
     if(over.length){const gap=Math.min(...over.map(p=>p.y))-half[1];if(gap<r.minSupportGap){r.minSupportGap=gap;r.worstSupport={phase,volumeId:volume.id,side,gap};}r.maxSupportGap=Math.max(r.maxSupportGap,gap);}
    }
   }
  }
  results.push(r);console.log(JSON.stringify({...r,strictShoeCollisions:r.strictShoeCollisions.map(h=>({bodyPart:h.bodyPart,volumeId:h.volumeId,depth:h.depth,phase:h.phase}))}));
 }
}
writeFileSync(new URL(`../artifacts/${process.env.FORM_SUPPORT_REPORT_PREFIX||'lower-machine-support-before'}.json`,import.meta.url),JSON.stringify({phaseCount:101,allShoeVertices:true,noShoeContactExceptions:true,results},null,2));
if(results.some(r=>r.strictShoeCollisions.length||r.minSupportGap<-.004))process.exitCode=1;
