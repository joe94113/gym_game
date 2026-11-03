import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {cpus,platform,release} from 'node:os';
import {performanceProtocolV019 as protocol,hashHarnessV019,hashSourcesV019,changedHashesV019,summarizeFramesV019,sampledDistanceV019,validateRunV019,npcPoseSnapshotV019} from './performance-common-v019.mjs';
import {compareDirectoryV019} from './compare-performance-v019.mjs';

const args=process.argv.slice(2),option=(name,fallback)=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
if(args.some(value=>!/^--(?:cpu|output|before-url|after-url|before-root|after-root)=/.test(value)))throw new Error('Unknown benchmark option.');
const cpuRate=Number(option('cpu','1'));if(![1,4].includes(cpuRate))throw new Error('--cpu must be 1 or 4; 4 is a simulated CPU stress rate.');
const directory=option('output',`artifacts/release-v019/performance-cpu${cpuRate}`);
if(existsSync(join(directory,'measurement-session.json'))||existsSync(join(directory,'before-1.json')))throw new Error('Output already has evidence. Use a new --output directory to retain prior failures and raw frames.');
mkdirSync(directory,{recursive:true});
const versions={before:{root:option('before-root','.local-tools/v019-before'),base:option('before-url','http://127.0.0.1:5174/')},after:{root:option('after-root',''),base:option('after-url','http://127.0.0.1:5173/')}};
const startedAt=new Date().toISOString(),harnessHashes=hashHarnessV019(),sourceHashes=Object.fromEntries(Object.entries(versions).map(([name,version])=>[name,hashSourcesV019(version.root)])),reports=[],errors=[];
const launchArgs=process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[];
launchArgs.push('--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows');
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

function installAudit(){
  localStorage.setItem('form.graphics-quality.v1','auto');localStorage.setItem('form.course-audio.v1',JSON.stringify({musicEnabled:false,voiceEnabled:false}));
  const nativeRaf=window.requestAnimationFrame.bind(window),known=new WeakSet();let paused=true,pending=null,lastTimestamp=null,measurement=null;
  const audit={detected:null,get armed(){return!!measurement;},resume(){paused=false;if(pending){const callback=pending;pending=null;window.requestAnimationFrame(callback);}},run(durationMs){
    if(paused||measurement)throw new Error('App RAF must be running and measurement idle.');
    return new Promise((resolve,reject)=>{measurement={armedAt:performance.now(),start:null,end:null,requestedMs:durationMs,frames:[],telemetry:[],keys:[],lastTelemetry:-Infinity,resolve,reject,watchdog:setTimeout(()=>{if(measurement){measurement.reject(new Error('App RAF did not complete before deadline.'));measurement=null;}},durationMs+15000)};});
  }};window.__PERFORMANCE_AUDIT_V019__=audit;
  for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{if(measurement)measurement.keys.push({type,key:event.key,code:event.code,timestamp:performance.now()});},true);
  window.requestAnimationFrame=function(callback){
    let game=known.has(callback);if(!game&&callback?.name==='frame'&&Function.prototype.toString.call(callback).includes('recordFrameTiming')){game=true;known.add(callback);audit.detected={name:'frame',proof:'Named app frame callback contains recordFrameTiming.'};}
    if(!game)return nativeRaf(callback);
    return nativeRaf(function observedGameFrame(timestamp){
      if(paused){pending=callback;return;}
      const interval=lastTimestamp===null?null:timestamp-lastTimestamp;lastTimestamp=timestamp;
      const current=measurement;if(current&&current.start===null){current.start=timestamp;current.end=timestamp+current.requestedMs;}
      const callbackStart=performance.now();callback.call(window,timestamp);const callbackMs=performance.now()-callbackStart;
      if(!current||measurement!==current)return;
      const observerStart=performance.now(),world=window.__FORM__?.world,canvas=document.querySelector('#gym-canvas'),activity=world?.getActivityState?.();
      const frame=interval===null?null:{t:timestamp-current.start,intervalMs:interval,callbackMs,stage:activity?.stage??null,phase:activity?.phase??null,lifecyclePhase:activity?.lifecyclePhase??null,framebuffer:[canvas?.width,canvas?.height],observerMs:0};
      if(timestamp-current.lastTelemetry>=250){current.lastTelemetry=timestamp;current.telemetry.push({t:timestamp-current.start,position:world?.getPlayerPosition?.(),heading:world?.getHeading?.(),quality:world?.getPerformanceDiagnostics?.(),work:world?.getFrameWorkDiagnostics?.()??null,batching:world?.getBatchDiagnostics?.()??null,render:world?.getRenderStats?.()??null,framebuffer:[canvas?.width,canvas?.height]});}
      if(frame){frame.observerMs=performance.now()-observerStart;current.frames.push(frame);}
      if(timestamp>=current.end){clearTimeout(current.watchdog);measurement=null;current.resolve({timingOrigin:'first-game-raf',armedAt:current.armedAt,startTimestamp:current.start,requestedMs:current.requestedMs,elapsedMs:timestamp-current.start,frames:current.frames,telemetry:current.telemetry,keys:current.keys.map(({timestamp,...event})=>({...event,t:timestamp-current.start})),detected:audit.detected,visibility:document.visibilityState,glWrappers:false});}
    });
  };
}
function snapshot(epoch='diagnostic'){
  const snapshotStartedAt=performance.now(),world=window.__FORM__.world,canvas=document.querySelector('#gym-canvas'),crowd=world.getCrowdDiagnostics(),social=world.getSocialDiagnostics();
  const coaches=social.actors.filter(actor=>actor.coachId||['trainer-desk','coach','class-instructor','floor-trainer'].includes(actor.role));
  const directWork=world.getFrameWorkDiagnostics?.()||{},npcPose=window.__NPC_COUNTER_SNAPSHOT_V019__(directWork.npcPose,crowd.actors),work={...directWork,npcPose};
  return{epoch,snapshotStartedAt,position:world.getPlayerPosition(),heading:world.getHeading(),quality:world.getPerformanceDiagnostics(),activity:world.getActivityState(),framebuffer:[canvas.width,canvas.height],contact:world.getContactDiagnostics?.()??null,highlights:world.getMuscleHighlights?.()??null,work,npcPoseCounterScope:npcPose.source==='crowd-actor-sum'?'Before/after snapshot sums of actual actor counters; unavailable per-telemetry/new-frustum counters are not invented.':'Direct world frame-work NPC counters checked against actual actor counters.',batching:world.getBatchDiagnostics?.()??null,render:world.getRenderStats?.()??null,actors:{crowdCount:crowd.actors?.length??crowd.count,socialCount:social.actors.length,coachCount:coaches.length,rosterCoachCount:social.coachCount??null},actorDetails:{crowd,social},model:world.getModelInfo(),snapshotCompletedAt:performance.now()};
}
function measurementStartSnapshot(){
  // No model, body/skin, contact, social actor or geometry diagnostics here.
  const snapshotStartedAt=performance.now(),world=window.__FORM__.world,canvas=document.querySelector('#gym-canvas');
  return{epoch:'after-diagnostic-settle-before-arming',snapshotStartedAt,position:world.getPlayerPosition(),heading:world.getHeading(),quality:world.getPerformanceDiagnostics(),activity:world.getActivityState(),framebuffer:[canvas.width,canvas.height],work:world.getFrameWorkDiagnostics?.()??null,snapshotCompletedAt:performance.now()};
}
async function driveRoute(page){const start=performance.now(),keys=['w','s','w','s'];try{for(let index=0;index<keys.length;index++){await page.keyboard.down(keys[index]);await pause(Math.max(0,start+(index+1)*2000-performance.now()));await page.keyboard.up(keys[index]);}}finally{await page.keyboard.up('w');await page.keyboard.up('s');}}
async function scenarioRun(browser,scenario,base){
  const context=await browser.newContext({viewport:protocol.viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage(),pageErrors=[];let cdp;
  page.on('pageerror',error=>pageErrors.push(error.message));
  try{
    await page.addInitScript(installAudit);await page.addInitScript({content:`window.__NPC_COUNTER_SNAPSHOT_V019__=(${npcPoseSnapshotV019.toString()});`});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded&&window.__PERFORMANCE_AUDIT_V019__?.detected,null,{polling:100,timeout:120000});await page.bringToFront();
    const setup=await page.evaluate(scenario=>{
      const api=window.__FORM__,world=api.world,initialDefault=world.getPerformanceDiagnostics(),free=document.querySelector('[data-action="free"]');if(!free)throw new Error('Free exploration button missing.');free.click();world.setGraphicsQuality('auto');
      if(scenario==='equipment'){api.openExercise('dumbbell-bench-press');if(!world.advanceUntilReady(180,false))throw new Error('Cannot prepare dumbbell bench.');world.setAnimationPaused(false);}
      else if(!world.placePlayerAtStation(scenario==='walking'?'stretch-zone':'inbody'))throw new Error('Scenario station not found.');
      for(let elapsed=0;elapsed<15;elapsed+=1/60)world.update(Math.min(1/60,15-elapsed),false);
      const position=world.getPlayerPosition(),camera={position:[position.x+5,6,position.z+7],target:[position.x,1,position.z]};if(typeof world.inspectView!=='function')throw new Error('DEV fixed-camera API is required for matched framing.');world.inspectView(camera);world.update(0,true);
      const canvas=document.querySelector('#gym-canvas'),gl=canvas.getContext('webgl2');if(!gl)throw new Error('WebGL2 required.');const extension=gl.getExtension('WEBGL_debug_renderer_info'),renderer=String(extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));if(/swiftshader|llvmpipe|lavapipe|software|basic render/i.test(renderer))throw new Error(`Native desktop GPU required: ${renderer}`);
      return{renderer,contextAttributes:gl.getContextAttributes(),emulation:{width:innerWidth,height:innerHeight,devicePixelRatio,coarsePointer:matchMedia('(pointer: coarse)').matches,hoverNone:matchMedia('(hover: none)').matches,maxTouchPoints:navigator.maxTouchPoints},initialDefault,camera,position:world.getPlayerPosition(),heading:world.getHeading(),quality:world.getPerformanceDiagnostics(),activity:world.getActivityState(),framebuffer:[canvas.width,canvas.height],model:world.getModelInfo(),setupExcludedFromTiming:true};
    },scenario);
    cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});await page.evaluate(()=>window.__PERFORMANCE_AUDIT_V019__.resume());await page.waitForTimeout(2000);
    const before=await page.evaluate(snapshot,'before-diagnostic-settle');
    // The heavy GLB diagnostics can block the page and prime app catch-up work.
    // Let the real game RAF settle again; never remove first/slow measured frames.
    await page.waitForTimeout(2000);const measurementStart=await page.evaluate(measurementStartSnapshot),diagnosticSettling={seconds:2,observedGapMs:measurementStart.snapshotStartedAt-before.snapshotCompletedAt,counterEpoch:'before snapshot is pre-settling; use measurementStart/raw telemetry for measured work deltas.'};
    const measurement=page.evaluate(()=>window.__PERFORMANCE_AUDIT_V019__.run(8000));await page.waitForFunction(()=>window.__PERFORMANCE_AUDIT_V019__.armed,null,{polling:1});
    const pending=await Promise.allSettled([measurement,scenario==='walking'?driveRoute(page):Promise.resolve()]);for(const item of pending)if(item.status==='rejected')throw item.reason;
    const raw=pending[0].value,after=await page.evaluate(snapshot,'after-measurement'),result={pass:pageErrors.length===0,scenario,setup,before,measurementStart,diagnosticSettling,after,raw,...summarizeFramesV019(raw.frames),socialCounterAvailability:!!before.work?.social,movement:{route:scenario==='walking'?['w','s','w','s']:[],sampledDistance:0},errors:pageErrors};result.movement.sampledDistance=sampledDistanceV019(result);return result;
  }finally{if(cdp)await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});await context.close();}
}
async function measureRun(name){
  const key=name.startsWith('before')?'before':'after',version=versions[key],runStartedAt=new Date().toISOString(),runSource=hashSourcesV019(version.root),runHarness=hashHarnessV019(),results=[],runErrors=[];
  if(changedHashesV019(sourceHashes[key],runSource).length||changedHashesV019(harnessHashes,runHarness).length)throw new Error('Sources/harness changed before the run; freeze and repeat the complete ABBA session in a new directory.');
  const browser=await chromium.launch({...config.use.launchOptions,args:launchArgs,headless:true});
  try{for(const scenario of protocol.scenarios){const result=await scenarioRun(browser,scenario,version.base);results.push(result);console.log(JSON.stringify({name,scenario,cpuRate,samples:result.cadence.samples,p95Ms:result.cadence.p95Ms,callbackMs:result.callback.meanMs,framebuffer:result.before.framebuffer,actors:result.before.actors,distance:result.movement.sampledDistance}));}}
  catch(error){runErrors.push(error.stack||String(error));}finally{await browser.close();}
  const report={pass:runErrors.length===0,name,base:version.base,sourceRoot:version.root,sourceHashes:runSource,sourceHashesEnd:hashSourcesV019(version.root),harnessHashes:runHarness,harnessHashesEnd:hashHarnessV019(),rendererKind:'native',glWrappers:false,rafObserver:true,viewport:protocol.viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true,profile:'auto',cpuRate,appliedCPURate:cpuRate,cdpCPUThrottleAcknowledged:runErrors.length===0,stressSimulation:cpuRate!==1,seconds:8,warmupSeconds:2,diagnosticSettlingSeconds:2,beforeCounterEpoch:'before-diagnostic-settle',setupSimulationSeconds:15,launchArgs,startedAt:runStartedAt,completedAt:new Date().toISOString(),results,errors:runErrors};
  try{validateRunV019(report);}catch(error){report.pass=false;report.errors.push(error.stack||String(error));}
  writeFileSync(join(directory,`${name}.json`),JSON.stringify(report,null,2)+'\n');return report;
}
try{for(const name of protocol.order){const report=await measureRun(name);reports.push(report);if(!report.pass)throw new Error(`${name} failed; all collected raw evidence is retained, no frames removed.`);}}
catch(error){errors.push(error.stack||String(error));console.error(error.stack||String(error));}
const harnessHashesEnd=hashHarnessV019(),sourceHashesEnd=Object.fromEntries(Object.entries(versions).map(([name,version])=>[name,hashSourcesV019(version.root)]));
if(changedHashesV019(harnessHashes,harnessHashesEnd).length||Object.keys(versions).some(key=>changedHashesV019(sourceHashes[key],sourceHashesEnd[key]).length))errors.push('Source or measurement/analysis harness changed during the ABBA session.');
const session={pass:errors.length===0&&reports.length===4&&reports.every(report=>report.pass),order:protocol.order,completedRuns:reports.map(report=>report.name),startedAt,completedAt:new Date().toISOString(),host:{platform:platform(),release:release(),cpu:cpus()[0]?.model??null},protocol,cpuRate,stressSimulation:cpuRate!==1,harnessHashes,harnessHashesEnd,sourceHashes,sourceHashesEnd,errors,scope:'Frozen v0.18 baseline and v0.19 candidate on the same native desktop GPU in sequential ABBA order. 390×844 DPR3 mobile/touch capability emulation. CPU4 is a CDP stress simulation, not phone hardware. Fixed camera and 15s setup are excluded, followed by 2s real RAF warmup, heavy before diagnostics, and 2s real RAF diagnostic settling before the full 8s raw sample window. Before counters belong to the pre-settling epoch; a separate cheap measurementStart snapshot and raw telemetry describe measured budgets/work. All measured first/slow frames are retained. Reception includes the added skinned coaches with actual counts and supported work/culling counters.'};
writeFileSync(join(directory,'measurement-session.json'),JSON.stringify(session,null,2)+'\n');
if(session.pass){try{const comparison=compareDirectoryV019(directory);console.log(JSON.stringify({pass:true,directory,cpuRate,renderer:comparison.renderer,rows:comparison.rows.map(row=>({scenario:row.scenario,beforeP95:row.before.cadence.p95Ms,afterP95:row.after.cadence.p95Ms,changePercent:row.changePercent,contentTradeoff:row.contentTradeoff}))}));}catch(error){console.error(error.stack||String(error));process.exitCode=1;}}
else process.exitCode=1;
