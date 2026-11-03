import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createGroupClassSystem} from '../src/classes/group-class-system.js';
import {receptionSceneAnchors} from '../src/reception-scenes.js';
import {facilityStations} from '../src/gym-layout.js';
import {createNavigationSearch} from '../src/navigation-search-v012.js';

// CPU reproduction of the real class-system obstacle snapshots. Keep the
// actual program visible after exit, as production does; do not hide it just
// to obtain a route. Static room/machine colliders are the sealed layout.
export function aerialNavigationRoundTrip(metrics){
 const layout=JSON.parse(readFileSync(new URL('../tests/fixtures/navigation-layout-v012.json',import.meta.url))),station=facilityStations.find(station=>station.id==='group-class'),placement=station.setup;
 const system=createGroupClassSystem({THREE,scene:new THREE.Scene(),metrics,station,architecture:{getSceneAnchors:()=>receptionSceneAnchors,getWorldCollisionVolumes:()=>[],roomZones:{registerRoot:(_,root)=>root}}});
 const navigation=createNavigationSearch({THREE,bounds:layout.bounds,colliders:layout.colliders,getDynamicObstacles:()=>system.getNavigationObstacles()}),toWorld=point=>new THREE.Vector3(...point).applyAxisAngle(new THREE.Vector3(0,1,0),placement.rotation||0).add(new THREE.Vector3(...placement.origin)),gate=toWorld(system.getLifecycle('class-aerial').gateOffset),spawn=new THREE.Vector3(layout.spawn.x,0,layout.spawn.z),chest=new THREE.Vector3(...layout.endpoints.find(endpoint=>endpoint.id==='chest-press').point);
 const entry=navigation.findPath(spawn,gate).map(point=>point.toArray());
 system.prepare('class-aerial');for(let i=0;i<700;i++)system.update(.05,{active:false});system.sampleLifecycle('class-aerial','exit',1);system.end();
 const obstacleCount=system.getNavigationObstacles().length,exit=navigation.findPath(gate,chest).map(point=>point.toArray()),exitDiagnostics=navigation.getDiagnostics(),cohort=system.getDiagnostics().npcs;
 return{gate:gate.toArray(),entry,exit,obstacleCount,cohort,exitDiagnostics};
}
