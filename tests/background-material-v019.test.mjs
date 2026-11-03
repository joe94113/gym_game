import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createHash} from 'node:crypto';
import {createNpcLodFixture,readNpcLodData} from '../scripts/npc-lod-fixture-v010.mjs';
import {createSkinnedCharacterFromModel as baselineCharacter} from '../.local-tools/v019-before/src/skinned-character.js';
import {buildMovementPose} from '../src/locomotion.js';
import {createMocapFixtureV019} from '../scripts/trainer-fixture-v019.mjs';
import {createGymCrowd} from '../src/crowd.js';
import {createSocialCrowd} from '../src/social-crowd.js';
import {receptionSceneAnchors} from '../src/reception-scenes.js';
import {activities} from '../src/activity-catalog.js';
import {floorHeightAt} from '../src/gym-layout.js';

const meshes=actor=>{const list=[];actor.group.traverse(object=>{if(object.isSkinnedMesh)list.push(object);});return list;};
const shader=material=>{const value={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};material.onBeforeCompile(value);return value;};
const sha=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const bones=actor=>{const values=[];actor.group.traverse(object=>{if(object.isBone)values.push([object.name,...object.position,...object.quaternion,...object.scale,...object.matrixWorld.elements]);});return values;};

test('full PBR shader remains byte-identical to v0.18 and background preserves the exact hair shader without muscle varyings',async()=>{
 const fixture=await createNpcLodFixture(),appearance={bodyProfile:'feminine',age:65,grayHair:.87,hair:'#b7b6ae',shirt:'#7a6d81'},actor=fixture.instantiate({appearance}),baseline=baselineCharacter({THREE,scene:fixture.scene,model:cloneSkeleton(fixture.gltf.scene),metadata:fixture.metadata,appearance});
 try{
  actor.setMuscleHighlights(['chest','biceps'],['triceps']);baseline.setMuscleHighlights(['chest','biceps'],['triceps']);actor.setMuscleOverlayEnabled(false);baseline.setMuscleOverlayEnabled(false);const full=meshes(actor).map(mesh=>mesh.material),before=meshes(baseline).map(mesh=>mesh.material);
  full.forEach((material,i)=>{const a=shader(material),b=shader(before[i]);assert.equal(a.vertexShader,b.vertexShader);assert.equal(a.fragmentShader,b.fragmentShader);assert.equal(material.customProgramCacheKey(),before[i].customProgramCacheKey());});
  actor.setBackgroundMaterialMode(true);const background=meshes(actor).map(mesh=>mesh.material);assert.equal(actor.getMaterialDiagnostics().backgroundMaterialCount,8);
  background.forEach((material,i)=>{assert.notEqual(material,full[i]);assert.equal(material.type,full[i].type);const current=shader(material),old=shader(full[i]);assert.equal(current.vertexShader,'#include <common>\n#include <begin_vertex>');assert.doesNotMatch(current.vertexShader+current.fragmentShader,/formMuscle|vFormMuscle|uFormPrimary|uFormSecondary|uFormOverlay/);assert.equal(current.fragmentShader.slice(current.fragmentShader.indexOf('float formHairDetail=')),old.fragmentShader.slice(old.fragmentShader.indexOf('float formHairDetail=')));assert.equal(current.uniforms.uFormHairGray,old.uniforms.uFormHairGray);assert.equal(current.uniforms.uFormHairColor,old.uniforms.uFormHairColor);assert.notEqual(material.customProgramCacheKey(),full[i].customProgramCacheKey());
   for(const key of Object.keys(full[i])){if(['uuid','version','onBeforeCompile','customProgramCacheKey'].includes(key))continue;if(full[i][key]?.isTexture)assert.equal(material[key],full[i][key],key);else assert.deepEqual(material[key],full[i][key],key);}
  });
 }finally{actor.dispose();baseline.dispose();}
});

test('overlay immediately restores original full material identities and colours, with lazy stable variants and unchanged geometry/bones',async()=>{
 const fixture=await createNpcLodFixture({data:readNpcLodData()}),actor=fixture.instantiate({geometryLodAllowed:true}),list=meshes(actor),full=list.map(mesh=>mesh.material),geometry=list.map(mesh=>mesh.geometry),attributes=geometry.map(g=>Object.fromEntries(Object.entries(g.attributes).map(([key,value])=>[key,sha(value.array)])));
 try{
  actor.setMuscleHighlights(['chest'],['triceps']);assert.equal(actor.setBackgroundMaterialMode(true),false);assert.equal(actor.getMaterialDiagnostics().backgroundMaterialCount,0);actor.setMuscleOverlayEnabled(false);const background=list.map(mesh=>mesh.material);
  for(const pose of [buildMovementPose(actor.getAssetInfo().metrics,.2,0,0),buildMovementPose(actor.getAssetInfo().metrics,.67,1,1)]){
   actor.pose(pose);const points=actor.getContactPoints(),state=bones(actor);for(const level of [0,1,2,0]){actor.setGeometryLod(level);const currentGeometry=list.map(mesh=>mesh.geometry);actor.setMuscleOverlayEnabled(true);list.forEach((mesh,i)=>assert.equal(mesh.material,full[i]));const uniforms=shader(full[0]).uniforms;assert.equal(uniforms.uFormOverlay.value,1);assert.equal(uniforms.uFormPrimaryColor.value.getHexString(),'dc6855');assert.equal(uniforms.uFormSecondaryColor.value.getHexString(),'e2a261');actor.setMuscleOverlayEnabled(false);list.forEach((mesh,i)=>{assert.equal(mesh.material,background[i]);assert.equal(mesh.geometry,currentGeometry[i]);});assert.deepEqual(bones(actor),state);assert.deepEqual(actor.getContactPoints(),points);}
  }
  actor.setBackgroundMaterialMode(false);list.forEach((mesh,i)=>{assert.equal(mesh.material,full[i]);assert.equal(mesh.geometry,geometry[i]);for(const[key,value]of Object.entries(mesh.geometry.attributes))assert.equal(sha(value.array),attributes[i][key]);});assert.equal(actor.getMaterialDiagnostics().backgroundMaterialCount,8);
 }finally{actor.dispose();}
});

test('background clones preserve shared maps/alpha/PBR settings and never dispose a texture while another actor still owns it',async()=>{
 const fixture=await createNpcLodFixture(),image={width:1,height:1,close() {closed++;}},texture=new THREE.Texture(image);let disposed=0,closed=0;texture.addEventListener('dispose',()=>disposed++);
 for(const mesh of fixture.sourceMeshes){mesh.material.map=texture;mesh.material.normalMap=texture;mesh.material.alphaMap=texture;mesh.material.alphaTest=.27;mesh.material.opacity=.84;mesh.material.transparent=true;mesh.material.depthWrite=false;mesh.material.side=THREE.DoubleSide;}
 const first=fixture.instantiate(),second=first.createClone();
 try{
  for(const actor of [first,second]){actor.setMuscleOverlayEnabled(false);const full=meshes(actor).map(mesh=>mesh.material);actor.setBackgroundMaterialMode(true);meshes(actor).forEach((mesh,i)=>{assert.equal(mesh.material.map,texture);assert.equal(mesh.material.alphaMap,texture);assert.equal(mesh.material.normalMap,texture);assert.equal(mesh.material.alphaTest,full[i].alphaTest);assert.equal(mesh.material.opacity,full[i].opacity);assert.equal(mesh.material.transparent,full[i].transparent);assert.equal(mesh.material.depthWrite,full[i].depthWrite);assert.equal(mesh.material.side,full[i].side);const protectedMaterials=actor.getGpuResourceProtection().materials;assert.ok(protectedMaterials.includes(mesh.material));assert.ok(protectedMaterials.includes(full[i]));});}
  first.dispose();assert.equal(disposed,0);assert.equal(closed,0);assert.equal(second.getMaterialDiagnostics().backgroundActive,true);second.pose(buildMovementPose(second.getAssetInfo().metrics,.7,0,0));const count=first.getMaterialDiagnostics().backgroundMaterialCount;assert.equal(first.setBackgroundMaterialMode(true),false);assert.equal(first.getMaterialDiagnostics().backgroundMaterialCount,count);second.dispose();assert.equal(disposed,1);assert.equal(closed,1);assert.equal(fixture.resources.instances,0);assert.equal(fixture.resources.disposed,true);
 }finally{first.dispose();second.dispose();}
});

test('physical PBR transmission/clearcoat/maps and non-PBR fallback remain unchanged by background selection',async()=>{
 const fixture=await createNpcLodFixture(),texture=new THREE.Texture(),physical=new THREE.MeshPhysicalMaterial({name:'physical-hair-probe',color:'#7e887c',roughness:.67,metalness:.15,clearcoat:.35,clearcoatRoughness:.27,transmission:.42,thickness:.04,ior:1.4,opacity:.63,transparent:true,alphaTest:.19,side:THREE.DoubleSide});physical.map=texture;physical.normalMap=texture;physical.transmissionMap=texture;physical.thicknessMap=texture;physical.clearcoatMap=texture;fixture.sourceMeshes[0].material=physical;fixture.sourceMeshes[1].material=new THREE.MeshBasicMaterial({color:'#4b6c71',map:texture});const actor=fixture.instantiate({appearance:{grayHair:.8,hair:'#c4c4bd'}});
 try{actor.setMuscleOverlayEnabled(false);const full=meshes(actor).map(mesh=>mesh.material);actor.setBackgroundMaterialMode(true);const next=meshes(actor).map(mesh=>mesh.material);assert.equal(next[0].isMeshPhysicalMaterial,true);for(const key of ['clearcoat','clearcoatRoughness','transmission','thickness','ior','opacity','transparent','alphaTest','side','map','normalMap','transmissionMap','thicknessMap','clearcoatMap'])assert.equal(next[0][key],full[0][key],key);assert.equal(next[1],full[1],'Unsupported non-PBR material retains its original shader');actor.setMuscleOverlayEnabled(true);meshes(actor).forEach((mesh,i)=>assert.equal(mesh.material,full[i]));}finally{actor.dispose();}
});

test('only eleven gym members and seventeen non-class social actors select background mode; player and three class actors stay full',async()=>{
 const f=await createMocapFixtureV019(),crowd=createGymCrowd({...f,activities,floorHeight:floorHeightAt}),social=createSocialCrowd({...f,anchors:receptionSceneAnchors,floorHeight:floorHeightAt}),playerMaterials=meshes(f.character).map(mesh=>mesh.material);
 try{
  assert.equal(crowd.getMaterialDiagnostics().count,11);assert.equal(crowd.getMaterialDiagnostics().backgroundActive,11);assert.equal(social.getMaterialDiagnostics().count,20);assert.equal(social.getMaterialDiagnostics().backgroundActive,17);assert.equal(f.character.getMaterialDiagnostics().backgroundModeRequested,false);assert.equal(f.character.getMaterialDiagnostics().backgroundActive,false);
  const classActors=social.getMaterialDiagnostics().actors.filter(actor=>actor.role.startsWith('class-'));assert.equal(classActors.length,3);assert.ok(classActors.every(actor=>!actor.backgroundModeRequested&&!actor.backgroundActive));
  crowd.setBackgroundMaterialMode(false);social.setBackgroundMaterialMode(false);assert.equal(crowd.getMaterialDiagnostics().backgroundActive,0);assert.equal(social.getMaterialDiagnostics().backgroundActive,0);crowd.setBackgroundMaterialMode(true);social.setBackgroundMaterialMode(true);assert.equal(crowd.getMaterialDiagnostics().backgroundActive,11);assert.equal(social.getMaterialDiagnostics().backgroundActive,17);assert.ok(social.getMaterialDiagnostics().actors.filter(actor=>actor.role.startsWith('class-')).every(actor=>!actor.backgroundModeRequested));
  f.clones[0].setMuscleOverlayEnabled(true);crowd.setBackgroundMaterialMode(true);assert.equal(crowd.getMaterialDiagnostics().backgroundActive,10);assert.equal(f.clones[0].getMaterialDiagnostics().backgroundActive,false);meshes(f.character).forEach((mesh,i)=>assert.equal(mesh.material,playerMaterials[i]));
 }finally{crowd.dispose();social.dispose();f.character.dispose();}assert.equal(f.pool.instances,0);assert.equal(f.pool.disposed,true);
});
