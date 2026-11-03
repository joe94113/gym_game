import {buildLocomotionPose} from './locomotion.js';

// Unloaded, planted-foot gestures. These do not claim captured coaching motion
// or change a user's exercise, grip targets or muscle-highlight selection.
export function sampleFloorTrainerPose(metrics,time,gesture='observing'){
 const pose=buildLocomotionPose(metrics,time,0),shoulder=metrics.neutral.shoulder[1],wave=Math.sin(time*.65),breath=Math.sin(time*1.4)*.002;
 pose.headYaw=Math.sin(time*.31)*.16;pose.headPitch=.025;pose.gripping=false;pose.handGripping=[false,false];pose.handGripStrength=[0,0];pose.relaxedHands=true;
 pose.shoulder[1]+=breath;pose.head[1]+=breath;
 if(gesture==='reading'){
  pose.hands=[[-.105,shoulder-.34,.285],[.105,shoulder-.34,.285]];pose.handNormals=[[0,1,0],[0,1,0]];pose.elbowHints=[[-1,-.6,.3],[1,-.6,.3]];pose.headPitch=.18;
 }else if(gesture==='explaining'){
  pose.hands[1]=[.32+.025*wave,shoulder-.25+.025*Math.sin(time*.8),.28+.025*Math.sin(time*.53)];pose.handNormals=[[0,1,0],[0,1,0]];pose.elbowHints=[[-1,-.5,0],[1,-.5,.4]];
 }else if(gesture==='demonstrating'){
  const lift=.5-.5*Math.cos(time*.55);pose.hands=[[-.34-.07*lift,shoulder-.39+.10*lift,.19],[.34+.07*lift,shoulder-.39+.10*lift,.19]];pose.handNormals=[[0,1,0],[0,1,0]];pose.elbowHints=[[-1,-.3,.3],[1,-.3,.3]];
 }
 return pose;
}
