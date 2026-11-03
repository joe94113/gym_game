import {buildLocomotionPose} from './locomotion.js';
import {floorHeightAt} from './gym-layout.js';
import {transformPoint} from './lifecycle-frame.js';
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a.map((value,index)=>value+(b[index]-value)*t);
const pointFields=['hip','shoulder','head','hands','feet'];
function shifted(pose,offset){const out={...pose};for(const key of pointFields)if(pose[key])out[key]=Array.isArray(pose[key][0])?pose[key].map(point=>point.map((v,i)=>v+offset[i])):pose[key].map((v,i)=>v+offset[i]);return out;}
function blend(a,b,u){const t=ease(u),out={...b};for(const key of pointFields)if(a[key]&&b[key])out[key]=Array.isArray(a[key][0])?a[key].map((p,i)=>mix(p,b[key][i],t)):mix(a[key],b[key],t);return out;}
/** Walking through the real door precedes sitting or stepping onto a platform. */
export function createFacilityLifecycle({station,architecture,metrics}){
  const setup=station.setup,origin=setup.origin,yaw=setup.rotation||0,kind=station.facilityKind;
  const local=world=>transformPoint(world.map((value,index)=>value-origin[index]),[0,0,0],-yaw);
  const world=point=>transformPoint(point,origin,yaw);
  const gate=local(station.interaction),ready=architecture.sampleFacility(station.id,0,metrics);
  const seated=['sauna','steam','toilet','coldPlunge'].includes(kind);
  const dock=kind==='inbody'?[0,0,-.6]:kind==='coldPlunge'?[0,.14,.7]:seated?[0,0,.7]:[0,kind==='shower'?.0225:0,0];
  let path=[gate];
  if(kind==='sauna'||kind==='steam')path.push(local([16.5,origin[1],station.position.z]),[0,0,.7]);
  else if(kind==='coldPlunge')path.push(local([16.25,.08,14.3]),local([18.3,.22,14.3]),dock);
  else if(kind==='groupClass')path.push(local([-14,.05,26.8]),local([-14,.05,28.2]),local([-24,.05,28.2]),dock);
  else path.push(dock);
  const lengths=path.slice(1).map((point,index)=>Math.hypot(point[0]-path[index][0],point[2]-path[index][2])),distance=lengths.reduce((a,b)=>a+b,0);
  const walkDuration=Math.max(.6,distance/1.55),turnDuration=.65,settleDuration=seated?2.6:kind==='inbody'?2.3:.7,graspDuration=kind==='inbody'?.7:.35;
  const duration=walkDuration+turnDuration+settleDuration+graspDuration;
  const last=path.at(-1),previous=path.at(-2),walkYaw=Math.atan2(last[0]-previous[0],last[2]-previous[2]);
  const standing=shifted(buildLocomotionPose(metrics,0,0),dock);
  const walkingFloor=(x,z)=>kind==='coldPlunge'&&x>16.4&&Math.abs(z-14.3)<.55?(x>17.02?.22:.15):floorHeightAt(x,z);
  function sampleForward(seconds){
    architecture.toggleDoor(station.id,true);
    if(seconds<walkDuration){
      let remaining=distance*clamp(seconds/walkDuration),index=0;
      while(index<lengths.length-1&&remaining>lengths[index])remaining-=lengths[index++];
      const t=lengths[index]?remaining/lengths[index]:1,offset=mix(path[index],path[index+1],t),segmentHeading=Math.atan2(path[index+1][0]-path[index][0],path[index+1][2]-path[index][2]);
      const previousHeading=index?Math.atan2(path[index][0]-path[index-1][0],path[index][2]-path[index-1][2]):segmentHeading;
      const heading=previousHeading+Math.atan2(Math.sin(segmentHeading-previousHeading),Math.cos(segmentHeading-previousHeading))*ease(Math.min(1,remaining/.55));
      const global=world(offset);offset[1]=walkingFloor(global[0],global[2])-origin[1];
      const pose=buildLocomotionPose(metrics,seconds,Math.min(1,seconds/.25,(walkDuration-seconds)/.25));
      // Each sole follows its own floor height when crossing a mat or pool step.
      const differences=[];
      pose.feet=pose.feet.map(point=>{const absolute=world(transformPoint(point,offset,heading)),soleFloor=Math.max(...[[0,0],[.11,0],[-.11,0],[0,.11],[0,-.11]].map(([dx,dz])=>walkingFloor(absolute[0]+dx,absolute[2]+dz))),difference=soleFloor-(origin[1]+offset[1]);differences.push(difference);return[point[0],point[1]+difference,point[2]];});
      if(differences.some(value=>value<-.015)){const bend=Math.min(.075,-Math.min(...differences)*.8);for(const key of ['hip','shoulder','head'])pose[key][1]-=bend;pose.hands.forEach(point=>point[1]-=bend);}
      return {pose,offset,rotation:heading,stage:'positioning',contacts:{hands:[false,false],feet:pose.feet.map(p=>p[1]<.035)}};
    }
    if(seconds<walkDuration+turnDuration){
      const t=ease((seconds-walkDuration)/turnDuration),pose=buildLocomotionPose(metrics,seconds,0);
      const angle=Math.atan2(Math.sin(-walkYaw),Math.cos(-walkYaw));
      pose.feet=pose.feet.map((point,index)=>[point[0],point[1]+Math.max(0,Math.sin(t*Math.PI*2+(index?Math.PI:0)))*.045,point[2]]);
      return {pose,offset:dock,rotation:walkYaw+angle*t,stage:'positioning',contacts:{hands:[false,false],feet:[false,false]}};
    }
    const u=clamp((seconds-walkDuration-turnDuration)/settleDuration);
    if(u<1){
      const pose=blend(standing,ready,u);
      if(kind==='inbody')for(const key of ['hip','shoulder','head'])pose[key][1]-=.10*Math.sin(Math.PI*u);
      pose.handGripping=[false,false];pose.gripping=false;pose.handGripStrength=[0,0];
      pose.feet=standing.feet.map((point,index)=>{const t=ease((u-(index?.42:0))/(index?.58:.58));const p=mix(point,ready.feet[index],t);p[1]+=Math.sin(t*Math.PI)*.055;return p;});
      return {pose,offset:[0,0,0],rotation:0,stage:seated?'sitting':kind==='inbody'?'stepping-up':'positioning',contacts:{hands:[false,false],feet:[false,false]}};
    }
    const t=ease((seconds-walkDuration-turnDuration-settleDuration)/graspDuration);
    return {pose:{...ready,handGripStrength:[t,t]},offset:[0,0,0],rotation:0,stage:kind==='inbody'?'grasping':'ready',contacts:{hands:kind==='inbody'?[true,true]:[false,false],feet:[true,true]}};
  }
  return {
    gateOffset:gate,gateRotation:Math.atan2(path[1][0]-gate[0],path[1][2]-gate[2]),entryDuration:duration,exitDuration:duration,restPhase:0,
    sample(direction,u){const entering=direction==='enter',frame=sampleForward((entering?clamp(u):1-clamp(u))*duration);if(!entering)frame.stage=frame.stage==='sitting'?'standing':frame.stage==='grasping'?'releasing':frame.stage==='positioning'?'leaving':frame.stage;return frame;},
  };
}
