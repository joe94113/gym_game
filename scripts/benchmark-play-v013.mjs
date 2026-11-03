import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashPerformanceSources} from './performance-source-v013.mjs';
import {frameStatistics} from './perf-stats-v013.mjs';

const startedAt=new Date().toISOString();
// Real game RAF benchmark. No synchronous world.update/gl.finish timings are
// used as FPS; optional GL wrappers only count calls, never wait for the GPU.
const arguments_=process.argv.slice(2),option=(name,fallback)=>arguments_.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const name=arguments_.find(value=>!value.startsWith('--'))||'after-1';
if(!/^[a-z\d-]+$/i.test(name))throw Error('Use a simple run label, e.g. before-1 or after-1.');
const before=name.startsWith('before'),rootValue=option('root',before?'.local-tools/v013-before/':''),root=rootValue&&!/[\\/]$/.test(rootValue)?`${rootValue}/`:rootValue,base=option('base-url',before?'http://127.0.0.1:5174':'http://127.0.0.1:5173');
const seconds=Number(option('seconds','8')),warmupSeconds=Number(option('warmup','2')),setupSimulationSeconds=Number(option('setup-simulation','15'));
const profiles=option('profiles','flow,clear').split(','),scenarios=option('scenarios','walking,sprint,guided,equipment').split(','),hooks=option('hooks','off'),station=option('station','stretch-zone');
if(!(seconds>=.25&&seconds<=120&&warmupSeconds>=0&&warmupSeconds<=60&&setupSimulationSeconds>=0&&setupSimulationSeconds<=60))throw Error('Invalid measurement, warmup or setup seconds.');
if(profiles.some(value=>!['flow','clear','auto'].includes(value))||scenarios.some(value=>!['walking','sprint','guided','equipment','class'].includes(value))||!['off','counts'].includes(hooks))throw Error('Invalid profile/scenario/hooks option.');
const classId=option('class-id','class-dance'),classPhase=Number(option('class-phase','0'));
if(!/^class-[a-z-]+$/.test(classId)||!Number.isFinite(classPhase)||classPhase<0||classPhase>1)throw Error('Invalid class id or phase.');
const dir=option('output','artifacts/performance-v013/play'),viewport={width:1280,height:800};mkdirSync(dir,{recursive:true});
const hashSources=()=>hashPerformanceSources(root);
const harnessFiles=['scripts/benchmark-play-v013.mjs','scripts/perf-stats-v013.mjs','scripts/performance-source-v013.mjs','playwright.config.js','tests/vite-client-shim.js'],hashHarness=()=>Object.fromEntries(harnessFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const validatorSourceHashes=hashHarness(),sourceHashes=hashSources(),errors=[],results=[],launchArgs=process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[];
launchArgs.push('--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows');
const browser=await chromium.launch({...config.use.launchOptions,args:launchArgs,headless:true});
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function driveRoute(page,sprint){
 const start=performance.now(),keys=['w','s','w','s'];if(sprint)await page.keyboard.down('Shift');
 try{for(let index=0;index<keys.length;index++){await page.keyboard.down(keys[index]);await pause(Math.max(0,start+(index+1)*seconds*1000/keys.length-performance.now()));await page.keyboard.up(keys[index]);}}
 finally{if(sprint)await page.keyboard.up('Shift');}
}
try{
 for(const profile of profiles)for(const scenario of scenarios){
  const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  try{
   await page.addInitScript(({profile,hooks})=>{
    localStorage.setItem('form.graphics-quality.v1',profile);
    const nativeRaf=window.requestAnimationFrame.bind(window),gameCallbacks=new WeakSet(),counts={drawArrays:0,drawElements:0,drawArraysInstanced:0,drawElementsInstanced:0,texImage2D:0,texSubImage2D:0,generateMipmap:0};
    let paused=true,pending=null,lastGameTimestamp=null,measure=null;
    const copyCounts=()=>({...counts}),subtract=(a,b)=>Object.fromEntries(Object.keys(a).map(key=>[key,a[key]-b[key]]));
    const audit={frames:[],telemetry:[],keys:[],detected:null,resume(){paused=false;if(pending){const callback=pending;pending=null;window.requestAnimationFrame(callback);}},
     run(durationMs){if(paused||measure)throw Error('Game RAF must be running and measurement idle.');audit.frames=[];audit.telemetry=[];audit.keys=[];return new Promise((resolve,reject)=>{const start=performance.now();measure={start,end:start+durationMs,resolve,reject,before:copyCounts(),lastTelemetry:-Infinity,timeout:setTimeout(()=>{if(measure){measure.reject(Error('No completing game RAF before watchdog deadline.'));measure=null;}},Math.max(15000,durationMs+15000))};});},
    };
    window.__PLAY_AUDIT_V013__=audit;
    for(const kind of ['keydown','keyup'])window.addEventListener(kind,event=>{if(measure)audit.keys.push({type:kind,key:event.key,code:event.code,shiftKey:event.shiftKey,t:performance.now()-measure.start});},true);
    if(hooks==='counts')for(const method of Object.keys(counts)){
     const original=WebGL2RenderingContext.prototype[method];if(typeof original!=='function')continue;
     WebGL2RenderingContext.prototype[method]=function(...args){if(measure)counts[method]++;return original.apply(this,args);};
    }
    window.requestAnimationFrame=function(callback){
     let isGame=gameCallbacks.has(callback);
     if(!isGame&&callback?.name==='frame'&&Function.prototype.toString.call(callback).includes('recordFrameTiming')){gameCallbacks.add(callback);isGame=true;audit.detected={name:callback.name,proof:'Named frame callback contains recordFrameTiming, matching the app loop.'};}
     if(!isGame)return nativeRaf(callback);
     return nativeRaf(function observedGameFrame(timestamp){
      if(paused){pending=callback;return;}
      const interval=lastGameTimestamp===null?null:timestamp-lastGameTimestamp;lastGameTimestamp=timestamp;
      const current=measure,before=hooks==='counts'&&current?copyCounts():null,start=performance.now();
      callback.call(window,timestamp);const callbackMs=performance.now()-start;
      if(!current||measure!==current)return;
      const activity=window.__FORM__?.world.getActivityState?.(),frameCanvas=document.querySelector('#gym-canvas');
      if(interval!==null)audit.frames.push({t:timestamp-current.start,intervalMs:interval,callbackMs,stage:activity?.stage??null,phase:activity?.phase??null,lifecyclePhase:activity?.lifecyclePhase??null,framebuffer:[frameCanvas?.width,frameCanvas?.height],...(before?{gl:subtract(copyCounts(),before)}:{})});
      if(timestamp-current.lastTelemetry>=250){
       current.lastTelemetry=timestamp;const w=window.__FORM__?.world,canvas=document.querySelector('#gym-canvas'),quality=w?.getPerformanceDiagnostics?.();
       audit.telemetry.push({t:timestamp-current.start,position:w?.getPlayerPosition?.(),heading:w?.getHeading?.(),running:quality?.running,movingSpeed:quality?.movingSpeed,activeProfile:quality?.active,pixelRatio:quality?.pixelRatio,shadows:quality?.shadows,framebuffer:[canvas?.width,canvas?.height]});
      }
      if(timestamp>=current.end){clearTimeout(current.timeout);measure=null;current.resolve({frames:audit.frames,telemetry:audit.telemetry,keys:audit.keys,gl:hooks==='counts'?subtract(copyCounts(),current.before):null,elapsedMs:timestamp-current.start,detected:audit.detected,visibility:document.visibilityState});}
     });
    };
   },{profile,hooks});
   await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
   await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.bringToFront();
   const setup=await page.evaluate(({profile,scenario,station,setupSimulationSeconds,classId,classPhase})=>{
    const a=window.__FORM__,w=a.world;document.querySelector('[data-action="free"]').click();w.setGraphicsQuality(profile);a.audio?.setSettings?.({musicEnabled:false,voiceEnabled:false});
    if(scenario==='equipment'||scenario==='class'){a.openExercise(scenario==='class'?classId:'dumbbell-bench-press');if(!w.advanceUntilReady(180,false))throw Error(`Cannot prepare ${scenario}`);if(scenario==='class')w.seekExercise(classPhase);w.setAnimationPaused(false);}
    else{if(station!=='spawn'&&!w.placePlayerAtStation(station))throw Error(`Unknown starting station ${station}`);if(scenario==='guided')a.targetExercise('machine-lat-pulldown');}
    for(let elapsed=0;elapsed<setupSimulationSeconds;elapsed+=1/60)w.update(Math.min(1/60,setupSimulationSeconds-elapsed),false);w.update(0,true);
    const canvas=document.querySelector('#gym-canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info'),renderer=String(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
    if(/swiftshader|llvmpipe|lavapipe|software|basic render/i.test(renderer))throw Error(`Hardware renderer required: ${renderer}`);
    const result={renderer,framebuffer:[canvas.width,canvas.height],position:w.getPlayerPosition(),heading:w.getHeading(),quality:w.getPerformanceDiagnostics(),activity:w.getActivityState(),target:a.state.targetId,model:w.getModelInfo(),audio:w.getActivityState().exerciseId?a.audio?.getSettings?.():null};window.__PLAY_AUDIT_V013__.resume();return result;
   },{profile,scenario,station,setupSimulationSeconds,classId,classPhase});
   await page.waitForTimeout(warmupSeconds*1000);
   const beforeState=await page.evaluate(()=>{const w=window.__FORM__.world;return{position:w.getPlayerPosition(),heading:w.getHeading(),quality:w.getPerformanceDiagnostics(),activity:w.getActivityState()};});
   const measurement=page.evaluate(milliseconds=>window.__PLAY_AUDIT_V013__.run(milliseconds),seconds*1000),route=['walking','sprint','guided'].includes(scenario)?driveRoute(page,scenario==='sprint'):Promise.resolve();
   const settled=await Promise.allSettled([measurement,route]);if(settled[0].status==='rejected')throw settled[0].reason;if(settled[1].status==='rejected')throw settled[1].reason;
   const raw=settled[0].value,afterState=await page.evaluate(()=>{const w=window.__FORM__.world;return{position:w.getPlayerPosition(),heading:w.getHeading(),quality:w.getPerformanceDiagnostics(),activity:w.getActivityState(),contact:w.getContactDiagnostics(),highlights:w.getMuscleHighlights(),work:w.getFrameWorkDiagnostics?.()||null};});
   const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.floor((sorted.length-1)*p)]??null,sum=values.reduce((a,b)=>a+b,0);return{samples:values.length,meanMs:values.length?sum/values.length:null,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),over25ms:values.filter(value=>value>25).length,over50ms:values.filter(value=>value>50).length};};
   const intervals=raw.frames.map(frame=>frame.intervalMs),cadence={...frameStatistics(intervals),over25ms:intervals.filter(value=>value>25).length,over50ms:intervals.filter(value=>value>50).length},callback=summarize(raw.frames.map(frame=>frame.callbackMs));cadence.observedGameRafHz=cadence.meanMs?1000/cadence.meanMs:null;
   const path=[beforeState.position,...raw.telemetry.map(sample=>sample.position),afterState.position].filter(Boolean),distance=path.reduce((sum,p,index)=>index?sum+Math.hypot(p.x-path[index-1].x,p.z-path[index-1].z):0,0),moving=['walking','sprint','guided'].includes(scenario);
   const pass=!pageErrors.length&&raw.detected&&raw.visibility==='visible'&&raw.frames.length>=3&&(!moving||distance>.2);
   const result={pass:!!pass,profile,scenario,hooks,setup,before:beforeState,after:afterState,cadence,callback,movement:{route:moving?['w','s','w','s']:[],shift:scenario==='sprint',sampledDistance:distance,minimumCoverageMet:!moving||distance>.2},raw,errors:pageErrors};results.push(result);
   console.log(JSON.stringify({name,profile,scenario,hooks,pass:result.pass,samples:cadence.samples,p50:cadence.p50Ms,p95:cadence.p95Ms,p99:cadence.p99Ms,over25ms:cadence.over25ms,over50ms:cadence.over50ms,callbackP95:callback.p95Ms,distance,activeProfiles:[...new Set(raw.telemetry.map(sample=>sample.activeProfile))]}));
  }finally{await context.close();}
 }
}catch(error){errors.push(String(error.stack||error));console.error(String(error));}finally{await browser.close();}
const finalHashes=hashSources(),changedSources=Object.keys(sourceHashes).filter(path=>sourceHashes[path]!==finalHashes[path]),finalHarness=hashHarness(),changedValidators=harnessFiles.filter(path=>validatorSourceHashes[path]!==finalHarness[path]),pass=!errors.length&&!changedSources.length&&!changedValidators.length&&results.length===profiles.length*scenarios.length&&results.every(result=>result.pass);
const report={pass,name,base,rendererKind:'native',sourceRoot:root,sourceHashes,changedSources,validatorSourceHashes,changedValidators,viewport,deviceScaleFactor:1,profiles,scenarios,hooks,seconds,warmupSeconds,setupSimulationSeconds,startingStation:station,...(scenarios.includes('class')?{classId,classPhase}:{}),launchArgs,errors,results,
 scope:'Measured data are actual intervals of the game\'s native requestAnimationFrame callback while handling real Playwright WASD/Shift keyboard input, or continuously playing an exercise/class. No synchronous update/gl.finish timing is labeled FPS. Each scenario uses a fresh browser context, muted course audio, fixed initial scene/camera and an explicitly unmeasured manual setup/cache settle, then real RAF warmup and measurement. Other RAF callbacks are untouched. Telemetry samples position and active quality at 4Hz outside the measured callback duration. The last callback crossing the requested deadline is retained to include a terminal long frame.',
 limits:['Observed game RAF cadence is not proof that every frame was presented by the display or an isolated GPU duration. Headless Chromium cadence may be capped by its compositor.','Even hooks=off instruments the app RAF callback and samples lightweight telemetry; it means no WebGL API wrappers. hooks=counts adds call-count overhead and must be compared only against the same mode.','flow and clear are fixed-budget comparisons. auto may adapt profile/resolution during a run and must be treated as an additional user-experience observation, not evidence of same-quality speedup.','W/S legs and actual key timestamps/path are retained; collision-blocked portions remain real gameplay and are not silently teleported. Movement coverage requires only positive travel, so inspect path length before drawing broad conclusions.','Setup/manual simulation, initial loading, approach, mounting and warmup durations are excluded from the measured frame arrays. One machine/run is not a universal FPS promise.']};
Object.assign(report,{startedAt,completedAt:new Date().toISOString()});
writeFileSync(`${dir}/${name}-${hooks}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({file:`${dir}/${name}-${hooks}.json`,pass,results:results.length,expected:profiles.length*scenarios.length,changedSources,errors}));if(!pass)process.exitCode=1;
