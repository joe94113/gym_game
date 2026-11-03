import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createNavigationSearch} from '../src/navigation-search-v012.js';
import {createLegacyNavigationV012} from './fixtures/navigation-oracle-v012.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/navigation-layout-v012.json',import.meta.url))),V=point=>new THREE.Vector3(...point),points=path=>path.map(point=>point.toArray());
function pair({bounds=fixture.bounds,colliders=structuredClone(fixture.colliders),getDynamicObstacles=()=>[]}={}){const context={THREE,bounds,colliders,getDynamicObstacles};return{current:createNavigationSearch(context),legacy:createLegacyNavigationV012(context),colliders};}

test('navigation oracle is the independently sealed original implementation',()=>{
 const source=readFileSync(new URL('./fixtures/navigation-oracle-v012.mjs',import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),fixture.oracleFileSha256);assert.equal(fixture.endpoints.length,56);assert.equal(fixture.doors.length,7);assert.ok(fixture.colliders.length>50);
});

test('all 56 installed interactions retain the exact original A* points and tie order',()=>{
 const {current,legacy}=pair(),start=V([fixture.spawn.x,0,fixture.spawn.z]);
 for(const end of fixture.endpoints)assert.deepEqual(points(current.findPath(start,V(end.point))),points(legacy.findPath(start,V(end.point))),end.id);
});

test('fractional, same-cell, blocked and out-of-bounds queries preserve original routes and live collision radii',()=>{
 const context=pair({bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},colliders:[{x:.1,z:.3,hx:.55,hz:.8}]});
 for(const [a,b]of [[[-4.02,7,-3.83],[4.19,2,3.73]],[[-2.16,0,-2.08],[-2.12,4,-2.04]],[[0,0,0],[0,0,.4]],[[-4,0,-4],[7,0,0]],[[-4,0,-4],[-4,0,-4]],[[-4,0,4],[4,0,-4]]])assert.deepEqual(points(context.current.findPath(V(a),V(b))),points(context.legacy.findPath(V(a),V(b))));
 for(const radius of [.1,.34,.43,.6])for(const x of [-6,-.8,0,.7,5.36,5.35])for(const z of [-6,-1,0,1,5.35])assert.equal(context.current.blocked(x,z,radius),context.legacy.blocked(x,z,radius));
});

test('a search reads dynamic obstacles once and memoizes repeated grid tests without changing the original path',()=>{
 let reads=0;const obstacle={x:0,z:0,hx:.9,hz:.9},context=pair({bounds:{minX:-8,maxX:8,minZ:-8,maxZ:8},colliders:[],getDynamicObstacles:()=>{reads++;return[obstacle];}}),start=V([-6,0,-6]),end=V([6,0,6]);
 const original=points(context.legacy.findPath(start,end)),originalReads=reads;reads=0;const actual=points(context.current.findPath(start,end)),work=context.current.getDiagnostics().lastSearch;
 assert.deepEqual(actual,original);assert.equal(reads,1);assert.equal(work.dynamicSnapshots,1);assert.ok(originalReads>10);assert.ok(work.memoHits>10);assert.ok(work.gridQueries>work.gridCollisionChecks);assert.equal(work.gridQueries,work.gridCollisionChecks+work.memoHits);
});

test('doors and replaced dynamic equipment are invalidated between every synchronous search; live movement remains current',()=>{
 let equipment=[],seed=0x13579bdf;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;},context=pair({getDynamicObstacles:()=>equipment}),start=V([fixture.spawn.x,0,fixture.spawn.z]);
 for(let trial=0;trial<35;trial++){
  for(const door of fixture.doors)context.colliders[door.index].disabled=random()>.5;
  equipment=trial%3?[{x:-12+random()*24,z:-12+random()*24,hx:.4+random(),hz:.4+random()}]:[];
  const end=fixture.endpoints[Math.floor(random()*fixture.endpoints.length)];assert.deepEqual(points(context.current.findPath(start,V(end.point))),points(context.legacy.findPath(start,V(end.point))),`trial ${trial}: ${end.id}`);
 }
 equipment=[{x:0,z:0,hx:.5,hz:.5}];const live=pair({bounds:{minX:-4,maxX:4,minZ:-4,maxZ:4},colliders:[],getDynamicObstacles:()=>equipment});assert.equal(live.current.blocked(0,0),true);equipment=[];assert.equal(live.current.blocked(0,0),false);
 const dynamicDoor={x:0,z:0,hx:.5,hz:.5,disabled:false};equipment=[dynamicDoor];assert.equal(live.current.blocked(0,0),true);dynamicDoor.disabled=true;assert.equal(live.current.blocked(0,0),false);
});
