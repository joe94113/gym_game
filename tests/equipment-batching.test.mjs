import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createEquipmentBatcher} from '../src/equipment-batching.js';

function fixture(options={}){
 const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(.5,.5,.5),material=new THREE.MeshStandardMaterial(),machines=new Map(),sources=[];
 for(let i=0;i<3;i++){const group=new THREE.Group();group.position.set(i*2,0,0);scene.add(group);const pivot=new THREE.Group();group.add(pivot);for(let j=0;j<2;j++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(j*.75,1,0);pivot.add(mesh);sources.push(mesh);}machines.set(String(i),{group,type:'chestPress',station:{id:String(i)}});}
 scene.updateMatrixWorld(true);const batcher=createEquipmentBatcher({THREE,scene,machines,...options});return{scene,geometry,material,machines,sources,batcher};
}
test('byte-identical repeated equipment uses instances while all original graph and geometry stay intact',()=>{
 const f=fixture(),records=f.batcher.getInspectionRecords();assert.equal(records.length,6);assert.equal(f.batcher.getDiagnostics().proxyCount,1);assert.equal(f.batcher.getDiagnostics().potentialSavedCalls,5);
 for(const r of records){assert.equal(r.source.layers.mask,0);assert.equal(r.source.geometry,f.geometry);assert.ok(r.source.parent);assert.ok(r.source.visible);const actual=new THREE.Matrix4();r.proxy.getMatrixAt(r.instanceIndex,actual);for(let i=0;i<16;i++)assert.ok(Math.abs(actual.elements[i]-r.source.matrixWorld.elements[i])<1e-6);}
 f.batcher.setEnabled(false);for(const source of f.sources)assert.equal(source.layers.mask,1);assert.equal(records[0].proxy.visible,false);f.batcher.setEnabled(true);assert.equal(records[0].proxy.count,6);f.batcher.dispose();
});
test('moving ancestors and independent source/root visibility update instances without changing animation nodes',()=>{
 const f=fixture();const machine=f.machines.get('0');machine.group.children[0].rotation.y=.4;machine.group.children[0].position.y=.3;f.sources[1].visible=false;f.machines.get('1').group.visible=false;f.batcher.update();assert.equal(f.batcher.getDiagnostics().visibleInstances,3);
 for(const r of f.batcher.getInspectionRecords().filter(r=>r.instanceIndex>=0)){const actual=new THREE.Matrix4();r.proxy.getMatrixAt(r.instanceIndex,actual);for(let i=0;i<16;i++)assert.ok(Math.abs(actual.elements[i]-r.source.matrixWorld.elements[i])<2e-6);}
 assert.equal(f.sources[0].parent,machine.group.children[0]);assert.equal(f.sources[1].visible,false);f.batcher.dispose();
});
test('replaceable plates, transparent or skinned geometry and distinct material instances are excluded or separated',()=>{
 const f=fixture({enabled:false}),group=f.machines.get('0').group;f.batcher.dispose();const load=new THREE.Group();load.userData.loadable=true;group.add(load);for(let i=0;i<2;i++)load.add(new THREE.Mesh(f.geometry,f.material));const glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.5});const glassMesh=new THREE.Mesh(f.geometry,glass);group.add(glassMesh);const different=new THREE.Mesh(f.geometry,f.material.clone());group.add(different);const skin=new THREE.SkinnedMesh(f.geometry,f.material);group.add(skin);
 const b=createEquipmentBatcher({THREE,scene:f.scene,machines:f.machines});assert.equal(b.getInspectionRecords().length,6);for(const o of [...load.children,glassMesh,different,skin])assert.equal(o.layers.mask,1);b.dispose();
});
test('12 metre spatial cells keep separate proxy bounds and camera culling compacts exact visible sources',()=>{
 const f=fixture();f.batcher.dispose();f.machines.get('2').group.position.x=30;const b=createEquipmentBatcher({THREE,scene:f.scene,machines:f.machines,cellSize:12});assert.equal(b.getDiagnostics().proxyCount,2);
 const camera=new THREE.PerspectiveCamera(35,1,.1,50);camera.position.set(0,1,5);camera.lookAt(0,1,0);camera.updateMatrixWorld();b.update({camera,shadows:false});const wanted=f.sources.filter(o=>{const s=o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld),frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));return frustum.intersectsSphere(s);});assert.equal(b.getDiagnostics().visibleInstances,wanted.length);assert.ok(b.getDiagnostics().frustumCulledInstances>0);
 b.update({camera,shadows:true});assert.equal(b.getDiagnostics().visibleInstances,6,'off-camera shadow casters must be retained when shadows are enabled');b.dispose();
});
test('isolated review temporarily restores original layers and does not move or duplicate equipment',()=>{
 const f=fixture(),root=f.machines.get('0').group,originalParent=root.parent,release=f.batcher.suspendRoots([root]);for(const r of f.batcher.getInspectionRecords().filter(r=>r.root===root))assert.equal(r.source.layers.mask,1);
 const review=new THREE.Scene();review.add(root);f.batcher.update();assert.equal(f.batcher.getDiagnostics().visibleInstances,4);assert.equal(root.parent,review);originalParent.add(root);release();release();f.batcher.update();assert.equal(f.batcher.getDiagnostics().visibleInstances,6);for(const source of f.sources)assert.equal(source.layers.mask,0);f.batcher.dispose();
});
test('render hook uses already-updated matrices and rays return the original fixture object exactly once',()=>{
 const f=fixture();const ray=new THREE.Raycaster(new THREE.Vector3(0,1,4),new THREE.Vector3(0,0,-1));f.scene.onBeforeRender({shadowMap:{enabled:false}},f.scene,new THREE.PerspectiveCamera());f.batcher.update();const hits=ray.intersectObject(f.scene,true);assert.ok(hits.length);assert.ok(hits.every(hit=>f.sources.includes(hit.object)));
 f.batcher.setEnabled(false);const plain=ray.intersectObject(f.scene,true);assert.equal(plain.length,hits.length);for(let i=0;i<hits.length;i++){assert.equal(hits[i].object,plain[i].object);assert.equal(hits[i].distance,plain[i].distance);}f.batcher.dispose();
});
test('unexpected geometry/material changes fall back to the authoritative original mesh and disposal restores renderer hook',()=>{
 const f=fixture(),before=f.scene.onBeforeRender,source=f.sources[0];source.material=source.material.clone();f.batcher.update();assert.equal(f.batcher.getDiagnostics().fallbacks,1);assert.equal(source.layers.mask,1);assert.equal(f.batcher.getDiagnostics().visibleInstances,5);f.batcher.dispose();assert.notEqual(f.scene.onBeforeRender,before);for(const o of f.sources)assert.equal(o.layers.mask,1);assert.ok(!f.scene.children.some(o=>o.userData.equipmentBatchProxy));
});
test('raycaster preserves Three.js default intersections with hidden meshes and roots too',()=>{
 const f=fixture();f.sources[0].visible=false;f.machines.get('0').group.visible=false;f.batcher.update();const ray=new THREE.Raycaster(new THREE.Vector3(0,1,4),new THREE.Vector3(0,0,-1)),enabled=ray.intersectObject(f.scene,true);f.batcher.setEnabled(false);const disabled=ray.intersectObject(f.scene,true);assert.equal(enabled.length,disabled.length);for(let i=0;i<enabled.length;i++){assert.equal(enabled[i].object,disabled[i].object);assert.equal(enabled[i].distance,disabled[i].distance);}f.batcher.dispose();
});
test('one to two to one visible sources switches originals and instances without duplicate rays or lost capture layers',()=>{
 const f=fixture(),chosen=f.sources.slice(0,2);for(const source of f.sources)source.visible=chosen.includes(source);chosen[1].visible=false;f.batcher.update();let d=f.batcher.getDiagnostics();assert.equal(d.visibleOriginals,1);assert.equal(d.liveProxyCount,0);assert.equal(chosen[0].layers.mask,1);assert.equal(f.batcher.getInspectionRecords().find(r=>r.source===chosen[0]).renderMode,'original');
 const ray=new THREE.Raycaster(new THREE.Vector3(0,1,4),new THREE.Vector3(0,0,-1)),oneHits=ray.intersectObject(f.scene,true);chosen[1].visible=true;f.batcher.update();d=f.batcher.getDiagnostics();assert.equal(d.visibleOriginals,0);assert.equal(d.instancedVisibleCount,2);assert.equal(d.liveProxyCount,1);assert.equal(chosen[0].layers.mask,0);assert.equal(ray.intersectObject(f.scene,true).length,oneHits.length);
 chosen[1].visible=false;f.batcher.update();assert.equal(chosen[0].layers.mask,1);assert.equal(f.batcher.getDiagnostics().visibleOriginals,1);assert.equal(ray.intersectObject(f.scene,true).length,oneHits.length);const release=f.batcher.suspendRoots([f.machines.get('0').group]);release();assert.equal(chosen[0].layers.mask,1);f.batcher.setEnabled(false);assert.equal(ray.intersectObject(f.scene,true).length,oneHits.length);f.batcher.dispose();
});
test('unchanged Float32 matrices avoid upload marks and bounds work; moving, reorder and singleton restoration never miss GPU data',()=>{
 const f=fixture(),records=f.batcher.getInspectionRecords(),proxy=records[0].proxy,initialVersion=proxy.instanceMatrix.version,initialBounds=f.batcher.getDiagnostics().boundsRecomputations;
 let gpu=proxy.instanceMatrix.array.slice(),gpuVersion=initialVersion;
 const check=()=>{if(proxy.instanceMatrix.version!==gpuVersion){gpu=proxy.instanceMatrix.array.slice();gpuVersion=proxy.instanceMatrix.version;}for(const r of f.batcher.getInspectionRecords())if(r.instanceIndex>=0){const offset=r.instanceIndex*16;for(let i=0;i<16;i++)assert.equal(gpu[offset+i],Math.fround(r.source.matrixWorld.elements[i]),'GPU-backed matrix must match the rendered source');}};
 for(let i=0;i<4;i++)f.batcher.update();assert.equal(proxy.instanceMatrix.version,initialVersion);assert.equal(f.batcher.getDiagnostics().boundsRecomputations,initialBounds);assert.equal(f.batcher.getDiagnostics().matrixUpdatesLastFrame,0);assert.equal(f.batcher.getDiagnostics().boundsUpdatesLastFrame,0);check();
 f.sources[0].position.x+=.123;f.batcher.update();assert.ok(proxy.instanceMatrix.version>initialVersion);assert.equal(f.batcher.getDiagnostics().matrixUpdatesLastFrame,1);check();
 f.sources[0].visible=false;f.batcher.update();check();f.sources[0].visible=true;f.batcher.update();check();
 for(let i=1;i<f.sources.length;i++)f.sources[i].visible=false;f.batcher.update();const singletonVersion=proxy.instanceMatrix.version;assert.equal(proxy.visible,false);f.sources[0].position.x+=.44;f.batcher.update();assert.equal(proxy.instanceMatrix.version,singletonVersion,'original singleton must not silently change the GPU-backed array');
 f.sources[1].position.z+=.23;f.sources[1].visible=true;f.batcher.update();assert.equal(proxy.count,2);assert.ok(proxy.instanceMatrix.version>singletonVersion);check();
 const settledVersion=proxy.instanceMatrix.version,settledBounds=f.batcher.getDiagnostics().boundsRecomputations;f.batcher.update();assert.equal(proxy.instanceMatrix.version,settledVersion);assert.equal(f.batcher.getDiagnostics().boundsRecomputations,settledBounds);check();f.batcher.dispose();
});
