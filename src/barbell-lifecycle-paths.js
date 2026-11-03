import {solveHandContactFrame} from './hand-contact-frame.js';
import {buildLocomotionPose} from './locomotion.js';

const copy=value=>structuredClone(value),clamp=value=>Math.max(0,Math.min(1,value)),ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a.map((value,index)=>value+(b[index]-value)*t);
const RACK_FINGERS={thumb:[.55,.15,.25],index:[.35,1.15,.25],middle:[.95,.40,.25],ring:[.75,.40,.65],pinky:[.55,.15,.45]};
export const SQUAT_RACK_SUPPORT={y:.020,z:-.124,radius:.016,gripWidth:.41,lean:.12};

/** The rigid shaft centre and the palm marker are different points. These
 * targets come from that shaft and its authored grasp frame, never from a
 * deformed character's measured hand position. */
export function rackGripTargets({THREE,pose,barPosition,halfWidth=.41}){
  return [-1,1].map((sign,index)=>{
    const advance=new THREE.Vector3(...pose.handAdvances[index]),axis=new THREE.Vector3(...pose.handDirections[index]);
    const normal=new THREE.Vector3().crossVectors(advance,axis).normalize().multiplyScalar(sign);
    return new THREE.Vector3(sign*halfWidth,barPosition[1],barPosition[2]).addScaledVector(normal,-.030).addScaledVector(advance,-.015).toArray();
  });
}

export function calibrateRackGrip({THREE,metrics,pose,barPosition,grip=1,approach=null,roll=0,directions=null}){
  const authored=copy(pose.hands),distances=authored.map(p=>Math.hypot(p[1]-barPosition[1],p[2]-barPosition[2]));
  const close=distances.map(distance=>approach??ease((.30-distance)/.08));
  const preferredAdvances=pose.handAdvances?copy(pose.handAdvances):null;
  pose.handDirections=directions||[[1,0,0],[-1,0,0]];delete pose.handNormals;delete pose.handAdvances;
  pose.handAdvances=preferredAdvances||[0,1].map(index=>{const d=new THREE.Vector3(...solveHandContactFrame(metrics,pose,index).advance);d.x=0;return d.normalize().applyAxisAngle(new THREE.Vector3(1,0,0),roll).toArray();});
  const targets=rackGripTargets({THREE,pose,barPosition});
  pose.hands=authored.map((p,index)=>p.map((v,j)=>v+(targets[index][j]-[[-.41,barPosition[1],barPosition[2]],[.41,barPosition[1],barPosition[2]]][index][j])*close[index]));
  pose.handFingerFlex=[0,1].map(index=>Object.fromEntries(Object.entries(RACK_FINGERS).map(([finger,angles])=>[finger,angles.map((value,digit)=>{
    const relaxed=finger==='thumb'?[.20,.20,.13][digit]:[.30,.46,.23][digit]+(['ring','pinky'].includes(finger)?.055:0),open=finger==='thumb'?value:.12;
    const unheld=relaxed+(open-relaxed)*close[index];return unheld+(value-unheld)*grip;
  })])));
  pose.handGripStrength=[grip,grip];pose.handGripping=[grip>.5,grip>.5];pose.gripping=grip>.5;pose.relaxedHands=false;
  return pose;
}

export function buildRackSquatExercisePose({THREE,metrics,smith=false,t=0}){
  const support=SQUAT_RACK_SUPPORT,torso=metrics.torsoLength,lean=support.lean+.38*t,hipY=metrics.neutral.hip[1]-.020-.32*t;
  const hipZ=smith?-.16-(torso+support.y)*Math.sin(lean)-support.z*Math.cos(lean):-.15*t;
  const hip=[0,hipY,hipZ],shoulder=[0,hipY+torso*Math.cos(lean),hipZ+torso*Math.sin(lean)];
  const restTorso=new THREE.Vector3(...metrics.neutral.shoulder).sub(new THREE.Vector3(...metrics.neutral.hip)),q=new THREE.Quaternion().setFromUnitVectors(restTorso.normalize(),new THREE.Vector3(0,Math.cos(lean),Math.sin(lean)));
  const head=new THREE.Vector3(...metrics.neutral.head).sub(new THREE.Vector3(...metrics.neutral.hip)).applyQuaternion(q).add(new THREE.Vector3(...hip)).toArray();
  const barPosition=[0,shoulder[1]+support.y*Math.cos(lean)-support.z*Math.sin(lean),smith?-.16:shoulder[2]+support.y*Math.sin(lean)+support.z*Math.cos(lean)];
  const pose={hip,shoulder,head,hands:[[-.41,barPosition[1],barPosition[2]],[.41,barPosition[1],barPosition[2]]],feet:[[-.23,.013,.08],[.23,.013,.08]],footDirections:[[-.08,0,1],[.08,0,1]],footNormals:[[0,1,0],[0,1,0]],elbowHints:[[-.7,-1,-.30],[.7,-1,-.30]],kneeHints:[[-.08,0,1],[.08,0,1]],headPitch:-lean*.45};
  return {pose:calibrateRackGrip({THREE,metrics,pose,barPosition,roll:smith?-.45:0}),barPosition};
}

/** Rack setup is an explicit forward sequence. Reversing it for reracking is
 * safe because the hook takes the load before hands open or the back leaves. */
export function createRackSquatLifecycle({THREE,machine,metrics}){
  const V=p=>new THREE.Vector3(...p),UP=new THREE.Vector3(0,1,0),smith=machine.type==='smithSquat',setup=machine.getRackSetup(),ready=copy(setup.readyPose);
  const restTorso=V(metrics.neutral.shoulder).sub(V(metrics.neutral.hip)),restHead=V(metrics.neutral.head).sub(V(metrics.neutral.hip)),axis=restTorso.clone().normalize();
  const rack=setup.rackBarPosition,readyBar=setup.readyBarPosition,rackHipZ=rack[2]-(readyBar[2]-ready.hip[2]),rackLift=readyBar[1]-rack[1],gate=[0,0,-1.65];
  function body(y,z,lean,feet){const q=new THREE.Quaternion().setFromUnitVectors(axis,new THREE.Vector3(0,Math.cos(lean),Math.sin(lean))),hip=[0,y,z];return {hip,shoulder:restTorso.clone().applyQuaternion(q).add(V(hip)).toArray(),head:restHead.clone().applyQuaternion(q).add(V(hip)).toArray(),feet:copy(feet),footDirections:[[-.08,0,1],[.08,0,1]],footNormals:[[0,1,0],[0,1,0]],kneeHints:[[-.08,0,1],[.08,0,1]],elbowHints:[[-.7,-1,-.30],[.7,-1,-.30]],headPitch:.22};}
  function freeHands(p){const q=new THREE.Quaternion().setFromUnitVectors(axis,V(p.shoulder).sub(V(p.hip)).normalize());p.hands=metrics.arms.map((arm,index)=>restTorso.clone().add(V(arm.shoulderOffset)).add(new THREE.Vector3(index?.053:-.053,-.505,.025)).applyQuaternion(q).add(V(p.hip)).toArray());p.handGripping=[false,false];p.handGripStrength=[0,0];p.gripping=false;p.relaxedHands=true;p.handNormals=[[1,0,0],[-1,0,0]];p.elbowHints=[[-.3,-.4,-1],[.3,-.4,-1]];return p;}
  const idle=buildLocomotionPose(metrics,0,0);idle.kneeHints=[[0,0,1],[0,0,1]];for(const k of ['hip','shoulder','head'])idle[k][2]+=gate[2];for(const k of ['hands','feet'])idle[k]=idle[k].map(p=>[p[0],p[1],p[2]+gate[2]]);
  const feet=z=>[[-.23,.013,z+.13],[.23,.013,z+.13]],nodes=[];
  function append(p,bar,seconds,label,options={}){nodes.push({pose:p,bar:[...bar],seconds,label,grip:0,handRoll:0,hookAngle:0,...options});}
  const before=body(metrics.neutral.hip[1]-.025,rack[2]-.43,.05,feet(rack[2]-.43));before.headPitch=0;freeHands(before);
  append(idle,rack,0,'站在架外');
  const threshold=body(metrics.neutral.hip[1]-.045,-.73,.06,feet(-.73));threshold.headPitch=0;freeHands(threshold);
  append(threshold,rack,2.6,'走近槓架',{walk:true,lift:.07});
  append(before,rack,1.6,'站穩並面對槓鈴',{walk:true,lift:.085});
  const touch=copy(before);touch.hands=[[-.41,rack[1],rack[2]],[.41,rack[1],rack[2]]];touch.elbowHints=[[-.7,-1,-.3],[.7,-1,-.3]];
  const touching=calibrateRackGrip({THREE,metrics,pose:copy(touch),barPosition:rack}),graspAdvances=copy(touching.handAdvances),beforeTouch=copy(touch);beforeTouch.hands=touch.hands.map((p,i)=>{const advance=V(graspAdvances[i]),normal=new THREE.Vector3().crossVectors(advance,new THREE.Vector3(i?-1:1,0,0)).multiplyScalar(i?1:-1).normalize();return V(p).addScaledVector(normal,-.16).addScaledVector(advance,-.06).toArray();});
  append(beforeTouch,rack,.75,'抬手到握位前',{handAdvances:graspAdvances});append(touch,rack,.65,'雙手對準握位',{handAdvances:graspAdvances});append(touch,rack,.45,'閉握固定槓鈴',{grip:1,handAdvances:graspAdvances});
  const low=body(metrics.neutral.hip[1]-.215,rack[2]-.46,.25,copy(before.feet));low.hands=copy(touch.hands);low.headPitch=.60;
  append(low,rack,.85,'先屈膝降低重心',{grip:1});
  const headClear=body(metrics.neutral.hip[1]-.295,rack[2]-.54,.50,copy(before.feet));headClear.hands=copy(touch.hands);headClear.headPitch=.60;
  append(headClear,rack,.65,'保持頭部在槓前降低高度',{grip:1});
  const duck=body(metrics.neutral.hip[1]-.25,rack[2]-.60,.85,copy(before.feet));duck.hands=copy(touch.hands);duck.headPitch=.60;
  append(duck,rack,1.1,'屈髖低頭讓頭部通過槓下',{grip:1});
  const under=body(metrics.neutral.hip[1]-.25,rack[2]-.16,.85,feet(rack[2]-.16));under.hands=copy(touch.hands);under.headPitch=.60;
  append(under,rack,1.25,'低頭跨入槓下',{grip:1,walk:true,lift:.06});
  const settle=body(ready.hip[1]-rackLift,rackHipZ,SQUAT_RACK_SUPPORT.lean,copy(under.feet));settle.hands=copy(touch.hands);settle.headPitch=ready.headPitch;
  append(settle,rack,1.15,'上背靠妥槓身',{grip:1});
  const underFeet=copy(ready.feet).map(p=>[p[0],p[1],p[2]+rackHipZ-ready.hip[2]]),square=copy(settle);square.feet=underFeet;
  append(square,rack,1.05,'雙腳移到承重位置',{grip:1,walk:true,lift:.055});
  const lifted=copy(ready);for(const k of ['hip','shoulder','head'])lifted[k][2]+=rackHipZ-ready.hip[2];lifted.feet=underFeet;lifted.hands=[[-.41,readyBar[1],rack[2]],[.41,readyBar[1],rack[2]]];
  append(lifted,[0,readyBar[1],rack[2]],.9,smith?'伸腿抬槓離開承重銷':'伸腿抬槓離開掛鉤',{grip:1,support:true});
  if(smith)append(lifted,[0,readyBar[1],rack[2]],.65,'轉動槓身使掛鉤避開承重銷',{grip:1,support:true,handRoll:-.45,hookAngle:-.45});
  if(!smith)append(ready,readyBar,2.4,'交替小步退到訓練位置',{grip:1,walk:true,lift:.065,support:true,alreadyCalibrated:true});
  else append(ready,readyBar,.35,'原位站穩準備深蹲',{grip:1,support:true,alreadyCalibrated:true,handRoll:-.45,hookAngle:-.45});
  const duration=nodes.reduce((a,n)=>a+n.seconds,0);
  function sample(direction,u){
    const phase=direction==='exit'?1-clamp(u):clamp(u),seconds=phase*duration;let index=1,start=0;
    for(;index<nodes.length-1&&seconds>start+nodes[index].seconds;index++)start+=nodes[index].seconds;
    const a=nodes[index-1],b=nodes[index],raw=clamp((seconds-start)/b.seconds),t=b.walk?raw:ease(raw),pose={};
    for(const k of ['hip','shoulder','head'])pose[k]=mix(a.pose[k],b.pose[k],t);
    for(const k of ['hands','feet','footDirections','footNormals','elbowHints','kneeHints'])pose[k]=[0,1].map(i=>mix(a.pose[k]?.[i]||b.pose[k][i],b.pose[k][i],t));
    pose.headPitch=(a.pose.headPitch||0)+((b.pose.headPitch||0)-(a.pose.headPitch||0))*t;
    let feetContact=[0,1].map(i=>V(a.pose.feet[i]).distanceTo(V(b.pose.feet[i]))<1e-8||raw===0||raw===1);
    if(b.walk){const distance=Math.abs(b.pose.hip[2]-a.pose.hip[2]),count=Math.max(2,Math.ceil(distance/.18/2)*2),step=Math.min(count-1,Math.floor(raw*count)),within=raw===1?1:raw*count-step,side=step%2;for(let i=0;i<2;i++){const completed=i===0?Math.floor((step+1)/2):Math.floor(step/2),progress=(completed+(side===i?ease(within):0))/(count/2);pose.feet[i]=mix(a.pose.feet[i],b.pose.feet[i],clamp(progress));if(side===i)pose.feet[i][1]+=Math.sin(within*Math.PI)*(b.lift||.065);}feetContact=[true,true];feetContact[side]=within<1e-8||within>1-1e-8;}
    if(b.step!==undefined){pose.feet[b.step][1]+=Math.sin(raw*Math.PI)*b.lift;feetContact[b.step]=raw===0||raw===1;}
    if(b.walk&&!b.support){const lower=.025*Math.sin(raw*Math.PI);for(const k of ['hip','shoulder','head'])pose[k][1]-=lower;}
    const bar=mix(a.bar,b.bar,t),grip=a.grip+(b.grip-a.grip)*t;
    if(b.walk&&b.support){const lower=.009*Math.sin(raw*Math.PI);for(const k of ['hip','shoulder','head'])pose[k][1]-=lower;bar[1]-=lower;}
    if(index<=2){pose.gripping=false;pose.handGripping=[false,false];pose.handGripStrength=[0,0];pose.relaxedHands=true;pose.handNormals=[[1,0,0],[-1,0,0]];}
    else{
      if(a.alreadyCalibrated||b.alreadyCalibrated){const clean=node=>{const p=copy(node.pose);if(node.alreadyCalibrated)p.hands=[[-.41,node.bar[1],node.bar[2]],[.41,node.bar[1],node.bar[2]]];return p;};pose.hands=clean(a).hands.map((p,i)=>mix(p,clean(b).hands[i],t));}
      if(grip>.999)pose.hands=[[-.41,bar[1],bar[2]],[.41,bar[1],bar[2]]];
      let directions=null;
      if(b.handAdvances){
        pose.handAdvances=copy(b.handAdvances);
        if(b.label==='抬手到握位前'){
          const frames=[0,1].map(i=>{
            const start=solveHandContactFrame(metrics,a.pose,i),basis=(across,advance)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(across),new THREE.Vector3().crossVectors(V(advance),V(across)).normalize(),V(advance))),q=basis(start.axis,start.advance).slerp(basis(i?[-1,0,0]:[1,0,0],b.handAdvances[i]),t);
            return{axis:new THREE.Vector3(1,0,0).applyQuaternion(q).toArray(),advance:new THREE.Vector3(0,0,1).applyQuaternion(q).toArray()};
          });
          pose.handAdvances=frames.map(f=>f.advance);directions=frames.map(f=>f.axis);
        }
      }
      calibrateRackGrip({THREE,metrics,pose,barPosition:bar,grip,roll:a.handRoll+(b.handRoll-a.handRoll)*t,directions});
    }
    if(phase===0)Object.assign(pose,copy(idle));if(phase===1)Object.assign(pose,copy(ready));
    machine.setRackLifecyclePose(pose,bar,a.hookAngle+(b.hookAngle-a.hookAngle)*t);
    const label=direction==='exit'?({'抬手到握位前':'放手後收回雙手','先屈膝降低重心':'確認已離槓後站起','保持頭部在槓前降低高度':'低頭退離槓身','屈髖低頭讓頭部通過槓下':'保持低頭移出槓下','交替小步退到訓練位置':'交替小步走回掛鉤','轉動槓身使掛鉤避開承重銷':'轉回槓身對準承重銷','伸腿抬槓離開承重銷':'屈膝把掛鉤穩放承重銷','站穩並面對槓鈴':'退離槓架','雙手對準握位':'雙手離開槓鈴','閉握固定槓鈴':'確認掛鉤承重後放手','屈膝屈髖並低頭':'離槓後自然站起','低頭跨入槓下':'低頭跨出槓下','上背靠妥槓身':'保持握持並離開槓下','雙腳移到承重位置':'收回站位準備離槓','伸腿抬槓離開掛鉤':'屈膝將槓穩放掛鉤','伸腿抬槓解除掛鉤':'屈膝將槓穩放掛鉤','第一步退離掛鉤':'向掛鉤跨進第二步','第二步退到訓練位置':'向掛鉤跨進第一步','原位站穩準備深蹲':'原位站穩準備收槓','走近槓架':'走離槓架'}[b.label]||b.label):b.label;
    return {pose,offset:[0,0,0],rotation:0,stage:label,contacts:{hands:[grip>.999,grip>.999],feet:feetContact},bodySupport:b.support?'upper-back-and-feet':'feet',barSupport:b.support?'upper-back':'rack',restPhase:0};
  }
  return{entryDuration:duration,exitDuration:duration,gate:{offset:gate,rotation:0},gateOffset:gate,gateRotation:0,restPhase:0,stages:nodes.slice(1).map(n=>({label:n.label,duration:n.seconds})),sample};
}

/** Bench setup keeps its existing independent sequence. */
export function authorBarbellExit({type,ready,free,gate,metrics,body,stand,freeHands,add,walk,clone}){
  if(type==='benchPress'){
    const rackBody=clone(ready),rackBar=[0,1.11,-.20];
    rackBody.hands=rackBody.hands.map(value=>[value[0],rackBar[1],rackBar[2]]);delete rackBody.handAdvances;
    add(ready,rackBody,.85,'returning',{state:{barPosition:rackBar}});add(rackBody,rackBody,.25,'releasing',{grip:[1,0]});const rackFree=freeHands(rackBody);add(rackBody,rackFree,.45,'releasing');
    const slid=clone(rackFree);for(const key of ['hip','shoulder','head'])slid[key][2]+=.14;const clear=freeHands(slid);add(rackFree,clear,.6,'positioning',{free:true});
    const sit=body([0,.64,.58],ready.feet);add(clear,sit,1.3,'sitting',{free:true});
    const stood=stand(0,.78,0,metrics.neutral.hip[1]-.05,ready.feet);add(sit,stood,1.0,'standing',{free:true});walk(stood,gate,1.5);
  }else return false;
  return true;
}
