import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileProtocol,summarizeMobileFrames,validateMobileRun,compareMobileRuns,changedHashes} from '../scripts/mobile-performance-common-v016.mjs';

// Synthetic fixtures exercise validation only. They are never performance data.
function fixture(name,index){
 const before=name.startsWith('before'),quality={preference:'auto',active:before?'balanced':'flow',pixelRatio:before?1.25:1,shadows:before,shadowHz:before?12:0,...(before?{}:{deviceTier:'mobile',pixelBudget:700000,autoReason:'mobile-budget'})};
 const framebuffer=before?[487,1055]:[390,844],position={x:1,y:0,z:2},state={quality,framebuffer,position,heading:0,activity:{exerciseId:'dumbbell-bench-press'}},camera={position:[6,6,9],target:[1,1,2]};
 const result=scenario=>{
  const frames=Array.from({length:480},(_,i)=>({t:(i+1)*8000/480,intervalMs:8000/480,callbackMs:before?6:4,framebuffer}));
  const raw={frames,telemetry:[{...state,t:0},{...state,t:7900,position:{...position,z:3}}],keys:scenario==='walking'?[{type:'keydown',key:'w'},{type:'keydown',key:'s'}]:[],requestedMs:8000,elapsedMs:8000,detected:{name:'frame',proof:'Named app frame callback contains recordFrameTiming.'},visibility:'visible',glWrappers:false};
  return{pass:true,scenario,setup:{...state,renderer:'ANGLE (Intel, Intel(R) UHD Graphics, D3D11)',contextAttributes:{antialias:before,powerPreference:before?'high-performance':'low-power'},emulation:{width:390,height:844,devicePixelRatio:3,coarsePointer:true,hoverNone:true,maxTouchPoints:1},initialDefault:quality,camera},before:state,after:state,...summarizeMobileFrames(frames),movement:{route:scenario==='walking'?['w','s','w','s']:[],sampledDistance:2},raw,errors:[]};
 };
 const timestamp=Date.UTC(2026,9,29)+index*30000;
 return{pass:true,name,rendererKind:'native',hooks:'off',viewport:mobileProtocol.viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true,seconds:8,warmupSeconds:2,profile:'auto',sourceHashes:{'src/world.js':before?'before':'after'},sourceHashesEnd:{'src/world.js':before?'before':'after'},harnessHashes:{'harness.mjs':'abc'},harnessHashesEnd:{'harness.mjs':'abc'},startedAt:new Date(timestamp).toISOString(),completedAt:new Date(timestamp+29000).toISOString(),results:mobileProtocol.scenarios.map(result),errors:[]};
}
function reports(){return mobileProtocol.order.map(fixture);}
test('mobile comparison pools raw frames and preserves distinct quality/context budgets',()=>{
 const result=compareMobileRuns(reports());assert.equal(result.pass,true);assert.equal(result.rows.length,2);assert.equal(result.rows[0].before.cadence.samples,960);assert.equal(result.rows[0].after.cadence.samples,960);
 assert.ok(Math.abs(result.rows[0].changePercent.callbackMeanMs+100/3)<1e-8);assert.equal(result.rows[0].before.observedBudgets[0].budgets[0].pixelRatio,1.25);assert.equal(result.rows[0].after.observedBudgets[0].budgets[0].pixelBudget,700000);assert.equal(result.rows[0].after.observedBudgets[0].contextAttributes.antialias,false);assert.match(result.scope,/not a physical phone/);
});
test('mobile comparator rejects tampered cadence and changed source/harness hashes',()=>{
 const cadence=reports();cadence[1].results[0].cadence.p95Ms=1;assert.throws(()=>compareMobileRuns(cadence),/disagrees with raw frames/);
 const source=reports();source[2].sourceHashesEnd['src/world.js']='changed';assert.throws(()=>compareMobileRuns(source),/changed during measurement/);
 const harness=reports();harness[3].harnessHashes['harness.mjs']='changed';harness[3].harnessHashesEnd['harness.mjs']='changed';assert.throws(()=>compareMobileRuns(harness),/Harness differs/);
 assert.deepEqual(changedHashes({a:'1',b:'2'},{a:'1',c:'3'}),['b','c']);
});
test('mobile comparator rejects incomplete, short, wrong renderer or wrong emulator measurements',()=>{
 assert.throws(()=>compareMobileRuns(reports().slice(0,3)),/complete sequential ABBA/);
 const short=fixture('before-1',0);short.seconds=2;assert.throws(()=>validateMobileRun(short),/duration/);
 const emulation=fixture('before-1',0);emulation.results[0].setup.emulation.coarsePointer=false;assert.throws(()=>validateMobileRun(emulation),/capabilities/);
 const software=fixture('before-1',0);software.results[0].setup.renderer='SwiftShader';assert.throws(()=>validateMobileRun(software),/software/);
 const terminal=fixture('before-1',0),frames=terminal.results[0].raw.frames;frames.at(-1).t=7999;frames.at(-1).intervalMs=7999-frames.at(-2).t;assert.throws(()=>validateMobileRun(terminal),/terminal frame/);
});
