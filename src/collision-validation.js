import * as THREE from 'three';

const vector = p => new THREE.Vector3(...p);
const average = points => points.reduce((sum,p)=>sum.add(vector(p)),new THREE.Vector3()).multiplyScalar(1/points.length);

export function bodyCollisionProxies(body) {
  if(!body?.shoulders?.length)return [];
  const proxies=[];
  const add=(id,start,end,radius)=>proxies.push({id,start:vector(start),end:vector(end),radius});
  for(let side=0;side<2;side++){
    const name=side?'right':'left';
    add(`${name}UpperArm`,body.shoulders[side],body.elbows[side],.061);
    add(`${name}Forearm`,body.elbows[side],body.wrists[side],.043);
    add(`${name}Hand`,body.wrists[side],body.hands[side],.034);
    add(`${name}Thigh`,body.hips[side],body.knees[side],.082);
    add(`${name}Shin`,body.knees[side],body.ankles[side],.052);
    const ankle=vector(body.ankles[side]),toe=vector(body.feet[side]);
    const shoeEnd=toe.clone().addScaledVector(toe.clone().sub(ankle).normalize(),.035);
    add(`${name}Foot`,ankle.toArray(),shoeEnd.toArray(),.052);
  }
  const hips=average(body.hips),shoulders=average(body.shoulders);
  const torsoStart=hips.clone().lerp(shoulders,.25),torsoEnd=hips.clone().lerp(shoulders,.85);
  add('torso',torsoStart.toArray(),torsoEnd.toArray(),.155);
  add('pelvis',body.hips[0],body.hips[1],.11);
  return proxies;
}

function pointBoxDistance(point,half) {
  const dx=Math.abs(point.x)-half.x,dy=Math.abs(point.y)-half.y,dz=Math.abs(point.z)-half.z;
  const outside=Math.hypot(Math.max(dx,0),Math.max(dy,0),Math.max(dz,0));
  return outside+Math.min(Math.max(dx,dy,dz),0);
}

function capsuleBoxClearance(proxy,volume) {
  const center=vector(volume.position||[0,0,0]);
  const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0]))).invert();
  const start=proxy.start.clone().sub(center).applyQuaternion(quaternion);
  const end=proxy.end.clone().sub(center).applyQuaternion(quaternion);
  const delta=end.clone().sub(start),half=vector(volume.size).multiplyScalar(.5),p=new THREE.Vector3();
  const at=t=>pointBoxDistance(p.copy(start).addScaledVector(delta,t),half);
  // Signed distance along a segment is convex outside the box. Sampling also
  // catches a flat interval through its interior before refining the minimum.
  let best=Infinity,bestT=0;
  for(let i=0;i<=12;i++){const t=i/12,d=at(t);if(d<best){best=d;bestT=t;}}
  let low=Math.max(0,bestT-1/12),high=Math.min(1,bestT+1/12);
  for(let i=0;i<18;i++){const a=(2*low+high)/3,b=(low+2*high)/3;if(at(a)<at(b))high=b;else low=a;}
  return Math.min(best,at((low+high)/2))-proxy.radius;
}

function segmentDistance(p1,q1,p2,q2) {
  const d1=q1.clone().sub(p1),d2=q2.clone().sub(p2),r=p1.clone().sub(p2);
  const a=d1.dot(d1),e=d2.dot(d2),f=d2.dot(r),clamp=THREE.MathUtils.clamp;
  let s=0,t=0;
  if(a<1e-10&&e<1e-10)return p1.distanceTo(p2);
  if(a<1e-10)t=clamp(f/e,0,1);
  else {
    const c=d1.dot(r);
    if(e<1e-10)s=clamp(-c/a,0,1);
    else {
      const b=d1.dot(d2),denom=a*e-b*b;
      if(denom!==0)s=clamp((b*f-c*e)/denom,0,1);
      t=(b*s+f)/e;
      if(t<0){t=0;s=clamp(-c/a,0,1);}else if(t>1){t=1;s=clamp((b-c)/a,0,1);}
    }
  }
  return p1.clone().addScaledVector(d1,s).distanceTo(p2.clone().addScaledVector(d2,t));
}

/** Whole-limb proxy tests complement palm/sole contact tests. They are not a
 * claim that every cloth triangle has been physically simulated. */
export function evaluateExerciseClearance(body,volumes,options={}) {
  const tolerance=options.tolerance??.006;
  const proxies=bodyCollisionProxies(body),collisions=[];
  let testedPairs=0,minClearance=Infinity;
  for(const proxy of proxies)for(const volume of volumes||[]){
    if(volume.allowedBodyParts?.includes(proxy.id))continue;
    let clearance;
    if(volume.shape==='box')clearance=capsuleBoxClearance(proxy,volume);
    else if(volume.shape==='capsule')clearance=segmentDistance(proxy.start,proxy.end,vector(volume.start),vector(volume.end))-proxy.radius-volume.radius;
    else throw new Error(`Unknown collision volume: ${volume.shape}`);
    testedPairs++;minClearance=Math.min(minClearance,clearance);
    if(clearance < -tolerance)collisions.push({bodyPart:proxy.id,volumeId:volume.id,depth:-clearance});
  }
  return {testedPairs,minClearance:Number.isFinite(minClearance)?minClearance:null,collisions,maxPenetration:Math.max(0,...collisions.map(item=>item.depth)),proxyCount:proxies.length,volumeCount:volumes?.length||0};
}

export function evaluateSurfaceClearance(samples,volumes,options={}) {
  const tolerance=options.tolerance??.004,collisions=[];
  let testedPairs=0;
  const prepared=(volumes||[]).map(volume=>({...volume,inverse:new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0]))).invert(),center:vector(volume.position||[0,0,0]),half:volume.size?vector(volume.size).multiplyScalar(.5):null}));
  for(const sample of samples||[])for(const volume of prepared){
    if(volume.allowedBodyParts?.includes(sample.part))continue;
    const point=vector(sample.position);let clearance;
    if(volume.shape==='box')clearance=pointBoxDistance(point.sub(volume.center).applyQuaternion(volume.inverse),volume.half);
    else if(volume.shape==='capsule')clearance=segmentDistance(point,point,vector(volume.start),vector(volume.end))-volume.radius;
    else continue;
    testedPairs++;
    if(clearance < -tolerance)collisions.push({bodyPart:sample.part,mesh:sample.mesh,volumeId:volume.id,depth:-clearance,position:sample.position});
  }
  return {testedPairs,sampleCount:samples?.length||0,collisions,maxPenetration:Math.max(0,...collisions.map(item=>item.depth))};
}

/** Non-adjacent forearms/palms must not pass through the torso. Upper-arm
 * roots are deliberately excluded: they share the shoulder's skin surface. */
export function evaluateSelfClearance(body,options={}) {
  const proxies=bodyCollisionProxies(body),byId=new Map(proxies.map(proxy=>[proxy.id,proxy]));
  const pairs=[['leftForearm','torso'],['rightForearm','torso'],['leftHand','torso'],['rightHand','torso'],['leftForearm','rightForearm']];
  const collisions=[],tolerance=options.tolerance??.006;let testedPairs=0;
  for(const [a,b]of pairs){
    if(options.allowedPairs?.some(pair=>pair.includes(a)&&pair.includes(b)))continue;
    const first=byId.get(a),second=byId.get(b);if(!first||!second)continue;
    const clearance=segmentDistance(first.start,first.end,second.start,second.end)-first.radius-second.radius;
    testedPairs++;if(clearance < -tolerance)collisions.push({bodyPart:a,otherBodyPart:b,depth:-clearance});
  }
  return {testedPairs,collisions,maxPenetration:Math.max(0,...collisions.map(item=>item.depth))};
}
