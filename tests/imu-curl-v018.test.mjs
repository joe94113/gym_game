import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildImuCurlDataset,parseImuCurlCSV,findCorrectImuRuns,unwrapImuDegrees,buildImuCurlClip,imuCurlRawPath} from '../scripts/import-imu-curl-v018.mjs';
import {imuCurlCaptureClips,sampleImuCurlCapture} from '../src/imu-curl-data-v018.js';
const sha=x=>createHash('sha256').update(x).digest('hex'),parsed=parseImuCurlCSV(readFileSync(imuCurlRawPath,'utf8')),manifest=JSON.parse(readFileSync('public/motions/uci-curl-v018.json'));

test('two IMU curves reproduce exact official source, crop, license and time-based resampling',()=>{
 const rebuilt=buildImuCurlDataset();assert.equal(rebuilt.module,readFileSync('src/imu-curl-data-v018.js','utf8'));assert.deepEqual(rebuilt.clips,imuCurlCaptureClips);assert.deepEqual(rebuilt.manifest,manifest);
 assert.equal(manifest.source.rawSHA256,sha(readFileSync(imuCurlRawPath)));assert.equal(manifest.generatorSHA256,sha(readFileSync('scripts/import-imu-curl-v018.mjs')));assert.equal(manifest.dataModule.sha256,sha(readFileSync(manifest.dataModule.path)));assert.equal(manifest.license.id,'CC-BY-4.0');assert.equal(manifest.paper.loadKg,1.25);assert.equal(manifest.professionalReview.status,'pending');
 assert.deepEqual(imuCurlCaptureClips.map(c=>[c.first,c.last]),[[2464,2574],[2628,2737]]);assert.equal(imuCurlCaptureClips.length,2);assert.ok(manifest.dataModule.bytes<30000);
 for(const c of imuCurlCaptureClips){for(const key of ['progress','rawMetric','unwrappedMetric','rawSampleRows'])assert.equal(c[key].length,121);assert.equal(c.durationSeconds,Number(((c.lastTimeUs-c.firstTimeUs)/1e6).toFixed(6)));assert.ok(c.maxGapSeconds<=.2);assert.equal(c.sourceClass,'A');assert.match(c.scope,/not elbow angle/);assert.ok(Math.max(...c.unwrappedMetric)-Math.min(...c.unwrappedMetric)>100);}
});

test('duplicate CSV names are preserved without corrupting raw channel indexes; A-only runs respect clock gaps',()=>{
 assert.equal(parsed.headerLine,4);assert.equal(parsed.headers.length,159);assert.equal(parsed.headers.filter(h=>h==='skewness_roll_belt').length,2);assert.equal(parsed.records.length,4024);
 assert.equal(parsed.records[0].user_name,'eurico');assert.equal(parsed.records[0].classe,'E');assert.equal(parsed.records[0].scalar,-111);
 for(const run of findCorrectImuRuns(parsed.records)){for(let i=0;i<run.length;i++){assert.equal(run[i].classe,'A');assert.equal(run[i].new_window,'no');if(i){assert.equal(run[i].user_name,run[i-1].user_name);assert.ok(run[i].timeUs>run[i-1].timeUs);assert.ok(run[i].timeUs-run[i-1].timeUs<=200000);}}}
 assert.deepEqual(unwrapImuDegrees([170,179,-179,-170,-179,179]),[170,179,181,190,181,179]);assert.throws(()=>unwrapImuDegrees([NaN]),/Nonfinite/);
 assert.throws(()=>parseImuCurlCSV('not a dataset'),/Missing original/);
});

test('sampler is bounded C1 and monotone on both measured excursion phases',()=>{
 for(const c of imuCurlCaptureClips){assert.equal(sampleImuCurlCapture(c.id,0),0);assert.equal(sampleImuCurlCapture(c.id,1),0);assert.equal(sampleImuCurlCapture(c.id,c.peakIndex/120),1);let previous=0;
  for(let i=0;i<=10000;i++){const phase=i/10000,p=sampleImuCurlCapture(c.id,phase);assert.ok(Number.isFinite(p)&&p>=0&&p<=1);if(phase<=c.peakIndex/120)assert.ok(p>=previous-1e-12);else if((i-1)/10000>=c.peakIndex/120)assert.ok(p<=previous+1e-12);previous=p;}
  const h=1e-8;assert.ok(sampleImuCurlCapture(c.id,h)/h<.001);assert.ok(sampleImuCurlCapture(c.id,1-h)/h<.001);
 }assert.equal(sampleImuCurlCapture('unknown',.5),null);assert.equal(sampleImuCurlCapture(imuCurlCaptureClips[0],NaN),null);assert.equal(sampleImuCurlCapture(imuCurlCaptureClips[0],-1),0);
});

test('unsafe/missing/mixed source crops are rejected instead of inventing captured cycles',()=>{
 assert.throws(()=>buildImuCurlClip(parsed.records,{id:'bad',first:1,last:200}),/class\/subject\/timestamp/);
 assert.throws(()=>buildImuCurlClip(parsed.records,{id:'gap',first:2396,last:2813}),/class\/subject\/timestamp/);
 assert.throws(()=>buildImuCurlClip(parsed.records,{id:'static',first:404,last:600}),/No complete/);
 const bad=parsed.records.map(r=>r.row===2500?{...r,classe:'B'}:r);assert.throws(()=>buildImuCurlClip(bad,{id:'badclass',first:2464,last:2574}),/class\/subject\/timestamp/);
 const reversed=parsed.records.map(r=>r.row===2500?{...r,timeUs:r.timeUs-1000000}:r);assert.throws(()=>buildImuCurlClip(reversed,{id:'badtime',first:2464,last:2574}),/class\/subject\/timestamp/);
});
