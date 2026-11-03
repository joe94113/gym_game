import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoomResourceManager} from '../src/room-gpu-resources-v011.js';
import {createRoomZones} from '../src/room-zones.js';

function fixture(options={}){
  const scene=new THREE.Scene(),classroom=new THREE.Group(),bathroom=new THREE.Group();classroom.visible=bathroom.visible=false;scene.add(classroom,bathroom);
  const extra=[],protectedResources={},manager=createRoomResourceManager({scene,rooms:{classroom,bathroom},getInventoryRoots:()=>extra,getProtectedResources:()=>protectedResources,...options});
  const add=(root,geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial())=>{const mesh=new THREE.Mesh(geometry,material);root.add(mesh);return mesh;};
  return{scene,classroom,bathroom,extra,protectedResources,manager,add};
}
function watch(resource){let count=0;resource.addEventListener('dispose',()=>count++);return()=>count;}
const force={force:true,dormantSeconds:20};

test('only hidden rooms past cooldown dispose exclusive GPU resources; CPU arrays, image, pose and references survive wake',()=>{
  const f=fixture(),texture=new THREE.DataTexture(new Uint8Array([255,0,0,255]),1,1),material=new THREE.MeshStandardMaterial({map:texture}),mesh=f.add(f.classroom,undefined,material);texture.needsUpdate=true;
  let closed=0;texture.source.data.close=()=>closed++;const geometry=mesh.geometry,arrays=Object.fromEntries(Object.entries(geometry.attributes).map(([key,a])=>[key,{attribute:a,array:a.array,values:Array.from(a.array)}])),index=geometry.index,bytes=Array.from(texture.source.data.data),image=texture.source.data,position=mesh.position.toArray(),matrix=mesh.matrix.toArray(),g=watch(geometry),m=watch(material),t=watch(texture);
  assert.equal(f.manager.sleepRoom('classroom',{dormantSeconds:11.99}),false);f.classroom.visible=true;assert.equal(f.manager.sleepRoom('classroom',force),false);f.classroom.visible=false;
  assert.equal(f.manager.sleepRoom('classroom',{dormantSeconds:12}),true);assert.deepEqual([g(),m(),t()],[1,1,1]);assert.equal(f.manager.sleepRoom('classroom',force),false);
  const attributeVersions=Object.values(geometry.attributes).map(a=>a.version),materialVersion=material.version,textureVersion=texture.version;
  assert.equal(f.manager.wakeRoom('classroom'),true);assert.equal(f.manager.wakeRoom('classroom'),false);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(geometry.index,index);
  for(const[key,snapshot]of Object.entries(arrays)){assert.equal(geometry.attributes[key],snapshot.attribute);assert.equal(geometry.attributes[key].array,snapshot.array);assert.deepEqual(Array.from(snapshot.array),snapshot.values);}
  assert.deepEqual(Object.values(geometry.attributes).map(a=>a.version),attributeVersions.map(v=>v+1));assert.equal(material.version,materialVersion+1);assert.equal(texture.version,textureVersion+1);assert.equal(texture.source.data,image);assert.deepEqual(Array.from(texture.source.data.data),bytes);assert.equal(closed,0);assert.deepEqual(mesh.position.toArray(),position);assert.deepEqual(mesh.matrix.toArray(),matrix);
  const d=f.manager.getDiagnostics();assert.equal(d.cpuModelsResident,true);assert.equal(d.fullModelUnloading,false);assert.equal(d.rooms.classroom.wakeCount,1);
});

test('cross-room and global geometry/material/texture references are never disposed, including hidden and parked roots',()=>{
  const f=fixture(),texture=new THREE.DataTexture(new Uint8Array(4),1,1),material=new THREE.MeshBasicMaterial({map:texture}),geometry=new THREE.BoxGeometry();f.add(f.classroom,geometry,material);f.add(f.bathroom,geometry,material);
  const parked=new THREE.Group();parked.visible=false;f.extra.push(parked);f.add(parked,geometry,material);const counters=[geometry,material,texture].map(watch);
  f.manager.sleepRoom('classroom',force);f.manager.sleepRoom('bathroom',force);assert.deepEqual(counters.map(fn=>fn()),[0,0,0]);
  assert.equal(f.manager.getDiagnostics().lastInventory.rooms.classroom.rejected.sharedGeometry,1);assert.equal(f.manager.getDiagnostics().rooms.classroom.retainedReleasedResources.geometries,0);
});

test('distinct geometries sharing position/index/ArrayBuffer aliases cannot invalidate each other’s GPU buffers',()=>{
  const f=fixture(),original=new THREE.BoxGeometry(),wrapper=original.clone();wrapper.setAttribute('position',original.attributes.position);wrapper.setIndex(original.index);f.add(f.scene,original);f.add(f.classroom,wrapper);
  const buffer=new Float32Array(18),a=new THREE.BufferGeometry(),b=new THREE.BufferGeometry();a.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer.buffer,0,9),3));b.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer.buffer,9*4,9),3));f.add(f.scene,a);f.add(f.classroom,b);
  const interleaved=new THREE.InterleavedBuffer(new Float32Array(18),6),c=new THREE.BufferGeometry(),d=new THREE.BufferGeometry();c.setAttribute('position',new THREE.InterleavedBufferAttribute(interleaved,3,0));d.setAttribute('position',new THREE.InterleavedBufferAttribute(interleaved,3,3));f.add(f.classroom,c);f.add(f.scene,d);
  const counters=[original,wrapper,a,b,c,d].map(watch);f.manager.sleepRoom('classroom',force);assert.ok(counters.every(fn=>fn()===0));assert.equal(f.manager.getDiagnostics().lastInventory.rooms.classroom.rejected.attributeAlias,3);
});

test('all SkinnedMesh, bone attachments, instanced proxies and protected cached full/LOD geometry stay resident',()=>{
  const f=fixture(),skin=new THREE.SkinnedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),bone=new THREE.Bone(),badge=f.add(bone);skin.add(bone);f.classroom.add(skin);
  const proxy=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2);f.classroom.add(proxy);
  const full=new THREE.BoxGeometry(),lod=new THREE.BufferGeometry();for(const[key,a]of Object.entries(full.attributes))lod.setAttribute(key,a);lod.setIndex(new THREE.BufferAttribute(new Uint16Array(full.index.array.slice(0,6)),1));const mesh=f.add(f.classroom,lod);f.protectedResources.characters={geometries:[full,lod],roots:[skin]};
  const counters=[skin.geometry,skin.material,badge.geometry,badge.material,proxy.geometry,proxy.material,full,lod,mesh.material].map(watch);f.manager.sleepRoom('classroom',force);
  assert.deepEqual(counters.slice(0,8).map(fn=>fn()),Array(8).fill(0));assert.equal(counters[8](),1,'unrelated exclusive material may still release without touching protected geometry');
});

test('texture Source/image aliases, environment, shadow/render-target textures and videos are excluded',()=>{
  const f=fixture(),source=new THREE.DataTexture(new Uint8Array(4),1,1),alias=source.clone();f.add(f.scene,undefined,new THREE.MeshBasicMaterial({map:source}));f.add(f.classroom,undefined,new THREE.MeshBasicMaterial({map:alias}));
  const environment=new THREE.DataTexture(new Uint8Array(4),1,1);f.scene.environment=environment;f.add(f.classroom,undefined,new THREE.MeshBasicMaterial({map:environment}));
  const target=new THREE.WebGLRenderTarget(2,2);f.add(f.classroom,undefined,new THREE.MeshBasicMaterial({map:target.texture}));
  const video=new THREE.Texture({width:2,height:2});video.isVideoTexture=true;f.add(f.classroom,undefined,new THREE.MeshBasicMaterial({map:video}));
  const image={width:2,height:2},imageA=new THREE.Texture(image),imageB=new THREE.Texture(image);f.add(f.scene,undefined,new THREE.MeshBasicMaterial({map:imageA}));f.add(f.classroom,undefined,new THREE.MeshBasicMaterial({map:imageB}));
  const counters=[source,alias,environment,target.texture,video,imageA,imageB].map(watch);f.manager.sleepRoom('classroom',force);assert.ok(counters.every(fn=>fn()===0));
});

test('shader nested uniforms and custom depth/distance materials participate in global reference counts',()=>{
  const f=fixture(),texture=new THREE.DataTexture(new Uint8Array(4),1,1),roomMaterial=new THREE.MeshBasicMaterial({map:texture});f.add(f.classroom,undefined,roomMaterial);
  const outside=f.add(f.scene),shader=new THREE.ShaderMaterial({uniforms:{nested:{value:{entries:[texture]}}}});outside.customDepthMaterial=shader;
  const sharedDepth=new THREE.MeshDepthMaterial(),inside=f.add(f.classroom);inside.customDistanceMaterial=sharedDepth;outside.customDistanceMaterial=sharedDepth;const t=watch(texture),d=watch(sharedDepth);
  f.manager.sleepRoom('classroom',force);assert.equal(t(),0);assert.equal(d(),0);
});

test('late generated room gear is scanned at release, while previous resources are not double-disposed',()=>{
  const f=fixture(),first=f.add(f.classroom),a=watch(first.geometry);f.manager.sleepRoom('classroom',force);const late=f.add(f.classroom),b=watch(late.geometry);f.manager.notifyRoomChanged('classroom');f.manager.sleepRoom('classroom',force);
  assert.equal(a(),1);assert.equal(b(),1);assert.equal(f.manager.getDiagnostics().rooms.classroom.releaseCount,2);f.manager.wakeRoom('classroom');f.manager.sleepRoom('classroom',force);assert.equal(a(),2);assert.equal(b(),2);
});

test('whole-graph inventory failure is fail-closed and disabling eviction restores upload state immediately',()=>{
  let fail=false;const f=fixture({getInventoryRoots:()=>{if(fail)throw new Error('incomplete roots');return[];}}),mesh=f.add(f.classroom),g=watch(mesh.geometry);
  fail=true;assert.equal(f.manager.sleepRoom('classroom',force),false);assert.equal(g(),0);assert.match(f.manager.getDiagnostics().lastError,/incomplete roots/);fail=false;f.manager.sleepRoom('classroom',force);const version=mesh.geometry.attributes.position.version;
  f.manager.setEnabled(false);assert.equal(mesh.geometry.attributes.position.version,version+1);assert.equal(f.manager.getDiagnostics().rooms.classroom.gpuEvictionRequested,false);assert.equal(f.manager.sleepRoom('classroom',force),false);
});

test('room-zones wake before first reveal and inventory keeps parked, late and detached registered roots with correct ownership',()=>{
  const scene=new THREE.Scene(),zones=createRoomZones({THREE,scene}),root=zones.getRoot('classroom'),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);mesh.position.set(-24,1,26);scene.add(mesh);zones.registerRoot('classroom',mesh);scene.updateMatrixWorld(true);const matrix=mesh.matrixWorld.clone(),g=watch(geometry);
  const manager=createRoomResourceManager({scene,rooms:{classroom:root,bathroom:zones.getRoot('bathroom')},getInventoryRoots:()=>zones.getInventoryRoots(),cooldownSeconds:.2});zones.setResourceManager(manager);
  for(let t=0;t<1.5;t+=.05)zones.evaluate({dt:.05,playerPosition:[0,0,-20]});assert.equal(g(),1);assert.equal(root.parent.userData.roomResidentCache,true);assert.ok(zones.getInventoryRoots().includes(mesh));
  const wake=manager.wakeRoom;let wokeBeforeReveal=false;manager.wakeRoom=id=>{if(id==='classroom'&&manager.getDiagnostics().rooms.classroom.gpuEvictionRequested){wokeBeforeReveal=root.visible===false&&root.parent.userData.roomResidentCache===true;}return wake(id);};
  zones.evaluate({playerPosition:[-24,0,26],dt:0});scene.updateMatrixWorld(true);assert.equal(wokeBeforeReveal,true);assert.equal(root.parent,scene);assert.deepEqual(mesh.matrixWorld.toArray(),matrix.toArray());
  const cached=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(cached);zones.registerRoot('classroom',cached);cached.removeFromParent();assert.ok(zones.getInventoryRoots().includes(cached));assert.ok(manager.inspect().rooms.classroom.eligible.geometries>=2);
  const review=new THREE.Scene();review.add(cached);const alias=new THREE.Mesh(cached.geometry,new THREE.MeshStandardMaterial());root.add(alias);assert.ok(manager.inspect().rooms.classroom.rejected.sharedGeometry>=1,'a cached root reparented into an external scene becomes global');zones.dispose();
});
