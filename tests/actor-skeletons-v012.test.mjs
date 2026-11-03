import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {consolidateActorSkeletons} from '../src/actor-skeletons-v012.js';
import {createSkeletonFixtureV012,skinnedMeshes,skeletons} from '../scripts/skeleton-fixture-v012.mjs';
import {buildLocomotionPose,buildMovementPose} from '../src/locomotion.js';

function fixture(){
 const actorRoot=new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone();a.add(b);actorRoot.add(a);b.position.y=1;actorRoot.updateMatrixWorld(true);
 const skeleton=new THREE.Skeleton([a,b]),geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial(),meshes=[0,1,2].map(i=>{const mesh=new THREE.SkinnedMesh(geometry,material);mesh.bind(skeleton.clone(),new THREE.Matrix4().makeTranslation(i,0,0));actorRoot.add(mesh);return mesh;});
 return{actorRoot,meshes,bones:[a,b]};
}

test('equivalent actor skeletons coalesce without touching mesh bind matrices, geometry or material',()=>{
 const f=fixture(),state=f.meshes.map(mesh=>({bind:mesh.bindMatrix.clone(),inverse:mesh.bindMatrixInverse.clone(),geometry:mesh.geometry,material:mesh.material}));
 const result=consolidateActorSkeletons(f);assert.equal(result.originalSkeletonCount,3);assert.equal(result.skeletons.length,1);assert.equal(result.mergedSkeletonCount,2);
 f.meshes.forEach((mesh,index)=>{assert.equal(mesh.skeleton,result.skeletons[0]);assert.ok(mesh.bindMatrix.equals(state[index].bind));assert.ok(mesh.bindMatrixInverse.equals(state[index].inverse));assert.equal(mesh.geometry,state[index].geometry);assert.equal(mesh.material,state[index].material);});
 assert.equal(consolidateActorSkeletons(f).mergedSkeletonCount,0);
});

test('different bone ordering, even tiny inverse changes and already uploaded skeletons remain separate',()=>{
 const f=fixture();f.meshes[1].skeleton.bones.reverse();f.meshes[2].skeleton.boneInverses=f.meshes[2].skeleton.boneInverses.map(matrix=>matrix.clone());f.meshes[2].skeleton.boneInverses[0].elements[12]=1e-14;
 assert.equal(consolidateActorSkeletons(f).skeletons.length,3);
 const uploaded=fixture();uploaded.meshes[0].skeleton.computeBoneTexture();const texture=uploaded.meshes[0].skeleton.boneTexture;let disposed=0;texture.addEventListener('dispose',()=>disposed++);
 const result=consolidateActorSkeletons(uploaded);assert.equal(result.skeletons.length,2);assert.equal(uploaded.meshes[0].skeleton.boneTexture,texture);assert.equal(disposed,0);texture.dispose();
});

test('equal transforms on different actors never share mutable skeletons or accept foreign mesh ownership',()=>{
 const a=fixture(),b=fixture(),foreign=b.meshes[0];a.meshes.push(foreign);
 const foreignSkeleton=foreign.skeleton;consolidateActorSkeletons(a);assert.equal(foreign.skeleton,foreignSkeleton);
 consolidateActorSkeletons(b);assert.notEqual(a.meshes[0].skeleton,b.meshes[0].skeleton);a.bones[0].position.x=2;assert.equal(b.bones[0].position.x,0);
});

test('real GLB clones reduce eight skeletons to one with exact contact, bone, mesh and sampled-skin results',async()=>{
 const fixture=await createSkeletonFixtureV012();
 try{
  for(const appearance of [{},{bodyProfile:'feminine'},{age:65},{bodyProfile:'feminine',age:65}]){
   const before=fixture.create(true,{appearance}),after=fixture.create(false,{appearance});assert.equal(skeletons(before).length,8);assert.equal(skeletons(after).length,1);assert.equal(after.getSkeletonDiagnostics().mergedSkeletonCount,7);
   const bm=skinnedMeshes(before),am=skinnedMeshes(after);bm.forEach((mesh,index)=>{assert.equal(mesh.name,am[index].name);assert.deepEqual(mesh.bindMatrix.toArray(),am[index].bindMatrix.toArray());assert.deepEqual(mesh.bindMatrixInverse.toArray(),am[index].bindMatrixInverse.toArray());for(const [name,attribute]of Object.entries(mesh.geometry.attributes))assert.deepEqual(attribute.array,am[index].geometry.attributes[name].array);});
   const metrics=before.getAssetInfo().metrics,poses=[buildLocomotionPose(metrics,0,0),buildMovementPose(metrics,.67,1,1),buildMovementPose(metrics,1.3,.3,.8)];
   for(const pose of poses){before.pose(pose);after.pose(pose);assert.deepEqual(after.getContactPoints(),before.getContactPoints());assert.deepEqual(after.getHandDiagnostics(),before.getHandDiagnostics());assert.deepEqual(after.getSurfaceSamples({stride:512}),before.getSurfaceSamples({stride:512}));const bones=actor=>{const values=[];actor.group.traverse(bone=>{if(bone.isBone)values.push([bone.name,...bone.position,...bone.quaternion,...bone.scale,...bone.matrixWorld.elements]);});return values;};assert.deepEqual(bones(after),bones(before));}
   before.dispose();after.dispose();
  }
 }finally{fixture.dispose();}
});

test('per-actor skeleton independence survives both LOD levels, muscle changes, clone disposal and failed LOD fallback',async()=>{
 const fixture=await createSkeletonFixtureV012();
 try{
  const actor=fixture.create(false),clone=actor.createClone({appearance:{bodyProfile:'feminine'}}),other=actor.createClone();assert.notEqual(skeletons(actor)[0],skeletons(clone)[0]);assert.notEqual(skeletons(actor)[0],skeletons(other)[0]);
  const meshState=skinnedMeshes(actor).map(mesh=>({skeleton:mesh.skeleton,material:mesh.material,bind:mesh.bindMatrix.clone()}));actor.setMuscleHighlights(['chest','biceps'],['triceps']);const colors=actor.getMuscleHighlights(),points=actor.getContactPoints();
  for(const level of [1,2,0]){assert.equal(actor.setGeometryLod(level),level);assert.deepEqual(actor.getContactPoints(),points);assert.deepEqual(actor.getMuscleHighlights(),colors);skinnedMeshes(actor).forEach((mesh,index)=>{assert.equal(mesh.skeleton,meshState[index].skeleton);assert.equal(mesh.material,meshState[index].material);assert.ok(mesh.bindMatrix.equals(meshState[index].bind));});}
  const canonical=skeletons(actor)[0];canonical.computeBoneTexture();let disposed=0;canonical.boneTexture.addEventListener('dispose',()=>disposed++);const otherPoints=other.getContactPoints();actor.dispose();actor.dispose();assert.equal(disposed,1);assert.deepEqual(other.getContactPoints(),otherPoints);other.pose(buildMovementPose(other.getAssetInfo().metrics,.6,1,1));assert.equal(other.getSkeletonDiagnostics().uniqueSkeletonCount,1);
  const noData=fixture.create(false,{lodState:{status:'failed',data:null,error:'missing',validationCache:new WeakMap(),wrapperCache:new WeakMap()}});assert.equal(noData.setGeometryLod(2),0);assert.equal(noData.getGeometryLodDiagnostics().triangles,56185);assert.equal(noData.getSkeletonDiagnostics().uniqueSkeletonCount,1);
 }finally{fixture.dispose();}
});
