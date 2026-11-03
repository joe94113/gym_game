import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVisibleCanvasAnimator,measurementCanvasKey} from '../src/canvas-updates-v012.js';
import {makeArchitecture} from '../scripts/room-test-helpers.mjs';

function fixture({frontOnly=true,side=THREE.DoubleSide}={}){
  const scene=new THREE.Scene(),parent=new THREE.Group();scene.add(parent);
  const object=new THREE.Mesh(new THREE.PlaneGeometry(2,1),new THREE.MeshBasicMaterial({side}));parent.add(object);
  const camera=new THREE.PerspectiveCamera(55,1.6,.1,100);camera.position.set(0,0,5);camera.lookAt(0,0,0);
  const draws=[],content={kind:'test'},animator=createVisibleCanvasAnimator({THREE,hz:12,draw:(value,time)=>draws.push({value,time})});
  animator.add(content,object,{frontOnly,paintedTime:0});return{scene,parent,object,camera,draws,content,animator};
}

test('visible sports screens retain 12Hz content cadence and duplicate render calls do not upload twice',()=>{
  const {animator,camera,draws,content}=fixture();
  for(let i=0;i<=60;i++){animator.prepare(camera,i/60);animator.prepare(camera,i/60);}
  assert.equal(draws.length,12);assert.ok(draws.every(item=>item.value===content));
  assert.equal(draws.at(-1).time,1);assert.equal(animator.getDiagnostics().redraws,13);
});

test('offscreen screens skip all canvas work, and returning displays current global content time immediately',()=>{
  const {animator,camera,draws,object}=fixture();object.position.x=40;
  for(let i=1;i<=600;i++)animator.prepare(camera,i/60);
  assert.equal(draws.length,0);assert.equal(animator.getDiagnostics().skippedHidden,600);
  object.position.x=0;assert.equal(animator.prepare(camera,10.01),1);assert.equal(draws[0].time,10.01);
  assert.equal(animator.prepare(camera,10.02),0);assert.equal(draws.length,1);
});

test('TV housing backface and invisible ancestors skip refresh while generic double-sided displays remain supported',()=>{
  const f=fixture();f.camera.position.z=-5;f.camera.lookAt(0,0,0);
  assert.equal(f.animator.prepare(f.camera,1),0);f.camera.position.z=5;f.camera.lookAt(0,0,0);
  f.parent.visible=false;assert.equal(f.animator.prepare(f.camera,2),0);f.parent.visible=true;assert.equal(f.animator.prepare(f.camera,2),1);
  const double=fixture({frontOnly:false});double.camera.position.z=-5;double.camera.lookAt(0,0,0);assert.equal(double.animator.prepare(double.camera,1),1);
});

test('visibility follows moved parent and updated camera matrices rather than a stale previous frame',()=>{
  const f=fixture();f.parent.position.x=25;assert.equal(f.animator.prepare(f.camera,1),0);
  f.camera.position.x=25;f.camera.lookAt(25,0,0);assert.equal(f.animator.prepare(f.camera,1),1);
  f.parent.rotation.y=Math.PI;assert.equal(f.animator.prepare(f.camera,2),0);
});

test('measurement dirty key retains exact scan bar fraction and separates idle, scanning zero and completed screens',()=>{
  assert.notEqual(measurementCanvasKey(false,0),measurementCanvasKey(true,0));
  assert.notEqual(measurementCanvasKey(true,.50001),measurementCanvasKey(true,.50002));
  assert.equal(measurementCanvasKey(true,1),measurementCanvasKey(true,20));
  assert.equal(measurementCanvasKey(false,1),measurementCanvasKey(false,0));
});

test('production InBody keeps idle and complete canvas unchanged, with immediate begin/end and exact eight-second progress',()=>{
  const h=makeArchitecture(),a=h.architecture;try{
    const canvas=[...h.textures].find(texture=>texture.name==='inbody-display');assert.ok(canvas);
    const initial=canvas.version;
    for(let i=1;i<=120;i++)a.update(i/60,1/60);
    assert.equal(canvas.version,initial);assert.equal(a.getDiagnostics().inbody.canvas.redraws,1);
    a.beginFacility('inbody');assert.equal(canvas.version,initial+1);assert.equal(a.getDiagnostics().inbody.canvas.key,'scanning:0');
    a.update(6,4);assert.equal(a.getDiagnostics().inbody.progress,.5);assert.equal(a.getDiagnostics().inbody.canvas.key,'scanning:0.5');
    const midpoint=canvas.version;a.update(6,0);assert.equal(canvas.version,midpoint);
    a.update(10,4);const complete=a.getDiagnostics().inbody;assert.equal(complete.progress,1);assert.equal(complete.complete,true);assert.match(complete.report.label,/非玩家量測/);assert.equal(complete.canvas.key,'complete');
    const completeVersion=canvas.version;for(let i=1;i<=120;i++)a.update(10+i/60,1/60);assert.equal(canvas.version,completeVersion);
    a.endFacility('inbody');assert.equal(canvas.version,completeVersion+1);assert.equal(a.getDiagnostics().inbody.canvas.key,'inactive');
    a.endFacility('inbody');assert.equal(canvas.version,completeVersion+1);
  }finally{h.dispose();}
});

test('production TV update is performed only in the render preparation path, preserving size, source time and visible animation',()=>{
  const h=makeArchitecture(),a=h.architecture;try{
    const screens=[...h.textures].filter(texture=>texture.userData.dynamicCanvasKind==='sports-tv');assert.equal(screens.length,3);
    for(const texture of screens)assert.deepEqual([texture.image.width,texture.image.height],[768,432]);
    const versions=screens.map(texture=>texture.version);a.update(20,20);assert.deepEqual(screens.map(texture=>texture.version),versions);
    const camera=new THREE.PerspectiveCamera(55,1.6,.1,150);camera.position.set(-18,3.6,-22);camera.lookAt(-18,3.6,-28.7);a.prepareRender(camera);
    const d=a.getDiagnostics().canvasUpdates.sports;assert.ok(d.screens.some(screen=>screen.visible&&screen.lastDrawTime===20));assert.ok(screens.some((texture,index)=>texture.version>versions[index]));
    const stable=screens.map(texture=>texture.version);a.prepareRender(camera);assert.deepEqual(screens.map(texture=>texture.version),stable);
    camera.lookAt(-18,3.6,30);a.update(50,30);a.prepareRender(camera);const hidden=a.getDiagnostics().canvasUpdates.sports;assert.ok(hidden.skippedHidden>0);assert.equal(a.getDiagnostics().screenFrames,600);
    camera.lookAt(-18,3.6,-28.7);a.prepareRender(camera);assert.ok(a.getDiagnostics().canvasUpdates.sports.screens.some(screen=>screen.visible&&screen.lastDrawTime===50));
  }finally{h.dispose();}
});
