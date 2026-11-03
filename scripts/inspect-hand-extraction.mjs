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
const program=createFloorProgram({THREE,kind:'barbell',metrics,group:new THREE.Group()}),pose=program.sampleCourse({motionId:'put-down-rest',localSeconds:27.75,block:{seconds:30},nextBlock:{motionId:'biceps-curl'}}),bar=program.getPropState().barPosition;character.pose(pose);const samples=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']}).map(s=>[s.position[1]-bar[1],s.position[2]-bar[2]]),candidates=[];
for(let angle=0;angle<360;angle+=5){const y=Math.cos(angle*Math.PI/180),z=Math.sin(angle*Math.PI/180);let min=Infinity;for(let i=0;i<=40;i++){const d=i*.004;for(const point of samples)min=Math.min(min,Math.hypot(point[0]+y*d,point[1]+z*d));}candidates.push({angle,y,z,min,depth:Math.max(0,.016-min)});}
candidates.sort((a,b)=>a.depth-b.depth);console.log(JSON.stringify({baseMin:Math.min(...samples.map(p=>Math.hypot(...p))),candidates:candidates.slice(0,12),frame:pose.handAdvances}));

