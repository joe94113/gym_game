import {createHash} from 'node:crypto';
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

const h=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),results=[];for(const m of machines.values())if(!['squat','smithSquat','dumbbellCurl'].includes(m.type)){m.sampleActivity(0,0);m.group.updateMatrixWorld(true);const meshes=[];m.group.traverse(o=>{if(o.isMesh)meshes.push({matrix:o.matrix.toArray(),position:Array.from(o.geometry.attributes.position.array),index:o.geometry.index?Array.from(o.geometry.index.array):null});});const colliders=m.getCollisionVolumes(),poses=Array.from({length:101},(_,i)=>m.sampleActivity(i/100,i/100)),profile=createMachineLifecycle({THREE,machine:m,metrics}),lifecycles=['enter','exit'].flatMap(d=>Array.from({length:101},(_,i)=>profile.sample(d,i/100)));results.push({id:m.station.id,type:m.type,geometrySHA256:h(meshes),colliderSHA256:h(colliders),poseSHA256:h(poses),lifecycleSHA256:h(lifecycles)});}const name=process.env.FORM_SCOPE_REPORT||'ordinary-machines-before-squat-fix.json';writeFileSync('artifacts/'+name,JSON.stringify({results},null,2));console.log(JSON.stringify({file:name,machines:results.length}));

