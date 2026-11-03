import test from 'node:test';
import assert from 'node:assert/strict';
import {performanceProtocolV019 as protocol,harnessFilesV019,statisticsV019,summarizeFramesV019,validateRunV019,compareRunsV019,sampledDistanceV019,changedHashesV019,npcPoseSnapshotV019,validateNpcPoseSnapshotV019} from '../scripts/performance-common-v019.mjs';

// Synthetic protocol fixtures only. These tests do not generate hardware evidence.
const copy=value=>structuredClone(value),digest='a'.repeat(64);
const quality={preference:'auto',active:'flow',pixelRatio:1.15,shadows:false,pixelBudget:680000},framebuffer=[449,971];
function scenarioFixture(scenario,after=false){
  const position={x:0,z:0},actors=Array.from({length:10},(_,index)=>({id:`actor-${index}`,poseUpdates:10,skippedPoseUpdates:1,...(after?{viewSkipped:index<8?1:0,viewRestores:0,viewDeferred:false}:{})})),work={npcPose:npcPoseSnapshotV019(after?{count:10,poseUpdates:100,viewSkipped:8}:null,actors),...(after?{social:{count:20,coachCount:16,poseUpdates:200,skippedPoseUpdates:90,culled:2}}:{})};
  const activity=scenario==='equipment'?{exerciseId:'dumbbell-bench-press',stage:'exercising'}:{exerciseId:null,stage:'idle'};
  const snapshot=()=>({position:copy(position),heading:0,quality:copy(quality),framebuffer:copy(framebuffer),activity:copy(activity),actors:{crowdCount:10,socialCount:after?20:7,coachCount:after?16:3,rosterCoachCount:after?16:null},work:copy(work),actorDetails:{crowd:{actors:copy(actors)}}});
  const frames=[0,2000,4000,6000,8000].map((t,index)=>({t,intervalMs:index?2000:16.7,callbackMs:after?8:10,observerMs:.2,framebuffer:copy(framebuffer),phase:index/5}));
  const telemetry=[0,4000,8000].map((t,index)=>({t,position:{x:0,z:scenario==='walking'&&index===1?1:0},quality:copy(quality),framebuffer:copy(framebuffer),work:copy(work)}));
  const result={pass:true,scenario,setup:{...snapshot(),camera:{position:[5,6,7],target:[0,1,0]},renderer:'ANGLE (Intel UHD Graphics, D3D11)',contextAttributes:{antialias:false},emulation:{width:390,height:844,devicePixelRatio:3,coarsePointer:true,hoverNone:true,maxTouchPoints:1}},before:snapshot(),after:snapshot(),raw:{requestedMs:8000,elapsedMs:8000,detected:{name:'frame',proof:'Named app frame callback contains recordFrameTiming.'},visibility:'visible',glWrappers:false,frames,telemetry,keys:scenario==='walking'?[{type:'keydown',key:'w'},{type:'keydown',key:'s'}]:[]},...summarizeFramesV019(frames),socialCounterAvailability:after,movement:{route:scenario==='walking'?['w','s','w','s']:[],sampledDistance:0},errors:[]};
  result.before.epoch='before-diagnostic-settle';result.before.snapshotStartedAt=1000;result.before.snapshotCompletedAt=1010;
  result.measurementStart={epoch:'after-diagnostic-settle-before-arming',snapshotStartedAt:3010,snapshotCompletedAt:3011,position:copy(position),heading:0,quality:copy(quality),framebuffer:copy(framebuffer),activity:copy(activity),work:copy(work)};
  result.after.epoch='after-measurement';result.after.snapshotStartedAt=12000;result.after.snapshotCompletedAt=12010;
  result.diagnosticSettling={seconds:2,observedGapMs:2000};
  result.movement.sampledDistance=sampledDistanceV019(result);return result;
}
function runFixture(name,index=0,cpuRate=1){
  const after=name.startsWith('after'),sourceHashes={'src/world-controller.js':after?'b'.repeat(64):digest},harnessHashes=Object.fromEntries(harnessFilesV019.map(path=>[path,digest]));
  return{pass:true,name,sourceHashes,sourceHashesEnd:copy(sourceHashes),harnessHashes,harnessHashesEnd:copy(harnessHashes),rendererKind:'native',glWrappers:false,rafObserver:true,viewport:protocol.viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true,seconds:8,warmupSeconds:2,diagnosticSettlingSeconds:2,beforeCounterEpoch:'before-diagnostic-settle',setupSimulationSeconds:15,profile:'auto',cpuRate,appliedCPURate:cpuRate,cdpCPUThrottleAcknowledged:true,startedAt:new Date(1700000000000+index*40000).toISOString(),completedAt:new Date(1700000030000+index*40000).toISOString(),results:protocol.scenarios.map(scenario=>scenarioFixture(scenario,after)),errors:[]};
}
const session=()=>protocol.order.map((name,index)=>runFixture(name,index));

test('v019 statistics retain every long interval and both exceedance counts',()=>{
  const result=statisticsV019([10,20,30,80]);assert.equal(result.samples,4);assert.equal(result.meanMs,35);assert.equal(result.over25Count,2);assert.equal(result.over50Count,1);assert.equal(result.over25Percent,50);assert.equal(result.over50Percent,25);assert.throws(()=>statisticsV019([10,NaN]));
});
test('v019 validates complete synthetic three-scenario runs including stationary reception',()=>{
  for(const report of session())assert.equal(validateRunV019(report),report);
  const result=compareRunsV019(session());assert.equal(result.rows.length,3);assert.equal(result.cpuRate,1);assert.equal(result.stressSimulation,false);assert.deepEqual(result.rows[2].contentTradeoff.beforeCoachCounts,[3,3]);assert.deepEqual(result.rows[2].contentTradeoff.afterCoachCounts,[16,16]);assert.equal(result.rows[2].contentTradeoff.sameActorLoad,false);
});
test('v019 CPU4 is labelled a stress simulation and cannot mix rates across versions',()=>{
  const reports=protocol.order.map((name,index)=>runFixture(name,index,4));assert.equal(compareRunsV019(reports).stressSimulation,true);reports[1].cpuRate=reports[1].appliedCPURate=1;assert.throws(()=>compareRunsV019(reports),/CPU throttle differs/);
});
test('v019 rejects fabricated summary numbers, missing terminal frames and removed raw frames',()=>{
  const report=runFixture('before-1');report.results[0].cadence.p95Ms=12;assert.throws(()=>validateRunV019(report),/does not match every raw frame/);
  const terminal=runFixture('before-1');terminal.results[0].raw.frames.pop();assert.throws(()=>validateRunV019(terminal),/terminal frame/);
  const dropped=runFixture('before-1');dropped.results[0].raw.frames.splice(2,1);assert.throws(()=>validateRunV019(dropped),/timestamp delta/);
});
test('v019 rejects incomplete ABBA, software rendering, camera drift and source edits',()=>{
  assert.throws(()=>compareRunsV019(session().slice(0,3)),/Complete sequential ABBA/);
  const software=runFixture('before-1');software.results[0].setup.renderer='ANGLE SwiftShader';assert.throws(()=>validateRunV019(software),/native GPU/);
  const camera=session();camera[1].results[2].setup.camera.position[0]++;assert.throws(()=>compareRunsV019(camera),/camera framing/);
  const edited=runFixture('before-1');edited.sourceHashesEnd['src/world-controller.js']='c'.repeat(64);assert.throws(()=>validateRunV019(edited),/changed during/);
});
test('v019 records missing old social counters explicitly instead of reporting zero updates',()=>{
  const baseline=runFixture('before-1');assert.equal(baseline.results[0].socialCounterAvailability,false);baseline.results[0].socialCounterAvailability=true;assert.throws(()=>validateRunV019(baseline),/unsupported baseline social counters/);
});
test('v019 fingerprints all measurement/analysis scripts without old harness dependencies',()=>{
  assert.deepEqual(harnessFilesV019.slice(0,3),['scripts/benchmark-play-v019.mjs','scripts/compare-performance-v019.mjs','scripts/performance-common-v019.mjs']);assert.equal(harnessFilesV019.some(path=>/v016|v018/.test(path)),false);assert.deepEqual(changedHashesV019({a:'1',b:'2'},{a:'1',b:'3',c:'4'}),['b','c']);
});
test('v019 old-world schema derives only real actor counters without fabricating new view counters',()=>{
  const actors=[{id:'member-1',poseUpdates:345,skippedPoseUpdates:707},{id:'member-2',poseUpdates:123,skippedPoseUpdates:45}],counter=npcPoseSnapshotV019(undefined,actors);
  assert.deepEqual(counter,{source:'crowd-actor-sum',count:2,poseUpdates:468,skippedPoseUpdates:752});assert.equal('viewSkipped'in counter,false);assert.equal('deferred'in counter,false);
  assert.equal(validateNpcPoseSnapshotV019({work:{npcPose:counter},actorDetails:{crowd:{actors}}}).poseUpdates,468);
  assert.throws(()=>validateNpcPoseSnapshotV019({work:{npcPose:{...counter,viewSkipped:0}},actorDetails:{crowd:{actors}}}),/aggregate differs/);
  assert.throws(()=>validateNpcPoseSnapshotV019({work:{npcPose:{...counter,poseUpdates:469}},actorDetails:{crowd:{actors}}}),/aggregate differs/);
});
test('v019 direct world NPC diagnostics retain their provenance and must agree with actual actors',()=>{
  const actors=[{poseUpdates:8,skippedPoseUpdates:2,viewSkipped:1,viewRestores:3,viewDeferred:true}],direct={count:1,poseUpdates:8,viewSkipped:1,viewRestores:3,deferred:1},counter=npcPoseSnapshotV019(direct,actors);
  assert.equal(counter.source,'world-direct-npcPose');assert.equal('skippedPoseUpdates'in counter,false);assert.equal(validateNpcPoseSnapshotV019({work:{npcPose:counter},actorDetails:{crowd:{actors}}}),counter);assert.throws(()=>validateNpcPoseSnapshotV019({work:{npcPose:{...counter,viewSkipped:2}},actorDetails:{crowd:{actors}}}),/aggregate differs/);
});
test('v019 requires two real settling seconds after heavy diagnostics and explicit counter epochs',()=>{
  const missing=runFixture('before-1');delete missing.diagnosticSettlingSeconds;assert.throws(()=>validateRunV019(missing),/diagnostic settling duration/);
  const short=runFixture('before-1');short.results[0].measurementStart.snapshotStartedAt=1510;short.results[0].diagnosticSettling.observedGapMs=500;assert.throws(()=>validateRunV019(short),/real RAF diagnostic settling/);
  const epoch=runFixture('before-1');epoch.results[0].before.epoch='measurement-start';assert.throws(()=>validateRunV019(epoch),/counter epochs were mixed/);
  const heavy=runFixture('before-1');heavy.results[0].measurementStart.actorDetails={};assert.throws(()=>validateRunV019(heavy),/cheap budget/);
});
