import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderQuality} from '../src/render-quality.js';

function harness({gpu='NVIDIA test hardware',dpr=2,stored=null,extension=true,storageThrows=false}={}){
  const calls={ratios:[],sizes:[],saved:[]},gl={RENDERER:1,getExtension:()=>extension?{UNMASKED_RENDERER_WEBGL:2}:null,getParameter:()=>gpu};
  let ratio=1;
  const renderer={getContext:()=>gl,setPixelRatio:value=>{ratio=value;calls.ratios.push(value);},getPixelRatio:()=>ratio,setSize:(w,h)=>calls.sizes.push([w,h]),shadowMap:{},info:{render:{calls:211,triangles:48000}}};
  const environment={devicePixelRatio:dpr,innerWidth:1280,innerHeight:800,localStorage:{getItem(){if(storageThrows)throw new Error('storage blocked');return stored;},setItem:(key,value)=>{if(storageThrows)throw new Error('storage blocked');calls.saved.push({key,value});}}};
  return{q:createRenderQuality({renderer,environment}),renderer,environment,calls};
}

test('hardware auto selects balanced, caps device pixels and configures manually scheduled shadows',()=>{
  const {q,renderer,calls}=harness();assert.equal(q.active,'balanced');assert.equal(renderer.getPixelRatio(),1.25);assert.equal(renderer.shadowMap.enabled,true);assert.equal(renderer.shadowMap.autoUpdate,false);assert.equal(renderer.shadowMap.needsUpdate,true);assert.deepEqual(calls.sizes,[[1280,800]]);
  assert.equal(q.diagnostics().drawCalls,211);assert.equal(q.diagnostics().triangles,48000);
  const low=harness({dpr:.8});assert.equal(low.renderer.getPixelRatio(),.8,'never increase above actual device DPR');
});

test('slow valid frames adapt only auto mode and manual modes remain user-controlled',()=>{
  const {q,renderer}=harness();for(let i=0;i<90;i++)q.recordFrame(40);assert.equal(q.active,'balanced');q.recordFrame(40);assert.equal(q.active,'flow');assert.equal(renderer.getPixelRatio(),.85);assert.equal(renderer.shadowMap.enabled,false);
  for(let i=0;i<300;i++)q.recordFrame(16);assert.equal(q.active,'flow','avoid quality oscillation until user resets auto');
  assert.equal(q.setPreference('clear'),true);for(let i=0;i<150;i++)q.recordFrame(100);assert.equal(q.active,'clear');assert.equal(renderer.getPixelRatio(),1.65);
  q.setPreference('auto');assert.equal(q.active,'balanced');assert.equal(q.diagnostics().frameSamples,0);
});

test('software renderer fallback works with and without debug extension and allows explicit clear mode',()=>{
  for(const gpu of ['ANGLE (SwiftShader Device)','llvmpipe (LLVM 19)','Mesa lavapipe','Microsoft Basic Render Driver','Software Rasterizer'])for(const extension of [true,false]){
    const {q,renderer}=harness({gpu,extension});assert.equal(q.diagnostics().softwareRendering,true,gpu);assert.equal(q.active,'flow');assert.equal(renderer.shadowMap.enabled,false);
    q.setPreference('clear');assert.equal(q.active,'clear');q.setPreference('auto');assert.equal(q.active,'flow');
  }
});

test('preferences persist, invalid stored values fall back and blocked storage is harmless',()=>{
  for(const stored of ['flow','clear'])assert.equal(harness({stored}).q.active,stored);
  const {q,calls}=harness({stored:'invalid'});assert.equal(q.diagnostics().preference,'auto');assert.equal(q.setPreference('unknown'),false);assert.equal(calls.saved.length,0);
  q.setPreference('flow');assert.deepEqual(calls.saved,[{key:'form.graphics-quality.v1',value:'flow'}]);
  const locked=harness({storageThrows:true});assert.equal(locked.q.active,'balanced');assert.doesNotThrow(()=>locked.q.setPreference('clear'));assert.equal(locked.q.active,'clear');
});

test('resize re-evaluates device DPR caps and uses the current viewport without redundant preset changes',()=>{
  const {q,environment,calls,renderer}=harness();q.setPreference('clear');const count=calls.sizes.length;q.setPreference('clear');assert.equal(calls.sizes.length,count);
  environment.devicePixelRatio=3;environment.innerWidth=1920;environment.innerHeight=1080;q.resize();assert.equal(renderer.getPixelRatio(),1.65);assert.deepEqual(calls.sizes.at(-1),[1920,1080]);
  environment.devicePixelRatio=1;q.resize();assert.equal(renderer.getPixelRatio(),1);
});

test('balanced shadows are throttled to 12Hz, running raises cadence, clear uses 30Hz and flow disables them',()=>{
  const {q,renderer}=harness();const step=(time,running=false)=>{renderer.shadowMap.needsUpdate=false;q.beforeRender(time,running);return renderer.shadowMap.needsUpdate;};
  assert.equal(step(0),true);assert.equal(step(.04),false);assert.equal(step(.0834),true);assert.equal(step(.10),false);assert.equal(step(.1251,true),true);assert.equal(step(.14,true),false);
  q.setPreference('clear');assert.equal(step(.159),true);assert.equal(step(.18),false);assert.equal(step(.193),true);
  q.setPreference('flow');assert.equal(step(20,true),false);assert.equal(q.diagnostics().shadowHz,0);
});

test('frame observations retain timing evidence and ignore startup stalls or invalid frame durations',()=>{
  const {q}=harness();for(const value of [NaN,Infinity,-1,0,.5,251,1000])q.recordFrame(value);assert.equal(q.diagnostics().frameSamples,0);assert.equal(q.diagnostics().fps,0);
  q.recordFrame(20);q.recordFrame(40);q.observe(8,12);q.observe(12,20);const d=q.diagnostics();assert.equal(d.frameSamples,2);assert.equal(d.frameMs,21);assert.ok(Math.abs(d.fps-1000/21)<1e-9);assert.ok(Math.abs(d.cpuMs-8.2)<1e-9);assert.ok(Math.abs(d.renderMs-12.4)<1e-9);
  for(const skipped of [null,undefined,NaN,Infinity])q.observe(10,skipped);assert.equal(q.diagnostics().renderMs,d.renderMs,'a skipped render must not dilute or corrupt render timing');
});
