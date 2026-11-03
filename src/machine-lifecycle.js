import {buildLocomotionPose} from './locomotion.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {authorCardioExit,cardioLifecycleMetadata} from './cardio-lifecycle-paths.js';
import {authorAuxiliaryStrengthExit} from './auxiliary-strength-paths.js';
import {authorBarbellExit,createRackSquatLifecycle} from './barbell-lifecycle-paths.js';
import {preparationStepTurn} from './preparation-step-turn-v013.js';
import {planCapturedTransition,capturedTransitionProgress} from './captured-transition-v018.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const clamp=value=>Math.max(0,Math.min(1,value));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const point=(a,b,t)=>a.map((value,index)=>lerp(value,b[index],t));
const REVERSE={returning:'taking',releasing:'grasping',standing:'sitting',leaving:'positioning',positioning:'positioning',sitting:'standing',taking:'returning',grasping:'releasing'};
const REST_PHASE={benchPress:.44,legPress:.44,legCurl:.44};
const SIDE_TYPES=new Set(['legPress','seatedRow','rower','legExtension','legCurl','bike','elliptical']);
// Longer mounts have several separate foot placements and restraint steps.
// The old shared 6.2 s budget compressed e.g. a 10.15 s calf sequence into
// 6.2 s. Preserve the authored cadence without sampling a busy machine just
// to read lifecycle metadata.
const MIN_SETUP_SECONDS=Object.freeze({calfRaise:10.4,legPress:9.2,legExtension:9.8,legCurl:10.4,seatedRow:9.3,rower:6.4,hipThrust:6.8});

/** Authored, machine-local entry/exit paths. Metadata reads are pure: a busy
 * machine is sampled only when the first actual lifecycle frame is requested. */
export function createMachineLifecycle({THREE,machine,metrics,activityId=null,capturedTransitionTiming=true}) {
  if(['squat','smithSquat'].includes(machine.type))return createRackSquatLifecycle({THREE,machine,metrics});
  const custom=machine.getLifecycle?.(activityId);
  if(custom&&machine.sampleLifecycle)return {
    ...custom,gate:{offset:custom.gateOffset,rotation:custom.gateRotation||0},
    sample:(direction,u)=>machine.sampleLifecycle(direction,u,activityId),
  };
  const type=machine.type,forwardGate=Math.max(1.65,(machine.footprint?.d||2)/2+.48),cardioMeta=cardioLifecycleMetadata(type,machine);
  const gateOffset=cardioMeta?.gateOffset||(type==='legPress'?[-2.05,0,-.35]:type==='seatedRow'?[-1.75,0,.1]:['legExtension','legCurl'].includes(type)?[-1.7,0,0]:[0,0,forwardGate]);
  const gateRotation=cardioMeta?.gateRotation??(SIDE_TYPES.has(type)?-Math.PI/2:0);
  const restPhase=cardioMeta?.restPhase??REST_PHASE[type]??0;
  const entryDuration=cardioMeta?.entryDuration??Math.max(MIN_SETUP_SECONDS[type]||0,['benchPress','legPress','elliptical','bike','stairClimber'].includes(type)?8.4:6.2);
  const exitDuration=cardioMeta?.exitDuration??entryDuration;
  const up=new THREE.Vector3(0,1,0),restAxis=new THREE.Vector3(...metrics.neutral.shoulder).sub(new THREE.Vector3(...metrics.neutral.hip)).normalize();
  const torsoVector=new THREE.Vector3(...metrics.neutral.shoulder).sub(new THREE.Vector3(...metrics.neutral.hip));
  const headVector=new THREE.Vector3(...metrics.neutral.head).sub(new THREE.Vector3(...metrics.neutral.hip));
  let segments=null,ready=null,initialState=null;
  const vector=value=>new THREE.Vector3(...value);
  const rotationFor=(pose,yaw=0)=>new THREE.Quaternion().setFromAxisAngle(up,yaw).multiply(new THREE.Quaternion().setFromUnitVectors(restAxis,vector(pose.shoulder).sub(vector(pose.hip)).normalize().applyAxisAngle(up,-yaw)));
  function directionMix(a,b,t){const av=vector(a).normalize(),bv=vector(b).normalize();if(av.lengthSq()<1e-8)return [...b];if(bv.lengthSq()<1e-8)return [...a];const q=new THREE.Quaternion().setFromUnitVectors(av,bv);return av.applyQuaternion(new THREE.Quaternion().slerp(q,t)).toArray();}
  function kneePoleMix(a,b,t){
    const authored=vector(point(a,b,t)),length=authored.length(),from=vector(a).normalize(),to=vector(b).normalize();
    if(from.dot(to)>-.85||length>=.32)return authored.toArray();
    // Preserve the calibrated route away from an almost cancelling pair.
    // Around the singular region use its angular direction, with a smooth
    // blend back to the authored pole before the outer plates are reached.
    const angular=vector(directionMix(a,b,t)),weight=1-ease((length-.12)/.20);
    return length<1e-8?angular.toArray():authored.normalize().lerp(angular,weight).normalize().toArray();
  }
  function freeHands(pose,yaw=pose.yaw||0){
    const p=clone(pose),q=rotationFor(p,yaw),hip=vector(p.hip);
    p.hands=metrics.arms.map((arm,index)=>{
      const root=torsoVector.clone().add(vector(arm.shoulderOffset)).applyQuaternion(q).add(hip);
      return root.add(new THREE.Vector3((index?1:-1)*.085,-.36,.12).applyQuaternion(q)).toArray();
    });
    p.handNormals=[new THREE.Vector3(1,0,0).applyAxisAngle(up,yaw).toArray(),new THREE.Vector3(-1,0,0).applyAxisAngle(up,yaw).toArray()];
    const poleZ=['legPress','squat','smithSquat'].includes(type)?.8:-.6;
    p.elbowHints=[[-.8,-.5,poleZ],[.8,-.5,poleZ]].map(value=>vector(value).applyAxisAngle(up,yaw).toArray());
    p.handGripping=[false,false];p.handGripStrength=[0,0];p.gripping=false;p.relaxedHands=true;
    delete p.handAdvances;delete p.handDirections;delete p.elbows;
    return p;
  }
  function body(hip,feet,{axis=[0,1,0],yaw=0,footDirections=null,footNormals=null,kneeHints=null}={}){
    const q=new THREE.Quaternion().setFromUnitVectors(restAxis,vector(axis).normalize());
    const pose={hip:[...hip],shoulder:torsoVector.clone().applyQuaternion(q).add(vector(hip)).toArray(),head:headVector.clone().applyQuaternion(q).add(vector(hip)).toArray(),feet:clone(feet),yaw,footDirections:footDirections||feet.map(()=>[Math.sin(yaw),0,Math.cos(yaw)]),footNormals:footNormals||[[0,1,0],[0,1,0]],kneeHints:kneeHints||feet.map(()=>[Math.sin(yaw),0,Math.cos(yaw)])};
    return freeHands(pose,yaw);
  }
  const stand=(x,z,yaw=0,height=metrics.neutral.hip[1]-.032,feet=null)=>body([x,height,z],feet||[-1,1].map(sign=>vector([sign*.17,.013,.145]).applyAxisAngle(up,yaw).add(new THREE.Vector3(x,0,z)).toArray()),{yaw});
  function idleAt(x,z,yaw=0){const p=buildLocomotionPose(metrics,0,0);p.kneeHints=[[0,0,1],[0,0,1]];for(const key of ['hip','shoulder','head'])p[key]=vector(p[key]).applyAxisAngle(up,yaw).add(new THREE.Vector3(x,0,z)).toArray();for(const key of ['hands','feet'])p[key]=p[key].map(value=>vector(value).applyAxisAngle(up,yaw).add(new THREE.Vector3(x,0,z)).toArray());for(const key of ['handNormals','footNormals','footDirections','elbowHints','kneeHints'])if(p[key])p[key]=p[key].map(value=>vector(value).applyAxisAngle(up,yaw).toArray());p.yaw=yaw;return p;}
  function armHint(p,index){
    const q=rotationFor(p,p.yaw||0),root=torsoVector.clone().add(vector(metrics.arms[index].shoulderOffset)).applyQuaternion(q).add(vector(p.hip));
    if(p.elbows?.[index])return vector(p.elbows[index]).sub(root).toArray();if(p.elbowHints?.[index])return p.elbowHints[index];
    const sign=index?1:-1,gripping=p.handGripping?.[index]??p.gripping??!!p.hands,ahead=vector(p.hands[index]).sub(root).dot(new THREE.Vector3(0,0,1).applyQuaternion(q))>.12;
    return vector(gripping?[sign*.55,-.8,.15]:ahead?[sign*.4,-.6,.8]:[sign*.08,-.2,-1]).applyQuaternion(q).toArray();
  }
  function kneeHint(p,index){if(p.knees?.[index])return vector(p.knees[index]).sub(vector(metrics.legs[index].hipOffset).applyQuaternion(rotationFor(p,p.yaw||0)).add(vector(p.hip))).toArray();return p.kneeHints?.[index]||(p.lying?[0,1,0]:[0,0,1]);}
  function orientHands(pose){
    const p=clone(pose);p.handAdvances=[];p.handNormals=[];
    // The final actor is rebased by yaw before it is solved. Evaluate these
    // hand frames in that same local space, then return machine directions.
    // Solving a side-facing gate as if it faced +Z changed its wrist/elbow
    // frame at the first preparation sample.
    const local=clone(pose),yaw=pose.yaw||0,inverse=new THREE.Quaternion().setFromAxisAngle(up,-yaw),origin=new THREE.Vector3(pose.hip[0],0,pose.hip[2]);
    for(const key of ['hip','shoulder','head'])local[key]=vector(pose[key]).sub(origin).applyQuaternion(inverse).toArray();
    for(const key of ['hands','feet','elbows','knees'])if(pose[key])local[key]=pose[key].map(value=>vector(value).sub(origin).applyQuaternion(inverse).toArray());
    for(const key of ['handDirections','handNormals','handAdvances','elbowHints','kneeHints'])if(pose[key])local[key]=pose[key].map(value=>value?vector(value).applyQuaternion(inverse).toArray():value);
    for(let index=0;index<2;index++){
      const frame=solveHandContactFrame(metrics,local,index),advance=vector(frame.advance).applyAxisAngle(up,yaw),axis=vector(frame.axis).applyAxisAngle(up,yaw);p.handAdvances.push(advance.toArray());
      p.handNormals.push(advance.clone().cross(axis).multiplyScalar(index?1:-1).normalize().toArray());
    }
    return p;
  }
  function blend(a,b,u,{free=false,linear=false}={}){
    const t=linear?clamp(u):ease(u),p={};
    for(const key of ['hip','shoulder','head'])p[key]=point(a[key],b[key],t);
    const ayaw=a.yaw||0,byaw=b.yaw||0;p.yaw=ayaw+Math.atan2(Math.sin(byaw-ayaw),Math.cos(byaw-ayaw))*t;
    for(const key of ['hands','feet'])p[key]=a[key].map((value,index)=>point(value,b[key][index],t));
    for(const key of ['footDirections','footNormals'])p[key]=[0,1].map(index=>directionMix(a[key]?.[index]||[0,key==='footNormals'?1:0,key==='footNormals'?0:1],b[key]?.[index]||[0,key==='footNormals'?1:0,key==='footNormals'?0:1],t));
    // Knee poles are directions. Linear coordinates nearly cancelled the
    // right leg's +X/-X poles while turning out of the leg-press rail, so a
    // tiny time step spun the knee around the planted hip/ankle line.
    p.kneeHints=[0,1].map(index=>kneePoleMix(kneeHint(a,index),kneeHint(b,index),t));
    const aa=orientHands(a),bb=orientHands(b);
    p.handAdvances=[0,1].map(index=>directionMix(aa.handAdvances[index],bb.handAdvances[index],t));
    p.handNormals=[0,1].map(index=>directionMix(aa.handNormals[index],bb.handNormals[index],t));
    p.elbowHints=[0,1].map(index=>point(armHint(a,index),armHint(b,index),t));
    p.handGripStrength=[0,1].map(index=>lerp(a.handGripStrength?.[index]??((a.handGripping?.[index]??a.gripping??true)?1:0),b.handGripStrength?.[index]??((b.handGripping?.[index]??b.gripping??true)?1:0),t));
    p.handGripping=p.handGripStrength.map(value=>value>.5);p.gripping=p.handGripping.some(Boolean);p.relaxedHands=true;
    // "Free" means no load/contact, not that both authored endpoint arms
    // disappear. Replacing them with a newly generated rest pose made the
    // calf-raise/leg-press setup snap when a supported arm segment met a
    // standing segment. Keep the endpoint path and release only the grip.
    if(free){p.handGripStrength=[0,0];p.handGripping=[false,false];p.gripping=false;}
    return p;
  }
  function add(a,b,duration,stage,options={}){const stateA=clone(segments.at(-1)?.stateB||initialState||{open:0}),stateB={...stateA,...clone(options.state||{})},common={domain:'machine',type,id:activityId||machine.station?.id||type,stage,kind:options.kind,gripChange:options.grip};const capturedTiming={exit:planCapturedTransition({...common,from:a,to:b,stateA,stateB}),enter:planCapturedTransition({...common,from:b,to:a,stateA:stateB,stateB:stateA})};segments.push({a,b,duration,stage,stateA,stateB,...options,capturedTiming});}
  function walk(a,b,duration=1.8,options={}){add(a,b,duration,'leaving',{kind:'walk',free:true,...options});}
  function step(a,b,side,lift=.14,duration=.7,options={}){add(a,b,duration,'standing',{kind:'step',side,lift,free:true,...options});}
  function turn(a,yaw,duration=1.1,width=.10){
    const origin=new THREE.Vector3(a.hip[0],0,a.hip[2]),delta=yaw-(a.yaw||0),feet=a.feet.map((point,index)=>[point[0],point[1],origin.z+(index?width:-width)]);
    const b=body([...a.hip],feet,{yaw,footDirections:a.footDirections.map(value=>vector(value).applyAxisAngle(up,delta).toArray()),footNormals:a.footNormals,kneeHints:[[Math.sin(yaw),0,Math.cos(yaw)],[Math.sin(yaw),0,Math.cos(yaw)]]});add(a,b,duration,'positioning',{kind:'turn',free:true});return b;
  }
  function seatedExit(){
    const free=freeHands(ready),standing=stand(0,.38,0,metrics.neutral.hip[1]-.04,ready.feet);
    if(['latPulldown','plateHighRow'].includes(type)){
      add(ready,ready,.6,'positioning',{grip:[1,1],state:{open:1}});
      add(ready,free,.65,'releasing');
    }else if(type==='shoulderPress'){
      // Reach from the front of the handle before raising the elbows. A
      // direct rest-to-grip interpolation passed the upper arms through
      // the rear handle links when the seat was raised.
      const ahead=clone(free);ahead.hands=[[-.34,ready.shoulder[1]-.05,.32],[.34,ready.shoulder[1]-.05,.32]];ahead.elbowHints=[[-.7,-.8,.7],[.7,-.8,.7]];
      add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,ahead,.65,'releasing');add(ahead,free,.65,'releasing');
    }else{add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,free,.45,'releasing');}
    add(free,standing,.9,'standing',{free:true});walk(standing,idleAt(gateOffset[0],gateOffset[2],gateRotation),2.0);
  }
  function sideGateExit(seated,initialFeet=seated.feet,{rail=.75,gate=gateOffset,lift=.29,frontZ=seated.hip[2]}={}){
    const sideKnees=[[-1,0,.15],[-1,0,.15]];
    const sideArms=pose=>{pose.hands=metrics.arms.map((arm,index)=>torsoVector.clone().add(vector(arm.shoulderOffset)).add(new THREE.Vector3((index?1:-1)*.015,-.40,.16)).applyQuaternion(rotationFor(pose,pose.yaw||0)).add(vector(pose.hip)).toArray());pose.elbowHints=[[-.2,-.5,1],[.2,-.5,1]].map(value=>vector(value).applyAxisAngle(up,pose.yaw||0).toArray());return pose;};
    const s=sideArms(stand(0,frontZ,0,metrics.neutral.hip[1]-.09,initialFeet));add(seated,s,.8,'standing',{free:true});
    // Face the direction of the crossing before stepping over the rail.
    // Keeping the torso forward while spreading the knee poles sideways
    // produced the old frog-like crouch despite clearing the geometry.
    let p=sideArms(turn(s,-Math.PI/2,1.1,type==='seatedRow'?.06:type==='legPress'?.07:.10));
    const targets=[[-rail+.25,p.feet[1][0],-.18],[-rail+.25,-rail+.40,-.40],[-rail-.38,-rail+.40,-rail+.18],[-rail-.38,-rail-.26,-rail-.13]];
    for(let index=0;index<targets.length;index++){
      let [left,right,cx]=targets[index];if(index===0)cx=-.10;
      const feet=clone(p.feet);feet[0][0]=left;feet[1][0]=right;
      if(type==='legPress'&&index>=2)feet[index%2][2]=-.30+(index%2?.07:-.07);
      const z=type==='legPress'&&index>=2?(index===2?-.25:-.30):p.hip[2];
      const n=sideArms(body([cx,metrics.neutral.hip[1]-.14,z],feet,{yaw:-Math.PI/2,footDirections:[[-1,0,0],[-1,0,0]],kneeHints:sideKnees}));step(p,n,index%2,lift,.62,{clearanceFirst:type==='seatedRow'});p=n;
    }
    const end=idleAt(gate[0],gate[2],gateRotation);walk(p,end,1.5);
  }
  function build(){
    ready=clone(machine.sampleActivity(restPhase,restPhase,activityId));ready.yaw=0;segments=[];
    initialState={open:0,...(['benchPress','squat','smithSquat'].includes(type)?{barPosition:[0,ready.hands[0][1],ready.hands[0][2]]}:{})};
    const free=freeHands(ready),gate=idleAt(gateOffset[0],gateOffset[2],gateRotation);
    const standard=['chestPress','shoulderPress','plateInclinePress','plateShoulderPress','latPulldown','plateHighRow','pecDeck'];
    if(authorCardioExit({THREE,machine,type,ready,free,gate,metrics,body,stand,idleAt,freeHands,add,walk,step,sideGateExit,clone})){}
    else if(authorAuxiliaryStrengthExit({THREE,machine,type,ready,free,gate,metrics,body,stand,idleAt,freeHands,add,walk,step,sideGateExit,seatedExit,clone})){}
    else if(authorBarbellExit({THREE,machine,type,ready,free,gate,metrics,body,stand,idleAt,freeHands,add,walk,step,sideGateExit,seatedExit,clone})){}
    else if(standard.includes(type)){seatedExit();}
    else if(type==='cableFly'){
      add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,free,.45,'releasing');
      const square=stand(0,0,0,metrics.neutral.hip[1]-.05,[ready.feet[0],[.20,.013,.145]]);step(free,square,1,.10,.8);walk(square,gate,2.5);
    }else if(type==='seatedRow'){
      add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,free,.4,'releasing');
      const floor=body([0,ready.hip[1],type==='rower'?-.05:.1],[[-.20,.013,type==='rower'?.10:.25],[.20,.013,type==='rower'?.10:.25]]);
      add(free,floor,.8,'positioning',{free:true,lift:.14});
      const stood=stand(0,.10,0,metrics.neutral.hip[1]-.09,floor.feet);add(floor,stood,.7,'standing',{free:true});
      const one=body([0,.84,.22],[[-.20,.013,.50],stood.feet[1]]);step(stood,one,0,.10,.6);
      const two=body([0,.86,.35],[[-.20,.013,.50],[.20,.013,.50]]);step(one,two,1,.10,.6);sideGateExit(two,two.feet,{rail:.75,lift:.36,frontZ:.42});
    }else if(['legExtension','legCurl'].includes(type)){
      add(ready,ready,.2,'releasing',{grip:[1,0]});
      if(type==='legCurl')add(ready,ready,.65,'positioning',{grip:[0,0],state:{open:1}});
      add(ready,free,.4,'releasing');
      // Keep the knees in front of the shin roller while lowering onto an
      // adjusted seat; only the supported shins go behind the roller.
      const floorZ=type==='legExtension'?.38:.145;
      const floor=body([0,ready.hip[1],ready.hip[2]],[[-.2,.013,floorZ],[.2,.013,floorZ]]);
      add(free,floor,.75,'positioning',{free:true});
      const stood=stand(0,.05,0,.84,floor.feet);add(floor,stood,.8,'standing',{free:true});
      const one=body([0,.885,.30],[[-.20,.013,.65],stood.feet[1]]);step(stood,one,0,.45,.8);
      const two=body([0,.90,.52],[[-.20,.013,.65],[.20,.013,.65]]);step(one,two,1,.45,.8);sideGateExit(two,two.feet,{rail:.725,lift:.30,frontZ:.50});
    }else if(type==='hackSquat'){
      add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,free,.4,'releasing');
      const forward=clone(free);for(const key of ['hip','shoulder','head'])forward[key][2]+=.30;const out=freeHands(forward);add(free,out,.6,'positioning',{free:true});
      const crouch=body([0,.90,.10],ready.feet,{footDirections:ready.footDirections,footNormals:ready.footNormals});add(out,crouch,.7,'standing',{free:true});
      const one=body([0,.82,.30],[[-.23,.013,.75],ready.feet[1]],{footDirections:[[0,0,1],ready.footDirections[1]],footNormals:[[0,1,0],ready.footNormals[1]]});step(crouch,one,0,.22,.8);
      const two=stand(0,.6,0,metrics.neutral.hip[1]-.04,[[-.23,.013,.75],[.23,.013,.75]]);step(one,two,1,.22,.8);walk(two,gate,1.2);
    }else if(type==='hipThrust'){
      add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,ready,.7,'positioning',{grip:[0,0],state:{open:1}});add(ready,free,.4,'releasing');
      const sit=body(ready.hip,ready.feet);add(free,sit,.9,'standing',{free:true});
      const standPlate=stand(0,.56,0,metrics.neutral.hip[1]+.10,ready.feet);add(sit,standPlate,1.0,'standing',{free:true});
      const edge=body([0,metrics.neutral.hip[1]+.10,1.0],[[-.24,.15,1.15],[.24,.15,1.15]]);walk(standPlate,edge,1.1,{lift:.10});
      const one=body([0,.88,1.25],[[-.24,.013,1.65],edge.feet[1]]);step(edge,one,0,.22,.8);
      const two=stand(0,1.50,0,metrics.neutral.hip[1]-.03,[[-.24,.013,1.65],[.24,.013,1.65]]);step(one,two,1,.22,.8);walk(two,gate,.8);
    }else if(type==='legPress'){
      add(ready,ready,.2,'releasing',{grip:[1,0]});add(ready,free,.4,'releasing');
      const lifted=clone(free);lifted.feet=free.feet.map(value=>[value[0],value[1]+.10,value[2]-.15]);add(free,lifted,.5,'positioning',{free:true});
      const floor=body([0,.62,-.52],[[-.22,.013,-.20],[.22,.013,-.20]]);add(lifted,floor,.9,'positioning',{free:true});
      const one=body([0,.62,-.44],[[-.22,.013,-.055],floor.feet[1]]);step(floor,one,0,.08,.6);
      const centre=body([0,.62,-.35],[[-.22,.013,-.055],[.22,.013,-.055]]);step(one,centre,1,.08,.6);sideGateExit(centre,centre.feet,{rail:.90,lift:.55,frontZ:-.12});
    }else throw new Error(`缺少 ${type} 的器材進出動作`);
  }
  function sample(direction,u){
    if(!segments)build();
    const x=direction==='enter'?1-clamp(u):clamp(u),total=segments.reduce((sum,item)=>sum+item.duration,0),time=x*total;
    let sum=0,segment=segments.at(-1),t=1;
    for(const item of segments){if(time<=sum+item.duration){segment=item;t=clamp((time-sum)/item.duration);break;}sum+=item.duration;}
    machine.sampleActivity(restPhase,restPhase,activityId);
    const walkTime=segment.kind==='walk'?ease(t):t;
    const profile=segment.capturedTiming?.[direction],captured=capturedTransitionTiming?capturedTransitionProgress(profile,t,{reversePath:direction==='enter'}):null;
    let pose=blend(segment.a,segment.b,captured??walkTime,{free:segment.free,linear:captured!==null||segment.kind==='walk'});
    const feetContact=[0,1].map(index=>vector(segment.a.feet[index]).distanceTo(vector(segment.b.feet[index]))<1e-8||t<1e-6||t>1-1e-6);
    if(segment.kind==='step'){
      const side=segment.side,s=ease(t);pose.feet[side]=point(segment.a.feet[side],segment.b.feet[side],s);pose.feet[side][1]+=Math.sin(t*Math.PI)*segment.lift;
      if(segment.clearanceFirst){
        // Clear the beam before moving a long shoe across it. Each lift,
        // travel and landing boundary has zero velocity in both directions.
        const travel=ease(clamp((t-.22)/.56)),height=t<.22?ease(t/.22):t>.78?ease((1-t)/.22):1;
        pose.feet[side]=point(segment.a.feet[side],segment.b.feet[side],travel);pose.feet[side][1]+=height*segment.lift;
      }
      if(segment.via){const mid=segment.via;pose.feet[side]=t<.5?point(segment.a.feet[side],mid,ease(t*2)):point(mid,segment.b.feet[side],ease((t-.5)*2));}
      feetContact[side]=t<1e-6||t>1-1e-6;
    }else if(segment.kind==='turn'){
      const origin=new THREE.Vector3(segment.a.hip[0],0,segment.a.hip[2]),yaw=segment.a.yaw||0,inv=new THREE.Quaternion().setFromAxisAngle(up,-yaw),neutral=clone(segment.a);
      for(const key of ['hip','shoulder','head'])neutral[key]=vector(neutral[key]).sub(origin).applyQuaternion(inv).toArray();
      for(const key of ['hands','feet','elbows','knees'])if(neutral[key])neutral[key]=neutral[key].map(point=>vector(point).sub(origin).applyQuaternion(inv).toArray());
      for(const key of ['handDirections','handNormals','handAdvances','footDirections','footNormals','elbowHints','kneeHints'])if(neutral[key])neutral[key]=neutral[key].map(value=>value?vector(value).applyQuaternion(inv).toArray():value);
      const turning=preparationStepTurn({neutral,offset:origin.toArray(),from:yaw,to:segment.b.yaw||0,phase:t,stage:'轉身跨出器材',endFeet:segment.b.feet.map(point=>vector(point).sub(origin).toArray())});pose=turning.pose;pose.yaw=turning.rotation;
      for(const key of ['hip','shoulder','head'])pose[key]=vector(pose[key]).applyAxisAngle(up,turning.rotation).add(origin).toArray();
      for(const key of ['hands','feet','elbows','knees'])if(pose[key])pose[key]=pose[key].map(point=>vector(point).applyAxisAngle(up,turning.rotation).add(origin).toArray());
      for(const key of ['handDirections','handNormals','handAdvances','footDirections','footNormals','elbowHints','kneeHints'])if(pose[key])pose[key]=pose[key].map(value=>value?vector(value).applyAxisAngle(up,turning.rotation).toArray():value);
      feetContact.splice(0,2,...turning.contacts.feet);
    }else if(segment.kind==='walk'){
      const distance=vector(segment.b.hip).sub(vector(segment.a.hip)).setY(0).length(),count=Math.max(2,Math.ceil(distance/.18/2)*2),step=Math.min(count-1,Math.floor(walkTime*count)),within=t===1?1:walkTime*count-step;
      const side=step%2,swings=count/2;
      for(let index=0;index<2;index++){
        const completed=index===0?Math.floor((step+1)/2):Math.floor(step/2),progress=(completed+(side===index?ease(within):0))/swings;
        pose.feet[index]=point(segment.a.feet[index],segment.b.feet[index],clamp(progress));
        if(side===index)pose.feet[index][1]+=(['bike','hackSquat'].includes(type)?Math.sin(ease(within)*Math.PI):Math.sin(within*Math.PI))*(segment.lift||.085);
      }
      feetContact[side]=within<1e-6||within>1-1e-6;
      feetContact[1-side]=true;
      pose.hip[1]-=Math.sin(walkTime*Math.PI)*.02;pose.shoulder[1]-=Math.sin(walkTime*Math.PI)*.02;pose.head[1]-=Math.sin(walkTime*Math.PI)*.02;
      if(segment.free!==false){
        const q=rotationFor(pose,pose.yaw||0),baseHands=segment.a.hands.map((value,index)=>point(value,segment.b.hands[index],walkTime)),weight=ease(Math.min(1,walkTime/.16,(1-walkTime)/.16));
        pose.hands=metrics.arms.map((arm,index)=>{const root=torsoVector.clone().add(vector(arm.shoulderOffset)).applyQuaternion(q).add(vector(pose.hip));const natural=root.add(new THREE.Vector3((index?1:-1)*.053,-.505,.025+Math.sin(walkTime*count*Math.PI)*(index?1:-1)*.10).applyQuaternion(q)).toArray();return point(baseHands[index],natural,weight);});
        pose.elbowHints=[0,1].map(index=>{const a=vector(segment.a.elbowHints?.[index]||pose.elbowHints[index]).applyAxisAngle(up,-(segment.a.yaw||0)),b=vector(segment.b.elbowHints?.[index]||pose.elbowHints[index]).applyAxisAngle(up,-(segment.b.yaw||0));return vector(directionMix(a.toArray(),b.toArray(),ease(walkTime))).applyAxisAngle(up,pose.yaw||0).toArray();});
        // The hands have moved into a walking swing; their old fixed palm
        // advances no longer describe those targets. Blend toward an actual
        // relaxed palm frame, otherwise a hand at the waist lifts its elbow.
        const natural=clone(pose);delete natural.handAdvances;natural.handNormals=[[1,0,0],[-1,0,0]].map(value=>vector(value).applyAxisAngle(up,pose.yaw||0).toArray());const frames=orientHands(natural);
        pose.handAdvances=pose.handAdvances.map((value,index)=>directionMix(value,frames.handAdvances[index],weight));pose.handNormals=pose.handNormals.map((value,index)=>directionMix(value,frames.handNormals[index],weight));
      }
    }
    if(segment.grip){const amount=lerp(segment.grip[0],segment.grip[1],captured??ease(t));pose.handGripStrength=[amount,amount];pose.handGripping=[true,true];}
    const stateT=captured??(segment.kind==='walk'?t:ease(t)),mechanism={open:lerp(segment.stateA.open||0,segment.stateB.open||0,stateT)};
    if(segment.stateA.barPosition&&segment.stateB.barPosition)mechanism.barPosition=point(segment.stateA.barPosition,segment.stateB.barPosition,stateT);
    machine.setLifecycleState?.(mechanism);
    if(x<1e-10)pose=clone(ready);
    if(x>1-1e-10)pose=idleAt(gateOffset[0],gateOffset[2],gateRotation);
    const yaw=pose.yaw||0,offset=[pose.hip[0],0,pose.hip[2]],inverse=new THREE.Quaternion().setFromAxisAngle(up,-yaw),bodyQ=rotationFor(pose,yaw);
    for(const key of ['hip','shoulder','head'])pose[key]=vector(pose[key]).sub(vector(offset)).applyQuaternion(inverse).toArray();
    for(const key of ['hands','feet','elbows','knees'])if(pose[key])pose[key]=pose[key].map(value=>vector(value).sub(vector(offset)).applyQuaternion(inverse).toArray());
    for(const key of ['handDirections','handNormals','handAdvances','footDirections','footNormals','elbowHints','kneeHints'])if(pose[key])pose[key]=pose[key].map(value=>vector(value).applyQuaternion(inverse).toArray());
    pose.bodyQuaternion=inverse.clone().multiply(bodyQ).toArray();delete pose.yaw;
    const handsContact=[0,1].map(index=>(pose.handGripStrength?.[index]??((pose.handGripping?.[index]??pose.gripping??!!pose.hands)?1:0))>.99);
    return{pose,offset,rotation:yaw,stage:direction==='enter'?(REVERSE[segment.stage]||segment.stage):segment.stage,contacts:{hands:handsContact,feet:feetContact},bodySupport:['sitting','positioning','releasing'].includes(segment.stage)?'seat-or-feet':'feet',restPhase,...(captured!==null?{transitionTiming:{...profile,pathProgress:captured,storedPhase:t,actualPhase:direction==='enter'?1-t:t,storedPathDirection:'exit',playbackDirection:direction,segmentRange:[sum/total,(sum+segment.duration)/total]}}:{})};
  }
  return{entryDuration,exitDuration,gate:{offset:gateOffset,rotation:gateRotation},gateOffset,gateRotation,restPhase,stages:['positioning','sitting','taking','grasping','returning','releasing','standing','leaving'],sample,getCapturedTransitionCoverage(){const total=segments?.reduce((sum,s)=>sum+s.duration,0)||1;let elapsed=0;return{kind:'captured-transition-timing',machineType:type,activityId:activityId||machine.station?.id||type,initialized:!!segments,enabled:!!capturedTransitionTiming,segments:(segments||[]).map(segment=>{const from=elapsed;elapsed+=segment.duration;return{stage:segment.stage,range:[from/total,elapsed/total],enter:clone(segment.capturedTiming.enter),exit:clone(segment.capturedTiming.exit)};})};}};
}
