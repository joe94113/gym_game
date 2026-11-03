import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createNpcLodFixture,readNpcLodData} from './npc-lod-fixture-v010.mjs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createSkinnedCharacterFromModel as createBaselineCharacter} from '../.local-tools/v012-before/src/skinned-character.js';
import {createNpcLodState} from '../src/npc-geometry-lod-v010.js';

export const skinnedMeshes=actor=>{const meshes=[];actor.group.traverse(object=>{if(object.isSkinnedMesh)meshes.push(object);});return meshes;};
export const skeletons=actor=>[...new Set(skinnedMeshes(actor).map(mesh=>mesh.skeleton))];
export async function createSkeletonFixtureV012(){
 const parsed=await createNpcLodFixture({data:readNpcLodData()}),actors=[];
 const makeResources=()=>({geometryCache:new WeakMap(),geometries:new Set(),materials:new Set(),textures:new Set(),instances:0,disposed:false,lodState:createNpcLodState(readNpcLodData())});
 function create(before=false,options={},resources=makeResources()){
  const createCharacter=before?createBaselineCharacter:createSkinnedCharacterFromModel;
  const actor=createCharacter({THREE,scene:parsed.scene,model:cloneSkeleton(parsed.gltf.scene),metadata:parsed.metadata,geometryLodAllowed:true,sharedResources:resources,lodState:resources.lodState,...options});
  actor.createClone=overrides=>create(before,{...options,...overrides},resources);actors.push(actor);return actor;
 }
 return{...parsed,create,dispose(){for(const actor of actors)actor.dispose();}};
}
