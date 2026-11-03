import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inertialCurlEffort,inertialCurlInfo,inertialCurlIds} from '../src/inertial-curl-v018.js';
import {activityById} from '../src/activity-catalog.js';
import {equivalentAuthoredPhase,cylinderPenetration,qualifyInertialCurl} from '../scripts/qualify-inertial-curl-v018.mjs';

test('all six IMU mappings exist in the actual activity catalog and disclose sensor-only adaptations',()=>{
 assert.deepEqual([...inertialCurlIds],['dumbbell-curl','dumbbell-hammer-curl','cable-straight-bar-curl','cable-ez-bar-curl','cable-rope-hammer-curl','machine-preacher-curl']);
 for(const id of inertialCurlIds){const activity=activityById(id),info=inertialCurlInfo(id);assert.ok(activity,id);assert.equal(activity.runtime,id.startsWith('machine-')?'machine':'rig');assert.ok(activity.muscleKeys.includes('biceps'));assert.equal(info.sourceId,'uci-wle-273');assert.equal(info.kind,'measured-imu-tempo');assert.equal(info.license,'CC BY 4.0');assert.equal(info.repetitions,2);assert.equal(info.humanApproval,false);assert.match(info.sourceLoad,/1\.25 kg.*class A/);assert.match(info.scope,/35%/);assert.match(info.scope,/Not anatomical elbow angles/);}
 assert.equal(inertialCurlInfo('dumbbell-bench-press'),null);assert.equal(inertialCurlEffort('unknown',.4),null);assert.equal(inertialCurlEffort(inertialCurlIds[0],NaN),null);assert.equal(inertialCurlEffort(inertialCurlIds[0],.4,Infinity),null);
});

test('paced source repetitions retain C1 rest/peak seams, monotone phases, distinct source cycles and bounded velocity',()=>{
 const step=1/10000,h=1e-7;let maxSlope=0,sourceCycleDifference=0;
 for(const id of inertialCurlIds)for(let cycle=0;cycle<3;cycle++){
  assert.equal(inertialCurlEffort(id,0,cycle),0);assert.equal(inertialCurlEffort(id,.44,cycle),1);assert.equal(inertialCurlEffort(id,1,cycle),0);let previous=0;
  for(let i=1;i<=10000;i++){const p=i*step,value=inertialCurlEffort(id,p,cycle);assert.ok(Number.isFinite(value)&&value>=0&&value<=1);maxSlope=Math.max(maxSlope,Math.abs(value-previous)/step);if(p<=.44)assert.ok(value>=previous-1e-10);else if(p-step>=.44)assert.ok(value<=previous+1e-10);previous=value;sourceCycleDifference=Math.max(sourceCycleDifference,Math.abs(inertialCurlEffort(id,p,0)-inertialCurlEffort(id,p,1)));}
  assert.ok(inertialCurlEffort(id,h,cycle)/h<.002);assert.ok(inertialCurlEffort(id,1-h,cycle)/h<.002);assert.ok((1-inertialCurlEffort(id,.44-h,cycle))/h<.002);assert.ok((1-inertialCurlEffort(id,.44+h,cycle))/h<.002);assert.ok(Math.abs(inertialCurlEffort(id,1-h,cycle)-inertialCurlEffort(id,h,cycle+1))<1e-8);
 }assert.ok(maxSlope<6,'phase velocity '+maxSlope);assert.ok(sourceCycleDifference>.001,'two measured repetitions must produce different pacing');
});

test('qualification uses the correct old cable hold mapping and actual solid shaft penetration, with invalid scope rejected',async()=>{
 const smooth=x=>x*x*(3-2*x);for(const id of inertialCurlIds)for(let i=0;i<=100;i++){const e=i/100,peak=id==='cable-rope-hammer-curl'?.43:.44;assert.ok(Math.abs(smooth(equivalentAuthoredPhase(id,e)/peak)-e)<1e-14);}
 assert.throws(()=>equivalentAuthoredPhase('dumbbell-curl',NaN),/Invalid/);assert.throws(()=>equivalentAuthoredPhase('dumbbell-curl',1.1),/Invalid/);
 const shaft={center:[0,0,0],axis:[1,0,0],radius:.016,halfLength:.19};assert.equal(cylinderPenetration([{position:[0,0,0]}],shaft),.016);assert.equal(cylinderPenetration([{position:[0,.016,0]}],shaft),0);assert.equal(cylinderPenetration([{position:[.3,0,0]}],shaft),0);assert.equal(cylinderPenetration([{position:[0,.2,0]}],shaft),0);
 await assert.rejects(()=>qualifyInertialCurl({ids:['not-mapped'],write:false}),/Invalid qualification/);await assert.rejects(()=>qualifyInertialCurl({ids:[],write:false}),/Invalid qualification/);
});

test('actual GLB qualification covers 3996 dense poses and remains bound to the tested current and baseline sources',()=>{
 const path=process.env.INERTIAL_CURL_REPORT||'artifacts/release-v019/inertial-curl-qualification-final.json',report=JSON.parse(readFileSync(path));assert.equal(report.pass,true,JSON.stringify(report.failures));assert.deepEqual(report.ids,[...inertialCurlIds]);assert.equal(report.cycles,3);assert.deepEqual(report.divisions,[100,120]);assert.equal(report.totalPoses,3996);assert.deepEqual(report.changedSources,[]);assert.deepEqual(report.changedBaselineSources,[]);
 const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');for(const [p,hash]of Object.entries(report.sourceHashes))assert.equal(sha(p),hash,p);for(const [p,hash]of Object.entries(report.baselineSourceHashes))assert.equal(sha('.local-tools/v018-before/'+p),hash,p);
 for(const row of report.rows){assert.equal(row.pass,true,row.id);assert.equal(row.poses,666);assert.equal(row.grids.phase101,303);assert.equal(row.grids.phase121,363);assert.equal(row.canonicalPoses,9);assert.ok(row.maxEquivalentPathDifference<1e-7);assert.ok(row.maxEquivalentSkinDifference<1e-7);assert.ok(row.maxContactError<.015);assert.ok(row.maxReachError<.015);assert.ok(row.maxBoneLengthError<1e-5);assert.ok(row.maxHandMetalDepth<=.001);assert.equal(row.muscleHighlightsRetained,true);assert.ok(row.skinSamples>0);assert.deepEqual(row.collisions,[]);assert.deepEqual(row.errors,[]);if(row.id.startsWith('dumbbell-')){assert.ok(row.handSkinSamples>0);assert.ok(row.metalCylinderSamples>=row.poses*2);}}
});
