import test from 'node:test';import assert from 'node:assert/strict';
import {createMocapFixtureV017} from '../scripts/mocap-fixture-v017.mjs';
import {createActivityRig} from '../src/extended-rig.js';
import {preparationFootLift} from '../src/preparation-motion-v019.js';
import {transformBody} from '../src/lifecycle-frame.js';

const f=await createMocapFixtureV017(),{THREE,metrics,character}=f,ids=['dumbbell-curl','dumbbell-bench-press','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-romanian-deadlift'];
test.after(()=>character.dispose());
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
function world(rig,id,phase){const frame=rig.sampleLifecycle(id,'enter',phase);character.pose(frame.pose);return transformBody(character.getContactPoints(),frame);}
function contactVelocityJump(rig){const id='dumbbell-curl',meta=rig.getLifecycle(id),duration=meta.entryDuration,first=meta.stages[0].duration;let low=0,high=1;for(let i=0;i<50;i++){const m=(low+high)/2;if(m*m*(3-2*m)<1/8)low=m;else high=m;}const phase=first*((low+high)/2)/duration,h=.0001/duration,a=world(rig,id,phase-h),b=world(rig,id,phase),c=world(rig,id,phase+h);return Math.max(...['feet','knees','ankles'].flatMap(key=>[0,1].map(i=>distance(b[key][i].map((x,j)=>(x-a[key][i][j])/.0001),c[key][i].map((x,j)=>(x-b[key][i][j])/.0001)))));}

test('sole lift retains exact contact/peak heights and removes vertical contact velocity',()=>{
 assert.equal(preparationFootLift(0),0);assert.ok(Math.abs(preparationFootLift(1))<1e-14);assert.equal(preparationFootLift(.5),1);const h=1e-5;assert.ok(preparationFootLift(h)/h<1e-6);assert.ok(Math.abs(preparationFootLift(1-h))/h<1e-6);
});
test('the actual GLB knee/sole velocity pop at a dumbbell walking contact is reduced in the default preparation',()=>{
 const current=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics}),old=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics,naturalPreparation:false});current.prepare('dumbbell-curl');old.prepare('dumbbell-curl');const before=contactVelocityJump(old),after=contactVelocityJump(current);assert.ok(before>1);assert.ok(after<.02);assert.ok(after<before/100);current.end();old.end();
});
test('leg-length settling reaches the authored planted soles instead of stretching bones or floating the trailing foot',()=>{
 const id='dumbbell-curl',current=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics}),old=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics,naturalPreparation:false});current.prepare(id);old.prepare(id);let low=0,high=1;for(let i=0;i<50;i++){const m=(low+high)/2;if(m*m*(3-2*m)<1/8)low=m;else high=m;}
 const observations=[];for(const rig of [old,current]){const meta=rig.getLifecycle(id),phase=meta.stages[0].duration*(low+high)/2/meta.entryDuration,frame=rig.sampleLifecycle(id,'enter',phase);character.pose(frame.pose);const body=character.getContactPoints();observations.push(body.maxReachError);if(rig===current){assert.ok(frame.pose.preparationLegSettle>0&&frame.pose.preparationLegSettle<.012);for(let side=0;side<2;side++){assert.ok(distance(body.feet[side],frame.pose.feet[side])<1e-6);assert.ok(Math.abs(distance(body.hips[side],body.knees[side])-metrics.legs[side].upper)<1e-6);assert.ok(Math.abs(distance(body.knees[side],body.ankles[side])-metrics.legs[side].lower)<1e-6);}}}assert.ok(observations[0]>.001);assert.ok(observations[1]<1e-6);current.end();old.end();
});
test('each shaft-grip preparation retains a short closed-grip confirmation before lifting and the return stays held until parked',()=>{
 const rig=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics});for(const id of ids){rig.prepare(id);const meta=rig.getLifecycle(id),hold=meta.stages.find(s=>s.label==='提鈴前調整手腕');assert.equal(hold.duration,.18);let elapsed=0;for(const stage of meta.stages){if(['提鈴前調整手腕','抬離啞鈴架'].includes(stage.label))for(const mode of ['enter','exit']){const p=(elapsed+stage.duration*.5)/meta.entryDuration,frame=rig.sampleLifecycle(id,mode,mode==='enter'?p:1-p);assert.equal(frame.held,true);for(let side=0;side<2;side++)if(frame.contacts.hands[side])assert.equal(frame.pose.handGripStrength[side],1);}elapsed+=stage.duration;}rig.end();}
});
