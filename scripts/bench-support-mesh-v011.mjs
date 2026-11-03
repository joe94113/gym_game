export function measureSeatSkinV011({THREE,rig,character,id}){
 const root=rig.getVisualRoot(id);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),volumes=rig.getCollisionVolumes(id).filter(v=>v.id==='bench-pad'||v.id==='incline-seat-pad'),meshes=[root.children[0],...(root.children[7]?.geometry?.type==='RoundedBoxGeometry'?[root.children[7]]:[])],skin=character.getSurfaceSamples({stride:1,parts:['pelvis','leftThigh','rightThigh']}),ray=new THREE.Raycaster(),out={tests:0,closestGap:null,deepestGap:Infinity,parts:{}};
 for(let index=0;index<volumes.length;index++){
  const volume=volumes[index],mesh=meshes[index];if(!mesh)throw Error('Missing physical seat pad');
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0]))),normal=new THREE.Vector3(0,1,0).applyQuaternion(rotation),candidates=[];
  for(const sample of skin){const p=new THREE.Vector3(...sample.position).sub(new THREE.Vector3(...volume.position)).applyQuaternion(rotation.clone().invert());if(Math.abs(p.x)<volume.size[0]/2&&Math.abs(p.z)<volume.size[2]/2&&Math.abs(p.y-volume.size[1]/2)<.08)candidates.push({...sample,planeGap:p.y-volume.size[1]/2});}
  candidates.sort((a,b)=>a.planeGap-b.planeGap);
  // Test the closest-to-pad candidates from each body part, including all
  // potentially penetrating points. Ray intersections use actual rounded
  // triangles; a point near a rounded edge is not treated as a flat plane.
  const selected=candidates.filter((s,i)=>s.planeGap<0||i<250);
  for(const sample of selected){const local=new THREE.Vector3(...sample.position),origin=local.clone().addScaledVector(normal,.2).applyMatrix4(root.matrixWorld),direction=normal.clone().negate().transformDirection(root.matrixWorld);ray.set(origin,direction);ray.near=0;ray.far=.4;
   const hit=ray.intersectObject(mesh,false).find(h=>h.face.normal.clone().transformDirection(mesh.matrixWorld).dot(normal.clone().transformDirection(root.matrixWorld))>.6);if(!hit)continue;
   const gap=local.clone().sub(hit.point.clone().applyMatrix4(inverse)).dot(normal);out.tests++;out.deepestGap=Math.min(out.deepestGap,gap);if(out.closestGap===null||Math.abs(gap)<Math.abs(out.closestGap))out.closestGap=gap;out.parts[sample.part]=Math.min(out.parts[sample.part]??Infinity,gap);
  }
 }
 return out;
}
