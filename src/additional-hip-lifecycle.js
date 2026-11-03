import * as THREE from 'three';
import {buildLocomotionPose} from './locomotion.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {floorHeightAt} from './gym-layout.js';
import {createPressMachineLifecycle} from './additional-press-lifecycle.js';
import {preparationStepTurn} from './preparation-step-turn-v013.js';

const copy=value=>JSON.parse(JSON.stringify(value)),UP=new THREE.Vector3(0,1,0);
const read=point=>new THREE.Vector3(...point),mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a.map((value,index)=>mix(value,b[index],t));
const positionKeys=['hip','shoulder','head','hands','feet','elbows','knees'];
const handFrame=(advance,axis)=>{const z=read(advance).normalize(),x=read(axis).addScaledVector(z,-read(axis).dot(z)).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,new THREE.Vector3().crossVectors(z,x).normalize(),z));};
function translated(pose,delta){const result=copy(pose);for(const key of positionKeys){if(!result[key])continue;result[key]=typeof result[key][0]==='number'?result[key].map((v,i)=>v+delta[i]):result[key].map(point=>point.map((v,i)=>v+delta[i]));}return result;}
function direction(a,b,t){const start=read(a).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(start,read(b).normalize());return start.applyQuaternion(new THREE.Quaternion().slerp(rotation,t)).toArray();}


export function createHipMachineLifecycle({machine,metrics,restPose}){
 const type=machine.type,rest=copy(restPose),neutral=buildLocomotionPose(metrics,0,0),gate=[0,0,2.55],inner=[0,0,1.0],seatFront=[0,0,.78];
 const meta={gateOffset:gate,gateRotation:Math.PI,exitGateRotation:0,restPhase:0,entryDuration:11,exitDuration:11,stages:['走近器材','轉身就位','坐穩椅墊','依序踩穩踏板','調整腿部開度','握穩握把','收腿放回','起身離開']};
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
    // Interpolate real fixed-length arm/palm frames. Inventing an upward
    // palm normal for an endpoint that only supplied a grip axis caused the
    // old shoulders-high, waist-low chicken-wing preparation.
    const bodyQ=pose=>new THREE.Quaternion().setFromUnitVectors(UP,read(pose.shoulder).sub(read(pose.hip)).normalize()),qa=bodyQ(a),qb=bodyQ(b),q=qa.clone().slerp(qb,t),torso=read(metrics.neutral.shoulder).sub(read(metrics.neutral.hip));result.handAdvances=[];delete result.handNormals;
    for(let index=0;index<2;index++){
      const arm=metrics.arms[index],fa=solveHandContactFrame(metrics,a,index),fb=solveHandContactFrame(metrics,b,index),root=pose=>torso.clone().add(read(arm.shoulderOffset)).applyQuaternion(bodyQ(pose)).add(read(pose.hip)),local=(value,rotation)=>read(value).applyQuaternion(rotation.clone().invert()).toArray();
      const elbow=read(direction(local(read(fa.elbow).sub(root(a)).toArray(),qa),local(read(fb.elbow).sub(root(b)).toArray(),qb),t)).multiplyScalar(arm.upper).applyQuaternion(q).add(torso.clone().add(read(arm.shoulderOffset)).applyQuaternion(q).add(read(result.hip)));
      const wrist=read(direction(local(read(fa.wrist).sub(read(fa.elbow)).toArray(),qa),local(read(fb.wrist).sub(read(fb.elbow)).toArray(),qb),t)).multiplyScalar(arm.lower).applyQuaternion(q).add(elbow),frame=q.clone().multiply(qa.clone().invert().multiply(handFrame(fa.advance,fa.axis)).slerp(qb.clone().invert().multiply(handFrame(fb.advance,fb.axis)),t));
      result.elbows[index]=elbow.toArray();if(read(a.hands[index]).distanceToSquared(read(b.hands[index]))>1e-10)result.hands[index]=read(arm.palmOffset).applyQuaternion(frame.clone().multiply(new THREE.Quaternion(...arm.handFrameLocal).invert())).add(wrist).toArray();result.handDirections[index]=new THREE.Vector3(1,0,0).applyQuaternion(frame).toArray();result.handAdvances[index]=new THREE.Vector3(0,0,1).applyQuaternion(frame).toArray();
    }
    return result;
  }
  const frame=(pose,offset=[0,0,0],rotation=0,stage='就位',hands=[false,false],feet=[true,true])=>({pose,offset,rotation,stage,contacts:{hands,feet}});
  const fixed=(pose,stage,hands=[false,false],feet=[true,true])=>frame(copy(pose),[0,0,0],0,stage,hands,feet);
  function walk(from,to,t,heading,stage){
    const p=smooth(t),distance=read(to).sub(read(from)).length(),cycles=Math.max(1,Math.ceil(distance/.45)),steps=cycles*2,progress=Math.min(steps-.000001,p*steps),step=Math.floor(progress),within=progress-step;
    const pose=translated(neutral,[0,-.065*Math.sin(Math.PI*t),0]),offset=lerp(from,to,p);
    pose.feet=[0,1].map(index=>{const done=Math.max(0,Math.ceil((step-index)/2)),moving=step%2===index,footProgress=Math.min(1,(done+(moving?smooth(within):0))/cycles),base=read(lerp(from,to,footProgress)).add(read(neutral.feet[index]).applyAxisAngle(UP,heading));if(moving)base.y+=Math.sin(Math.PI*within)*.12;return base.sub(read(offset)).applyAxisAngle(UP,-heading).toArray();});
    return frame(pose,offset,heading,stage,[false,false],pose.feet.map(point=>point[1]<.025));
  }
  function standingAt(point){return translated(neutral,point);}

 const closedEffort=type==='hipAdduction'?1:0;
 // The closed setting is sampled lazily, after the occupant has left.
 let closedPose=null;
 function free(pose){const result=copy(pose);result.hands=[[-.30,result.hip[1]+.22,result.hip[2]+.32],[.30,result.hip[1]+.22,result.hip[2]+.32]];result.handGripping=[false,false];result.handGripStrength=[0,0];result.gripping=false;result.relaxedHands=true;delete result.elbows;delete result.handAdvances;delete result.handDirections;result.handNormals=[[1,0,0],[-1,0,0]];result.elbowHints=[[-1,-1,.6],[1,-1,.6]];return result;}
 function enter(u){
   const closed=closedPose||(closedPose=copy(machine.update(closedEffort)));machine.setHipAccess?.(u<.79?1:u<.85?1-smooth((u-.79)/.06):0);machine.update(closedEffort);
   if(u<.16)return walk(gate,inner,u/.16,Math.PI,'走近器材');
   if(u<.28)return preparationStepTurn({neutral,offset:inner,from:Math.PI,to:0,phase:(u-.16)/.12,stage:'轉身就位'});
   if(u<.36)return walk(inner,seatFront,(u-.28)/.08,0,'踩穩椅前地面');
   const beforeSit=standingAt(seatFront),sitting=copy(closed);sitting.hip[2]=.35;sitting.shoulder[2]=.35;sitting.head[2]=.35;sitting.feet=copy(beforeSit.feet);delete sitting.knees;Object.assign(sitting,free(sitting));
   if(u<.48){const p=smooth((u-.36)/.12);return fixed(blend(beforeSit,sitting,p),'坐穩椅墊');}
   const placing=copy(closed);placing.hip[2]=.35;placing.shoulder[2]=.35;placing.head[2]=.35;delete placing.knees;Object.assign(placing,free(placing));
   if(u<.70){const t=(u-.48)/.22,index=t<.5?0:1,p=smooth((t% .5)/.5),pose=blend(sitting,placing,index?1:0);pose.feet=copy(sitting.feet);if(index)pose.feet[0]=copy(closed.feet[0]);pose.feet[index]=lerp(sitting.feet[index],closed.feet[index],p);pose.feet[index][1]+=.20*Math.sin(p*Math.PI);delete pose.knees;return fixed(pose,'依序踩穩踏板',[false,false],index?[true,p>.98]:[p>.98,true]);}
   if(u<.79){const p=smooth((u-.70)/.09),pose=blend(placing,free(closed),p);pose.feet=copy(closed.feet);return fixed(pose,'靠穩背墊');}
   if(u<.85)return fixed(free(closed),'調整腿墊位置');
   if(u<.92){const p=smooth((u-.85)/.07),effort=closedEffort*(1-p),pose=free(machine.update(effort));return fixed(pose,'調整腿部開度');}
   machine.update(0);
   if(u<.98){const p=smooth((u-.92)/.06),start=free(rest),pose=blend(start,rest,p);pose.hands=start.hands.map((hand,index)=>lerp(hand,rest.hands[index],p));pose.handGripStrength=[0,0];return fixed(pose,'對準兩側握把');}
   const pose=copy(rest),g=smooth((u-.98)/.02);pose.handGripStrength=[g,g];pose.handGripping=[true,true];return fixed(pose,'握穩握把',[true,true]);
 }
 function sample(direction,u){const p=Math.max(0,Math.min(1,u));if(direction==='enter'||direction==='entry')return enter(p);if(p<.82){const f=enter(1-p/.82*.72);f.stage=p<.10?'鬆開握把':p<.28?'收回腿部開度':p<.55?'依序踩回地面':'扶穩起身';return f;}return walk(inner,gate,(p-.82)/.18,0,'離開器材');}
 return{meta,sample};
}
