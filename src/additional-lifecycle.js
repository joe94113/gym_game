import * as THREE from 'three';
import {buildLocomotionPose} from './locomotion.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {floorHeightAt} from './gym-layout.js';
import {createPressMachineLifecycle} from './additional-press-lifecycle.js';
import {createUpperBodyMachineLifecycle} from './additional-upperbody-lifecycle.js';
import {preparationStepTurn} from './preparation-step-turn-v013.js';

const copy=value=>JSON.parse(JSON.stringify(value)),UP=new THREE.Vector3(0,1,0);
const read=point=>new THREE.Vector3(...point),mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a.map((value,index)=>mix(value,b[index],t));
const positionKeys=['hip','shoulder','head','hands','feet','elbows','knees'];
const frameQuaternion=(advance,axis)=>{const z=read(advance).normalize(),x=read(axis).addScaledVector(z,-read(axis).dot(z)).normalize(),y=new THREE.Vector3().crossVectors(z,x).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};
function translated(pose,delta){const result=copy(pose);for(const key of positionKeys){if(!result[key])continue;result[key]=typeof result[key][0]==='number'?result[key].map((v,i)=>v+delta[i]):result[key].map(point=>point.map((v,i)=>v+delta[i]));}return result;}
function direction(a,b,t){const start=read(a).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(start,read(b).normalize());return start.applyQuaternion(new THREE.Quaternion().slerp(rotation,t)).toArray();}

/** These paths are authored around the new fixtures' actual open front/side,
 * step platform, knee support and bench. Exit reverses support transfer before
 * turning outward and walking away. No scene fade substitutes for movement. */
export function createAdditionalLifecycle({machine,metrics,restPose}){
  if(machine.type==='lyingChestPress'||machine.type==='declineChestPress')return createPressMachineLifecycle({machine,metrics,restPose});
  if(machine.type==='preacherCurl'||machine.type==='reverseFly')return createUpperBodyMachineLifecycle({machine,metrics,restPose});
  const type=machine.type,rest=copy(restPose),neutral=buildLocomotionPose(metrics,0,0);
  const assisted=type==='assistedPullup'||type==='assistedDip';
  const hipMachine=type==='hipAbduction'||type==='hipAdduction';
  const bench=type==='lyingChestPress'||type==='declineChestPress';
  const back=type==='backExtension',side=bench||type==='reverseFly'||type==='preacherCurl';
  const entryHeading=back?0:side?-Math.PI/2:Math.PI,outHeading=back?Math.PI:side?Math.PI/2:0;
  const gate=back?[0,0,-1.7]:side?[bench?2.25:1.75,0,bench?.80:type==='preacherCurl'?-.30:0]:[0,0,assisted?2.7:2.55];
  const baseFloor=floorHeightAt(machine.station.position.x,machine.station.position.z);
  const rotation=machine.group.rotation.y;
  const gateWorld=read(gate).applyAxisAngle(UP,rotation);gateWorld.x+=machine.station.position.x;gateWorld.z+=machine.station.position.z;
  gate[1]=floorHeightAt(gateWorld.x,gateWorld.z)-baseFloor;
  const inner=back?[0,0,-.94]:side?[.74,0,bench?.80:type==='preacherCurl'?-.20:0]:[0,0,assisted?1.25:.90];
  const turnEnd=assisted?.33:side?.29:.32;
  const meta={gateOffset:[...gate],gateRotation:entryHeading,entryGateRotation:entryHeading,exitGateRotation:outHeading,restPhase:0,
    entryDuration:assisted?9:bench?8.5:type==='backExtension'?8:9.5,exitDuration:assisted?8:bench?7.5:back?10:8,
    stages:['走近器材','轉身就位',assisted?'踩上踏台':bench?'坐穩後躺下':'坐穩或踩好踏板','對準支撐','握穩或準備姿勢','運動','放開握把','起身','離開器材']};
  const getElbows=pose=>pose.elbows||pose.hands.map((_,index)=>solveHandContactFrame(metrics,pose,index).elbow);
  function legRoots(pose){const q=new THREE.Quaternion().setFromUnitVectors(UP,read(pose.shoulder).sub(read(pose.hip)).normalize());return metrics.legs.map(leg=>read(leg.hipOffset).applyQuaternion(q).add(read(pose.hip)));}
  function kneePoints(pose){
    if(pose.knees)return pose.knees;
    const roots=legRoots(pose);
    return roots.map((root,index)=>{const leg=metrics.legs[index],forward=read(pose.footDirections?.[index]||[0,0,1]),normal=read(pose.footNormals?.[index]||[0,1,0]),ankle=read(pose.feet[index]).addScaledVector(forward,-metrics.footForwardOffset).addScaledVector(normal,metrics.footHeightOffset),delta=ankle.sub(root),length=Math.min(delta.length(),leg.upper+leg.lower-.00001),axis=delta.normalize(),hint=read(pose.kneeHints?.[index]||[0,0,1]),bend=hint.addScaledVector(axis,-hint.dot(axis)).normalize(),along=(leg.upper**2-leg.lower**2+length**2)/(2*length),height=Math.sqrt(Math.max(0,leg.upper**2-along**2));return root.clone().addScaledVector(axis,along).addScaledVector(bend,height).toArray();});
  }
  function blend(a,b,t){
    const result={...copy(b),hip:lerp(a.hip,b.hip,t),hands:a.hands.map((point,index)=>lerp(point,b.hands[index],t)),feet:a.feet.map((point,index)=>lerp(point,b.feet[index],t)),gripping:false,handGripStrength:[0,0],handGripping:[false,false],relaxedHands:true};
    const axis=direction(read(a.shoulder).sub(read(a.hip)).toArray(),read(b.shoulder).sub(read(b.hip)).toArray(),t);
    result.shoulder=read(result.hip).addScaledVector(read(axis),metrics.torsoLength).toArray();result.head=lerp(a.head,b.head,t);
    for(const key of ['handNormals','handDirections','footDirections','footNormals'])result[key]=[0,1].map(index=>direction(a[key]?.[index]||(key.includes('Normal')?[0,1,0]:[0,0,1]),b[key]?.[index]||(key.includes('Normal')?[0,1,0]:[0,0,1]),t));
    const ae=getElbows(a),be=getElbows(b),ak=kneePoints(a),bk=kneePoints(b);
    result.elbows=ae.map((point,index)=>lerp(point,be[index],t));result.knees=ak.map((point,index)=>lerp(point,bk[index],t));
    // Rotate real upper-arm / forearm segments, instead of moving a target
    // through the elbow pole. Hands already holding a grip stay fixed on it.
    const bodyQ=pose=>new THREE.Quaternion().setFromUnitVectors(UP,read(pose.shoulder).sub(read(pose.hip)).normalize()),qa=bodyQ(a),qb=bodyQ(b),q=qa.clone().slerp(qb,t),torso=read(metrics.neutral.shoulder).sub(read(metrics.neutral.hip));
    result.handAdvances=[];delete result.handNormals;
    for(let index=0;index<2;index++){
      const arm=metrics.arms[index],fa=solveHandContactFrame(metrics,a,index),fb=solveHandContactFrame(metrics,b,index),root=pose=>torso.clone().add(read(arm.shoulderOffset)).applyQuaternion(bodyQ(pose)).add(read(pose.hip)),local=(value,rotation)=>read(value).applyQuaternion(rotation.clone().invert()).toArray();
      const upperA=local(read(fa.elbow).sub(root(a)).toArray(),qa),upperB=local(read(fb.elbow).sub(root(b)).toArray(),qb),ri=torso.clone().add(read(arm.shoulderOffset)).applyQuaternion(q).add(read(result.hip)),elbow=read(direction(upperA,upperB,t)).multiplyScalar(arm.upper).applyQuaternion(q).add(ri);
      const lowerA=local(read(fa.wrist).sub(read(fa.elbow)).toArray(),qa),lowerB=local(read(fb.wrist).sub(read(fb.elbow)).toArray(),qb),wrist=read(direction(lowerA,lowerB,t)).multiplyScalar(arm.lower).applyQuaternion(q).add(elbow),ha=qa.clone().invert().multiply(frameQuaternion(fa.advance,fa.axis)),hb=qb.clone().invert().multiply(frameQuaternion(fb.advance,fb.axis)),handFrame=q.clone().multiply(ha.slerp(hb,t)),handQ=handFrame.clone().multiply(new THREE.Quaternion(...arm.handFrameLocal).invert());
      result.elbows[index]=elbow.toArray();
      if(read(a.hands[index]).distanceToSquared(read(b.hands[index]))>1e-10)result.hands[index]=read(arm.palmOffset).applyQuaternion(handQ).add(wrist).toArray();
      result.handDirections[index]=new THREE.Vector3(1,0,0).applyQuaternion(handFrame).toArray();result.handAdvances[index]=new THREE.Vector3(0,0,1).applyQuaternion(handFrame).toArray();
    }
    if(back){delete result.knees;result.kneeHints=[[0,0,1],[0,0,1]];}
    return result;
  }
  const frame=(pose,offset=[0,0,0],rotation=0,stage='就位',hands=[false,false],feet=[true,true])=>({pose,offset,rotation,stage,contacts:{hands,feet}});
  const fixed=(pose,stage,hands=[false,false],feet=[true,true])=>frame(copy(pose),[0,0,0],0,stage,hands,feet);
  function walk(from,to,t,heading,stage){
    const p=Math.max(0,Math.min(1,t)),distance=read(to).sub(read(from)).length(),cycles=Math.max(1,Math.ceil(distance/.90)),steps=cycles*2,progress=Math.min(steps-.000001,p*steps),step=Math.floor(progress),within=progress-step;
    const pose=translated(neutral,[0,-(back?.125:.095)*Math.sin(Math.PI*t),0]),offset=lerp(from,to,p);
    pose.feet=[0,1].map(index=>{const done=Math.max(0,Math.ceil((step-index)/2)),moving=step%2===index,footProgress=Math.min(1,(done+(moving?smooth(within):0))/cycles),base=read(lerp(from,to,footProgress)).add(read(neutral.feet[index]).applyAxisAngle(UP,heading));if(moving)base.y+=Math.sin(Math.PI*within)*(back?.36:.12);return base.sub(read(offset)).applyAxisAngle(UP,-heading).toArray();});
    return frame(pose,offset,heading,stage,[false,false],pose.feet.map(point=>point[1]<.025));
  }
  function standingAt(point){return translated(neutral,point);}
  function stepOver(pose,side,start,end,t){const u=Math.max(0,Math.min(1,t)),height=.46;if(u<.25)pose.feet[side]=[start[0],mix(start[1],height,smooth(u/.25)),start[2]];else if(u<.75)pose.feet[side]=[mix(start[0],end[0],smooth((u-.25)/.5)),height,mix(start[2],end[2],smooth((u-.25)/.5))];else pose.feet[side]=[end[0],mix(height,end[1],smooth((u-.75)/.25)),end[2]];}
  const seated=copy(rest);seated.hip=[0,bench?.675:type==='reverseFly'?.70:rest.hip[1],bench||hipMachine?.20:0];seated.shoulder=[0,seated.hip[1]+metrics.torsoLength,seated.hip[2]];seated.head=[0,seated.hip[1]+metrics.torsoLength+(metrics.neutral.head[1]-metrics.neutral.shoulder[1]),seated.hip[2]];
  seated.feet=hipMachine?[[-.20,.013,.85],[.20,.013,.85]]:copy(rest.feet);
  delete seated.knees;delete seated.elbows;
  seated.hands=bench?[[-.60,seated.shoulder[1]+.25,seated.shoulder[2]+.05],[.60,seated.shoulder[1]+.25,seated.shoulder[2]+.05]]:type==='preacherCurl'?rest.hands.map(point=>[point[0],point[1]+.12,point[2]+.02]):[[-.32,seated.hip[1]+.23,hipMachine?.60:.40],[.32,seated.hip[1]+.23,hipMachine?.60:.40]];
  seated.handNormals=[[0,-1,0],[0,-1,0]];seated.elbowHints=[[-1,-.2,.5],[1,-.2,.5]];seated.gripping=false;seated.relaxedHands=true;
  const released=copy(rest);released.gripping=false;released.handGripping=[false,false];released.handGripStrength=[0,0];released.relaxedHands=true;
  if(type==='preacherCurl')released.hands=rest.hands.map(point=>[point[0],point[1]+.12,point[2]+.02]);
  else if(bench)released.hands=[[-.60,rest.shoulder[1]+.25,rest.shoulder[2]+.05],[.60,rest.shoulder[1]+.25,rest.shoulder[2]+.05]];
  else if(type==='reverseFly')released.hands=[[-.32,1.18,.48],[.32,1.18,.48]];
  else if(!assisted&&type!=='backExtension')released.hands=[[-.32,rest.hip[1]+.23,.40],[.32,rest.hip[1]+.23,.40]];
  released.handNormals=[[0,-1,0],[0,-1,0]];delete released.elbows;
  function attach(t,from=released){const p=smooth(t),pose=blend(from,rest,p);pose.handGripStrength=[0,0];return fixed(pose,'對準握把');}
  function closed(t){const pose=copy(rest);pose.handGripStrength=[smooth(t),smooth(t)];pose.handGripping=[true,true];return fixed(pose,rest.gripping===false?'準備動作':'握穩握把',rest.gripping===false?[false,false]:[true,true],assisted?[false,false]:[true,true]);}
  function entry(u){
    if(u<.17)return walk(gate,inner,u/.17,entryHeading,'走近器材');
    if(u<turnEnd)return preparationStepTurn({neutral,offset:inner,from:entryHeading,to:0,phase:(u-.17)/(turnEnd-.17),stage:'轉身就位'});
    if(assisted){
      const start=standingAt(inner),first=copy(start);first.hip[2]=1.10;first.shoulder[2]=1.10;first.head[2]=1.10;first.hands=translated(neutral,[0,0,1.10]).hands;first.feet[0]=[-.143,.293,.70];
      const second=translated(neutral,[0,.28,.65]);second.feet=[[-.143,.293,.70],[.143,.293,.70]];
      const platform=translated(neutral,[0,.28,.15]);platform.feet=[[-.143,.293,.30],[.143,.293,.30]];
      if(u<.45){const p=smooth((u-turnEnd)/(.45-turnEnd)),pose=blend(start,first,p);pose.feet[0][1]+=.24*Math.sin(p*Math.PI);return fixed(pose,'先踩穩踏台',[false,false],[p>.98,true]);}
      if(u<.58){const p=smooth((u-.45)/.13),pose=blend(first,second,p);pose.feet[1][1]+=.24*Math.sin(p*Math.PI);return fixed(pose,'移到踏台上',[false,false],[true,p>.98]);}
      if(u<.68){const p=smooth((u-.58)/.10),pose=blend(second,platform,p);pose.feet.forEach((foot,index)=>{foot[1]+=.075*Math.max(0,Math.sin(p*Math.PI*2+(index?Math.PI:0)));});return fixed(pose,'調整踏台站位',[false,false],pose.feet.map(foot=>foot[1]<.31));}
      const holding=copy(platform);holding.hands=copy(rest.hands);holding.handNormals=copy(rest.handNormals);holding.handDirections=copy(rest.handDirections);holding.elbowHints=copy(rest.elbowHints);
      if(u<.81){const p=smooth((u-.68)/.13),pose=blend(platform,holding,p);return fixed(pose,'扶好握把',[p>.98,p>.98]);}
      if(u<.95){const p=smooth((u-.81)/.14),pose=blend(holding,rest,p);pose.handGripStrength=[1,1];return fixed(pose,'膝蓋靠穩輔助墊',[true,true],[false,false]);}
      return closed((u-.95)/.05);
    }
    if(type==='backExtension'){
      const mountFeet=rest.feet.map(point=>[point[0],point[1],point[2]+.04]);
      const first=standingAt([0,-.035,-.70]);first.feet[0]=copy(mountFeet[0]);first.feet[1]=copy(standingAt(inner).feet[1]);
      const platform=translated(neutral,[0,.08,-.43]);platform.feet=copy(mountFeet);
      if(u<.49){const t=(u-turnEnd)/(.49-turnEnd),p=smooth(t),start=standingAt(inner),pose=blend(start,first,p);stepOver(pose,0,start.feet[0],first.feet[0],t);return fixed(pose,'跨過腳踝墊，踩穩踏板',[false,false],[p>.98,true]);}
      if(u<.66){const t=(u-.49)/.17,p=smooth(t),pose=blend(first,platform,p);stepOver(pose,1,first.feet[1],platform.feet[1],t);return fixed(pose,'踩穩另一側踏板',[false,false],[true,p>.98]);}
      if(u<.95)return fixed(blend(platform,rest,smooth((u-.66)/.29)),'向前靠穩大腿墊');return closed(0);
    }
    if(u<.66){const p=smooth((u-turnEnd)/(.66-turnEnd)),basePose=blend(standingAt(inner),seated,p),offset=lerp(inner,[0,0,0],p);if(type==='reverseFly'){basePose.hands.forEach(point=>point[2]+=.25*Math.sin(p*Math.PI));basePose.feet.forEach(point=>point[2]+=.25*Math.sin(p*Math.PI));}return frame(translated(basePose,offset.map(v=>-v)),offset,0,'坐穩椅墊');}
    if(hipMachine){
      if(u<.85){const t=(u-.66)/.19,index=t<.5?0:1,p=smooth((t% .5)/.5),pose=blend(seated,released,Math.min(1,t*2));pose.hands=copy(released.hands);pose.feet=copy(seated.feet);if(index===1)pose.feet[0]=copy(rest.feet[0]);pose.feet[index]=lerp(seated.feet[index],rest.feet[index],p);pose.feet[index][1]+=.16*Math.sin(p*Math.PI);return fixed(pose,'踩穩兩側踏板',[false,false],index?[true,p>.98]:[p>.98,true]);}
      if(u<.96)return attach((u-.85)/.11);return closed((u-.96)/.04);
    }
    if(bench){if(u<.85){const p=smooth((u-.66)/.19),pose=blend(seated,released,p);return fixed(pose,'緩慢躺穩靠墊');}if(u<.96)return attach((u-.85)/.11);return closed((u-.96)/.04);}
    if(u<.84)return fixed(blend(seated,released,smooth((u-.66)/.18)),'調整支撐與站位');
    if(u<.96)return attach((u-.84)/.12);return closed((u-.96)/.04);
  }
  function sample(direction,u){
    machine.update(0);const p=Math.max(0,Math.min(1,u));
    if(direction!=='exit'&&direction!=='out')return entry(p);
    const reverseEnd=back?.68:side?.74:.82;
    if(p<reverseEnd){const q=1-p/reverseEnd*(1-turnEnd),result=entry(q);result.stage=q>.96?'放開握把':q>.84?'放回握持位置':bench&&q>.66?'坐回椅墊':q>.53?'移開支撐':'起身離開';return result;}
    if(back){if(p<.84)return walk(inner,gate,(p-.68)/.16,0,'跨回走道');return preparationStepTurn({neutral,offset:gate,from:0,to:Math.PI,phase:(p-.84)/.16,stage:'轉向走道'});}
    if(side&&p<.86)return preparationStepTurn({neutral,offset:inner,from:0,to:outHeading,phase:(p-.74)/.12,stage:'轉向走道'});
    const start=side||back?.86:reverseEnd;return walk(inner,gate,(p-start)/(1-start),outHeading,'走回走道');
  }
  return{meta,sample};
}
