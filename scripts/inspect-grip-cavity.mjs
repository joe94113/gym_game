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
const program=createFloorProgram({THREE,kind:'barbell',metrics,group:new THREE.Group()}),base=process.argv.includes('--curl')?program.sampleCourse({motionId:'biceps-curl',repPhase:.5,intensity:1,envelope:1}):process.argv.includes('--row')?program.sample(.76):process.argv.includes('--enter')?program.sampleLifecycle('enter',.65).pose:program.sample(0),center=program.getPropState().barPosition;character.pose(base);const diagnostics=character.getHandDiagnostics(),candidates=[];
for(const grip of [.2,.3,.4,.5])for(let normal=-.05;normal<=.03001;normal+=.005)for(let advance=-.04;advance<=.04001;advance+=.005){const p=structuredClone(base);p.handGripStrength=[grip,grip];p.hands=p.hands.map((point,i)=>point.map((v,j)=>j?center[j]+diagnostics[i].palmNormal[j]*normal+diagnostics[i].advance[j]*advance:v));character.pose(p);const samples=character.getSurfaceSamples({stride:3,parts:['leftHand','rightHand']}),hands=[0,1].map(side=>samples.filter(s=>(s.position[0]>0)===!!side).map(s=>({r:Math.hypot(s.position[1]-center[1],s.position[2]-center[2]),n:(s.position[1]-center[1])*diagnostics[side].palmNormal[1]+(s.position[2]-center[2])*diagnostics[side].palmNormal[2],a:(s.position[1]-center[1])*diagnostics[side].advance[1]+(s.position[2]-center[2])*diagnostics[side].advance[2]}))),stats=hands.map(h=>({inside:h.filter(s=>s.r<.015).length,min:Math.min(...h.map(s=>s.r)),wrap:Math.min(...h.map(s=>s.n))<0&&Math.max(...h.map(s=>s.n))>0&&Math.min(...h.map(s=>s.a))<0&&Math.max(...h.map(s=>s.a))>0}));candidates.push({grip,normal,advance,left:stats[0],right:stats[1],maxReach:character.getContactPoints().maxReachError});}
for(const key of ['left','right']){candidates.sort((a,b)=>Number(b[key].wrap)-Number(a[key].wrap)||a[key].inside-b[key].inside||Math.abs(a[key].min-.0165)-Math.abs(b[key].min-.0165));console.log(JSON.stringify({side:key,candidates:candidates.slice(0,10)}));}

