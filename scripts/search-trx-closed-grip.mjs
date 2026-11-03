import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {solveHandContactFrame} from '../src/hand-contact-frame.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
import {cylinderHandMeasure} from './equipment-grip-test-helpers.mjs';

// Load the production human rig and skin without requesting a GPU or textures.
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
const remainder=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url))),scene=new THREE.Scene();
const character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics;
globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
const materials={};for(const key of ['graphite','steel','chrome','black','accent'])materials[key]=new THREE.MeshStandardMaterial();

const V=p=>new THREE.Vector3(...p),group=new THREE.Group(),program=createEquipmentProgram({kind:'trx',metrics,group,materials,geometries:new Set(),extraMaterials:new Set()}),base=program.sampleCourse({motionId:'trx-low-row',repPhase:.5,phase:.5,envelope:1,intensity:1}),cylinders=program.getHardGripCylinders(),frames=[0,1].map(i=>solveHandContactFrame(metrics,base,i)),profiles={pronated:{thumb:[.55,.15,.25],index:[.35,1.15,.25],middle:[.95,.40,.25],ring:[.75,.40,.65],pinky:[.55,.15,.45]},supinated:{thumb:[.15,.90,.25],index:[.75,.40,.65],middle:[.95,.40,.85],ring:[.95,.40,.65],pinky:[.75,.15,.80]}},meshes=new Map(),boneCache=new Map(),candidates=[],best=[];
character.group.traverse(o=>{if(o.isSkinnedMesh)meshes.set(o.name,o);});
function boneOf(s){const key=s.mesh+':'+s.vertex;if(boneCache.has(key))return boneCache.get(key);const m=meshes.get(s.mesh),idx=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;let j=0;for(let i=1;i<4;i++)if(w.getComponent(s.vertex,i)>w.getComponent(s.vertex,j))j=i;const name=m.skeleton.bones[idx.getComponent(s.vertex,j)].name.toLowerCase();boneCache.set(key,name);return name;}
for(const [name,profile]of Object.entries(profiles))for(const opposition of [0,.3,.6,.9])for(const normal of [.018,.020,.024,.028,.030,.032,.034])for(const advance of [-.010,-.015,-.020,-.025,-.030]){
 const pose=structuredClone(base);pose.handFingerFlex=[structuredClone(profile),structuredClone(profile)];pose.handThumbOpposition=[-opposition,opposition];pose.relaxedHands=false;pose.hands=frames.map((f,i)=>{const n=V(f.advance).cross(V(f.axis)).normalize().multiplyScalar(i?1:-1);return V(cylinders[i].center).addScaledVector(n,-normal).addScaledVector(V(f.advance),advance).toArray();});character.pose(pose);
 const checks=[0,1].map(i=>{const samples=character.getSurfaceSamples({stride:1,parts:[i?'rightHand':'leftHand']}),measurement=cylinderHandMeasure(samples,cylinders[i]),f=frames[i],n=V(f.advance).cross(V(f.axis)).normalize().multiplyScalar(i?1:-1),tips={};for(const finger of ['index','middle','ring','pinky']){const points=samples.filter(s=>boneOf(s).includes(finger+'_03_'));const mean=points.reduce((v,s)=>v.add(V(s.position)),new THREE.Vector3()).multiplyScalar(1/points.length).sub(V(cylinders[i].center));tips[finger]={normal:mean.dot(n),advance:mean.dot(V(f.advance))};}return{...measurement,tips};});
 const depth=Math.max(...checks.map(c=>c.maxDepth)),entry={name,opposition,normal,advance,checks,depth,score:depth*100+Math.abs(normal-.025)+Math.abs(advance+.015)};best.push(entry);if(checks.every(c=>c.count===0))candidates.push(entry);
}
best.sort((a,b)=>a.score-b.score);candidates.sort((a,b)=>a.score-b.score);const report={candidateCount:candidates.length,best:candidates.slice(0,20),nearest:best.slice(0,5)};writeFileSync('artifacts/trx-closed-grip-search.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));


