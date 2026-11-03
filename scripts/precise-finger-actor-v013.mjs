import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync} from 'node:fs';
export async function createPreciseFingerActor(){
 const url=new URL('../src/skinned-character.js',import.meta.url),source=readFileSync(url,'utf8'),needle='direction=child?restPosition(child).clone().sub(restPosition(bone)):advance.clone();';
 if(!source.includes(needle))throw Error('Expected original finger-axis branch');
 const patched=source.replace(needle,"direction=child?restPosition(child).clone().sub(restPosition(bone)):metadata?.bones?.[bone.name]?.tail?new THREE.Vector3(...metadata.bones[bone.name].tail).sub(new THREE.Vector3(...metadata.bones[bone.name].head)):restPosition(bone).clone().sub(restPosition(bone.parent));").replace(/from '([^']+)'/g,(_,specifier)=>`from '${specifier.startsWith('.')?new URL(specifier,url).href:import.meta.resolve(specifier)}'`);
 const factory=await import(`data:text/javascript;base64,${Buffer.from(patched).toString('base64')}`),bytes=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
 for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}delete json.images;delete json.textures;delete json.samplers;
 let data=Buffer.from(JSON.stringify(json));if(data.length%4)data=Buffer.concat([data,Buffer.alloc(4-data.length%4,32)]);const tail=bytes.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+data.length+tail.length,8);header.writeUInt32LE(data.length,12);header.writeUInt32LE(0x4e4f534a,16);const binary=Buffer.concat([header,data,tail]),model=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
 return factory.createSkinnedCharacterFromModel({THREE,scene:new THREE.Scene(),model:model.scene,metadata:JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)))});
}
