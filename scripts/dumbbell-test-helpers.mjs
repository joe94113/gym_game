import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {createActivityRig}=await import(process.env.DB_CANDIDATE_ROOT?pathToFileURL(resolve(process.env.DB_CANDIDATE_ROOT,'src/extended-rig.js')).href:new URL('../src/extended-rig.js',import.meta.url).href);
import {cylinderHandMeasure} from './equipment-grip-test-helpers.mjs';
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength));
for(const m of json.materials||[]){m.pbrMetallicRoughness={baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;delete m.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let j=Buffer.from(JSON.stringify(json));if(j.length%4)j=Buffer.concat([j,Buffer.alloc(4-j.length%4,32)]);
const rest=source.subarray(20+jsonLength),h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(20+j.length+rest.length,8);h.writeUInt32LE(j.length,12);h.writeUInt32LE(0x4e4f534a,16);
const b=Buffer.concat([h,j,rest]),gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata:JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)))}),metrics=character.getAssetInfo().metrics,rig=createActivityRig({THREE,scene,characterMetrics:metrics});
export {THREE,scene,character,metrics,rig};
