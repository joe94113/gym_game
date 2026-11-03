import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {createMachineLifecycle} from '../src/machine-lifecycle.js';
import {stations} from '../src/data.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
import {createEquipmentSystem} from '../src/equipment.js';
import {createHash} from 'node:crypto';

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

const {machines}=createEquipmentSystem({THREE,scene,stations:[{id:'default-bike',name:'Default bike snapshot',number:'',type:'bike',position:{x:0,z:0},rotation:0,category:'cardio'}],materials,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){},characterMetrics:metrics}),machine=machines.get('default-bike'),hash=createHash('sha256');let meshCount=0,vertices=0;
machine.sampleActivity(0,0);machine.group.updateMatrixWorld(true);machine.group.traverse(o=>{if(!o.isMesh)return;meshCount++;vertices+=o.geometry.attributes.position.count;hash.update(JSON.stringify(o.matrixWorld.toArray()));for(const key of Object.keys(o.geometry.attributes).sort()){const a=o.geometry.attributes[key];hash.update(key);hash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(o.geometry.index){const a=o.geometry.index.array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}});
const colliders=machine.getCollisionVolumes(),poses=[];for(let i=0;i<=100;i++)poses.push(machine.sampleActivity(i/100,i/100));const report={geometrySHA256:hash.digest('hex'),meshCount,vertices,colliderSHA256:createHash('sha256').update(JSON.stringify(colliders)).digest('hex'),poseSHA256:createHash('sha256').update(JSON.stringify(poses)).digest('hex')};writeFileSync(`artifacts/${process.env.FORM_REPORT_NAME||'default-bike-snapshot.json'}`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));


