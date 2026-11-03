import {capturedGaits} from './mocap-samples-v013.js';
const clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),unit=v=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length);};
function sample(clip,phase,key,side){
 const position=((phase%1+1)%1)*clip.samples.length,index=Math.floor(position),fraction=position-index;
 const raw=unit(mix(clip.samples[index][key][side],clip.samples[(index+1)%clip.samples.length][key][side],fraction));
 // Capture extracts are not perfectly cyclic. Blend eight samples around
 // the seam instead of replaying a one-frame shoulder/elbow jump each stride.
 const edge=clamp(Math.min(position,clip.samples.length-position)/8),weight=edge*edge*(3-2*edge);
 return weight===1?raw:unit(mix(unit(mix(clip.samples[0][key][side],clip.samples.at(-1)[key][side],.5)),raw,weight));
}
/** Hybrid retarget: measured arm swing with the existing planted-foot gait.
 * No equipment pose or bone length is replaced by a capture subject's size. */
export function applyCapturedArmSwing(metrics,time,runAmount,movementAmount,pose){
 const r=clamp(runAmount),amount=clamp(movementAmount);if(amount<.001)return pose;
 const blend=(.45-.15*r)*amount;
 for(let side=0;side<2;side++){
  const sign=side?1:-1,arm=metrics.arms[side],upper=unit(mix(sample(capturedGaits.walk,time*6.6/(2*Math.PI),'upper',side),sample(capturedGaits.run,time/.68,'upper',side),r)),lower=unit(mix(sample(capturedGaits.walk,time*6.6/(2*Math.PI),'lower',side),sample(capturedGaits.run,time/.68,'lower',side),r));
  // Keep the captured elbow outside the torso when body proportions differ.
  upper[0]=sign*Math.max(.09,Math.abs(upper[0]));const u=unit(upper),root=pose.shoulder.map((v,i)=>v+arm.shoulderOffset[i]),elbow=root.map((v,i)=>v+u[i]*arm.upper),hand=elbow.map((v,i)=>v+lower[i]*(arm.lower+arm.palmLength-.02));
  hand[0]=sign*Math.max(.19,sign*hand[0]);
  pose.hands[side]=mix(pose.hands[side],hand,blend);pose.elbowHints[side]=unit(mix(unit(pose.elbowHints[side]),u,blend));
 }
 pose.motionSource={kind:'hybrid-cmu',walk:'07_01',run:'09_01',captured:'arm swing',contacts:'authored foot gait and IK'};return pose;
}
