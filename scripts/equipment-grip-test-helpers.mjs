import * as THREE from 'three';
const V=p=>new THREE.Vector3(...p);
export function cylinderHandMeasure(samples,cylinder){
  const axis=V(cylinder.axis),center=V(cylinder.center),ref=Math.abs(axis.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0),u=ref.addScaledVector(axis,-ref.dot(axis)).normalize(),v=new THREE.Vector3().crossVectors(axis,u),points=[];let count=0,maxDepth=0,minGap=Infinity;
  for(const sample of samples){const p=V(sample.position).sub(center),along=p.dot(axis);if(Math.abs(along)>cylinder.halfLength)continue;const planar=p.clone().addScaledVector(axis,-along),radial=planar.length(),depth=Math.min(cylinder.radius-radial,cylinder.halfLength-Math.abs(along));points.push([planar.dot(u),planar.dot(v)]);minGap=Math.min(minGap,radial-cylinder.radius);if(depth>.001){count++;maxDepth=Math.max(maxDepth,depth);}}
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lower=[],upper=[];for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of [...sorted].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}const hull=[...lower.slice(0,-1),...upper.slice(0,-1)],wraps=hull.length>=3&&hull.every((p,i)=>cross(p,hull[(i+1)%hull.length],[0,0])>=-1e-8);
  return{count,maxDepth,minGap:Number.isFinite(minGap)?minGap:null,wraps};
}
