import * as THREE from 'three';
import {solveHandContactFrame} from './hand-contact-frame.js';

const V=p=>new THREE.Vector3(...p);

/** Rotate a free dumbbell around its fixed grip centre, without moving either
 * the bones or the palm target. A small, bounded solve aligns the hand with
 * the actual forearm; line search prevents an unstable fixed-point flip. */
export function solveFreeDumbbellShaft({metrics,pose,side,center,axis,advance,contactWeight=1,freedom=1,contactOffsets={normal:-.030,advance:-.015}}){
  const authored=axis.clone(),initialAdvance=advance.clone(),candidate=structuredClone(pose);
  candidate.elbows=undefined;candidate.handNormals=undefined;
  candidate.handDirections=structuredClone(pose.handDirections);candidate.handAdvances=structuredClone(pose.handAdvances);
  const evaluate=direction=>{
    const z=direction.clone().normalize();let x=authored.clone().addScaledVector(z,-authored.dot(z));
    if(x.lengthSq()<1e-8)x=axis.clone().addScaledVector(z,-axis.dot(z));
    if(x.lengthSq()<1e-8)x=new THREE.Vector3(0,1,0).addScaledVector(z,-z.y);
    x.normalize();if(x.dot(authored)<0)x.negate();
    const normal=new THREE.Vector3().crossVectors(z,x).multiplyScalar(side?1:-1).normalize();
    candidate.hands[side]=V(center).addScaledVector(normal,contactOffsets.normal*contactWeight).addScaledVector(z,contactOffsets.advance*contactWeight).toArray();
    candidate.handDirections[side]=x.toArray();candidate.handAdvances[side]=z.toArray();
    const solved=solveHandContactFrame(metrics,candidate,side),forearm=V(solved.wrist).sub(V(solved.elbow)).normalize(),residual=forearm.clone().sub(z);
    return{axis:x,advance:z,forearm,residual,error:residual.lengthSq()};
  };
  let best=evaluate(advance);
  for(let iteration=0;iteration<12&&best.error>1e-14;iteration++){
    const t1=best.axis,t2=new THREE.Vector3().crossVectors(best.advance,t1).normalize(),h=.0005;
    const r=[best.residual.dot(t1),best.residual.dot(t2)],jac=[t1,t2].map(t=>{
      const e=evaluate(best.advance.clone().addScaledVector(t,h));return[(e.residual.dot(t1)-r[0])/h,(e.residual.dot(t2)-r[1])/h];
    }),det=jac[0][0]*jac[1][1]-jac[1][0]*jac[0][1];
    let step=Math.abs(det)>1e-8?t1.clone().multiplyScalar((-r[0]*jac[1][1]+r[1]*jac[1][0])/det).addScaledVector(t2,(-jac[0][0]*r[1]+jac[0][1]*r[0])/det):best.residual.clone();
    if(step.length()>.35)step.multiplyScalar(.35/step.length());
    let improved=null;
    for(let backtrack=0;backtrack<8;backtrack++){
      const next=evaluate(best.advance.clone().addScaledVector(step,2**-backtrack));
      if(next.error<best.error){improved=next;break;}
    }
    if(!improved){const next=evaluate(best.advance.clone().lerp(best.forearm,.1));if(next.error>=best.error)break;improved=next;}
    best=improved;
  }
  const outAxis=authored.clone().lerp(best.axis,freedom).normalize(),outAdvance=initialAdvance.lerp(best.advance,freedom);
  outAdvance.addScaledVector(outAxis,-outAdvance.dot(outAxis)).normalize();
  return{axis:outAxis,advance:outAdvance,error:best.error};
}
