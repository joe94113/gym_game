import * as THREE from 'three';

/** The same fixed-length palm/wrist solve as the real-human controller, without
 * touching an actor. Articulated handles can then swivel to the hand's natural
 * grasp instead of forcing a wrist bend or leaving fingers across the handle. */
export function solveHandContactFrame(metrics,pose,index){
  const arm=metrics.arms[index],sign=index?1:-1,up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1),read=value=>new THREE.Vector3(...value);
  const hip=read(pose.hip),shoulder=read(pose.shoulder),restAxis=read(metrics.neutral.shoulder).sub(read(metrics.neutral.hip)).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(restAxis,shoulder.clone().sub(hip).normalize());
  const root=read(metrics.neutral.shoulder).sub(read(metrics.neutral.hip)).add(read(arm.shoulderOffset)).applyQuaternion(rotation).add(hip),target=read(pose.hands[index]);
  const gripping=pose.handGripping?.[index]??pose.gripping??true,ahead=target.clone().sub(root).dot(forward.clone().applyQuaternion(rotation))>.12;
  const defaultHint=gripping?[sign*.55,-.8,.15]:ahead?[sign*.4,-.6,.8]:[sign*.08,-.2,-1];
  const hint=pose.elbows?.[index]?read(pose.elbows[index]).sub(root):pose.elbowHints?.[index]?read(pose.elbowHints[index]):read(defaultHint).applyQuaternion(rotation);
  const preferred=read(pose.handDirections?.[index]||[sign,0,0]).normalize(),palmOffset=read(arm.palmOffset),inverseHandFrame=new THREE.Quaternion(...arm.handFrameLocal).invert();
  function solve(wrist){const delta=wrist.clone().sub(root),requested=delta.length(),distance=THREE.MathUtils.clamp(requested,Math.abs(arm.upper-arm.lower)+.00001,arm.upper+arm.lower-.00001),axis=requested>.000001?delta.multiplyScalar(1/requested):new THREE.Vector3(0,-1,0);let bend=hint.clone().addScaledVector(axis,-hint.dot(axis));if(bend.lengthSq()<.000001)bend=forward.clone().addScaledVector(axis,-axis.z);if(bend.lengthSq()<.000001)bend=up.clone().addScaledVector(axis,-axis.y);bend.normalize();const along=(arm.upper**2-arm.lower**2+distance**2)/(2*distance),height=Math.sqrt(Math.max(0,arm.upper**2-along**2));return{elbow:root.clone().addScaledVector(axis,along).addScaledVector(bend,height),wrist:root.clone().addScaledVector(axis,distance)};}
  let elbow=root.clone().add(new THREE.Vector3(0,-arm.upper,0).applyQuaternion(rotation)),handQ=new THREE.Quaternion(),basis=new THREE.Quaternion(),wrist=target.clone();
  for(let iteration=0;iteration<16;iteration++){
    const advance=pose.handAdvances?.[index]?read(pose.handAdvances[index]).normalize():target.clone().sub(elbow).normalize(),normal=pose.handNormals?.[index]?read(pose.handNormals[index]).multiplyScalar(sign):null;
    const across=normal?new THREE.Vector3().crossVectors(normal,advance).normalize():preferred.clone();across.addScaledVector(advance,-across.dot(advance));if(across.lengthSq()<.000001)across.set(1,0,0).addScaledVector(advance,-advance.x);if(across.lengthSq()<.000001)across.set(0,1,0).addScaledVector(advance,-advance.y);across.normalize();
    const y=new THREE.Vector3().crossVectors(advance,across).normalize();basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,y,advance));handQ.copy(basis).multiply(inverseHandFrame);
    wrist.copy(target).sub(palmOffset.clone().applyQuaternion(handQ));const next=solve(wrist),stable=next.elbow.distanceToSquared(elbow)<1e-12;elbow=next.elbow;if(stable)break;
  }
  const final=solve(wrist),axis=new THREE.Vector3(1,0,0).applyQuaternion(basis),advance=new THREE.Vector3(0,0,1).applyQuaternion(basis);
  return{axis:axis.toArray(),advance:advance.toArray(),elbow:final.elbow.toArray(),wrist:final.wrist.toArray(),wristBendRadians:Math.acos(THREE.MathUtils.clamp(advance.dot(final.wrist.clone().sub(final.elbow).normalize()),-1,1))};
}
