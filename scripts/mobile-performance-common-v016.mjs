import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {frameStatistics,hardwareRenderer} from './perf-stats-v013.mjs';
import {hashPerformanceSources} from './performance-source-v013.mjs';

export const mobileProtocol={version:16,order:['before-1','after-1','after-2','before-2'],scenarios:['walking','equipment'],viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,warmupSeconds:2,profile:'auto',hooks:'off'};
export const mobileHarnessFiles=['scripts/benchmark-mobile-v016.mjs','scripts/compare-mobile-v016.mjs','scripts/mobile-performance-common-v016.mjs','scripts/perf-stats-v013.mjs','scripts/performance-source-v013.mjs','playwright.config.js','tests/vite-client-shim.js'];
export function hashMobileHarness(){return Object.fromEntries(mobileHarnessFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));}
export function hashMobileSources(root=''){
 const hashes=hashPerformanceSources(root),collect=directory=>{if(!existsSync(join(root,directory)))return;for(const entry of readdirSync(join(root,directory),{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())collect(path);else if(entry.isFile()&&/\.(?:mjs|js|json|css|svg)$/.test(path))hashes[path]=createHash('sha256').update(readFileSync(join(root,path))).digest('hex');}};collect('site');return Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b)));
}
export function changedHashes(before,after){return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>before[key]!==after[key]);}
export function callbackStatistics(values){
 if(!Array.isArray(values)||!values.length||values.some(value=>!Number.isFinite(value)||value<0))throw Error('Expected finite nonnegative callback durations.');
 const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.floor((sorted.length-1)*p)];return{samples:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),over25Percent:values.filter(v=>v>25).length/values.length*100,over50Percent:values.filter(v=>v>50).length/values.length*100};
}
export function summarizeMobileFrames(frames){return{cadence:frameStatistics(frames.map(frame=>frame.intervalMs)),callback:callbackStatistics(frames.map(frame=>frame.callbackMs))};}
function requireValue(condition,message){if(!condition)throw Error(message);}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function checkStatistics(actual,expected,label){for(const key of Object.keys(expected))requireValue(Number.isFinite(actual?.[key])&&Math.abs(actual[key]-expected[key])<=1e-8,`${label}: ${key} disagrees with raw frames.`);}
export function validateMobileRun(report){
 requireValue(report.pass===true,`${report.name}: run failed.`);requireValue(mobileProtocol.order.includes(report.name),'Unknown run label.');
 requireValue(report.rendererKind==='native'&&report.hooks==='off','Native renderer without WebGL wrappers is required.');
 requireValue(report.deviceScaleFactor===3&&report.isMobile===true&&report.hasTouch===true&&same(report.viewport,mobileProtocol.viewport),'Incorrect mobile emulation.');
 requireValue(report.seconds>=8&&report.seconds<=10&&report.warmupSeconds===2&&report.profile==='auto','Incorrect duration or auto profile.');
 requireValue(!report.errors?.length,'Run contains page/harness errors.');
 requireValue(Object.keys(report.sourceHashes||{}).length>0&&Object.keys(report.harnessHashes||{}).length>0,'Missing source/harness hashes.');
 requireValue(!changedHashes(report.sourceHashes,report.sourceHashesEnd||{}).length&&!changedHashes(report.harnessHashes,report.harnessHashesEnd||{}).length,'Sources or harness changed during measurement.');
 requireValue(Number.isFinite(Date.parse(report.startedAt))&&Date.parse(report.completedAt)>=Date.parse(report.startedAt),'Invalid run timestamps.');
 requireValue(report.results?.length===2&&same(report.results.map(result=>result.scenario),mobileProtocol.scenarios),'Walking and equipment scenarios are both required.');
 for(const result of report.results){
  const label=`${report.name}/${result.scenario}`,raw=result.raw,setup=result.setup,emulation=setup?.emulation;
  requireValue(result.pass===true&&!result.errors?.length,`${label}: scenario failed.`);
  requireValue(hardwareRenderer(setup?.renderer),`${label}: software or missing renderer.`);
  requireValue(emulation?.width===390&&emulation.height===844&&emulation.devicePixelRatio===3&&emulation.coarsePointer===true&&emulation.hoverNone===true&&emulation.maxTouchPoints>0,`${label}: browser mobile capabilities are missing.`);
  requireValue(setup?.contextAttributes&&typeof setup.contextAttributes.antialias==='boolean',`${label}: missing real context attributes.`);
  requireValue(raw?.detected?.name==='frame'&&raw.detected.proof==='Named app frame callback contains recordFrameTiming.'&&raw.visibility==='visible'&&raw.glWrappers===false,`${label}: actual native app RAF proof is missing.`);
  requireValue(raw.requestedMs===report.seconds*1000&&raw.elapsedMs>=raw.requestedMs&&raw.elapsedMs<raw.requestedMs+15000,`${label}: incomplete measurement.`);
  requireValue(raw.frames?.length>=3&&raw.telemetry?.length>=2,`${label}: missing raw frames/telemetry.`);
  for(let index=0;index<raw.frames.length;index++){
   const frame=raw.frames[index];requireValue(Number.isFinite(frame.t)&&frame.t>=0&&(!index||frame.t>raw.frames[index-1].t),`${label}: invalid raw timestamp order.`);
   if(index)requireValue(Math.abs(frame.t-raw.frames[index-1].t-frame.intervalMs)<.1,`${label}: interval disagrees with native RAF timestamp delta.`);
   requireValue(Array.isArray(frame.framebuffer)&&frame.framebuffer.length===2&&frame.framebuffer.every(value=>Number.isInteger(value)&&value>0),`${label}: invalid raw framebuffer.`);
  }
  requireValue(raw.frames.at(-1).t>=raw.requestedMs,`${label}: terminal frame omitted.`);
  requireValue(Math.abs(raw.frames.at(-1).t-raw.elapsedMs)<.1,`${label}: elapsed duration disagrees with terminal RAF timestamp.`);
  const recomputed=summarizeMobileFrames(raw.frames);checkStatistics(result.cadence,recomputed.cadence,`${label}/cadence`);checkStatistics(result.callback,recomputed.callback,`${label}/callback`);
  for(const sample of [setup,result.before,result.after,...raw.telemetry]){
   const quality=sample.quality;requireValue(quality?.preference==='auto'&&['balanced','flow'].includes(quality.active)&&Number.isFinite(quality.pixelRatio)&&quality.pixelRatio>0&&typeof quality.shadows==='boolean',`${label}: missing actual quality diagnostics.`);
   requireValue(Array.isArray(sample.framebuffer)&&sample.framebuffer.length===2&&sample.framebuffer.every(value=>Number.isInteger(value)&&value>0),`${label}: missing observed framebuffer.`);
  }
  if(result.scenario==='walking'){
   const path=[result.before.position,...raw.telemetry.map(sample=>sample.position),result.after.position];
   requireValue(path.every(position=>position&&Number.isFinite(position.x)&&Number.isFinite(position.z)),`${label}: position samples are missing.`);
   const distance=path.reduce((total,position,index)=>index?total+Math.hypot(position.x-path[index-1].x,position.z-path[index-1].z):0,0);
   requireValue(Math.abs(distance-result.movement?.sampledDistance)<1e-8&&distance>.2&&same(result.movement.route,['w','s','w','s'])&&raw.keys.some(key=>key.type==='keydown'&&key.key==='w')&&raw.keys.some(key=>key.type==='keydown'&&key.key==='s'),`${label}: route input/travel was not observed.`);
  }
  else requireValue(result.before?.activity?.exerciseId==='dumbbell-bench-press'&&result.after?.activity?.exerciseId==='dumbbell-bench-press',`${label}: dumbbell bench exercise was not active.`);
 }
 return report;
}
function budgets(result){return [...new Map([result.setup,result.before,...result.raw.telemetry,result.after].map(sample=>{const q=sample.quality,value={active:q.active,pixelRatio:q.pixelRatio,framebuffer:sample.framebuffer,pixels:sample.framebuffer[0]*sample.framebuffer[1],shadows:q.shadows,shadowHz:q.shadowHz??null,deviceTier:q.deviceTier??null,pixelBudget:q.pixelBudget??null,autoReason:q.autoReason??null};return[JSON.stringify(value),value];})).values()];}
export function compareMobileRuns(reports){
 requireValue(same(reports.map(report=>report.name),mobileProtocol.order),'Expected complete sequential ABBA runs.');reports.forEach(validateMobileRun);
 for(let index=1;index<reports.length;index++)requireValue(Date.parse(reports[index].startedAt)>=Date.parse(reports[index-1].completedAt),'ABBA runs overlap or are out of order.');
 const harness=reports[0].harnessHashes,renderer=reports[0].results[0].setup.renderer;
 for(const report of reports){requireValue(!changedHashes(harness,report.harnessHashes).length,'Harness differs between runs.');requireValue(report.results.every(result=>result.setup.renderer===renderer),'Native GPU differs between scenarios/runs.');requireValue(report.seconds===reports[0].seconds,'Measurement lengths differ.');}
 for(const indices of [[0,3],[1,2]])requireValue(!changedHashes(reports[indices[0]].sourceHashes,reports[indices[1]].sourceHashes).length,'Version sources differ between repeated runs.');
 const rows=mobileProtocol.scenarios.map(scenario=>{
  const results=reports.map(report=>report.results.find(result=>result.scenario===scenario)),reference=results[0].setup;
  for(const result of results){requireValue(same(result.setup.camera,reference.camera),'Camera framing differs.');for(const coordinate of ['x','y','z'])if(reference.position[coordinate]!==undefined)requireValue(Math.abs(result.setup.position[coordinate]-reference.position[coordinate])<1e-6,'Initial position differs.');requireValue(Math.abs(result.setup.heading-reference.heading)<1e-6,'Initial heading differs.');}
  const group=indices=>({runs:indices.map(index=>reports[index].name),...summarizeMobileFrames(indices.flatMap(index=>results[index].raw.frames)),observedBudgets:indices.map(index=>({run:reports[index].name,contextAttributes:results[index].setup.contextAttributes,initialDefault:results[index].setup.initialDefault,budgets:budgets(results[index])}))});
  const before=group([0,3]),after=group([1,2]),percent=(a,b)=>(b-a)/a*100;
  return{scenario,before,after,changePercent:{meanFrameMs:percent(before.cadence.meanMs,after.cadence.meanMs),p95FrameMs:percent(before.cadence.p95Ms,after.cadence.p95Ms),p99FrameMs:percent(before.cadence.p99Ms,after.cadence.p99Ms),callbackMeanMs:before.callback.meanMs?percent(before.callback.meanMs,after.callback.meanMs):null}};
 });
 return{pass:true,renderer,protocol:mobileProtocol,rows,scope:'Native desktop GPU with Chromium mobile capability emulation (390×844, DPR 3). This is not a physical phone measurement. Auto quality, framebuffer size, antialiasing and shadow policy may differ; compare the recorded budgets alongside cadence rather than claiming equal-quality acceleration.',limits:['Two repetitions per version on one desktop GPU do not establish phone FPS, thermal behavior, battery use or touch latency.','Observed application RAF cadence is not display presentation timing or isolated GPU time.','Matched real W/S keyboard input is used in both versions because the baseline has no touch controls. Setup simulation and two-second actual RAF warmup are excluded.']};
}
