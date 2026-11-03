import test from 'node:test';
import assert from 'node:assert/strict';
import {lateralReferenceEffort,lateralReferencePlane,lateralReferenceInfo} from '../src/lateral-reference-v018.js';
import {upperBodyClips} from '../src/upper-body-data-v018.js';

const id='dumbbell-lateral-raise';
test('loaded lateral-raise reference explicitly describes unweighted right-arm capture and derived left mirror',()=>{
 const info=lateralReferenceInfo(id);assert.equal(info.repetitions,2);assert.equal(info.license,'PDDL-1.0');assert.equal(info.capturedSide,'right');assert.equal(info.leftArmDerivedByMirroring,true);assert.equal(info.humanApproval,false);assert.match(info.scope,/Unloaded/);assert.match(info.scope,/Loaded elevation, elbow bend and wrist grips retain the authored limits/);
 assert.deepEqual(upperBodyClips.filter(clip=>clip.task==='m07').map(clip=>clip.id),['uiprmd-vicon-m07-s01-e02','uiprmd-vicon-m07-s01-e03']);
});

test('two actual source repetitions yield bounded paced effort and nonzero bounded arm-plane references',()=>{
 let difference=0,maxRate=0,planeMaximum=0;
 for(let cycle=0;cycle<2;cycle++){
  assert.equal(lateralReferenceEffort(id,0,cycle),0);assert.equal(lateralReferenceEffort(id,.44,cycle),1);assert.equal(lateralReferenceEffort(id,1,cycle),0);let previous=0;
  for(let i=0;i<=10000;i++){
   const phase=i/10000,e=lateralReferenceEffort(id,phase,cycle),plane=lateralReferencePlane(id,phase,cycle);assert.ok(Number.isFinite(e)&&e>=0&&e<=1);assert.ok(Number.isFinite(plane)&&plane>=-.06-1e-12&&plane<=.10+1e-12);if(i)maxRate=Math.max(maxRate,Math.abs(e-previous)*10000);previous=e;planeMaximum=Math.max(planeMaximum,Math.abs(plane));if(cycle===1)difference=Math.max(difference,Math.abs(e-lateralReferenceEffort(id,phase,0)));
  }
 }
 assert.ok(maxRate<6);assert.ok(planeMaximum>.01);assert.ok(difference>.005);
});

test('paced scalar and bounded optical plane are C1 at every interpolation knot with zero-speed rest/turnaround joins',()=>{
 const h=1e-7;
 for(let cycle=0;cycle<2;cycle++){
  for(const phase of [0,.44,1]){assert.equal(lateralReferencePlane(id,phase,cycle)===0||phase===.44,true);for(const direction of [-1,1]){const at=phase+direction*h;if(at<0||at>1)continue;assert.ok(Math.abs((lateralReferenceEffort(id,at,cycle)-lateralReferenceEffort(id,phase,cycle))/h)<.001);assert.ok(Math.abs((lateralReferencePlane(id,at,cycle)-lateralReferencePlane(id,phase,cycle))/h)<.001);}}
  for(let i=1;i<60;i++)for(const phase of [.44*i/60,.44+.56*i/60])for(const fn of [lateralReferenceEffort,lateralReferencePlane]){const center=fn(id,phase,cycle),left=(center-fn(id,phase-h,cycle))/h,right=(fn(id,phase+h,cycle)-center)/h;assert.ok(Math.abs(left-right)<.002,`${fn.name} cycle${cycle} knot${phase} derivative jump${Math.abs(left-right)}`);}
 }
});

test('only lateral raise is mapped and invalid inputs cannot introduce NaN into a rig',()=>{
 for(const invalid of [undefined,'m07','machine-lateral-raise','dumbbell-curl']){assert.equal(lateralReferenceEffort(invalid,.5),null);assert.equal(lateralReferencePlane(invalid,.5),0);assert.equal(lateralReferenceInfo(invalid),null);}
 for(const phase of [NaN,Infinity,-Infinity]){assert.equal(lateralReferenceEffort(id,phase),null);assert.equal(lateralReferencePlane(id,phase),0);}
 assert.equal(lateralReferenceEffort(id,.5,NaN),null);assert.equal(lateralReferencePlane(id,.5,Infinity),0);
 assert.equal(lateralReferenceEffort(id,-1),0);assert.equal(lateralReferenceEffort(id,2),0);assert.equal(lateralReferenceEffort(id,.3,-2),lateralReferenceEffort(id,.3,0));
});
