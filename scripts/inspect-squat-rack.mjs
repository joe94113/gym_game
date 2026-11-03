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

console.log('METRICS',JSON.stringify(metrics));
for(const machine of machines.values())if(['squat','smithSquat'].includes(machine.type)){const lifecycle=createMachineLifecycle({THREE,machine,metrics});let previous='',worst={depth:0},minHip=Infinity;for(let i=0;i<=100;i++){const u=i/100,f=lifecycle.sample('enter',u);character.pose(f.pose);const tr=p=>new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0,1,0),f.rotation||0).add(new THREE.Vector3(...f.offset));const bar=machine.getRackSetup().barPosition,skin=character.getSurfaceSamples({stride:1,parts:['head']}).map(s=>({...s,position:tr(s.position).toArray()}));for(const s of skin){const distance=Math.hypot(s.position[1]-bar[1],s.position[2]-bar[2]),depth=.025-distance;if(depth>worst.depth)worst={u,depth,bar,skin:s};}minHip=Math.min(minHip,f.pose.hip[1]);if(f.stage!==previous){console.log('STAGE',JSON.stringify({type:machine.type,u,stage:f.stage,grip:f.pose.handGripStrength,hip:tr(f.pose.hip).toArray(),shoulder:tr(f.pose.shoulder).toArray(),head:tr(f.pose.head).toArray(),feet:f.pose.feet.map(p=>tr(p).toArray()),hands:f.pose.hands.map(p=>tr(p).toArray()),bar}));previous=f.stage;}}console.log('WORST',JSON.stringify({type:machine.type,minHip,headWorst:worst}));}

for(const m of machines.values())if(['squat','smithSquat'].includes(m.type)){const p=m.sampleActivity(0,0);character.pose(p);const samples=character.getSurfaceSamples({stride:1});const b=m.getRackSetup().barPosition;for(const part of ['torso','head','leftHand','rightHand']){const a=samples.filter(s=>s.part===part&&Math.abs(s.position[0])<(part.includes('Hand')?.65:.26));let nearest=null;for(const q of a){const d=Math.hypot(q.position[1]-b[1],q.position[2]-b[2]);if(!nearest||d<nearest.distance)nearest={distance:d,point:q.position};}console.log('SUPPORT',JSON.stringify({type:m.type,part,bar:b,nearest}));}}

