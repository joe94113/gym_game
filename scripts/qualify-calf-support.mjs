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

const machine=machines.get('calf-raise'),lifecycle=createMachineLifecycle({THREE,machine,metrics}),results=[];
for(const mode of ['loop','enter','exit']){const r={mode,minimumShoeGap:Infinity,maximumSupportedShoeGap:0,maximumKneeTrackError:0,failures:[]};for(let i=0;i<=100;i++){
 const phase=i/100,frame=mode==='loop'?{pose:machine.sampleActivity(phase,phase),offset:[0,0,0],rotation:0}:lifecycle.sample(mode,phase);character.pose(frame.pose);const body=character.getContactPoints();
 const transform=p=>new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0,1,0),frame.rotation||0).add(new THREE.Vector3(...frame.offset)).toArray();
 const feet=body.feet.map(transform),knees=body.knees.map(transform);if(mode==='loop')for(let side=0;side<2;side++)r.maximumKneeTrackError=Math.max(r.maximumKneeTrackError,Math.abs(knees[side][0]-feet[side][0]));
 const samples=character.getSurfaceSamples({stride:1}).filter(p=>p.part?.endsWith('Foot')).map(p=>({...p,position:transform(p.position)}));
 for(const part of ['leftFoot','rightFoot']){const over=samples.filter(p=>p.part===part&&Math.abs(p.position[0])<.375&&Math.abs(p.position[2]-.55)<.095);if(over.length){const gap=Math.min(...over.map(p=>p.position[1]))-.29;r.minimumShoeGap=Math.min(r.minimumShoeGap,gap);if(mode==='loop')r.maximumSupportedShoeGap=Math.max(r.maximumSupportedShoeGap,gap);if(gap<-.006)r.failures.push({phase,part,gap});}}
 }results.push(r);}
writeFileSync(new URL('../artifacts/calf-support-review.json',import.meta.url),JSON.stringify({phaseCount:101,allFootVertices:true,stepSurfaceY:.29,results},null,2));console.log(JSON.stringify(results));if(results.some(r=>r.failures.length||r.maximumSupportedShoeGap>.016||r.maximumKneeTrackError>.001))process.exitCode=1;
