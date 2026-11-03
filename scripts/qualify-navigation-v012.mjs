import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createNavigationSearch} from '../src/navigation-search-v012.js';
import {createLegacyNavigationV012} from '../tests/fixtures/navigation-oracle-v012.mjs';

const files=['src/navigation-search-v012.js','src/world-controller.js','tests/fixtures/navigation-oracle-v012.mjs','tests/fixtures/navigation-layout-v012.json'],hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),sourceHashes=Object.fromEntries(files.map(path=>[path,hash(path)]));
const fixture=JSON.parse(readFileSync('tests/fixtures/navigation-layout-v012.json','utf8')),colliders=structuredClone(fixture.colliders),V=point=>new THREE.Vector3(...point),points=path=>path.map(point=>point.toArray()),results=[];
let equipment=[],reads=0;const context={THREE,bounds:fixture.bounds,colliders,getDynamicObstacles:()=>{reads++;return equipment;}},current=createNavigationSearch(context),legacy=createLegacyNavigationV012(context),start=V([fixture.spawn.x,0,fixture.spawn.z]);
function compare(id,end){reads=0;const expected=points(legacy.findPath(start,end)),beforeReads=reads;reads=0;const actual=points(current.findPath(start,end)),afterReads=reads;assert.deepEqual(actual,expected,id);results.push({id,exact:true,points:actual.length,beforeDynamicReads:beforeReads,afterDynamicReads:afterReads,work:current.getDiagnostics().lastSearch});}
for(const end of fixture.endpoints)compare(end.id,V(end.point));
let seed=0x13579bdf;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let trial=0;trial<35;trial++){
 for(const door of fixture.doors)colliders[door.index].disabled=random()>.5;
 equipment=trial%3?[{x:-12+random()*24,z:-12+random()*24,hx:.4+random(),hz:.4+random()}]:[];
 const end=fixture.endpoints[Math.floor(random()*fixture.endpoints.length)];compare(`door-equipment-${trial}-${end.id}`,V(end.point));
}
const changedSources=files.filter(path=>sourceHashes[path]!==hash(path)),report={pass:!changedSources.length&&results.every(result=>result.exact),sourceHashes,changedSources,scope:'Exact waypoint-array comparison to verbatim sealed v0.11 A*. All 56 real installed interactions plus 35 seeded door/equipment variations use actual CPU-captured architecture/equipment footprint data (125 colliders, seven doors). No algorithm/order/radius/step changes, no animation or collision sampling reductions, no GPU/FPS result.',counts:{realInteractions:56,doorEquipmentVariations:35,exactRoutes:results.length,colliders:colliders.length,doors:fixture.doors.length},work:{beforeDynamicReads:results.reduce((n,r)=>n+r.beforeDynamicReads,0),afterDynamicReads:results.reduce((n,r)=>n+r.afterDynamicReads,0),gridQueries:results.reduce((n,r)=>n+r.work.gridQueries,0),gridCollisionChecks:results.reduce((n,r)=>n+r.work.gridCollisionChecks,0),memoHits:results.reduce((n,r)=>n+r.work.memoHits,0)},originalControllerSha256:fixture.oracleControllerSha256,results};
mkdirSync('artifacts/navigation-v012',{recursive:true});writeFileSync('artifacts/navigation-v012/qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,counts:report.counts,work:report.work,changedSources}));if(!report.pass)process.exitCode=1;
