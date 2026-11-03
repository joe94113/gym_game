import {buildLocomotionPose} from '../locomotion.js';
import * as THREE from 'three';
const copy=value=>structuredClone(value),clamp=x=>Math.max(0,Math.min(1,x));
export const WARMUP_COURSE_MOTIONS=['march','side-step','shoulder-open','hip-hinge','shallow-squat','knee-lift','breathe'];
export function warmupSegment(phase){
  const index=Math.min(3,Math.floor(clamp(phase)*4));
  return[{label:'原地踏步',description:'先用小步幅交替抬腳，手臂自然擺動。',block:'準備'},
    {label:'肩部活動',description:'平順抬起手臂，再慢慢放下，肩膀保持放鬆。',block:'活動度'},
    {label:'小幅屈膝',description:'雙腳踩穩，屈膝降低重心，再回到站姿。',block:'全身活動'},
    {label:'放慢與呼吸',description:'回到輕鬆站姿，放慢手臂活動與呼吸。',block:'緩和'}].map((s,i)=>({...s,index:i,total:4}))[index];
}
/** Four short teaching sections; each returns to a common, reachable stance. */
export function sampleWarmupPose(metrics,phase=0){
  const p=clamp(phase),index=Math.min(3,Math.floor(p*4)),u=p===1?1:p*4-index,envelope=Math.sin(Math.PI*u)**2;
  const pose=copy(buildLocomotionPose(metrics,0,0)),n=metrics.neutral;
  pose.kneeHints=[[0,0,1],[0,0,1]];
  if(index===0){
    const wave=Math.sin(u*Math.PI*4)*envelope;
    for(let side=0;side<2;side++){const sign=side?1:-1;pose.feet[side][1]+=.075*Math.max(0,wave*sign);pose.hands[side][2]+=wave*sign*.09;}
    for(const key of ['hip','shoulder','head'])pose[key][1]-=.018*envelope;
  }else if(index===1){
    const e=(.5-.5*Math.cos(u*Math.PI*4))*envelope,angle=-1.25+1.35*e;
    for(let side=0;side<2;side++){
      const sign=side?1:-1,arm=metrics.arms[side],root=pose.shoulder.map((v,i)=>v+arm.shoulderOffset[i]),elbow=[root[0]+sign*Math.cos(angle)*arm.upper,root[1]+Math.sin(angle)*arm.upper,root[2]+.025];
      const target=[elbow[0]+sign*Math.cos(angle+.12)*(arm.lower+arm.palmLength-.015),elbow[1]+Math.sin(angle+.12)*(arm.lower+arm.palmLength-.015),elbow[2]+.025];
      pose.hands[side]=pose.hands[side].map((v,i)=>v+(target[i]-v)*envelope);
    }
    pose.elbowHints=[[-1,-.2,.15],[1,-.2,.15]];
  }else if(index===2){
    const e=(.5-.5*Math.cos(u*Math.PI*4))*envelope,drop=.10*e,lean=.12*e;
    pose.hip[1]-=drop;pose.shoulder=[pose.hip[0],pose.hip[1]+metrics.torsoLength*Math.cos(lean),pose.hip[2]+metrics.torsoLength*Math.sin(lean)];
    const headSpan=n.head[1]-n.shoulder[1];pose.head=[pose.shoulder[0],pose.shoulder[1]+headSpan*Math.cos(lean),pose.shoulder[2]+headSpan*Math.sin(lean)];
    pose.hands=pose.hands.map((point,side)=>point.map((v,i)=>v+([side?.015:-.015,.08,.16][i])*e));
    pose.elbowHints=[[-.8,-.5,.5],[.8,-.5,.5]];
  }else{
    const breath=Math.sin(Math.PI*u*2)*envelope;
    pose.hands=pose.hands.map(point=>[point[0],point[1]+.04*envelope,point[2]+.025*breath]);pose.headPitch=.025*breath;
  }
  return pose;
}
/** A repetition is one complete movement, including both sides where needed.
 * Course time is supplied by the shared lesson clock, never an actor's clock. */
export function sampleWarmupCoursePose(metrics,frame={}){
  const base=buildLocomotionPose(metrics,0,0);if(frame.complete)return base;
  const id=frame.motionId||'march',phase=clamp(frame.repPhase??0),amount=.30+.70*clamp(frame.intensity??1),fade=clamp(frame.envelope??1),e=Math.sin(Math.PI*phase)**2,wave=Math.sin(Math.PI*2*phase),pose=copy(base);
  pose.kneeHints=[[0,0,1],[0,0,1]];
  if(id==='march'||id==='knee-lift'){
    for(let i=0;i<2;i++){const lift=Math.max(0,wave*(i?-1:1));pose.feet[i][1]+=(id==='knee-lift'?.13:.065)*lift*amount;pose.hands[i][2]+=.065*wave*(i?1:-1)*amount;}
    for(const key of ['hip','shoulder','head'])pose[key][1]-=.018*e*amount;
  }else if(id==='side-step'){
    for(let i=0;i<2;i++){const lift=Math.max(0,wave*(i?-1:1));pose.feet[i][0]+=(i?1:-1)*.20*lift*amount;pose.feet[i][1]+=.045*lift*amount;}
    for(const key of ['hip','shoulder','head'])pose[key][0]-=.05*wave*amount;
  }else if(id==='shoulder-open'){
    const armPose=sampleWarmupPose(metrics,.3125);for(let i=0;i<2;i++)pose.hands[i]=pose.hands[i].map((v,j)=>v+(armPose.hands[i][j]-v)*e*amount);pose.elbowHints=armPose.elbowHints;
  }else if(id==='shallow-squat'){
    const squat=sampleWarmupPose(metrics,.5625);for(const key of ['hip','shoulder','head'])pose[key]=pose[key].map((v,i)=>v+(squat[key][i]-v)*e*amount);pose.hands=pose.hands.map((point,i)=>point.map((v,j)=>v+(squat.hands[i][j]-v)*e*amount));pose.elbowHints=squat.elbowHints;
  }else if(id==='hip-hinge'){
    const lean=.32*e*amount,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),lean),hip=new THREE.Vector3(...base.hip).add(new THREE.Vector3(0,-.035*e*amount,-.09*e*amount)),baseHip=new THREE.Vector3(...base.hip),rotate=point=>new THREE.Vector3(...point).sub(baseHip).applyQuaternion(q).add(hip).toArray();
    pose.hip=hip.toArray();pose.shoulder=rotate(base.shoulder);pose.head=rotate(base.head);pose.hands=base.hands.map(rotate);for(const key of ['handNormals','elbowHints'])if(base[key])pose[key]=base[key].map(p=>new THREE.Vector3(...p).applyQuaternion(q).toArray());
  }else{
    pose.hands=pose.hands.map(point=>[point[0],point[1]+.025*e*amount,point[2]+.018*e*amount]);pose.headPitch=.012*Math.sin(Math.PI*2*phase)*amount;
  }
  // All course blocks meet the same established standing pose at their edges.
  for(const key of ['hip','shoulder','head'])pose[key]=base[key].map((v,i)=>v+(pose[key][i]-v)*fade);
  for(const key of ['hands','feet'])pose[key]=base[key].map((point,i)=>point.map((v,j)=>v+(pose[key][i][j]-v)*fade));
  for(const key of ['handNormals','elbowHints'])if(base[key]&&pose[key])pose[key]=base[key].map((point,i)=>point.map((v,j)=>v+(pose[key][i][j]-v)*fade*e));
  if(fade<.000001)return base;return pose;
}
export function createWarmupProgram({metrics}){
  let contacts=null;
  const remember=pose=>{contacts={hands:copy(pose.hands),feet:copy(pose.feet)};return pose;};
  return{sample(phase){return remember(sampleWarmupPose(metrics,phase));},sampleCourse(frame){return remember(sampleWarmupCoursePose(metrics,frame));},getCourseMotionIds:()=>[...WARMUP_COURSE_MOTIONS],getCourseContacts:()=>({hands:[false,false],feet:contacts?.feet.map(p=>p[1]<.025)||[true,true]}),getSegment:warmupSegment,getCollisionVolumes:()=>[],getActualContacts:()=>contacts};
}
