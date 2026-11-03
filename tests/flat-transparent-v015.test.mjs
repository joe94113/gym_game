import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {optimizeFlatTransparentPlanes} from '../src/flat-transparent-v015.js';
const material=()=>new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide});
test('unmodified shared basic planes keep both sides while removing the redundant pass',()=>{
 const scene=new THREE.Scene(),m=material();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(),m),new THREE.Mesh(new THREE.PlaneGeometry(2,3),m));
 const result=optimizeFlatTransparentPlanes({THREE,scene});assert.equal(result.materialCount,1);assert.equal(result.planeCount,2);assert.equal(m.forceSinglePass,true);assert.equal(m.side,THREE.DoubleSide);
});
test('a material shared by a volumetric mesh is not changed',()=>{
 const scene=new THREE.Scene(),m=material();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(),m),new THREE.Mesh(new THREE.BoxGeometry(),m));assert.equal(optimizeFlatTransparentPlanes({THREE,scene}).materialCount,0);assert.equal(m.forceSinglePass,false);
});
test('bent planes, custom shaders and lit surfaces retain their original two-pass policy',()=>{
 const scene=new THREE.Scene(),bent=new THREE.PlaneGeometry();bent.attributes.position.setZ(0,.1);
 const custom=material();custom.onBeforeCompile=()=>{};const lit=new THREE.MeshStandardMaterial({transparent:true,side:THREE.DoubleSide});
 scene.add(new THREE.Mesh(bent,material()),new THREE.Mesh(new THREE.PlaneGeometry(),custom),new THREE.Mesh(new THREE.PlaneGeometry(),lit));assert.equal(optimizeFlatTransparentPlanes({THREE,scene}).materialCount,0);
});
