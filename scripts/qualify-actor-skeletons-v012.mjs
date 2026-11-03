import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSkeletonFixtureV012,skinnedMeshes,skeletons} from './skeleton-fixture-v012.mjs';
import {buildLocomotionPose,buildMovementPose} from '../src/locomotion.js';
import {createActivityRig} from '../src/extended-rig.js';

const quick=process.argv.includes('--quick'),files=['src/actor-skeletons-v012.js','src/skinned-character.js','src/npc-geometry-lod-v010.js','src/locomotion.js','src/extended-rig.js','src/rig-lifecycle.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json','public/models/athlete/lod-v010/manifest.json','public/models/athlete/lod-v010/indices.bin'],baselineFiles=files.filter(path=>!path.endsWith('actor-skeletons-v012.js'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),hashes=()=>Object.fromEntries(files.map(path=>[path,sha(readFileSync(path))])),sourceHashes=hashes(),baselineSourceHashes=Object.fromEntries(baselineFiles.map(path=>[path,sha(readFileSync(`.local-tools/v012-before/${path}`))]));
const fixture=await createSkeletonFixtureV012(),variants=quick?[{}]:[{}, {bodyProfile:'feminine'}, {age:65}, {bodyProfile:'feminine',age:65}],results=[],failures=[];let vertexChecks=0,sampleChecks=0,boneChecks=0,poseChecks=0,maxVertexError=0;
const equal=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))failures.push(label);};
const shaderOf=material=>{const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};material.onBeforeCompile(shader);return{vertexShader:shader.vertexShader,fragmentShader:shader.fragmentShader,uniforms:Object.fromEntries(Object.entries(shader.uniforms).map(([key,uniform])=>[key,uniform.value?.toArray?.()||uniform.value]))};};
const bonesOf=actor=>{const values=[];actor.group.traverse(bone=>{if(bone.isBone)values.push([bone.name,...bone.position,...bone.quaternion,...bone.scale,...bone.matrixWorld.elements]);});return values;};
try{
 for(const appearance of variants){
  const before=fixture.create(true,{appearance}),after=fixture.create(false,{appearance}),bm=skinnedMeshes(before),am=skinnedMeshes(after),metrics=before.getAssetInfo().metrics;
  if(skeletons(before).length!==8||skeletons(after).length!==1)failures.push('expected real GLB skeletons 8 → 1');
  const staticState=meshes=>meshes.map(mesh=>({name:mesh.name,bind:mesh.bindMatrix.toArray(),bindInverse:mesh.bindMatrixInverse.toArray(),boneInverses:mesh.skeleton.boneInverses.map(matrix=>matrix.toArray()),geometry:Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name,attribute])=>[name,{itemSize:attribute.itemSize,normalized:attribute.normalized,hash:sha(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength))}])),index:sha(new Uint8Array(mesh.geometry.index.array.buffer,mesh.geometry.index.array.byteOffset,mesh.geometry.index.array.byteLength)),material:{type:mesh.material.type,color:mesh.material.color?.toArray(),roughness:mesh.material.roughness,metalness:mesh.material.metalness,shader:shaderOf(mesh.material)}}));
  equal(staticState(bm),staticState(am),'static binding/geometry/material/shader changed');equal(before.getAssetInfo(),after.getAssetInfo(),'asset metadata changed');
  const cases=[{name:'idle',pose:buildLocomotionPose(metrics,0,0)},{name:'walk',pose:buildMovementPose(metrics,.63,0,1)},{name:'sprint',pose:buildMovementPose(metrics,1.19,1,1)}];
  const rig=createActivityRig({THREE:fixture.THREE,scene:new fixture.THREE.Scene(),characterMetrics:metrics});
  for(const id of quick?['dumbbell-bench-press','cable-rope-crunch']:['dumbbell-curl','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-bench-press','dumbbell-goblet-squat','dumbbell-romanian-deadlift','rope-pushdown','single-arm-cable-row','cable-rope-hammer-curl','cable-straight-arm-pulldown','cable-rope-crunch','standing-thoracic-rotation','kneeling-hip-flexor-stretch']){
   rig.prepare(id);for(const phase of quick?[.5]:[0,.25,.5,.75,1])cases.push({name:`${id}:loop:${phase}`,pose:structuredClone(rig.sample(id,phase,phase))});
   if(!quick)for(const direction of ['enter','exit'])for(const phase of [0,.2,.5,.8,1])cases.push({name:`${id}:${direction}:${phase}`,pose:structuredClone(rig.sampleLifecycle(id,direction,phase).pose)});
   rig.end({keepVisible:false});
  }
  let beforeUpdates=0,afterUpdates=0;for(const skeleton of skeletons(before)){const update=skeleton.update;skeleton.update=function(){beforeUpdates++;return update.call(this);};skeleton.computeBoneTexture();}for(const skeleton of skeletons(after)){const update=skeleton.update;skeleton.update=function(){afterUpdates++;return update.call(this);};skeleton.computeBoneTexture();}
  const previous={before:beforeUpdates,after:afterUpdates};before.pose(cases[0].pose);after.pose(cases[0].pose);const updateCalls={before:beforeUpdates-previous.before,after:afterUpdates-previous.after};
  if(updateCalls.before!==8||updateCalls.after!==1)failures.push('expected one production pose to update 8 → 1 skeletons');
  const result={appearance,skeletons:{before:skeletons(before).length,after:skeletons(after).length},boneTextures:{before:skeletons(before).filter(skeleton=>skeleton.boneTexture).length,after:skeletons(after).filter(skeleton=>skeleton.boneTexture).length},updateCalls,poseCases:cases.length,levels:[0,1,2]};
  for(const c of cases)for(const level of [0,1,2]){
   before.setGeometryLod(level);after.setGeometryLod(level);before.pose(c.pose);after.pose(c.pose);before.setMuscleHighlights(['chest','back','biceps'],['shoulders','triceps'],{side:'right'});after.setMuscleHighlights(['chest','back','biceps'],['shoulders','triceps'],{side:'right'});
   equal(before.getContactPoints(),after.getContactPoints(),`${c.name}/${level}: contacts`);equal(before.getHandDiagnostics(),after.getHandDiagnostics(),`${c.name}/${level}: hands`);equal(bonesOf(before),bonesOf(after),`${c.name}/${level}: bones`);boneChecks+=53;
   equal(before.getMuscleHighlights(),after.getMuscleHighlights(),`${c.name}/${level}: muscle keys`);equal(shaderOf(bm[0].material),shaderOf(am[0].material),`${c.name}/${level}: muscle uniforms`);
   const stride=quick?512:128,b=before.getSurfaceSamples({stride}),a=after.getSurfaceSamples({stride});equal(b,a,`${c.name}/${level}: surface samples`);sampleChecks+=b.length;
   // A full vertex pass at one representative pose per appearance and level
   // covers the actual deformation, not just bone targets or sample markers.
   if(c.name==='sprint')for(let meshIndex=0;meshIndex<bm.length;meshIndex++){
    const point=new fixture.THREE.Vector3(),other=new fixture.THREE.Vector3(),count=bm[meshIndex].geometry.attributes.position.count;
    for(let vertex=0;vertex<count;vertex++){bm[meshIndex].getVertexPosition(vertex,point);am[meshIndex].getVertexPosition(vertex,other);const error=point.distanceTo(other);maxVertexError=Math.max(maxVertexError,error);vertexChecks++;if(error!==0)failures.push(`vertex changed: ${meshIndex}/${vertex}`);}
   }
   equal(Array.from(skeletons(before)[0].boneMatrices),Array.from(skeletons(after)[0].boneMatrices),`${c.name}/${level}: bone matrices`);poseChecks++;
  }
  before.dispose();after.dispose();results.push(result);
 }
}finally{fixture.dispose();}
const finalHashes=hashes(),changedSources=files.filter(path=>sourceHashes[path]!==finalHashes[path]),pass=!failures.length&&!changedSources.length,report={pass,quick,scope:'Production GLB parsed without image decoding only in the CPU fixture; geometry/skin/bones are unchanged. Same actor meshes with exactly equal ordered Bone references and inverse matrices share one mutable Skeleton. Different actors remain separate. Exact asset/geometry/binding/material/shader/contacts/bone/hand/sample equality, and a full deformed vertex pass at sprint for each appearance/LOD. No GPU timing or visual/trainer approval is claimed by this report.',sourceHashes,baselineSourceHashes,changedSources,variants,poseChecks,boneChecks,sampleChecks,vertexChecks,maxVertexError,failures,results};
mkdirSync('artifacts/skeletons-v012',{recursive:true});const file=`artifacts/skeletons-v012/qualification${quick?'-quick':''}.json`;writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({file,pass,quick,poseChecks,vertexChecks,maxVertexError,results,failures,changedSources}));if(!pass)process.exitCode=1;
