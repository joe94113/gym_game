import * as THREE from 'three';
import {capturedFullBodyClips,capturedFullBodyLandmarks,capturedFullBodyAliases,decodeCapturedFullBodyClip} from './captured-fullbody-data-v017.js';

const IDS=['dumbbell-shoulder-press','dumbbell-goblet-squat'];
const CLIPS=new Map(),ALIASES=Object.keys(capturedFullBodyAliases),UP=new THREE.Vector3(0,1,0);
const V=value=>new THREE.Vector3(...value),A=value=>value.toArray();
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,k)=>a.map(v=>v*k);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=THREE.MathUtils.clamp;
const finitePoint=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const unit=(value,fallback=[0,1,0])=>{const length=Math.hypot(...value);return Number.isFinite(length)&&length>1e-8?scale(value,1/length):[...fallback];};
const direction=(a,b)=>unit(sub(b,a)),mid=(a,b)=>mix(a,b,.5);
const smoother=t=>{const x=clamp(t,0,1);return x*x*x*(x*(x*6-15)+10);};

// Source directions are already in the game's mirrored-X / +Y-up / +Z-forward
// frame. No second reflection or conversion of source bone lengths is applied.
function channels(points){
  const hip=mid(points.leftHip,points.rightHip),shoulder=mid(points.leftShoulder,points.rightShoulder),ankle=mid(points.leftAnkle,points.rightAnkle);
  return{hipRelativeFeet:sub(hip,ankle),torso:direction(hip,shoulder),head:direction(points.neck,points.head),
    upper:['left','right'].map(side=>direction(points[side+'Shoulder'],points[side+'Elbow'])),
    lower:['left','right'].map(side=>direction(points[side+'Elbow'],points[side+'Wrist'])),
    thighs:['left','right'].map(side=>direction(points[side+'Hip'],points[side+'Knee'])),
    shins:['left','right'].map(side=>direction(points[side+'Knee'],points[side+'Ankle']))};
}
function pointsAt(values,clip,index){return Object.fromEntries(ALIASES.map(alias=>{const offset=index*clip.stride+3+capturedFullBodyLandmarks.indexOf(capturedFullBodyAliases[alias])*3;return[alias,[values[offset],values[offset+1],values[offset+2]]];}));}
function compiled(id){
  if(CLIPS.has(id))return CLIPS.get(id);
  const result=capturedFullBodyClips.filter(clip=>clip.exerciseId===id).map(clip=>{
    const values=decodeCapturedFullBodyClip(clip),first=pointsAt(values,clip,0),reference=channels(first);
    const sourceLegLength=['left','right'].reduce((sum,side)=>sum+V(first[side+'Hip']).distanceTo(V(first[side+'Knee']))+V(first[side+'Knee']).distanceTo(V(first[side+'Ankle'])),0)/2;
    const armCalibration=reference.upper.map((axis,i)=>({upper:new THREE.Quaternion().setFromUnitVectors(V(axis),V([i?.23:-.23,.01,.08]).normalize()),lower:new THREE.Quaternion().setFromUnitVectors(V(reference.lower[i]),V([0,1,.04]).normalize())}));
    return{clip,values,reference,sourceLegLength,armCalibration};
  });CLIPS.set(id,result);return result;
}
function pick(id,cycle){const clips=compiled(id);return clips[((Math.floor(cycle)%clips.length)+clips.length)%clips.length];}

/** Actual dequantized source landmarks, before the actor/contact adaptation.
 * This getter is also used by the review UI and provenance tests. */
export function sampleCapturedPoseReference({id,phase,cycle=0}={}){
  if(!IDS.includes(id)||!Number.isFinite(phase)||!Number.isFinite(cycle))return null;
  const record=pick(id,cycle),{clip,values}=record,p=clamp(phase,0,1),at=p*(clip.sampleCount-1),first=Math.floor(at),next=Math.min(first+1,clip.sampleCount-1),t=at-first;
  const before=pointsAt(values,clip,first),after=pointsAt(values,clip,next),points=Object.fromEntries(ALIASES.map(alias=>[alias,mix(before[alias],after[alias],t)]));
  const offset=first*clip.stride,nextOffset=next*clip.stride,rootOffset=[0,1,2].map(i=>values[offset+i]+(values[nextOffset+i]-values[offset+i])*t);
  return{clipId:clip.id,sourceId:clip.sourceId,phase:p,sourceFrame:clip.firstFrame+(clip.lastFrame-clip.firstFrame)*p,points,rootOffset,...channels(points),reference:structuredClone(record.reference),sourceLegLength:record.sourceLegLength};
}
function torsoAxis(axis,maxTilt){
  const value=unit(axis),tilt=Math.atan2(Math.hypot(value[0],value[2]),value[1]);
  if(tilt<=maxTilt)return value;
  const horizontal=Math.hypot(value[0],value[2])||1;return[value[0]/horizontal*Math.sin(maxTilt),Math.cos(maxTilt),value[2]/horizontal*Math.sin(maxTilt)];
}
function bodyRotation(metrics,pose){return new THREE.Quaternion().setFromUnitVectors(V(sub(metrics.neutral.shoulder,metrics.neutral.hip)).normalize(),V(sub(pose.shoulder,pose.hip)).normalize());}
function armRoots(metrics,pose){const q=bodyRotation(metrics,pose),torso=sub(metrics.neutral.shoulder,metrics.neutral.hip);return metrics.arms.map(arm=>A(V(add(torso,arm.shoulderOffset)).applyQuaternion(q).add(V(pose.hip))));}
function validMetrics(metrics){return metrics&&['hip','shoulder','head'].every(key=>finitePoint(metrics.neutral?.[key]))&&Number.isFinite(metrics.torsoLength)&&metrics.torsoLength>0&&metrics.arms?.length===2&&metrics.arms.every(arm=>[arm.upper,arm.lower,arm.palmLength].every(v=>Number.isFinite(v)&&v>0)&&finitePoint(arm.shoulderOffset))&&metrics.legs?.length===2&&metrics.legs.every(leg=>Number.isFinite(leg.upper)&&leg.upper>0&&Number.isFinite(leg.lower)&&leg.lower>0);}

export const capturedPoseSettingsV017=Object.freeze({pressArmBlend:.72,bodyBlend:.7,seamPhase:.12,pressMaxTorsoTilt:.12,squatMaxTorsoTilt:.40,squatMaxHipDrop:.38,squatMaxHipBack:.20,squatGripLift:.025,pressMaxHipShift:.02});

/** Source-driven multi-joint retargeting, not literal full-skeleton playback.
 * Fixed-length FK produces free-weight arm targets; the existing hand adapter
 * and actor IK still solve palm/shaft and shoe/floor contacts afterwards. */
export function applyCapturedPose({id,phase,cycle=0,pose,metrics}={}){
  if(!IDS.includes(id)||!Number.isFinite(phase)||!Number.isFinite(cycle)||!pose||!validMetrics(metrics)||!['hip','shoulder','head'].every(key=>finitePoint(pose[key]))||pose.hands?.length!==2||pose.feet?.length!==2||!pose.hands.every(finitePoint)||!pose.feet.every(finitePoint))return pose;
  const p=clamp(phase,0,1);if(p===0||p===1)return pose;
  const envelope=smoother(Math.min(p,1-p)/capturedPoseSettingsV017.seamPhase),goblet=id==='dumbbell-goblet-squat',sample=sampleCapturedPoseReference({id,phase:p,cycle}),record=pick(id,cycle);
  const result={...pose},bodyWeight=capturedPoseSettingsV017.bodyBlend*envelope;
  const legLength=metrics.legs.reduce((sum,leg)=>sum+leg.upper+leg.lower,0)/2,ratio=legLength/sample.sourceLegLength;
  let delta=scale(sub(sample.hipRelativeFeet,sample.reference.hipRelativeFeet),ratio),targetHip;
  if(goblet){delta=[clamp(delta[0],-.025,.025),clamp(delta[1],-capturedPoseSettingsV017.squatMaxHipDrop,0),clamp(delta[2],-capturedPoseSettingsV017.squatMaxHipBack,.06)];targetHip=add(metrics.neutral.hip,delta);}
  else{delta=delta.map((v,i)=>clamp(v,i===1?-.012:-capturedPoseSettingsV017.pressMaxHipShift,i===1?.006:capturedPoseSettingsV017.pressMaxHipShift));targetHip=add(pose.hip,delta);}
  result.hip=mix(pose.hip,targetHip,bodyWeight);
  const originalAxis=unit(sub(pose.shoulder,pose.hip)),neutralAxis=unit(sub(metrics.neutral.shoulder,metrics.neutral.hip));
  const targetAxis=torsoAxis(goblet?sample.torso:add(neutralAxis,sub(sample.torso,sample.reference.torso)),goblet?capturedPoseSettingsV017.squatMaxTorsoTilt:capturedPoseSettingsV017.pressMaxTorsoTilt);
  const axis=unit(mix(originalAxis,targetAxis,bodyWeight)),q=new THREE.Quaternion().setFromUnitVectors(V(originalAxis),V(axis));
  result.shoulder=add(result.hip,scale(axis,metrics.torsoLength));result.head=add(result.shoulder,A(V(sub(pose.head,pose.shoulder)).applyQuaternion(q)));
  const headTilt=s=>Math.atan2(s.head[2],s.head[1])-Math.atan2(s.torso[2],s.torso[1]);
  result.headPitch=(pose.headPitch||0)+clamp(headTilt(sample)-headTilt(sample.reference),-.10,.10)*bodyWeight;
  if(goblet){
    // The source squat is unweighted. Its balancing arms are deliberately not
    // copied onto a two-handed goblet hold. Keep that authored chest-relative
    // contact geometry at chest height. The dumbbell remains world-upright;
    // rotating its forward offset with the chest would lower it into a thigh.
    result.hands=pose.hands.map(hand=>add(add(result.shoulder,sub(hand,pose.shoulder)),[0,capturedPoseSettingsV017.squatGripLift*bodyWeight,0]));
    result.elbows=undefined;
    // The captured actor used a different stance. Retain the measured change
    // of bend plane, bounded around this character's fixed forward-facing feet.
    result.kneeHints=sample.thighs.map((hint,i)=>{const sign=i?1:-1,outward=clamp(sign*(hint[0]-sample.reference.thighs[i][0]),0,.12);return unit(mix(pose.kneeHints?.[i]||[0,0,1],[sign*outward,0,1],bodyWeight),[0,0,1]);});
  }else{
    const oldRoots=armRoots(metrics,pose),newRoots=armRoots(metrics,result),armWeight=capturedPoseSettingsV017.pressArmBlend*envelope;
    result.elbows=[];result.hands=[];
    for(let i=0;i<2;i++){
      const sign=i?1:-1,calibration=record.armCalibration[i];
      let upper=A(V(sample.upper[i]).applyQuaternion(calibration.upper)),lower=A(V(sample.lower[i]).applyQuaternion(calibration.lower));
      // Captured upper-arm changes are calibrated from the actor's initial
      // pose, then bounded to the current power-grip/shoulder workspace.
      upper=unit([sign*Math.max(.24,sign*upper[0]),clamp(upper[1],-.15,.99),clamp(upper[2],-.08,.45)]);
      lower=unit([clamp(lower[0],-.30,.30),Math.max(.4,lower[1]),clamp(lower[2],-.12,.45)]);
      const oldElbow=pose.elbows?.[i]||add(oldRoots[i],scale([sign*.8,.1,.3],metrics.arms[i].upper));
      const authoredUpper=A(V(direction(oldRoots[i],oldElbow)).applyQuaternion(q)),authoredLower=A(V(direction(oldElbow,pose.hands[i])).applyQuaternion(q));
      upper=unit(mix(authoredUpper,upper,armWeight));lower=unit(mix(authoredLower,lower,armWeight));
      const elbow=add(newRoots[i],scale(upper,metrics.arms[i].upper));result.elbows.push(elbow);result.hands.push(add(elbow,scale(lower,metrics.arms[i].lower+metrics.arms[i].palmLength-.008)));
    }
  }
  // feet, directions, palm/grip settings, weights and muscle fields are never
  // overwritten here. The caller updates its real props from these hand targets.
  return result;
}

export function getCapturedPoseInfo(id){
  if(!IDS.includes(id))return null;
  const goblet=id==='dumbbell-goblet-squat';return{exerciseId:id,sourceId:goblet?'13_29':'79_93',kind:'source-driven-multi-joint-retarget-with-contact-IK',clips:capturedFullBodyClips.filter(clip=>clip.exerciseId===id).map(({id,firstFrame,lastFrame,fps,sourceDurationSeconds})=>({id,firstFrame,lastFrame,fps,sourceDurationSeconds})),settings:{...capturedPoseSettingsV017},channels:goblet?['pelvis-relative-to-feet','torso-axis','head-pitch-reference','knee-bend-reference']:['pelvis-relative-to-feet','torso-axis','head-pitch-reference','upper-arm-directions','forearm-directions'],contacts:'Existing fixed foot anchors; existing palm/shaft adapter, finger grips and fixed-length actor IK. Free-weight hands follow the retargeted arm FK.',sourceLoad:goblet?'Unweighted squat adapted to an authored two-handed goblet hold.':'Standing capture with dumbbells.',lifecycle:'Existing authored approach, pickup, return and departure; source data covers repetitions only.',scope:'Calibrated and bounded source multi-joint reference; not literal full-skeleton or finger mocap playback.',humanApproval:false};
}
