import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {readFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createNpcLodState,decodeNpcLodData} from '../src/npc-geometry-lod-v010.js';

export function readNpcLodData(){
  const manifest=JSON.parse(readFileSync(new URL('../public/models/athlete/lod-v010/manifest.json',import.meta.url)));
  const bytes=readFileSync(new URL('../public/models/athlete/lod-v010/indices.bin',import.meta.url));
  return decodeNpcLodData(manifest,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}

export async function createNpcLodFixture({data=null}={}){
  const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url)),length=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+length));
  // GLB geometry/skeleton stay byte-identical. Node qualification does not need
  // image decoding or a canvas/GPU, so remove texture references only in memory.
  for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
  delete json.images;delete json.textures;delete json.samplers;
  let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
  const remainder=source.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binary=Buffer.concat([header,bytes,remainder]);
  const gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
  const scene=new THREE.Scene(),metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url))),lodState=createNpcLodState(data);
  const resources={geometryCache:new WeakMap(),geometries:new Set(),textures:new Set(),instances:0,disposed:false,lodState};
  const sourceMeshes=[];gltf.scene.traverse(mesh=>{if(mesh.isSkinnedMesh)sourceMeshes.push(mesh);});
  function instantiate(options={}){
    const actor=createSkinnedCharacterFromModel({THREE,scene,model:cloneSkeleton(gltf.scene),metadata,sharedResources:resources,lodState,...options});
    actor.createClone=overrides=>instantiate({geometryLodAllowed:true,...overrides});return actor;
  }
  return {THREE,scene,source,gltf,sourceMeshes,metadata,lodState,resources,instantiate};
}
