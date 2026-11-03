import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
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


const group=new THREE.Group();scene.add(group);const program=createEquipmentProgram({kind:'cycle',metrics,group,materials,geometries:new Set(),extraMaterials:new Set()}),results=[];
for(const mode of ['enter','exit']){let previous=null,previousFrame=null;const r={mode,maxJointStep:0,maxKneeStep:0,maxInteriorStep:0,maxSteps:{},endpointSteps:{}};for(let i=0;i<=1000;i++){const frame=program.sampleLifecycle(mode,i/1000);character.pose(frame.pose);const body=transformBody(character.getContactPoints(),frame);if(previous)for(const field of ['hands','feet','knees','elbows','hips'])for(let side=0;side<2;side++){const distance=Math.hypot(...body[field][side].map((v,k)=>v-previous[field][side][k]));r.maxSteps[field]=Math.max(r.maxSteps[field]||0,distance);if(i===1||i===1000)r.endpointSteps[field]=Math.max(r.endpointSteps[field]||0,distance);if(distance>r.maxJointStep){r.maxJointStep=distance;r.worst={phase:i/1000,field,side,distance,from:previous[field][side],to:body[field][side],stage:frame.stage,previousFrame,frame};}if(i>10&&i<990&&distance>r.maxInteriorStep){r.maxInteriorStep=distance;r.worstInterior={phase:i/1000,field,side,distance,stage:frame.stage,from:previous[field][side],to:body[field][side]};}if(field==='knees')r.maxKneeStep=Math.max(r.maxKneeStep,distance);}previous=body;previousFrame=frame;}
 results.push(r);console.log(JSON.stringify(r));}
writeFileSync(new URL('../artifacts/cycle-continuity-inspection.json',import.meta.url),JSON.stringify({phaseCount:1001,results},null,2));
