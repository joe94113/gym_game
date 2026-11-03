// Offline only: verify the rendered load pouch lies outside the actual GLB's
// outer pelvis/thigh skin. Permitted soft contact is not a skin exemption.
// Production uses the fixed, calibrated local saddle and never calls this.
import * as THREE from 'three';
export function evaluateAerialPouchOuterSkin({pose,cloth,samples,tolerance=.0005}){
 const inverse=pose.bodyQuaternion?new THREE.Quaternion(...pose.bodyQuaternion).invert():new THREE.Quaternion(),hip=new THREE.Vector3(...pose.hip),point=new THREE.Vector3(),triangles=[];
 const points=[];for(let i=0;i<cloth.positions.length;i+=3)points.push(new THREE.Vector3(...cloth.positions.slice(i,i+3)).sub(hip).applyQuaternion(inverse));
 for(let t=0;t<cloth.indices.length;t+=3){const ids=cloth.indices.slice(t,t+3);if(!ids.every(index=>cloth.loadPouchNodes?.[index]))continue;const [a,b,c]=ids.map(index=>points[index]),d=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(d)<1e-10)continue;triangles.push({id:t/3,a,b,c,d,minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)});}
 let maxDepth=0,checkedVertices=0,minimumClearance=Infinity;const hits=[];
 for(const sample of samples){if(!['pelvis','leftThigh','rightThigh'].includes(sample.part)&&!['pelvis','leftThigh','rightThigh'].includes(sample.regionPart))continue;point.fromArray(sample.position).sub(hip).applyQuaternion(inverse);for(const triangle of triangles){const {a,b,c,d}=triangle;if(point.x<triangle.minX||point.x>triangle.maxX||point.z<triangle.minZ||point.z>triangle.maxZ)continue;const u=((b.z-c.z)*(point.x-c.x)+(c.x-b.x)*(point.z-c.z))/d,v=((c.z-a.z)*(point.x-c.x)+(a.x-c.x)*(point.z-c.z))/d,w=1-u-v;if(Math.min(u,v,w)<-1e-7)continue;checkedVertices++;const y=u*a.y+v*b.y+w*c.y,depth=y-point.y;minimumClearance=Math.min(minimumClearance,-depth);maxDepth=Math.max(maxDepth,depth);if(depth>tolerance&&!hits.some(hit=>hit.bodyPart===sample.part))hits.push({bodyPart:sample.part,triangle:triangle.id,depth,mesh:sample.mesh,vertex:sample.vertex,skinLocal:point.toArray(),clothLocalY:y});}}
 return {maxDepth,minimumClearance,checkedVertices,hits};
}
