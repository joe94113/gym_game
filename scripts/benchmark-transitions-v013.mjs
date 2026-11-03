import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashPerformanceSources} from './performance-source-v013.mjs';
import {frameStatistics,hardwareRenderer,fixedProfileSettings} from './perf-stats-v013.mjs';

const startedAt=new Date().toISOString();
const args=process.argv.slice(2),option=(name,fallback)=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const name=args.find(value=>!value.startsWith('--'))||'after',before=name.startsWith('before'),base=option('base-url',before?'http://127.0.0.1:5174':'http://127.0.0.1:5173'),root=option('root',before?'.local-tools/v013-before/':''),output=option('output','artifacts/performance-v013/transitions'),quality=option('quality','flow'),repeats=Number(option('repeats','2')),seconds=Number(option('seconds','4')),exercise=option('exercise','machine-calf-raise'),station=option('station',exercise==='dumbbell-bench-press'?'dumbbell-curl':'calf-raise');
if(!/^[a-z\d-]+$/i.test(name)||!['flow','clear'].includes(quality)||!Number.isInteger(repeats)||repeats<1||repeats>4||seconds<3||seconds>20)throw Error('Invalid label/profile/repeats/seconds.');
mkdirSync(output,{recursive:true});const sourceHashes=hashPerformanceSources(root),results=[],errors=[],failedSamples=[],viewport={width:1280,height:800},launchArgs=[...(process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[]),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'];
const harnessFiles=['scripts/benchmark-transitions-v013.mjs','scripts/perf-stats-v013.mjs','scripts/performance-source-v013.mjs','playwright.config.js','tests/vite-client-shim.js'],hashHarness=()=>Object.fromEntries(harnessFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),validatorSourceHashes=hashHarness();
const browser=await chromium.launch({...config.use.launchOptions,args:launchArgs,headless:true});
const stats=raw=>frameStatistics(raw.frames.map(frame=>frame.intervalMs));
const record=result=>{results.push(result);console.log(JSON.stringify({name,repeat:result.repeat,scenario:result.scenario,pass:result.pass,elapsedMs:result.raw.elapsedMs,meanMs:result.cadence.meanMs,p95Ms:result.cadence.p95Ms,over25Percent:result.cadence.over25Percent,over50Percent:result.cadence.over50Percent}));};

// This initializer observes the actual named app loop. It neither pauses the
// loop nor times synchronous simulation/render calls as FPS.
function installTransitionAudit({quality,seconds}){
 localStorage.setItem('form.graphics-quality.v1',quality);
 const raf=window.requestAnimationFrame.bind(window),known=new WeakSet();let lastTimestamp=null,current=null;
 const snapshot=room=>{const world=window.__FORM__?.world,canvas=document.querySelector('#gym-canvas'),activity=world?.getActivityState?.(),performance_=world?.getPerformanceDiagnostics?.();return{stage:activity?.stage??'loading',phase:activity?.phase??null,lifecyclePhase:activity?.lifecyclePhase??null,exerciseId:activity?.exerciseId??null,position:world?.getPlayerPosition?.(),framebuffer:[canvas?.width,canvas?.height],activeProfile:performance_?.active,pixelRatio:performance_?.pixelRatio,shadows:performance_?.shadows,...(room?{roomVisible:world?.getRoomDiagnostics?.().rooms?.[room]?.visible}:{} )};};
 const audit={detected:null,run(options){if(current)throw Error('Another transition measurement is active.');const started=performance.now();return new Promise((resolve,reject)=>{current={...options,started,frames:[],stages:[],events:[],resolve,reject,completedAt:null,loadedAt:null,firstGameFrameAt:null,lastStage:null,watchdog:setTimeout(()=>{if(current){const pending=current;current=null;pending.reject(Error(`Transition watchdog: ${options.kind}`));}},options.timeoutMs||90000)};});},get active(){return!!current;}};
 window.__TRANSITION_AUDIT_V013__=audit;
 const finish=measure=>{clearTimeout(measure.watchdog);current=null;measure.resolve({frames:measure.frames,stages:measure.stages,events:measure.events,kind:measure.kind,room:measure.room||null,elapsedMs:performance.now()-measure.started,completedAtMs:measure.completedAt===null?null:measure.completedAt-measure.started,loadedAtMs:measure.loadedAt===null?null:measure.loadedAt-measure.started,firstGameFrameAtMs:measure.firstGameFrameAt===null?null:measure.firstGameFrameAt-measure.started,detected:audit.detected,visibility:document.visibilityState,final:snapshot(measure.room)});};
 audit.loadPromise=audit.run({kind:'load',tailMs:seconds*1000,timeoutMs:120000});audit.loadPromise.catch(()=>{});
 for(const type of ['keydown','keyup','pointerdown','pointermove','pointerup'])window.addEventListener(type,event=>{if(current)current.events.push({type,t:performance.now()-current.started,key:event.key,code:event.code,clientX:event.clientX,clientY:event.clientY});},true);
 window.requestAnimationFrame=function(callback){
  let game=known.has(callback);if(!game&&callback?.name==='frame'&&Function.prototype.toString.call(callback).includes('recordFrameTiming')){known.add(callback);game=true;audit.detected={name:callback.name,proof:'Named frame callback contains recordFrameTiming.'};}
  if(!game)return raf(callback);
  return raf(timestamp=>{
   const interval=lastTimestamp===null?null:timestamp-lastTimestamp;lastTimestamp=timestamp;const measure=current,started=performance.now();
   try{callback.call(window,timestamp);}catch(error){if(current){clearTimeout(current.watchdog);current.reject(error);current=null;}throw error;}
   if(!measure||measure!==current)return;const callbackMs=performance.now()-started,state=snapshot(measure.room);measure.firstGameFrameAt??=timestamp;
   if(window.__FORM__?.state.loaded)measure.loadedAt??=timestamp;
   if(interval!==null)measure.frames.push({t:timestamp-measure.started,intervalMs:interval,callbackMs,...state});
   if(state.stage!==measure.lastStage){measure.lastStage=state.stage;measure.stages.push({t:timestamp-measure.started,...state});}
   if(measure.kind==='load'){if(measure.loadedAt!==null&&timestamp>=measure.loadedAt+measure.tailMs&&measure.frames.length>=3)finish(measure);}
   else{
    const complete=measure.kind==='mount'?state.stage==='exercising':measure.kind==='exit'?state.stage==='idle':measure.kind==='room-wake'?state.roomVisible===true:false;
    if(complete)measure.completedAt??=timestamp;
    if(measure.completedAt!==null&&timestamp>=measure.completedAt+(measure.kind==='room-wake'?0:500)&&timestamp>=measure.started+(measure.minimumMs||0)&&measure.frames.length>=3)finish(measure);
   }
  });
 };
}

async function describe(page){return page.evaluate(()=>{const w=window.__FORM__.world,canvas=document.querySelector('#gym-canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:String(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)),framebuffer:[canvas.width,canvas.height],quality:w.getPerformanceDiagnostics(),activity:w.getActivityState(),position:w.getPlayerPosition(),heading:w.getHeading(),model:w.getModelInfo()};});}
function accept(raw,setup,pageErrors){fixedProfileSettings(setup,quality);if(pageErrors.length||!raw.detected?.proof||raw.visibility!=='visible'||raw.frames.length<3||raw.frames.some(frame=>frame.activeProfile!==quality||frame.pixelRatio!==setup.quality.pixelRatio||frame.shadows!==setup.quality.shadows||JSON.stringify(frame.framebuffer)!==JSON.stringify(setup.framebuffer))){const checks={pageErrors:pageErrors.length,detected:!!raw.detected?.proof,visibility:raw.visibility,frames:raw.frames.length,badFrames:raw.frames.filter(frame=>frame.activeProfile!==quality||frame.pixelRatio!==setup.quality.pixelRatio||frame.shadows!==setup.quality.shadows||JSON.stringify(frame.framebuffer)!==JSON.stringify(setup.framebuffer)).slice(0,3)};failedSamples.push({checks,setup,raw,pageErrors:[...pageErrors]});throw Error('Invalid native transition sample or adapted quality: '+JSON.stringify(checks));}return{pass:true,profile:quality,setup,raw,cadence:stats(raw)};}

try{
 for(let repeat=1;repeat<=repeats;repeat++){
  const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  try{
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   await page.addInitScript(installTransitionAudit,{quality,seconds});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto(base);await page.bringToFront();await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});
   const loaded=await page.evaluate(()=>window.__TRANSITION_AUDIT_V013__.loadPromise),loadedSetup=await describe(page);if(!hardwareRenderer(loadedSetup.renderer))throw Error('Native hardware renderer required.');
   const loading=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(entry=>entry.toJSON()),resources:performance.getEntriesByType('resource').map(entry=>({name:entry.name,startTime:entry.startTime,duration:entry.duration,transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize,responseEnd:entry.responseEnd,deliveryType:entry.deliveryType||null}))}));
   record({repeat,scenario:'load',...accept(loaded,loadedSetup,pageErrors),loading,cacheCondition:'Fresh browser context, HTTP cache disabled through CDP. Browser/driver shader cache and OS/server filesystem cache are uncontrolled; repeat 2 is not a cold machine boot.'});
   await page.evaluate(()=>{document.querySelector('[data-action=free]').click();window.__FORM__.audio?.setSettings?.({musicEnabled:false,voiceEnabled:false});});
   if(!await page.evaluate(station=>window.__FORM__.world.placePlayerAtStation(station),station))throw Error(`Unknown station ${station}`);await page.waitForTimeout(2000);const mountSetup=await describe(page);
   const mount=await page.evaluate(({exercise})=>{const audit=window.__TRANSITION_AUDIT_V013__,pending=audit.run({kind:'mount',timeoutMs:90000});window.__FORM__.openExercise(exercise);return pending;},{exercise});
   record({repeat,scenario:'mount',exercise,station,...accept(mount,mountSetup,pageErrors),durationMeaning:'Includes real approach, possible occupant handoff, alignment and entry. Longer authored preparation can intentionally increase total duration; cadence is reported separately.'});
   const exitSetup=await describe(page),exit=await page.evaluate(()=>{const pending=window.__TRANSITION_AUDIT_V013__.run({kind:'exit',timeoutMs:90000});window.__FORM__.world.stopExercise();return pending;});
   record({repeat,scenario:'exit',exercise,station,...accept(exit,exitSetup,pageErrors),durationMeaning:'Includes return to safe pose, release and actual exit; cadence and authored duration are separate.'});
   // Both versions start orbit yaw=.3 and restore it after an activity. Real
   // pointer drags below modify yaw; room activation occurs in the game RAF.
   if(!await page.evaluate(()=>window.__FORM__.world.placePlayerAtStation('chest-press')))throw Error('Missing neutral room-view station');await page.waitForTimeout(1800);let yaw=.3;
   const drag=async target=>{while(Math.abs(yaw-target)>1e-7){const delta=Math.max(-2.5,Math.min(2.5,yaw-target)),dx=delta/.005;await page.mouse.move(640,400);await page.mouse.down();await page.mouse.move(640+dx,400,{steps:12});await page.mouse.up();yaw-=delta;}};
   for(const [room,targetYaw]of [['classroom',2.575],['bathroom',-2.246]]){
    await drag(targetYaw);await page.waitForFunction(room=>window.__FORM__.world.getRoomDiagnostics().rooms[room].visible,room,{timeout:10000,polling:100});await page.waitForTimeout(1500);await drag(0);
    const hiddenStarted=performance.now();await page.waitForFunction(room=>{const w=window.__FORM__.world;return!w.getRoomDiagnostics().rooms[room].visible&&w.getRoomResourceDiagnostics().rooms[room].gpuEvictionRequested;},room,{timeout:90000,polling:200});
    const beforeRoom=await page.evaluate(room=>({room:window.__FORM__.world.getRoomDiagnostics().rooms[room],resources:window.__FORM__.world.getRoomResourceDiagnostics().rooms[room]}),room),roomSetup=await describe(page);
    const measured=page.evaluate(({room,seconds})=>window.__TRANSITION_AUDIT_V013__.run({kind:'room-wake',room,minimumMs:seconds*1000,timeoutMs:20000}),{room,seconds});await page.waitForFunction(()=>window.__TRANSITION_AUDIT_V013__.active,null,{timeout:5000});await drag(targetYaw);const raw=await measured;
    const afterRoom=await page.evaluate(room=>({room:window.__FORM__.world.getRoomDiagnostics().rooms[room],resources:window.__FORM__.world.getRoomResourceDiagnostics().rooms[room]}),room);
    if(!afterRoom.room.visible||afterRoom.resources.gpuEvictionRequested||!raw.events.some(event=>event.type==='pointermove'))throw Error(`Room return not observed: ${room}`);
    record({repeat,scenario:`${room}-wake`,...accept(raw,roomSetup,pageErrors),room,viewInput:{neutralStation:'chest-press',initialYaw:0,targetYaw,pointerSensitivity:.005},hiddenWaitMs:performance.now()-hiddenStarted-raw.elapsedMs,beforeRoom,afterRoom,scope:'Real pointer drag after room disposal was requested; interval data are actual game RAF. Resource diagnostics prove disposal requests, not actual GL byte transfer/deletion counts.'});
   }
   if(pageErrors.length)throw Error(pageErrors.join('\n'));
  }finally{await context.close();}
 }
}catch(error){errors.push(String(error.stack||error));console.error(String(error));}finally{await browser.close();}
const final=hashPerformanceSources(root),changedSources=[...new Set([...Object.keys(sourceHashes),...Object.keys(final)])].filter(path=>sourceHashes[path]!==final[path]),finalHarness=hashHarness(),changedValidators=harnessFiles.filter(path=>validatorSourceHashes[path]!==finalHarness[path]),pass=!errors.length&&!changedSources.length&&!changedValidators.length&&results.length===repeats*5&&results.every(result=>result.pass);
const report={pass,version:'0.13.0',name,base,sourceRoot:root,sourceHashes,changedSources,harnessSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),rendererKind:'native',viewport,deviceScaleFactor:1,quality,repeats,windowSeconds:seconds,exercise,station,launchArgs,results,failedSamples,errors,scope:'Native app RAF during page initialization, real approach/mount and exit, and real pointer-driven classroom/bathroom return. No manual simulation loops, synchronous world.update or gl.finish timings are used as FPS.',limits:['The loading result separates navigation/resource/app-ready duration from subsequent game RAF intervals: no game frames exist before the app loop starts. App-ready is observed in the first native game RAF, with approximately one-frame observation granularity.','Fresh HTTP cache is controlled, while OS/server filesystem and browser/driver shader caches are not.','Preparation duration changes may be intentional animation changes; longer elapsed time alone is not evidence of a rendering regression. Phase/stage traces and cadence are retained.','Room return is a fixed camera-drag observation after disposal requests, not all walking entrances or a measurement of actual GPU transfer bytes.','Headless game RAF cadence is not proof of physical display presentation or isolated GPU time. Per-frame phase/quality diagnostics add identical observational work in both versions.']};
Object.assign(report,{validatorSourceHashes,changedValidators,startedAt,completedAt:new Date().toISOString()});
const file=`${output}/${name}-${quality}.json`;writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({file,pass,cases:results.length,expected:repeats*5,changedSources,changedValidators,errors}));if(!pass)process.exitCode=1;
