import {test} from 'node:test';import assert from 'node:assert/strict';
import {createPerformanceCapture,frameSummary} from '../src/performance-capture-v015.js';
const fixture=()=>{let now=0,visible=true,active='clear',callbacks=0;const capture=createPerformanceCapture({clock:()=>now,isVisible:()=>visible,getContext:()=>({quality:{active,pixelRatio:1,shadows:true},framebuffer:[1280,800]}),onComplete:()=>callbacks++});return{capture,advance(ms){now+=ms;capture.record(ms);},hide(){visible=false;},quality(value){active=value;},callbacks:()=>callbacks};};
test('actual long frames are retained instead of being filtered as outliers',()=>{
 const {capture,advance,callbacks}=fixture();capture.start(1);advance(10);advance(10);advance(400);advance(600);const report=capture.getReport();assert.equal(report.status,'complete');assert.deepEqual(report.frames.map(frame=>frame.intervalMs),[10,400,600]);assert.equal(report.summary.maxMs,600);assert.equal(report.summary.samples,3);assert.equal(callbacks(),1);
});
test('background interruption prevents a normal completed comparison',()=>{const f=fixture();f.capture.start(1);f.advance(16);f.hide();f.advance(1000);assert.equal(f.capture.getStatus().status,'interrupted');assert.ok(f.capture.getReport().reason);});
test('adaptive quality is recorded and cannot look like fixed-quality evidence',()=>{const f=fixture();f.capture.start(1);f.advance(16);f.quality('flow');f.advance(1000);assert.equal(f.capture.getReport().fixedQuality,false);});
test('idle recording does no diagnostic work and report callers cannot mutate samples',()=>{
 let calls=0;const c=createPerformanceCapture({getContext:()=>{calls++;return{};}});for(let i=0;i<100;i++)c.record(16);assert.equal(calls,0);c.start(1);const copy=c.getReport();copy.frames.push({intervalMs:999});assert.equal(c.getReport().frames.length,0);assert.equal(c.start(1),false);
});
test('summary exposes mean, percentile and long-frame proportions from actual values',()=>{assert.deepEqual(frameSummary([10,10,20,100]),{samples:4,meanMs:35,p50Ms:10,p95Ms:20,p99Ms:20,maxMs:100,over50Percent:25});assert.equal(frameSummary([]),null);});
