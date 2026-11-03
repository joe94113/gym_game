import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectDeviceProfile,budgetPixelRatio,initialRendererConfiguration} from '../src/device-profile-v016.js';
import {createRenderQuality} from '../src/render-quality.js';

function environment({width=390,height=844,dpr=3,touchPoints=5,coarse=true,hover=false,fine=false,stored=null}={}){
  return{innerWidth:width,innerHeight:height,devicePixelRatio:dpr,navigator:{maxTouchPoints:touchPoints,userAgent:'test'},matchMedia:media=>({matches:media==='(pointer: coarse)'?coarse:media==='(pointer: fine)'?fine:media==='(hover: none)'?!hover:media==='(hover: hover)'?hover:false}),localStorage:{getItem:()=>stored,setItem(){}}};
}
function harness(options={}){
  const env=environment(options);let ratio=1;const calls={sizes:[],ratios:[]};
  const renderer={getContext:()=>({getExtension:()=>null,getParameter:()=>options.gpu||'Native mobile GPU'}),setPixelRatio:value=>{ratio=value;calls.ratios.push(value);},getPixelRatio:()=>ratio,setSize:(...args)=>calls.sizes.push(args),shadowMap:{},info:{render:{calls:200,triangles:300000}}};
  return{q:createRenderQuality({renderer,environment:env}),renderer,env,calls};
}
test('compact primary-touch capability selects mobile without relying on a user agent',()=>{
  const env=environment();env.navigator.userAgent='Desktop-looking user agent';assert.equal(detectDeviceProfile(env).deviceTier,'mobile');
  env.innerWidth=844;env.innerHeight=390;assert.equal(detectDeviceProfile(env).deviceTier,'mobile');
});
test('touch laptops with fine pointer and hover retain desktop rendering',()=>{
  for(const size of [[1366,768],[900,600],[390,844]])assert.equal(detectDeviceProfile(environment({width:size[0],height:size[1],coarse:false,fine:true,hover:true,touchPoints:10})).deviceTier,'desktop');
  const env=environment({coarse:false,fine:true,hover:true});env.navigator.userAgent='Android Mobile';assert.equal(detectDeviceProfile(env).deviceTier,'desktop');
});
test('missing touch/media evidence and oversized desktops do not become phones',()=>{
  assert.equal(detectDeviceProfile(environment({touchPoints:0})).deviceTier,'desktop');
  assert.equal(detectDeviceProfile({innerWidth:390,innerHeight:844,navigator:{maxTouchPoints:5}}).deviceTier,'desktop');
  assert.equal(detectDeviceProfile(environment({width:1920,height:1080})).deviceTier,'desktop');
});
test('initial renderer setup prevents retina-sized allocation and documents the power hint',()=>{
  const mobile=initialRendererConfiguration(environment({dpr:4}));assert.equal(mobile.antialias,false);assert.equal(mobile.pixelRatio,1);assert.equal(mobile.shadows,false);assert.equal(mobile.pixelBudget,700000);
  const desktop=initialRendererConfiguration(environment({coarse:false,fine:true,hover:true,dpr:3}));assert.equal(desktop.antialias,true);assert.equal(desktop.pixelRatio,1.65);assert.equal(desktop.powerPreference,'high-performance');assert.equal(desktop.shadows,true);
});
test('mobile auto begins inside its pixel budget with no dynamic shadow pass',()=>{
  const {q}=harness();const d=q.diagnostics();assert.equal(q.active,'flow');assert.equal(d.pixelRatio,1);assert.equal(d.shadows,false);assert.equal(d.shadowHz,0);assert.equal(d.deviceTier,'mobile');assert.equal(d.autoReason,'mobile-budget');assert.equal(d.pixelBudget,700000);assert.ok(d.framebufferPixels<=d.pixelBudget);
});
test('large touch tablets obey a total pixel budget rather than only a DPR cap',()=>{
  const {q}=harness({width:1024,height:1366,dpr:3});const d=q.diagnostics();assert.equal(d.deviceTier,'mobile');assert.ok(d.pixelRatio<1);assert.ok(d.framebufferPixels<=700000);assert.ok(d.framebufferPixels>690000);
  assert.equal(budgetPixelRatio({width:390,height:844,devicePixelRatio:.5,maxRatio:1,pixelBudget:700000}),.5);
});
test('sustained mobile pressure can reduce resolution once while staying in flow',()=>{
  const {q,calls}=harness();for(let i=0;i<91;i++)q.recordFrame(40);assert.equal(q.active,'flow');assert.equal(q.diagnostics().pixelRatio,.75);assert.equal(q.diagnostics().mobileReduced,true);assert.equal(q.diagnostics().autoReason,'sustained-frame-time');
  const changes=calls.ratios.length;for(let i=0;i<1000;i++)q.recordFrame(16);assert.equal(q.diagnostics().pixelRatio,.75);assert.equal(calls.ratios.length,changes);
  q.setPreference('auto');assert.equal(q.diagnostics().pixelRatio,1);assert.equal(q.diagnostics().mobileReduced,false);
});
test('mobile manual presets expose bounded detail and a conservative running shadow cadence',()=>{
  const {q,renderer}=harness();q.setPreference('clear');const detail=q.diagnostics();assert.equal(detail.pixelRatio,1.25);assert.equal(detail.shadows,true);assert.equal(detail.shadowHz,12);assert.equal(detail.pixelBudget,1050000);
  renderer.shadowMap.needsUpdate=false;q.beforeRender(0,true);assert.equal(renderer.shadowMap.needsUpdate,true);renderer.shadowMap.needsUpdate=false;q.beforeRender(.05,true);assert.equal(renderer.shadowMap.needsUpdate,false);q.beforeRender(.084,true);assert.equal(renderer.shadowMap.needsUpdate,true);
  q.setPreference('flow');assert.equal(q.diagnostics().pixelRatio,.85);assert.equal(q.diagnostics().shadows,false);
});
test('rotation and viewport resize recompute the cap without increasing above the hardware DPR',()=>{
  const {q,env,calls}=harness();env.innerWidth=844;env.innerHeight=390;q.resize();assert.deepEqual(calls.sizes.at(-1),[844,390]);assert.equal(q.diagnostics().deviceTier,'mobile');assert.equal(q.diagnostics().pixelRatio,1);
  env.innerWidth=1280;env.innerHeight=768;q.resize();assert.ok(q.diagnostics().framebufferPixels<=700000);assert.ok(q.diagnostics().pixelRatio<1);
  env.devicePixelRatio=.6;q.resize();assert.equal(q.diagnostics().pixelRatio,.6);
});
test('manual clear remains user-selected and software auto fallback retains its semantics',()=>{
  const mobile=harness({stored:'clear'});for(let i=0;i<150;i++)mobile.q.recordFrame(80);assert.equal(mobile.q.active,'clear');assert.equal(mobile.q.diagnostics().shadows,true);
  const software=harness({gpu:'ANGLE SwiftShader'});assert.equal(software.q.active,'flow');assert.equal(software.q.diagnostics().autoReason,'software');assert.equal(software.q.diagnostics().pixelRatio,.75);software.q.setPreference('clear');assert.equal(software.q.active,'clear');assert.equal(software.q.diagnostics().shadows,true);
});
