import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {hashMocapHarness as hashMobileHarness} from './mocap-performance-common-v018.mjs';
import {cpus,platform,release} from 'node:os';
import {mobileProtocol,hashMobileSources,changedHashes,summarizeMobileFrames,validateMobileRun} from './mobile-performance-common-v016.mjs';
import {compareMobileDirectory} from './compare-mocap-v018.mjs';

// Default invocation measures all four runs in one sequential ABBA session.
// It never starts servers or rewrites v015 evidence. Run only while both source
// trees and this harness are frozen, with the native desktop GPU available.
const args=process.argv.slice(2),option=(name,fallback)=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
if(args.some(value=>!/^--(?:seconds|output|before-url|after-url)=/.test(value)))throw Error('Unknown mobile benchmark option.');
const seconds=Number(option('seconds','8'));if(!(seconds>=8&&seconds<=10))throw Error('Measurement must be 8–10 seconds.');
const directory=option('output','artifacts/mocap-v018/performance-final'),startedAt=new Date().toISOString(),harnessHashes=hashMobileHarness();mkdirSync(directory,{recursive:true});
const versions={before:{root:'.local-tools/v018-before/',base:option('before-url','http://127.0.0.1:5174')},after:{root:'',base:option('after-url','http://127.0.0.1:5173')}};
const initialSources=Object.fromEntries(Object.entries(versions).map(([key,value])=>[key,hashMobileSources(value.root)]));
const launchArgs=process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[];
launchArgs.push('--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows');
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)),reports=[],errors=[];
async function driveRoute(page){
 const start=performance.now(),keys=['w','s','w','s'];
 try{for(let index=0;index<keys.length;index++){await page.keyboard.down(keys[index]);await pause(Math.max(0,start+(index+1)*seconds*1000/keys.length-performance.now()));await page.keyboard.up(keys[index]);}}
 finally{await page.keyboard.up('w');await page.keyboard.up('s');}
}
function installAudit(){
 localStorage.setItem('form.graphics-quality.v1','auto');
 localStorage.setItem('form.course-audio.v1',JSON.stringify({musicEnabled:false,voiceEnabled:false}));
 const nativeRaf=window.requestAnimationFrame.bind(window),known=new WeakSet();let paused=true,pending=null,lastTimestamp=null,measurement=null;
 const audit={detected:null,get armed(){return!!measurement;},resume(){paused=false;if(pending){const callback=pending;pending=null;window.requestAnimationFrame(callback);}},run(durationMs){
  if(paused||measurement)throw Error('App RAF must be running and measurement idle.');
  return new Promise((resolve,reject)=>{measurement={armedAt:performance.now(),start:null,end:null,requestedMs:durationMs,frames:[],telemetry:[],keys:[],lastTelemetry:-Infinity,resolve,reject,watchdog:setTimeout(()=>{if(measurement){measurement.reject(Error('App RAF did not complete before deadline.'));measurement=null;}},durationMs+15000)};});
 }};window.__MOBILE_AUDIT_V016__=audit;
 for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{if(measurement)measurement.keys.push({type,key:event.key,code:event.code,timestamp:performance.now()});},true);
 window.requestAnimationFrame=function(callback){
  let game=known.has(callback);if(!game&&callback?.name==='frame'&&Function.prototype.toString.call(callback).includes('recordFrameTiming')){game=true;known.add(callback);audit.detected={name:'frame',proof:'Named app frame callback contains recordFrameTiming.'};}
  if(!game)return nativeRaf(callback);
  return nativeRaf(function observedGameFrame(timestamp){
   if(paused){pending=callback;return;}
   const interval=lastTimestamp===null?null:timestamp-lastTimestamp;lastTimestamp=timestamp;
   const current=measurement;if(current&&current.start===null){current.start=timestamp;current.end=timestamp+current.requestedMs;}
   const start=performance.now();callback.call(window,timestamp);const callbackMs=performance.now()-start;
   if(!current||measurement!==current)return;
   const world=window.__FORM__?.world,canvas=document.querySelector('#gym-canvas'),activity=world?.getActivityState?.();
   if(interval!==null)current.frames.push({t:timestamp-current.start,intervalMs:interval,callbackMs,stage:activity?.stage??null,phase:activity?.phase??null,lifecyclePhase:activity?.lifecyclePhase??null,framebuffer:[canvas?.width,canvas?.height]});
   if(timestamp-current.lastTelemetry>=250){current.lastTelemetry=timestamp;current.telemetry.push({t:timestamp-current.start,position:world?.getPlayerPosition?.(),heading:world?.getHeading?.(),quality:world?.getPerformanceDiagnostics?.(),framebuffer:[canvas?.width,canvas?.height]});}
   if(timestamp>=current.end){clearTimeout(current.watchdog);measurement=null;current.resolve({timingOrigin:'first-game-raf',armedAt:current.armedAt,startTimestamp:current.start,requestedMs:current.requestedMs,elapsedMs:timestamp-current.start,frames:current.frames,telemetry:current.telemetry,keys:current.keys.map(({timestamp,...key})=>({...key,t:timestamp-current.start})),detected:audit.detected,visibility:document.visibilityState,glWrappers:false});}
  });
 };
}
function snapshot(){
 const world=window.__FORM__.world,canvas=document.querySelector('#gym-canvas');return{position:world.getPlayerPosition(),heading:world.getHeading(),quality:world.getPerformanceDiagnostics(),activity:world.getActivityState(),framebuffer:[canvas.width,canvas.height],contact:world.getContactDiagnostics?.()??null,highlights:world.getMuscleHighlights?.()??null,work:world.getFrameWorkDiagnostics?.()??null};
}
async function scenarioRun(browser,scenario,base){
 const context=await browser.newContext({viewport:mobileProtocol.viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage(),pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 try{
  await page.addInitScript(installAudit);await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{polling:100,timeout:120000});await page.bringToFront();
  const setup=await page.evaluate(scenario=>{
   const api=window.__FORM__,world=api.world,initialDefault=world.getPerformanceDiagnostics();
   const free=document.querySelector('[data-action="free"]');if(!free)throw Error('Free exploration button not found.');free.click();
   world.setGraphicsQuality('auto');
   if(scenario==='equipment'){api.openExercise('dumbbell-bench-press');if(!world.advanceUntilReady(180,false))throw Error('Cannot prepare dumbbell bench.');world.setAnimationPaused(false);}
   else if(!world.placePlayerAtStation('stretch-zone'))throw Error('Walking starting station not found.');
   // Equal setup/cache settle is deliberately excluded from RAF samples.
   for(let elapsed=0;elapsed<15;elapsed+=1/60)world.update(Math.min(1/60,15-elapsed),false);
   const position=world.getPlayerPosition(),camera={position:[position.x+5,6,position.z+7],target:[position.x,1,position.z]};
   if(typeof world.inspectView!=='function')throw Error('DEV fixed-camera inspection API is required.');world.inspectView(camera);world.update(0,true);
   const canvas=document.querySelector('#gym-canvas'),gl=canvas.getContext('webgl2');if(!gl)throw Error('WebGL2 context required.');
   const extension=gl.getExtension('WEBGL_debug_renderer_info'),renderer=String(extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
   if(/swiftshader|llvmpipe|lavapipe|software|basic render/i.test(renderer))throw Error(`Native desktop GPU required: ${renderer}`);
   const result={renderer,contextAttributes:gl.getContextAttributes(),emulation:{width:innerWidth,height:innerHeight,devicePixelRatio,coarsePointer:matchMedia('(pointer: coarse)').matches,hoverNone:matchMedia('(hover: none)').matches,maxTouchPoints:navigator.maxTouchPoints},initialDefault,camera,position:world.getPlayerPosition(),heading:world.getHeading(),quality:world.getPerformanceDiagnostics(),activity:world.getActivityState(),framebuffer:[canvas.width,canvas.height],model:world.getModelInfo()};window.__MOBILE_AUDIT_V016__.resume();return result;
  },scenario);
  await page.waitForTimeout(2000);const before=await page.evaluate(snapshot);
  const measurement=page.evaluate(milliseconds=>window.__MOBILE_AUDIT_V016__.run(milliseconds),seconds*1000);
  await page.waitForFunction(()=>window.__MOBILE_AUDIT_V016__.armed,null,{polling:1});
  const pending=await Promise.allSettled([measurement,scenario==='walking'?driveRoute(page):Promise.resolve()]);
  for(const item of pending)if(item.status==='rejected')throw item.reason;
  const raw=pending[0].value,after=await page.evaluate(snapshot),path=[before.position,...raw.telemetry.map(item=>item.position),after.position];
  const sampledDistance=path.reduce((total,item,index)=>index?total+Math.hypot(item.x-path[index-1].x,item.z-path[index-1].z):0,0),summary=summarizeMobileFrames(raw.frames);
  return{pass:pageErrors.length===0,scenario,setup,before,after,...summary,movement:{route:scenario==='walking'?['w','s','w','s']:[],sampledDistance},raw,errors:pageErrors};
 }finally{await context.close();}
}
async function measureRun(name){
 const version=versions[name.startsWith('before')?'before':'after'],runStartedAt=new Date().toISOString(),sourceHashes=hashMobileSources(version.root),runHarness=hashMobileHarness(),results=[],runErrors=[];
 if(changedHashes(initialSources[name.startsWith('before')?'before':'after'],sourceHashes).length||changedHashes(harnessHashes,runHarness).length)throw Error('Sources/harness changed before run; freeze them and rerun the full ABBA session.');
 const browser=await chromium.launch({...config.use.launchOptions,args:launchArgs,headless:true});
 try{for(const scenario of mobileProtocol.scenarios){const result=await scenarioRun(browser,scenario,version.base);results.push(result);console.log(JSON.stringify({name,scenario,samples:result.cadence.samples,p95Ms:result.cadence.p95Ms,framebuffer:result.before.framebuffer,quality:result.before.quality.active,distance:result.movement.sampledDistance}));}}
 catch(error){runErrors.push(error.stack||String(error));}finally{await browser.close();}
 const report={pass:runErrors.length===0,name,base:version.base,sourceRoot:version.root,sourceHashes,sourceHashesEnd:hashMobileSources(version.root),harnessHashes:runHarness,harnessHashesEnd:hashMobileHarness(),rendererKind:'native',hooks:'off',viewport:mobileProtocol.viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true,profile:'auto',seconds,warmupSeconds:2,setupSimulationSeconds:15,launchArgs,startedAt:runStartedAt,completedAt:new Date().toISOString(),results,errors:runErrors};
 try{validateMobileRun(report);}catch(error){report.pass=false;report.errors.push(error.stack||String(error));}
 writeFileSync(join(directory,`${name}.json`),JSON.stringify(report,null,2));return report;
}
try{for(const name of mobileProtocol.order){const report=await measureRun(name);reports.push(report);if(!report.pass)throw Error(`${name} failed; incomplete session retained for diagnosis.`);}}
catch(error){errors.push(error.stack||String(error));console.error(error.stack||String(error));}
const harnessHashesEnd=hashMobileHarness(),sourceHashesEnd=Object.fromEntries(Object.entries(versions).map(([key,value])=>[key,hashMobileSources(value.root)]));
if(changedHashes(harnessHashes,harnessHashesEnd).length||Object.keys(versions).some(key=>changedHashes(initialSources[key],sourceHashesEnd[key]).length))errors.push('Sources or benchmark harness changed during ABBA session.');
const session={pass:!errors.length&&reports.length===4&&reports.every(report=>report.pass),order:mobileProtocol.order,completedRuns:reports.map(report=>report.name),startedAt,completedAt:new Date().toISOString(),host:{platform:platform(),release:release(),cpu:cpus()[0]?.model??null},protocol:mobileProtocol,seconds,harnessHashes,harnessHashesEnd,sourceHashes:initialSources,sourceHashesEnd,errors,scope:'Native desktop GPU mobile emulation; this is not a phone hardware benchmark. Current development machine uses Intel desktop graphics; actual renderer is recorded per scenario. Baseline and current auto quality can use different framebuffer, antialias and shadow policies. Real W/S keyboard movement provides the same matched route on both versions; touch gestures are verified separately. Baseline is the frozen v0.17 snapshot and candidate is v0.18. This is a frame-cadence regression check, not a claim of a new performance optimization.'};
writeFileSync(join(directory,'measurement-session.json'),JSON.stringify(session,null,2));
if(session.pass){try{const comparison=compareMobileDirectory(directory);console.log(JSON.stringify({pass:true,output:directory,renderer:comparison.renderer,scenarios:comparison.rows.map(row=>row.scenario)}));}catch(error){console.error(error.stack||String(error));process.exitCode=1;}}
else process.exitCode=1;
