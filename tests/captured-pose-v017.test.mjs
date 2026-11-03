import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyCapturedPose,sampleCapturedPoseReference,getCapturedPoseInfo} from '../src/captured-pose-v017.js';
import {capturedFullBodyClips,capturedFullBodyAliases,capturedFullBodyLandmarks,decodeCapturedFullBodyClip} from '../src/captured-fullbody-data-v017.js';

const ids=['dumbbell-shoulder-press','dumbbell-goblet-squat'],V=a=>new THREE.Vector3(...a),add=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,k)=>a.map(v=>v*k),norm=a=>{const length=Math.hypot(...a);return a.map(v=>v/length);};
const neutral={hip:[0,.93434,.0037],shoulder:[0,1.38948,.0163],head:[0,1.5981,.0534]};
const metrics={neutral,torsoLength:V(neutral.hip).distanceTo(V(neutral.shoulder)),arms:[-1,1].map(sign=>({upper:.24676,lower:.25253,palmLength:.07351,shoulderOffset:[sign*.18572,0,0]})),legs:[0,1].map(()=>({upper:.4,lower:.43}))};
const armRoots=pose=>{const rest=V(neutral.shoulder).sub(V(neutral.hip)),q=new THREE.Quaternion().setFromUnitVectors(rest.clone().normalize(),V(pose.shoulder).sub(V(pose.hip)).normalize());return metrics.arms.map(arm=>rest.clone().add(V(arm.shoulderOffset)).applyQuaternion(q).add(V(pose.hip)).toArray());};
function authored(id,phase=.4){
  const effort=Math.sin(phase*Math.PI),pose={...structuredClone(neutral),feet:[[-.18,.013,.145],[.18,.013,.145]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],handDirections:[[1,0,0],[1,0,0]],handGripStrength:[1,1],handGripping:[true,true],gripping:true};
  if(id==='dumbbell-shoulder-press'){
    const roots=armRoots(pose),upper=[-1,1].map(sign=>norm([sign*(.23-.14*effort),.01+.22*effort,.08-.065*effort])),lower=norm([0,1,.04*(1-effort)]);
    pose.elbows=roots.map((root,i)=>add(root,scale(upper[i],metrics.arms[i].upper)));pose.hands=pose.elbows.map((elbow,i)=>add(elbow,scale(lower,metrics.arms[i].lower+metrics.arms[i].palmLength-.008)));
  }else{
    pose.hip=[0,neutral.hip[1]-.31*effort,-.13*effort];pose.shoulder=add(pose.hip,[0,metrics.torsoLength*Math.cos(.24*effort),metrics.torsoLength*Math.sin(.24*effort)]);pose.head=add(pose.shoulder,[0,.20862*Math.cos(.24*effort),.20862*Math.sin(.24*effort)]);pose.hands=[[-.10,pose.shoulder[1]-.075,pose.shoulder[2]+.29],[.10,pose.shoulder[1]-.075,pose.shoulder[2]+.29]];pose.handDirections=[[0,0,1],[0,0,1]];pose.elbowHints=[[-1,-.7,.3],[1,-.7,.3]];
  }return pose;
}
function finiteTree(value){if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')for(const child of Object.values(value))finiteTree(child);}

test('unsupported IDs, malformed inputs and exact loop endpoints retain the original pose object',()=>{
  const pose=authored(ids[0],0);
  for(const id of ['dumbbell-curl','machine-chest-press',''])assert.equal(applyCapturedPose({id,phase:.5,pose,metrics}),pose);
  for(const id of ids)for(const phase of [0,1,-1,2,NaN,Infinity])assert.equal(applyCapturedPose({id,phase,pose,metrics}),pose);
  assert.equal(applyCapturedPose({id:ids[0],phase:.5,cycle:Infinity,pose,metrics}),pose);
  assert.equal(applyCapturedPose({id:ids[0],phase:.5,pose,metrics:{}}),pose);
  assert.equal(applyCapturedPose({id:ids[0],phase:.5,pose:{...pose,hands:[]},metrics}).hands.length,0);
});

test('source samples use actual decoded landmarks and the existing game handedness without a second mirror',()=>{
  for(const clip of capturedFullBodyClips){const data=decodeCapturedFullBodyClip(clip),cycle=capturedFullBodyClips.filter(c=>c.exerciseId===clip.exerciseId).findIndex(c=>c.id===clip.id),sample=sampleCapturedPoseReference({id:clip.exerciseId,phase:0,cycle});
    assert.equal(sample.clipId,clip.id);assert.equal(sample.sourceId,clip.sourceId);assert.equal(sample.sourceFrame,clip.firstFrame);
    for(const alias of ['leftShoulder','rightShoulder','leftElbow','rightElbow','leftKnee','head']){const offset=3+capturedFullBodyLandmarks.indexOf(capturedFullBodyAliases[alias])*3;assert.deepEqual(sample.points[alias],[...data.slice(offset,offset+3)]);}
    assert.ok(sample.points.leftShoulder[0]<sample.points.rightShoulder[0]);assert.ok(sample.points.leftHip[0]<sample.points.rightHip[0]);
    assert.ok(sample.points.leftForefoot[2]>sample.points.leftAnkle[2]);assert.ok(sample.sourceLegLength>.6&&sample.sourceLegLength<1.2);
  }
});

test('dense source interpolation is finite, directions remain unit vectors and two real repetitions stay distinct',()=>{
  for(const id of ids){
    for(let cycle=0;cycle<2;cycle++)for(let index=0;index<=1000;index++){
      const sample=sampleCapturedPoseReference({id,phase:index/1000,cycle});finiteTree(sample);
      for(const dir of [sample.torso,sample.head,...sample.upper,...sample.lower,...sample.thighs,...sample.shins])assert.ok(Math.abs(Math.hypot(...dir)-1)<1e-10);
    }
    const first=sampleCapturedPoseReference({id,phase:.43,cycle:0}),second=sampleCapturedPoseReference({id,phase:.43,cycle:1});assert.notDeepEqual(first.points,second.points);assert.deepEqual(sampleCapturedPoseReference({id,phase:.43,cycle:2}),first);assert.deepEqual(sampleCapturedPoseReference({id,phase:.43,cycle:-1}),second);
  }
  assert.equal(sampleCapturedPoseReference({id:'not-captured',phase:.5}),null);assert.equal(sampleCapturedPoseReference({id:ids[0],phase:NaN}),null);
});

test('retargeting preserves input poses, foot anchors, grip settings, torso length and fixed FK arm lengths',()=>{
  for(const id of ids)for(let cycle=0;cycle<2;cycle++)for(const phase of [.001,.04,.12,.25,.5,.75,.88,.96,.999]){
    const pose=authored(id,phase),snapshot=structuredClone(pose),next=applyCapturedPose({id,phase,cycle,pose,metrics});finiteTree(next);assert.notEqual(next,pose);assert.deepEqual(pose,snapshot);assert.equal(next.feet,pose.feet);assert.equal(next.footDirections,pose.footDirections);assert.equal(next.footNormals,pose.footNormals);assert.equal(next.handDirections,pose.handDirections);assert.equal(next.handGripStrength,pose.handGripStrength);assert.equal(next.handGripping,pose.handGripping);
    assert.ok(Math.abs(V(next.shoulder).distanceTo(V(next.hip))-metrics.torsoLength)<1e-12);
    if(id===ids[0]){const roots=armRoots(next);for(let side=0;side<2;side++){assert.ok(Math.abs(V(next.elbows[side]).distanceTo(V(roots[side]))-metrics.arms[side].upper)<1e-12);assert.ok(Math.abs(V(next.hands[side]).distanceTo(V(next.elbows[side]))-(metrics.arms[side].lower+metrics.arms[side].palmLength-.008))<1e-12);}}
    else{assert.ok(Math.abs(V(next.hands[0]).distanceTo(V(next.hands[1]))-V(pose.hands[0]).distanceTo(V(pose.hands[1])))<1e-12);for(let side=0;side<2;side++){assert.ok(Math.abs(Math.hypot(...next.kneeHints[side])-1)<1e-12);assert.ok(next.kneeHints[side][2]>0);}}
  }
});

test('actual source data changes multiple joints and not only the exercise timing',()=>{
  for(const id of ids){const pose=authored(id,.43),first=applyCapturedPose({id,phase:.43,cycle:0,pose,metrics}),second=applyCapturedPose({id,phase:.43,cycle:1,pose,metrics});
    assert.ok(V(first.hip).distanceTo(V(pose.hip))>.0005);assert.ok(V(first.shoulder).distanceTo(V(pose.shoulder))>.005);assert.notDeepEqual(first.hands,pose.hands);assert.notDeepEqual(first.hands,second.hands);assert.notDeepEqual(first.shoulder,second.shoulder);
    if(id===ids[0])assert.ok(V(first.elbows[0]).distanceTo(V(pose.elbows[0]))>.01);else assert.notDeepEqual(first.kneeHints,second.kneeHints);
  }
});

test('the captured contribution has a zero first derivative at common ready/end poses across repetitions',()=>{
  const h=1e-5;
  for(const id of ids)for(let cycle=0;cycle<2;cycle++)for(const phase of [h,1-h]){
    const pose=authored(id,0),near=applyCapturedPose({id,phase,cycle,pose,metrics});
    for(const field of ['hip','shoulder','head'])assert.ok(V(near[field]).distanceTo(V(pose[field]))/h<.001,`${id}/${field}/${phase}`);
    for(let side=0;side<2;side++)assert.ok(V(near.hands[side]).distanceTo(V(pose.hands[side]))/h<.001,`${id}/hand/${phase}`);
    assert.ok(Math.abs(near.headPitch||0)/h<.001);
  }
});

test('review metadata identifies adapted unweighted squats, authored pickup and pending human approval',()=>{
  assert.equal(getCapturedPoseInfo('dumbbell-curl'),null);
  for(const id of ids){const info=getCapturedPoseInfo(id);assert.equal(info.humanApproval,false);assert.equal(info.clips.length,2);assert.match(info.scope,/not literal full-skeleton/);assert.match(info.lifecycle,/authored/);assert.match(info.contacts,/IK/);assert.ok(info.channels.length>=4);}
  assert.match(getCapturedPoseInfo(ids[1]).sourceLoad,/Unweighted/);
});
