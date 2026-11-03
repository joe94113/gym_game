import test from 'node:test';
import assert from 'node:assert/strict';
import {frameStatistics,hardwareRenderer,fixedProfileSettings} from '../scripts/perf-stats-v013.mjs';
test('cadence statistics retain severe stalls and recompute both late-frame thresholds',()=>{
 const actual=frameStatistics([10,20,30,60,100]);assert.equal(actual.samples,5);assert.equal(actual.meanMs,44);assert.equal(actual.p50Ms,30);assert.equal(actual.p95Ms,60);assert.equal(actual.over25Percent,60);assert.equal(actual.over50Percent,40);
 for(const values of [[],[0,1],[1,NaN],[1,Infinity],[-1,1]])assert.throws(()=>frameStatistics(values));
});
test('fixed-profile comparisons reject software, adaptive quality and mismatched framebuffer',()=>{
 const setup={renderer:'ANGLE (Intel UHD Graphics 630, D3D11)',framebuffer:[1088,680],quality:{active:'flow',pixelRatio:.85,shadows:false}};
 assert.equal(fixedProfileSettings(setup,'flow').active,'flow');assert.equal(hardwareRenderer('SwiftShader'),false);
 for(const bad of [{...setup,renderer:'SwiftShader'},{...setup,framebuffer:[1280,800]},{...setup,quality:{...setup.quality,active:'balanced'}},{...setup,quality:{...setup.quality,shadows:true}}])assert.throws(()=>fixedProfileSettings(bad,'flow'));
});
