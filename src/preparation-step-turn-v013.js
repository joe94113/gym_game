import * as THREE from 'three';

const up=new THREE.Vector3(0,1,0),smooth=value=>{const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t);};
/** Turn around the preparation spot with alternating small steps. A planted
 * shoe stays fixed in machine space instead of sliding in an arc with the
 * actor root. The same original neutral pose and fixed-length leg IK remain. */
export function preparationStepTurn({neutral,offset,from,to,phase,stage,endFeet=null}){
 const p=THREE.MathUtils.clamp(phase,0,1),progress=smooth(p),delta=Math.atan2(Math.sin(to-from),Math.cos(to-from)),yaw=from+delta*progress;
 if(Math.abs(delta)<1e-8)return{pose:structuredClone(neutral),offset:[...offset],rotation:from,stage,contacts:{hands:[false,false],feet:[true,true]}};
 const steps=Math.max(2,Math.ceil(Math.abs(delta)/(Math.PI/3)/2)*2),cycles=steps/2,position=Math.min(steps-1e-8,progress*steps),step=Math.floor(position),within=position-step,moving=step%2;
 const pose=structuredClone(neutral),drop=.045*Math.sin(p*Math.PI);
 for(const key of ['hip','shoulder','head'])pose[key][1]-=drop;
 pose.footDirections=[];pose.footNormals=[[0,1,0],[0,1,0]];pose.kneeHints=[[0,0,1],[0,0,1]];
 pose.feet=[0,1].map(side=>{
  const completed=Math.max(0,Math.ceil((step-side)/2)),travel=Math.min(1,(completed+(moving===side?smooth(within):0))/cycles),heading=from+delta*travel;
  const foot=endFeet?new THREE.Vector3(...neutral.feet[side]).applyAxisAngle(up,from).lerp(new THREE.Vector3(...endFeet[side]),travel):new THREE.Vector3(...neutral.feet[side]).applyAxisAngle(up,heading);
  if(moving===side)foot.y+=.10*Math.sin(within*Math.PI);
  pose.footDirections.push(new THREE.Vector3(0,0,1).applyAxisAngle(up,heading-yaw).toArray());
  return foot.applyAxisAngle(up,-yaw).toArray();
 });
 const feet=[0,1].map(side=>moving!==side||within<1e-7||within>1-1e-7);
 return{pose,offset:[...offset],rotation:yaw,stage,contacts:{hands:[false,false],feet}};
}
