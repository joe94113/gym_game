import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentSystem} from '../src/equipment.js';
import {createAdditionalEquipment,applyAdditionalVariants,ADDITIONAL_EQUIPMENT_TYPES} from '../src/additional-equipment.js';
import {stations} from '../src/data.js';

export async function createEquipmentFixture(){
 const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url)),length=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+length));
 for(const m of json.materials||[]){m.pbrMetallicRoughness={baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;delete m.extensions;}
 delete json.images;delete json.textures;delete json.samplers;let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
 const remainder=source.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),''),scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata:JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)))}),metrics=character.getAssetInfo().metrics;
 globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
 const materials={},geometries=new Set(),extraMaterials=new Set(),textures=new Set();for(const [key,color]of Object.entries({graphite:'#26312d',steel:'#89958d',chrome:'#c7cfca',black:'#18201d',accent:'#c5e998'}))materials[key]=new THREE.MeshStandardMaterial({color});
 const options={THREE,scene,stations,materials,geometries,extraMaterials,textures,collider(){},characterMetrics:metrics};
 const equipment=createEquipmentSystem({...options,stations:stations.filter(s=>!['stretchZone','facility'].includes(s.type)&&!ADDITIONAL_EQUIPMENT_TYPES.has(s.type))}),machines=equipment.machines;
 const additional=createAdditionalEquipment({...options,baseMachines:machines});for(const [id,machine]of additional.machines)machines.set(id,machine);applyAdditionalVariants(machines,options);scene.updateMatrixWorld(true);
 return{THREE,scene,metrics,machines,character,geometries,extraMaterials,textures,materials};
}
