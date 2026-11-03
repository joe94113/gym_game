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

const count=Number(process.env.FORM_PHASE_COUNT||101),results=[];for(const m of machines.values())if(['squat','smithSquat'].includes(m.type)){const life=createMachineLifecycle({THREE,machine:m,metrics});for(const mode of ['loop','enter','exit']){const result={type:m.type,mode,phases:count,vertices:0,minClearance:Infinity,maxDepth:0};for(let i=0;i<count;i++){const u=i/(count-1),f=mode==='loop'?{pose:m.sampleActivity(u,u)}:life.sample(mode,u);character.pose(f.pose);const rack=m.getRackSetup(),p=rack.barPosition,samples=character.getSurfaceSamples({stride:1,parts:['leftForearm','rightForearm','leftUpperArm','rightUpperArm']});result.vertices+=samples.length;for(const skin of samples){if(Math.abs(skin.position[0])>1.25)continue;const clearance=Math.hypot(skin.position[1]-p[1],skin.position[2]-p[2])-rack.barRadius;result.minClearance=Math.min(result.minClearance,clearance);if(-clearance>result.maxDepth){result.maxDepth=-clearance;result.worst={u,stage:f.stage,skin};}}}result.pass=result.maxDepth<=.001;results.push(result);console.log(JSON.stringify(result));}}writeFileSync('artifacts/squat-rack-arm-clearance.json',JSON.stringify({pass:results.every(r=>r.pass),scope:'All true upper-arm and forearm skin vertices against actual full rigid shaft cylinder; no wrist or forearm grip-zone exemptions.',results},null,2));if(results.some(r=>!r.pass))process.exitCode=1;
