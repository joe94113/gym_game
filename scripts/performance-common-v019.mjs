import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

export const performanceProtocolV019={version:19,revision:'post-diagnostic-settle',order:['before-1','after-1','after-2','before-2'],scenarios:['walking','equipment','reception'],viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,seconds:8,warmupSeconds:2,diagnosticSettlingSeconds:2,beforeCounterEpoch:'before-diagnostic-settle',setupSimulationSeconds:15,profile:'auto',cpuRates:[1,4]};
export const harnessFilesV019=['scripts/benchmark-play-v019.mjs','scripts/compare-performance-v019.mjs','scripts/performance-common-v019.mjs','playwright.config.js','tests/vite-client-shim.js'];
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
export const changedHashesV019=(before,after)=>[...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].filter(key=>before?.[key]!==after?.[key]);
export const hashHarnessV019=()=>Object.fromEntries(harnessFilesV019.map(path=>[path,sha(path)]));
export function hashSourcesV019(root=''){
  const paths=[];
  function collect(directory,include){if(!existsSync(join(root,directory)))return;for(const entry of readdirSync(join(root,directory),{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())collect(path,include);else if(entry.isFile()&&include(path))paths.push(path);}}
  collect('src',path=>/\.(?:js|mjs|css|svg|json)$/.test(path));collect('site',path=>/\.(?:js|mjs|css|svg|json)$/.test(path));collect('public',()=>true);
  // Server/account data is outside this browser benchmark and is never traversed.
  for(const path of ['package.json','package-lock.json','vite.config.js','index.html'])if(existsSync(join(root,path)))paths.push(path);
  return Object.fromEntries(paths.sort().map(path=>[path,sha(join(root,path))]));
}
const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const hardwareRendererV019=value=>typeof value==='string'&&!!value&&!/swiftshader|llvmpipe|lavapipe|software|basic render/i.test(value);
export function statisticsV019(values,{positive=true}={}){
  requireValue(Array.isArray(values)&&values.length>0&&values.every(value=>Number.isFinite(value)&&(positive?value>0:value>=0)),'Expected finite measured frame/callback values.');
  const sorted=[...values].sort((a,b)=>a-b),at=percent=>sorted[Math.floor((sorted.length-1)*percent)],over=threshold=>values.filter(value=>value>threshold).length;
  return{samples:values.length,meanMs:values.reduce((sum,value)=>sum+value,0)/values.length,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),over25Count:over(25),over50Count:over(50),over25Percent:over(25)/values.length*100,over50Percent:over(50)/values.length*100};
}
export const summarizeFramesV019=frames=>({cadence:statisticsV019(frames.map(frame=>frame.intervalMs)),callback:statisticsV019(frames.map(frame=>frame.callbackMs),{positive:false}),observer:statisticsV019(frames.map(frame=>frame.observerMs),{positive:false})});
// Also injected into the measurement page for before/after snapshots only.
// Keep this function self-contained: it must not close over module helpers.
export function npcPoseSnapshotV019(direct,actors){
  if(direct&&typeof direct==='object')return{...direct,source:'world-direct-npcPose'};
  if(!Array.isArray(actors)||!actors.every(actor=>Number.isFinite(actor.poseUpdates)))throw new Error('Actual crowd actor pose counters are unavailable.');
  const result={source:'crowd-actor-sum',count:actors.length,poseUpdates:actors.reduce((sum,actor)=>sum+actor.poseUpdates,0)};
  for(const key of ['skippedPoseUpdates','viewSkipped','viewRestores'])if(actors.every(actor=>Number.isFinite(actor[key])))result[key]=actors.reduce((sum,actor)=>sum+actor[key],0);
  if(actors.every(actor=>typeof actor.viewDeferred==='boolean'))result.deferred=actors.filter(actor=>actor.viewDeferred).length;
  return result;
}
export function validateNpcPoseSnapshotV019(sample,label='snapshot'){
  const counter=sample?.work?.npcPose,actors=sample?.actorDetails?.crowd?.actors;
  requireValue(counter&&['world-direct-npcPose','crowd-actor-sum'].includes(counter.source)&&Array.isArray(actors),`${label}: actual NPC counter provenance/actors missing.`);
  const summed=npcPoseSnapshotV019(null,actors);requireValue(counter.count===summed.count&&counter.poseUpdates===summed.poseUpdates,`${label}: NPC pose aggregate differs from actual actor counters.`);
  for(const key of ['skippedPoseUpdates','viewSkipped','viewRestores','deferred'])if(key in counter)requireValue(key in summed&&counter[key]===summed[key],`${label}: NPC ${key} aggregate differs from actual actor counters.`);
  if(counter.source==='crowd-actor-sum')requireValue(same(counter,summed),`${label}: fallback NPC counters include unsupported or invented fields.`);
  return counter;
}
function verifyStats(actual,expected,label){for(const key of Object.keys(expected))requireValue(Number.isFinite(actual?.[key])&&Math.abs(actual[key]-expected[key])<1e-8,`${label}: ${key} does not match every raw frame.`);}
function validBudget(sample,label){const quality=sample?.quality;requireValue(quality?.preference==='auto'&&['balanced','flow'].includes(quality.active)&&Number.isFinite(quality.pixelRatio)&&quality.pixelRatio>0&&typeof quality.shadows==='boolean',`${label}: actual auto-quality budget missing.`);requireValue(Array.isArray(sample.framebuffer)&&sample.framebuffer.length===2&&sample.framebuffer.every(value=>Number.isInteger(value)&&value>0),`${label}: actual framebuffer missing.`);}
export function sampledDistanceV019(result){const path=[result.before.position,...result.raw.telemetry.map(sample=>sample.position),result.after.position];requireValue(path.every(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.z)),'Missing measured player positions.');return path.reduce((total,point,index)=>index?total+Math.hypot(point.x-path[index-1].x,point.z-path[index-1].z):0,0);}
export function validateRunV019(report){
  requireValue(report.pass===true&&!report.errors?.length,`${report.name}: run has errors.`);requireValue(performanceProtocolV019.order.includes(report.name),'Unknown ABBA run label.');
  requireValue(report.rendererKind==='native'&&report.glWrappers===false&&report.rafObserver===true,'Native rendering with an explicitly declared RAF observer is required.');
  requireValue(same(report.viewport,performanceProtocolV019.viewport)&&report.deviceScaleFactor===3&&report.isMobile===true&&report.hasTouch===true,'Mobile capability emulation differs from the protocol.');
  requireValue(report.seconds===8&&report.warmupSeconds===2&&report.diagnosticSettlingSeconds===2&&report.beforeCounterEpoch==='before-diagnostic-settle'&&report.setupSimulationSeconds===15&&report.profile==='auto','Measurement/setup/diagnostic settling duration or quality differs from the protocol.');
  requireValue([1,4].includes(report.cpuRate),'CPU rate must be 1 or 4.');requireValue(report.cpuRate===report.appliedCPURate&&report.cdpCPUThrottleAcknowledged===true,'CDP throttle request was not acknowledged as applied.');
  requireValue(Object.keys(report.sourceHashes||{}).length>0&&Object.keys(report.harnessHashes||{}).length===harnessFilesV019.length,'Source/harness fingerprints missing.');
  requireValue(!changedHashesV019(report.sourceHashes,report.sourceHashesEnd).length&&!changedHashesV019(report.harnessHashes,report.harnessHashesEnd).length,'Source or measurement/analysis scripts changed during a run.');
  requireValue(Number.isFinite(Date.parse(report.startedAt))&&Date.parse(report.completedAt)>=Date.parse(report.startedAt),'Invalid run timestamps.');
  requireValue(same(report.results?.map(result=>result.scenario),performanceProtocolV019.scenarios),'All three scenarios must be measured in the specified order.');
  for(const result of report.results){
    const label=`${report.name}/${result.scenario}`,setup=result.setup,raw=result.raw,emulation=setup?.emulation;
    requireValue(result.pass===true&&!result.errors?.length,`${label}: scenario failed.`);requireValue(hardwareRendererV019(setup?.renderer),`${label}: native GPU proof missing.`);
    requireValue(emulation?.width===390&&emulation.height===844&&emulation.devicePixelRatio===3&&emulation.coarsePointer===true&&emulation.hoverNone===true&&emulation.maxTouchPoints>0,`${label}: mobile capabilities missing.`);
    requireValue(typeof setup?.contextAttributes?.antialias==='boolean',`${label}: actual WebGL context attributes missing.`);
    requireValue(raw?.detected?.name==='frame'&&raw.detected.proof==='Named app frame callback contains recordFrameTiming.'&&raw.visibility==='visible'&&raw.glWrappers===false,`${label}: actual app RAF proof missing.`);
    requireValue(raw.requestedMs===8000&&raw.elapsedMs>=8000&&raw.elapsedMs<23000,`${label}: incomplete actual RAF sample window.`);
    requireValue(raw.frames?.length>=3&&raw.telemetry?.length>=2,`${label}: raw frames/telemetry missing.`);
    for(let index=0;index<raw.frames.length;index++){const frame=raw.frames[index];requireValue(Number.isFinite(frame.t)&&frame.t>=0&&(!index||frame.t>raw.frames[index-1].t),`${label}: raw frame time order invalid.`);if(index)requireValue(Math.abs(frame.t-raw.frames[index-1].t-frame.intervalMs)<.1,`${label}: raw timestamp delta differs from interval.`);requireValue(Array.isArray(frame.framebuffer)&&frame.framebuffer.length===2&&frame.framebuffer.every(value=>Number.isInteger(value)&&value>0),`${label}: raw framebuffer missing.`);}
    requireValue(raw.frames.at(-1).t>=8000&&Math.abs(raw.frames.at(-1).t-raw.elapsedMs)<.1,`${label}: terminal frame was omitted.`);
    const summary=summarizeFramesV019(raw.frames);for(const key of ['cadence','callback','observer'])verifyStats(result[key],summary[key],`${label}/${key}`);
    for(const sample of [setup,result.before,result.measurementStart,...raw.telemetry,result.after])validBudget(sample,label);
    requireValue(result.before.epoch==='before-diagnostic-settle'&&result.measurementStart.epoch==='after-diagnostic-settle-before-arming'&&result.after.epoch==='after-measurement',`${label}: diagnostic and measurement counter epochs were mixed.`);
    requireValue(!('actorDetails'in result.measurementStart)&&!('contact'in result.measurementStart)&&!('model'in result.measurementStart),`${label}: measurementStart must remain a cheap budget/counter snapshot.`);
    const settledMs=result.measurementStart.snapshotStartedAt-result.before.snapshotCompletedAt;requireValue(Number.isFinite(settledMs)&&settledMs>=1990&&settledMs<17000&&result.diagnosticSettling?.seconds===2&&Math.abs(settledMs-result.diagnosticSettling.observedGapMs)<.1,`${label}: two-second real RAF diagnostic settling was not observed.`);
    requireValue(Number.isInteger(result.before.actors?.crowdCount)&&Number.isInteger(result.before.actors?.socialCount)&&Number.isInteger(result.before.actors?.coachCount),`${label}: actual installed actor counts missing.`);
    validateNpcPoseSnapshotV019(result.before,`${label}/before`);validateNpcPoseSnapshotV019(result.after,`${label}/after`);
    requireValue(result.socialCounterAvailability===!!result.before.work?.social,`${label}: unsupported baseline social counters must be identified rather than invented.`);
    const distance=sampledDistanceV019(result);requireValue(Math.abs(distance-result.movement?.sampledDistance)<1e-8,`${label}: movement distance does not match raw telemetry.`);
    if(result.scenario==='walking')requireValue(distance>.2&&same(result.movement.route,['w','s','w','s'])&&raw.keys.some(key=>key.type==='keydown'&&key.key==='w')&&raw.keys.some(key=>key.type==='keydown'&&key.key==='s'),`${label}: matched real W/S movement missing.`);
    if(result.scenario==='equipment')requireValue(result.before.activity?.exerciseId==='dumbbell-bench-press'&&result.after.activity?.exerciseId==='dumbbell-bench-press'&&result.raw.frames.some(frame=>frame.phase!==result.raw.frames[0].phase),`${label}: bench must keep animating naturally.`);
    if(result.scenario==='reception')requireValue(distance<1e-5&&!result.before.activity?.exerciseId&&!result.after.activity?.exerciseId,`${label}: reception observer was not stationary.`);
  }
  return report;
}
export function observedBudgetsV019(result){return[...new Map([result.setup,result.before,result.measurementStart,...result.raw.telemetry,result.after].map(sample=>{const quality=sample.quality,value={active:quality.active,pixelRatio:quality.pixelRatio,framebuffer:sample.framebuffer,pixels:sample.framebuffer[0]*sample.framebuffer[1],shadows:quality.shadows,shadowHz:quality.shadowHz??null,deviceTier:quality.deviceTier??null,pixelBudget:quality.pixelBudget??null,autoReason:quality.autoReason??null};return[JSON.stringify(value),value];})).values()];}
export function compareRunsV019(reports){
  requireValue(same(reports.map(report=>report.name),performanceProtocolV019.order),'Complete sequential ABBA session required.');reports.forEach(validateRunV019);
  const renderer=reports[0].results[0].setup.renderer,cpuRate=reports[0].cpuRate,harness=reports[0].harnessHashes;
  for(let index=1;index<reports.length;index++)requireValue(Date.parse(reports[index].startedAt)>=Date.parse(reports[index-1].completedAt),'ABBA runs overlap or are out of order.');
  for(const report of reports){requireValue(!changedHashesV019(harness,report.harnessHashes).length,'Measurement/analysis scripts differ between ABBA runs.');requireValue(report.cpuRate===cpuRate,'CPU throttle differs between versions/runs.');requireValue(report.results.every(result=>result.setup.renderer===renderer),'Native GPU differs between scenarios/runs.');}
  for(const indices of [[0,3],[1,2]])requireValue(!changedHashesV019(reports[indices[0]].sourceHashes,reports[indices[1]].sourceHashes).length,'Repeated version has different sources.');
  const rows=performanceProtocolV019.scenarios.map(scenario=>{
    const results=reports.map(report=>report.results.find(result=>result.scenario===scenario)),reference=results[0].setup;
    for(const result of results){requireValue(same(result.setup.camera,reference.camera),'Fixed camera framing differs.');requireValue(Math.hypot(result.setup.position.x-reference.position.x,result.setup.position.z-reference.position.z)<1e-6,'Initial player position differs.');requireValue(Math.abs(result.setup.heading-reference.heading)<1e-6,'Initial heading differs.');}
    const group=indices=>({runs:indices.map(index=>reports[index].name),...summarizeFramesV019(indices.flatMap(index=>results[index].raw.frames)),observedBudgets:indices.map(index=>({run:reports[index].name,contextAttributes:results[index].setup.contextAttributes,initialDefault:results[index].setup.initialDefault,budgets:observedBudgetsV019(results[index])})),actors:indices.map(index=>({run:reports[index].name,counts:results[index].before.actors,workBefore:results[index].before.work,workAtMeasurementStart:results[index].measurementStart.work,workAfter:results[index].after.work,beforeCounterEpoch:reports[index].beforeCounterEpoch,diagnosticSettling:results[index].diagnosticSettling,socialCounterAvailability:results[index].socialCounterAvailability}))});
    const before=group([0,3]),after=group([1,2]),percent=(a,b)=>a?(b-a)/a*100:null,changePercent={meanFrameMs:percent(before.cadence.meanMs,after.cadence.meanMs),p95FrameMs:percent(before.cadence.p95Ms,after.cadence.p95Ms),p99FrameMs:percent(before.cadence.p99Ms,after.cadence.p99Ms),callbackMeanMs:percent(before.callback.meanMs,after.callback.meanMs)};
    return{scenario,before,after,changePercent,observedRegression:{p95AboveFivePercent:changePercent.p95FrameMs>5,callbackAboveFivePercent:changePercent.callbackMeanMs>5},contentTradeoff:{beforeCoachCounts:before.actors.map(value=>value.counts.coachCount),afterCoachCounts:after.actors.map(value=>value.counts.coachCount),sameActorLoad:before.actors.every(value=>same(value.counts,after.actors[0].counts)),note:'The candidate adds skinned coaches. Different actor counts are an explicit content/load tradeoff, not an equal-actor optimization claim. Baseline social pose/cull counters may be unavailable; null is not zero.'}};
  });
  return{pass:true,renderer,cpuRate,stressSimulation:cpuRate!==1,protocol:performanceProtocolV019,rows,scope:'Native desktop GPU with Chromium 390×844 DPR3 touch/mobile capability emulation. CPU rate 4 is a CDP stress simulation, not a physical phone. Every measured app RAF frame, callback duration and 25/50ms exceedance is retained. Setup simulation, fixed camera, two-second initial warmup and another two-second real RAF settling after heavy diagnostics are outside the eight-second sample window.',limits:['One desktop GPU cannot establish phone FPS, heat, battery use or touch latency.','App RAF cadence is not display presentation timing or isolated GPU execution time.','Auto quality, framebuffer, shadows and actor counts can differ; budgets and content/load changes must accompany performance numbers.','The heavy before counters belong to the pre-settling epoch. Their before→after delta includes settling; measured work rates must use measurementStart/raw telemetry rather than divide that delta by eight seconds.','Counters are read after app callbacks and at 250ms telemetry intervals. This overhead contributes to measured cadence; observer durations are retained separately.','Only W/S input is used for a repeatable walking route. Public touch/normal-play acceptance is separate.','Model and hand/foot contact diagnostics are recorded without changing geometry, pose paths or muscle materials; numerical animation/collision qualification is separate.']};
}
