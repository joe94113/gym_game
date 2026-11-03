import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {solveHandContactFrame} from '../src/hand-contact-frame.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';

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

const group=new THREE.Group(),program=createEquipmentProgram({kind:'trx',metrics,group,materials,geometries:new Set(),extraMaterials:new Set()}),frame=program.sampleLifecycle('enter',.595);character.pose(frame.pose);group.updateMatrixWorld(true);const bars=[];group.traverse(o=>{if(o.geometry?.type==='CylinderGeometry'&&Math.abs(o.geometry.parameters.radiusTop-.016)<1e-8)bars.push(o);});bars.sort((a,b)=>a.position.x-b.position.x);const bar=bars[1],axis=new THREE.Vector3(0,1,0).applyQuaternion(bar.quaternion),advance=new THREE.Vector3(0,0,1).applyQuaternion(bar.quaternion),normal=advance.clone().cross(axis).normalize();let worst=null;
for(const sample of character.getSurfaceSamples({stride:1,parts:['rightHand']})){const v=new THREE.Vector3(...sample.position).sub(bar.position),along=v.dot(axis),radial=v.clone().addScaledVector(axis,-along),depth=Math.min(.016-radial.length(),.09-Math.abs(along));if(!worst||depth>worst.depth)worst={...sample,depth,axis:along,normal:v.dot(normal),advance:v.dot(advance),gradientNormal:radial.clone().normalize().dot(normal),gradientAdvance:radial.clone().normalize().dot(advance)};}
console.log(JSON.stringify({worst,pose:frame.pose.hands[1],bar:bar.position.toArray(),normal:normal.toArray(),advance:advance.toArray()}));


