import {applyCapturedArmSwing} from './captured-locomotion-v013.js';
/** Contact-space walking pose for the real athlete. `time` is seconds and
 * `speed` is 0 at rest, 1 for walking, or about 1.6 for a brisk walk. */
export function buildLocomotionPose(metrics,time,speed=1) {
  const neutral=metrics.neutral;
  const intensity=Math.max(0,Math.min(1.8,speed));
  const moving=intensity>.001;
  const amplitude=Math.min(1,intensity);
  const phase=time*(6.6+Math.max(0,intensity-1)*1.8);
  const stride=moving?Math.sin(phase)*amplitude:0;
  const strideLength=moving?.215+.055*Math.min(1,intensity):0;
  const bob=moving?-.013+(-.015+.012*Math.cos(phase*2))*amplitude:-.013;
  const sway=moving?Math.cos(phase)*.009*amplitude:Math.sin(time*1.8)*.0015;
  const lean=moving?.012*amplitude:0;
  const hip=[neutral.hip[0]+sway,neutral.hip[1]+bob,neutral.hip[2]];
  const shoulder=[neutral.shoulder[0]-sway*.55,neutral.shoulder[1]+bob,neutral.shoulder[2]+lean];
  const hands=[],feet=[],handNormals=[],elbowHints=[];
  for(let side=0;side<2;side++){
    const sign=side?1:-1;
    const swing=stride*(side?1:-1);
    // Opposite arm and leg swing together. Bend the elbows slightly instead
    // of trying to swing fully extended arms beyond the true bone lengths.
    hands.push([
      neutral.hands[side][0]+sign*.018+sway,
      neutral.hands[side][1]+bob+.046+Math.abs(swing)*.016,
      neutral.hands[side][2]+lean+swing*.125,
    ]);
    handNormals.push([-sign,0,.035*swing]);
    elbowHints.push([sign*.3,-.4,-1]);
    feet.push([
      sign*.143+sway*.15,
      neutral.feet[side][1]+(moving?Math.max(0,-swing)*.065:0),
      neutral.feet[side][2]-swing*strideLength,
    ]);
  }
  return{
    hip,shoulder,head:[neutral.head[0]-sway*.55,neutral.head[1]+bob,neutral.head[2]+lean],
    hands,feet,handNormals,elbowHints,gripping:false,handGripping:[false,false],relaxedHands:true,
    footDirections:[[-.04,0,1],[.04,0,1]],
  };
}

/** A distinct jogging gait: short planted stance, swing/flight and bent arms. */
export function buildRunningPose(metrics,time){
  const n=metrics.neutral,phase=time/0.68*Math.PI*2,sway=Math.sin(phase)*.006,lean=.13,bob=.022*Math.sin(phase*2)**2;
  const hip=[n.hip[0]+sway,n.hip[1]-.08+bob,n.hip[2]],span=metrics.torsoLength||Math.hypot(...n.shoulder.map((v,i)=>v-n.hip[i])),headSpan=n.head[1]-n.shoulder[1];
  const shoulder=[hip[0],hip[1]+span*Math.cos(lean),hip[2]+span*Math.sin(lean)],head=[shoulder[0],shoulder[1]+headSpan*Math.cos(lean),shoulder[2]+headSpan*Math.sin(lean)];
  const hands=[],elbows=[],feet=[],handNormals=[],footDirections=[];
  for(let i=0;i<2;i++){
    const sign=i?1:-1,a=metrics.arms[i],swing=Math.sin(phase+(i?Math.PI:0)),angle=.55*swing;
    const root=shoulder.map((v,j)=>v+a.shoulderOffset[j]),elbow=[root[0]+sign*.025,root[1]-a.upper*Math.cos(angle),root[2]+a.upper*Math.sin(angle)];
    elbows.push(elbow);hands.push([elbow[0]+sign*.012,elbow[1]+(a.lower+a.palmLength-.02)*Math.sin(angle),elbow[2]+(a.lower+a.palmLength-.02)*Math.cos(angle)]);handNormals.push([-sign,0,0]);
    const u=((time/.68+i*.5)%1+1)%1,air=u>.24,q=air?(u-.24)/.76:0,t=q*q*(3-2*q);
    feet.push([sign*.143,n.feet[i][1]+(air?.18*Math.sin(q*Math.PI):0),n.feet[i][2]+(air?-.34+.68*t:.34-.68*u/.24)]);
    footDirections.push([0,air?.12*Math.sin(q*Math.PI):0,1]);
  }
  return{hip,shoulder,head,hands,elbows,feet,handNormals,footDirections,kneeHints:[[0,0,1],[0,0,1]],gripping:false,handGripping:[false,false],relaxedHands:true};
}

export function buildMovementPose(metrics,time,runAmount=0,movementAmount=1){
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),walk=buildLocomotionPose(metrics,time,1),run=buildRunningPose(metrics,time),idle=buildLocomotionPose(metrics,time,0),r=Math.max(0,Math.min(1,runAmount)),m=Math.max(0,Math.min(1,movementAmount));
  const p={...walk};for(const k of ['hip','shoulder','head'])p[k]=mix(idle[k],mix(walk[k],run[k],r),m);
  for(const k of ['hands','feet','handNormals'])p[k]=walk[k].map((v,i)=>mix(idle[k][i],mix(v,run[k][i],r),m));
  const unit=v=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length);};
  p.elbowHints=walk.elbowHints.map((v,i)=>mix(unit(v),unit(run.elbows[i].map((x,j)=>x-run.shoulder[j]-metrics.arms[i].shoulderOffset[j])),r*m));p.kneeHints=[[0,0,1],[0,0,1]];p.footDirections=run.footDirections.map((v,i)=>mix(walk.footDirections[i],v,r*m));
  return applyCapturedArmSwing(metrics,time,r,m,p);
}
