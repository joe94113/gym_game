/** Contact coordinates used by both the InBody props and the human skeleton.
 * This is a game interaction; its result screen does not measure a real body. */
export function sampleInBodyPose(metrics,phase=0){
  const neutral=metrics.neutral,raise=point=>point.map((value,index)=>value+(index===1?.10:0));
  return {hip:raise(neutral.hip),shoulder:raise(neutral.shoulder),head:raise(neutral.head),hands:[[-.33,.98,.18],[.33,.98,.18]],feet:[[-.18,.113,.145],[.18,.113,.145]],handDirections:[[0,0,1],[0,0,1]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],elbowHints:[[-.45,-1,.2],[.45,-1,.2]],gripping:true};
}

export function sampleLegacyGroupClassPose(metrics,phase=0){
  const neutral=metrics.neutral,e=.5-.5*Math.cos(phase*Math.PI*2),angle=-1.21+1.42*e,drop=.025*e;
  const hip=neutral.hip.map((v,i)=>v-(i===1?drop:0)),shoulder=neutral.shoulder.map((v,i)=>v-(i===1?drop:0)),head=neutral.head.map((v,i)=>v-(i===1?drop:0));
  const elbows=[],hands=[];
  for(let index=0;index<2;index++){
    const sign=index?1:-1,arm=metrics.arms[index],root=shoulder.map((v,i)=>v+arm.shoulderOffset[i]);
    const elbow=[root[0]+sign*Math.cos(angle)*arm.upper,root[1]+Math.sin(angle)*arm.upper,root[2]+.025];elbows.push(elbow);
    const reach=arm.lower+arm.palmLength-.012;
    hands.push([elbow[0]+sign*Math.cos(angle+.18)*reach,elbow[1]+Math.sin(angle+.18)*reach,elbow[2]+.03]);
  }
  return{hip,shoulder,head,elbows,hands,feet:neutral.feet.map(p=>[...p]),handDirections:[[0,0,1],[0,0,1]],handNormals:[[0,0,1],[0,0,1]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],gripping:false,relaxedHands:true,spineTwist:Math.sin(phase*Math.PI*2)*.12};
}
export {sampleWarmupPose as sampleGroupClassPose} from './classes/warmup-program.js';
