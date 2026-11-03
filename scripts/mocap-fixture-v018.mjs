import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Omit image decoding only in this CPU fixture; real positions, skin, bones,
// model bytes on disk and the runtime factory are unchanged.
export async function createMocapFixtureV018({baseline=false}={}){
 const root=resolve(baseline?'.local-tools/v018-before':'.'),source=readFileSync(resolve(root,'public/models/athlete/athlete.glb')),length=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+length));
 for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
 delete json.images;delete json.textures;delete json.samplers;
 let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
 const remainder=source.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
 const load=name=>import(pathToFileURL(resolve(root,'src',name)));
 const [{createSkinnedCharacterFromModel},{createActivityRig},{createEquipmentSystem},{createMachineLifecycle},{stations}]=await Promise.all(['skinned-character.js','extended-rig.js','equipment.js','machine-lifecycle.js','data.js'].map(load));
 const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata:JSON.parse(readFileSync(resolve(root,'public/models/athlete/rig.json')))}),metrics=character.getAssetInfo().metrics,rig=createActivityRig({THREE,scene,characterMetrics:metrics});
 globalThis.document??={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
 const materials=Object.fromEntries(['graphite','steel','chrome','black','accent'].map(key=>[key,new THREE.MeshStandardMaterial()]));
 const types=new Set(['chestPress','latPulldown','seatedRow','legPress','legExtension','shoulderPress','cableFly','squat','benchPress','dumbbellCurl','treadmill','bike','plateInclinePress','plateHighRow','plateShoulderPress','hackSquat','hipThrust','calfRaise','smithSquat','legCurl','pecDeck','lateralRaise','elliptical','rower','stairClimber']);
 const {machines}=createEquipmentSystem({THREE,scene,stations:stations.filter(station=>types.has(station.type)),materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});
 const {createAdditionalEquipment,ADDITIONAL_EQUIPMENT_TYPES}=await load('additional-equipment.js');
 const extra=createAdditionalEquipment({scene,stations:stations.filter(station=>ADDITIONAL_EQUIPMENT_TYPES.has(station.type)),materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});
 for(const [id,machine]of extra.machines)machines.set(id,machine);
 return{THREE,root,scene,character,metrics,rig,machines,createMachineLifecycle};
}
