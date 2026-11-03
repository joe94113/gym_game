import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/** The sealed environment imports the original modules, not mutable current
 * runtime. Only GLB texture references are omitted for this CPU-only loader. */
export async function createBenchFixtureV011({before=false}={}){
 const root=resolve(before?'.local-tools/v011-before':'.'),source=readFileSync(resolve(root,'public/models/athlete/athlete.glb')),length=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+length));
 for(const m of json.materials||[]){m.pbrMetallicRoughness={baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;delete m.extensions;}
 delete json.images;delete json.textures;delete json.samplers;
 let j=Buffer.from(JSON.stringify(json));if(j.length%4)j=Buffer.concat([j,Buffer.alloc(4-j.length%4,32)]);
 const rest=source.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+j.length+rest.length,8);header.writeUInt32LE(j.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const data=Buffer.concat([header,j,rest]),gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
 const [{createSkinnedCharacterFromModel},{createActivityRig}]=await Promise.all(['skinned-character.js','extended-rig.js'].map(name=>import(pathToFileURL(resolve(root,'src',name)))));
 const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata:JSON.parse(readFileSync(resolve(root,'public/models/athlete/rig.json')))}),metrics=character.getAssetInfo().metrics,rig=createActivityRig({THREE,scene,characterMetrics:metrics});
 return{THREE,scene,character,metrics,rig,root};
}
