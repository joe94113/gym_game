import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoomZones,roomForStation,ROOM_ZONES,distanceToRoom} from '../src/room-zones.js';
import {makeArchitecture} from '../scripts/room-test-helpers.mjs';
const settle=(zones,context={},seconds=1.1)=>{for(let t=0;t<seconds;t+=.05)zones.evaluate({...context,dt:.05});return zones.getActivity();};

test('room ownership preserves rendered world transforms and keeps enclosing floor and walls permanent',()=>{
 const scene=new THREE.Scene(),m=new THREE.MeshBasicMaterial(),objects=[];
 function mesh(size,position,rotation=0){const o=new THREE.Mesh(new THREE.BoxGeometry(...size),m);o.position.set(...position);o.rotation.y=rotation;scene.add(o);objects.push(o);return o;}
 const stage=mesh([10,.2,3],[-24,.2,23.5]),mat=mesh([1.7,.006,2.6],[-29,.053,29.6]),wardrobe=mesh([.7,1,1],[12,.5,10],.2),floor=mesh([22,.05,10],[-24,.025,26]),wall=mesh([.16,3.1,10],[-35,1.55,26]),partition=mesh([.12,2.4,3.55],[18,1.2,10]);partition.userData.roomShell=true;
 scene.updateMatrixWorld(true);const before=objects.map(o=>o.matrixWorld.toArray()),zones=createRoomZones({THREE,scene});zones.adoptArchitecture();scene.updateMatrixWorld(true);
 assert.deepEqual(objects.map(o=>o.matrixWorld.toArray()),before);assert.equal(stage.parent,zones.getRoot('classroom'));assert.equal(mat.parent,zones.getRoot('classroom'));assert.equal(wardrobe.parent,zones.getRoot('bathroom'));
 for(const object of [floor,wall,partition])assert.equal(object.parent,scene);
 settle(zones,{playerPosition:[0,0,-20]});assert.equal(stage.parent.visible,false);assert.equal(floor.visible,true);assert.equal(wall.visible,true);assert.equal(partition.visible,true);assert.equal(zones.getDiagnostics().resourcesUnloaded,false);
});
test('distant offscreen interiors sleep; actual frustum and camera-inside rooms remain visible',()=>{
 const scene=new THREE.Scene(),zones=createRoomZones({THREE,scene}),camera=new THREE.PerspectiveCamera(51,1.6,.1,150);camera.position.set(0,4,-25);camera.lookAt(0,1,-29);camera.updateMatrixWorld(true);
 let state=settle(zones,{playerPosition:[0,0,-20],camera});assert.equal(state.classroom.visible,false);assert.equal(state.bathroom.visible,false);
 camera.position.set(-23,5,18);camera.lookAt(-24,1,26);state=zones.evaluate({playerPosition:[0,0,-20],camera,dt:.05});assert.equal(state.classroom.visible,true);assert.equal(state.classroom.reason,'camera-view');
 state=zones.evaluate({playerPosition:[0,0,-20],cameraPosition:[19,2,16],dt:.05});assert.equal(state.bathroom.visible,true);assert.equal(state.bathroom.reason,'camera-inside');
});
test('doorway prewarm and visibility hysteresis do not flicker at the activation boundary',()=>{
 const zones=createRoomZones({THREE,scene:new THREE.Scene()});settle(zones,{playerPosition:[0,0,-20]});
 let s=zones.evaluate({playerPosition:[-11.8,.035,26.8],dt:.05});assert.equal(s.classroom.visible,true);assert.equal(s.classroom.reason,'doorway-near');
 s=settle(zones,{playerPosition:[-10.4,0,26.8]},.5);assert.equal(s.classroom.visible,true);assert.equal(s.classroom.reason,'visibility-hysteresis');
 s=settle(zones,{playerPosition:[-10.4,0,26.8]},.5);assert.equal(s.classroom.visible,false);assert.equal(s.classroom.state,'prewarm');assert.equal(s.classroom.resident,true);
});
test('every bathroom and class activity is forced active throughout approach and return without depending on camera',()=>{
 const zones=createRoomZones({THREE,scene:new THREE.Scene()});for(const id of ['sauna','steam-room','cold-plunge','shower-1','shower-2','toilet-1','toilet-2','group-class','class-cycle','class-barbell','class-pilates']){
  settle(zones,{playerPosition:[0,0,-20]});const room=roomForStation(id),s=zones.evaluate({playerPosition:[0,0,-20],activeStationId:id,dt:0});assert.equal(s[room].state,'active',id);assert.equal(s[room].visible,true,id);assert.equal(s[room].updating,true,id);
 }assert.equal(roomForStation('inbody'),null);assert.equal(distanceToRoom([14,0,7],ROOM_ZONES.bathroom),1);
});
test('debug A/B bypass activates both rooms without changing selected child visibility or transform',()=>{
 const scene=new THREE.Scene(),zones=createRoomZones({THREE,scene}),program=new THREE.Group();scene.add(program);program.visible=false;program.position.set(-24,.056,26.8);zones.registerRoot('classroom',program);const p=program.position.toArray();
 settle(zones,{playerPosition:[0,0,-20]});zones.setEnabled(false);for(const room of Object.values(zones.getActivity())){assert.equal(room.visible,true);assert.equal(room.updating,true);assert.equal(room.state,'unmanaged');}assert.equal(program.visible,false);assert.deepEqual(program.position.toArray(),p);
});
test('real architecture keeps all collision data while dormant bath effects freeze and resume from the same phase',()=>{
 const h=makeArchitecture(),a=h.architecture;try{
  a.update(0,0);const before=JSON.stringify({world:a.getWorldCollisionVolumes(),colliders:h.colliders}),zones=a.roomZones;settle(zones,{playerPosition:[0,0,-20]});
  const start=a.getDiagnostics().bathEffects;for(let i=1;i<=80;i++)a.update(i*.05,.05);const asleep=a.getDiagnostics().bathEffects;assert.equal(asleep.elapsed,start.elapsed);assert.equal(asleep.updated,start.updated);assert.equal(asleep.skipped-start.skipped,80);assert.equal(JSON.stringify({world:a.getWorldCollisionVolumes(),colliders:h.colliders}),before);
  a.updateRoomState({playerPosition:[19,0,16],dt:.05});a.update(4.05,.05);const awake=a.getDiagnostics().bathEffects;assert.equal(awake.elapsed,start.elapsed+.05);assert.equal(awake.updated,start.updated+1);assert.ok(zones.getDiagnostics().rooms.bathroom.adoptedMeshes>50);
 }finally{h.dispose();}
});
test('resident parking removes dormant bone trees from render-scene matrix traversal and reattaches before first reveal',()=>{
 const scene=new THREE.Scene(),zones=createRoomZones({THREE,scene}),program=new THREE.Group(),bone=new THREE.Bone();program.add(bone);program.position.set(-24,.056,26.8);scene.add(program);zones.registerRoot('classroom',program);
 let matrixVisits=0;const update=bone.updateMatrixWorld;bone.updateMatrixWorld=function(...args){matrixVisits++;return update.apply(this,args);};scene.updateMatrixWorld(true);assert.ok(matrixVisits>0);
 settle(zones,{playerPosition:[0,0,-20]});assert.equal(zones.getActivity().classroom.parked,true);assert.equal(zones.getActivity().classroom.attachedToRenderScene,false);matrixVisits=0;for(let i=0;i<80;i++)scene.updateMatrixWorld(true);assert.equal(matrixVisits,0);
 const state=zones.evaluate({playerPosition:[-11.8,0,26.8],dt:0});assert.equal(state.classroom.attachedToRenderScene,true);assert.equal(state.classroom.parked,false);scene.updateMatrixWorld(true);assert.ok(matrixVisits>0);assert.equal(zones.getRoot('classroom').parent,scene);
});
test('parking preserves transformed scene and nested-source world coordinates, including late programs and inspection reparenting',()=>{
 const outer=new THREE.Group(),scene=new THREE.Scene();outer.position.set(7,2,-3);outer.rotation.y=.37;outer.scale.setScalar(1.2);outer.add(scene);scene.position.set(-2,.5,1);scene.rotation.y=-.19;
 const zones=createRoomZones({THREE,scene}),source=new THREE.Group(),program=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.5,.8,.3),new THREE.MeshBasicMaterial());source.position.set(1,0,-2);source.rotation.y=.43;scene.add(source);source.add(program);program.position.set(-21,.056,28.8);program.rotation.y=.29;program.add(mesh);outer.updateMatrixWorld(true);
 const old=mesh.matrixWorld.clone();zones.registerRoot('classroom',program);outer.updateMatrixWorld(true);const registered=mesh.matrixWorld.clone();assert.ok(Math.max(...old.elements.map((v,i)=>Math.abs(v-registered.elements[i])))<1e-12);const local=program.matrix.clone();
 settle(zones,{playerPosition:[0,0,-20]});zones.getRoot('classroom').updateWorldMatrix(true,true);assert.deepEqual(mesh.matrixWorld.toArray(),registered.toArray());assert.deepEqual(program.matrix.toArray(),local.toArray());
 const late=new THREE.Group();late.position.set(-19,.056,26.8);late.rotation.y=Math.PI;scene.add(late);outer.updateMatrixWorld(true);const lateWorld=late.matrixWorld.clone();zones.registerRoot('classroom',late);late.updateWorldMatrix(true,false);assert.deepEqual(late.matrixWorld.toArray(),lateWorld.toArray());assert.equal(late.parent.parent.userData.roomResidentCache,true);
 // Pose inspection temporarily owns a visual root and restores its old room
 // parent; a parked room can remain outside the rendering scene throughout.
 const previous=program.parent,review=new THREE.Scene();review.add(program);review.updateMatrixWorld(true);previous.add(program);program.updateWorldMatrix(true,true);assert.deepEqual(mesh.matrixWorld.toArray(),registered.toArray());
 zones.evaluate({playerPosition:[-24,0,26.8],dt:0});outer.updateMatrixWorld(true);assert.deepEqual(mesh.matrixWorld.toArray(),registered.toArray());assert.deepEqual(late.matrixWorld.toArray(),lateWorld.toArray());assert.equal(zones.getRoot('classroom').parent,scene);
});
