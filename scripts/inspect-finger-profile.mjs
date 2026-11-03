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
const supinated=process.argv.includes('--curl'),program=createFloorProgram({THREE,kind:'barbell',metrics,group:new THREE.Group()}),base=supinated?program.sampleCourse({motionId:'biceps-curl',repPhase:.5,intensity:1,envelope:1}):program.sample(0),center=program.getPropState().barPosition;character.pose(base);const normal=character.getHandDiagnostics()[0].palmNormal,advanceDirection=character.getHandDiagnostics()[0].advance,meshMap=new Map();character.group.traverse(m=>{if(m.isSkinnedMesh)meshMap.set(m.name,m);});
const regions=new Map();for(const sample of character.getSurfaceSamples({stride:2,parts:['leftHand']})){const mesh=meshMap.get(sample.mesh),ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),v=sample.vertex;let k=0;for(let i=1;i<4;i++)if(weights.array[v*4+i]>weights.array[v*4+k])k=i;regions.set(`${sample.mesh}:${v}`,mesh.skeleton.bones[ids.array[v*4+k]].name);}
const profile=structuredClone(base.handFingerFlex[0]);
for(const finger of process.argv.includes('--thumb-only')?['thumb']:['thumb','index','middle','ring','pinky']){
 const candidates=[];for(const a of [.15,.35,.55,.75,.95,1.15])for(const b of [.15,.4,.65,.9,1.15,1.4])for(const c of [.05,.25,.45,.65,.85]){
  const p=structuredClone(base),candidate={...profile,[finger]:[a,b,c]};p.handFingerFlex=[candidate,candidate];character.pose(p);const samples=character.getSurfaceSamples({stride:2,parts:['leftHand']}).filter(s=>regions.get(`${s.mesh}:${s.vertex}`)?.startsWith(`${finger}_`)),distances=samples.map(s=>Math.hypot(s.position[1]-center[1],s.position[2]-center[2])),min=Math.min(...distances),depth=Math.max(0,.0155-min),ns=samples.map(s=>(s.position[1]-center[1])*normal[1]+(s.position[2]-center[2])*normal[2]),maxN=Math.max(...ns),minN=Math.min(...ns),tipSamples=samples.filter(s=>regions.get(`${s.mesh}:${s.vertex}`)?.startsWith(`${finger}_03`)),tipA=tipSamples.reduce((sum,s)=>sum+(s.position[1]-center[1])*advanceDirection[1]+(s.position[2]-center[2])*advanceDirection[2],0)/tipSamples.length,score=(finger==='thumb'||!process.argv.includes('--wrap')?0:Math.max(0,tipA+.005)**2*1e5)+depth*depth*1e8+(min-.0165)**2*1e5+Math.max(0,.009-maxN)**2*1e5+.00001*((a-.65)**2+(b-.9)**2+(c-.4)**2);candidates.push({angles:[a,b,c],min,depth,maxN,minN,tipA,score});
 }
 candidates.sort((a,b)=>a.score-b.score);profile[finger]=candidates[0].angles;console.log(JSON.stringify({supinated,finger,best:candidates.slice(0,3)}));
}
console.log(JSON.stringify({supinated,profile}));


