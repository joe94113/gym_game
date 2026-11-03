import test from 'node:test';
import assert from 'node:assert/strict';
import {lowerBodyCapturedEffort,lowerBodyCaptureIds,lowerBodyCaptureInfo,applyLowerBodyReference,sampleLowerBodyReference} from '../src/lower-body-capture-v018.js';

test('the measured lower-body mapping exposes eight explicitly limited adaptations',()=>{
  assert.equal(lowerBodyCaptureIds.length,8);
  for(const id of lowerBodyCaptureIds){const info=lowerBodyCaptureInfo(id);assert.equal(info.humanApproval,false);assert.equal(info.upperBodyCaptured,false);assert.equal(info.repetitions,3);assert.equal(info.license,'CC BY 4.0');assert.ok(['measured-tempo','pelvis-reference-and-tempo'].includes(info.kind));}
  assert.match(lowerBodyCaptureInfo('dumbbell-romanian-deadlift').sourceLoad,/box.*A4/);assert.match(lowerBodyCaptureInfo('dumbbell-romanian-deadlift').scope,/not a dumbbell RDL capture/);
  assert.match(lowerBodyCaptureInfo('machine-calf-raise').sourceLoad,/Standing bilateral/);
  assert.equal(lowerBodyCaptureInfo('machine-bench-press'),null);
});

test('all three measured repetitions keep exact mounted rest/peak endpoints with smooth C1 joins',()=>{
  const h=1e-7;
  for(const id of lowerBodyCaptureIds)for(let cycle=0;cycle<3;cycle++){
    assert.equal(lowerBodyCapturedEffort(id,0,cycle),0);assert.equal(lowerBodyCapturedEffort(id,.44,cycle),1);assert.equal(lowerBodyCapturedEffort(id,1,cycle),0);
    assert.ok(lowerBodyCapturedEffort(id,h,cycle)/h<.002,`${id}: start derivative`);
    assert.ok(lowerBodyCapturedEffort(id,1-h,cycle)/h<.002,`${id}: end derivative`);
    assert.ok((1-lowerBodyCapturedEffort(id,.44-h,cycle))/h<.002,`${id}: peak before derivative`);
    assert.ok((1-lowerBodyCapturedEffort(id,.44+h,cycle))/h<.002,`${id}: peak after derivative`);
    assert.ok(Math.abs(lowerBodyCapturedEffort(id,1-h,cycle)-lowerBodyCapturedEffort(id,h,cycle+1))<1e-8,`${id}: repetition join`);
  }
});

test('dense paced curves stay within range, monotone per half and below the loaded-mechanism phase-rate bound',()=>{
  const step=1/10000;let maxSlope=0;
  for(const id of lowerBodyCaptureIds)for(let cycle=0;cycle<3;cycle++){
    let previous=lowerBodyCapturedEffort(id,0,cycle);
    for(let i=1;i<=10000;i++){
      const p=i*step,value=lowerBodyCapturedEffort(id,p,cycle);assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
      maxSlope=Math.max(maxSlope,Math.abs(value-previous)/step);
      if(p<=.44)assert.ok(value>=previous-1e-10);else if(p-step>=.44)assert.ok(value<=previous+1e-10);previous=value;
    }
  }
  assert.ok(maxSlope<6,`paced effort phase rate ${maxSlope} must stay below 6`);
});

test('RDL translation preserves authored torso/hand geometry and feet while bounding only a measured pelvis reference',()=>{
  const pose={hip:[0,.9,0],shoulder:[0,1.3,.25],head:[0,1.5,.3],hands:[[-.3,.6,.3],[.3,.6,.3]],elbows:[[-.3,.9,.3],[.3,.9,.3]],feet:[[-.18,0,.1],[.18,0,.1]],handDirections:[[1,0,0],[1,0,0]],kneeHints:[[0,0,1],[0,0,1]]},metrics={legs:[{upper:.42,lower:.4},{upper:.42,lower:.4}]},original=JSON.stringify(pose);
  let changed=0;
  for(let cycle=0;cycle<3;cycle++)for(let i=0;i<=120;i++){
    const phase=i/120,out=applyLowerBodyReference({id:'dumbbell-romanian-deadlift',phase,cycle,pose,metrics});
    assert.equal(out.feet,pose.feet);assert.equal(out.handDirections,pose.handDirections);assert.equal(out.kneeHints,pose.kneeHints);
    if(!phase||phase===1){assert.equal(out,pose);continue;}
    const delta=out.hip.map((v,j)=>v-pose.hip[j]);changed=Math.max(changed,Math.hypot(...delta));delta.forEach(v=>assert.ok(Math.abs(v)<=.008+1e-12));
    for(const field of ['shoulder','head'])out[field].forEach((v,j)=>assert.ok(Math.abs(v-pose[field][j]-delta[j])<1e-12));
    for(const field of ['hands','elbows'])out[field].forEach((point,side)=>point.forEach((v,j)=>assert.ok(Math.abs(v-pose[field][side][j]-delta[j])<1e-12)));
  }
  assert.equal(JSON.stringify(pose),original);assert.ok(changed>.003);assert.equal(applyLowerBodyReference({id:'machine-leg-press',phase:.5,pose,metrics}),pose);
});

test('source references remain actual lower-body markers and invalid inputs do not invent a capture',()=>{
  for(const task of ['deadlift','deep_squat','heel_raise','stand_sit_transition'])for(let cycle=0;cycle<3;cycle++){
    const p=sampleLowerBodyReference(task,.5,cycle);assert.ok(p.pelvis.every(Number.isFinite));assert.equal(p.thighs.length,2);assert.match(p.scope,/no trunk, head or arm/);assert.match(p.sourceUnit,/not metres or anatomical hip/);
  }
  assert.equal(lowerBodyCapturedEffort('dumbbell-bench-press',.5),null);assert.equal(lowerBodyCapturedEffort('machine-leg-press',NaN),null);assert.equal(lowerBodyCapturedEffort('machine-leg-press',.4,Infinity),null);assert.equal(sampleLowerBodyReference('unknown',.5),null);assert.equal(sampleLowerBodyReference('deadlift',NaN),null);
});
