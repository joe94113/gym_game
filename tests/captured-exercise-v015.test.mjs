import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {capturedExerciseEffort,capturedExerciseScope} from '../src/captured-exercise-v015.js';
import {capturedPressCurves,capturedSquatCurves} from '../src/captured-exercise-curves-v015.js';
import {parseCmuMotion,measuredPressCurve} from '../scripts/cmu-motion-v015.mjs';

const record=JSON.parse(readFileSync('public/motions/cmu-exercise-v015.json','utf8'));
test('capture is two real repetitions of one standing dumbbell press, not two exercise claims',()=>{
  assert.equal(capturedExerciseScope.repetitions,4);assert.equal(capturedExerciseScope.humanApproval,false);assert.equal(record.motion,'79_93');assert.equal(record.fps,60);assert.equal(record.sourceFrames,1138);
  assert.deepEqual(record.clips.map(({firstFrame,peakFrame,lastFrame})=>[firstFrame,peakFrame,lastFrame]),[[213,389,559],[559,712,836]]);
  assert.notDeepEqual(capturedPressCurves[0].progress,capturedPressCurves[1].progress);
  for(const [i,clip]of record.clips.entries()){
    assert.equal(clip.samples.length,clip.lastFrame-clip.firstFrame+1);assert.equal(clip.samples[0].frame,clip.firstFrame);assert.equal(clip.samples.at(-1).frame,clip.lastFrame);
    assert.deepEqual(clip.progress,capturedPressCurves[i].progress);
    for(const sample of clip.samples)for(const vector of [...sample.upper,...sample.lower])assert.ok(Math.abs(Math.hypot(...vector)-1)<1e-5);
  }
});
test('dense retiming remains within the old effort range with one ascent and descent',()=>{
  for(const id of capturedExerciseScope.exerciseIds)for(let cycle=0;cycle<2;cycle++){
    const samples=Array.from({length:10001},(_,i)=>capturedExerciseEffort(id,i/10000,cycle));
    assert.equal(samples[0],0);assert.equal(samples.at(-1),0);assert.ok(Math.max(...samples)>.99999);
    const peak=samples.indexOf(Math.max(...samples));
    for(let i=0;i<samples.length;i++){assert.ok(Number.isFinite(samples[i])&&samples[i]>=0&&samples[i]<=1);if(i)assert.ok(i<=peak?samples[i]>=samples[i-1]-1e-10:samples[i]<=samples[i-1]+1e-10);}
  }
});
test('alternating capture repetitions join at the same resting target with zero boundary tangent',()=>{
  for(const id of capturedExerciseScope.exerciseIds)for(let cycle=0;cycle<4;cycle++){
    assert.equal(capturedExerciseEffort(id,1,cycle),capturedExerciseEffort(id,0,cycle+1));
    const h=1e-7,start=capturedExerciseEffort(id,h,cycle)/h,end=capturedExerciseEffort(id,1-h,cycle)/h;
    assert.ok(Math.abs(start)<.001);assert.ok(Math.abs(end)<.001);
  }
});
test('squat reference explicitly preserves its unweighted source and exact crop frames',()=>{
  const squat=JSON.parse(readFileSync('public/motions/cmu-squat-v015.json','utf8'));
  assert.equal(squat.motion,'13_29');assert.equal(squat.fps,120);assert.equal(squat.sourceFrames,4592);assert.match(squat.loadInSource,/bodyweight only/);
  assert.deepEqual(squat.clips.map(({firstFrame,peakFrame,lastFrame})=>[firstFrame,peakFrame,lastFrame]),[[3792,3985,4143],[4143,4358,4501]]);
  for(const [i,clip]of squat.clips.entries()){assert.deepEqual(clip.progress,capturedSquatCurves[i].progress);assert.equal(clip.samples.length,clip.lastFrame-clip.firstFrame+1);for(const sample of clip.samples)for(const vector of [...sample.thighs,...sample.shins])assert.ok(Math.abs(Math.hypot(...vector)-1)<1e-5);}
});
test('unmapped exercises and invalid phases do not receive a guessed captured animation',()=>{
  for(const id of ['dumbbell-curl','dumbbell-hammer-curl','machine-seated-row',''])assert.equal(capturedExerciseEffort(id,.5,0),null);
  assert.equal(capturedExerciseEffort('dumbbell-shoulder-press',NaN),null);assert.equal(capturedExerciseEffort('dumbbell-shoulder-press',.5,Infinity),null);
  assert.equal(capturedExerciseEffort('dumbbell-shoulder-press',-1),0);assert.equal(capturedExerciseEffort('dumbbell-shoulder-press',2),0);
});
test('offline importer rejects malformed raw data instead of silently creating missing motion',()=>{
  assert.throws(()=>parseCmuMotion('',':DEGREES\n1\nroot 0 0 0 0 0 0'));
  assert.throws(()=>parseCmuMotion(':bonedata\nbegin\nname bad\nend\n:hierarchy\nroot bad',':DEGREES\n1\nroot 0 0 0 0 0 0'));
  assert.throws(()=>measuredPressCurve({frames:3,samples:[]},{firstFrame:2,lastFrame:1,peakFrame:3}));
});
