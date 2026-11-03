import {THREE,character,metrics,rig} from './dumbbell-test-helpers.mjs';
import {writeFileSync} from 'node:fs';
const base=rig.sample('dumbbell-bench-press',.5,.5),root=rig.getVisualRoot('dumbbell-bench-press'),weight=root.children.filter(object=>object.isGroup&&object.children.some(child=>child.geometry?.parameters?.radiusTop===.016))[0],center=weight.position.clone(),axis=new THREE.Vector3(...base.handDirections[0]).normalize(),meshes=new Map();character.group.traverse(object=>{if(object.isSkinnedMesh)meshes.set(object.name,object);});
const chosen=new Set();character.pose(base);for(const sample of character.getSurfaceSamples({stride:1,parts:['leftHand']})){const mesh=meshes.get(sample.mesh),ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');for(let k=0;k<4;k++)if(weights.array[sample.vertex*4+k]>.001&&/^pinky_/.test(mesh.skeleton.bones[ids.array[sample.vertex*4+k]]?.name))chosen.add(`${sample.mesh}:${sample.vertex}`);}
const closed=base.handFingerFlex[0].pinky,open=[.12,.12,.12],candidates=[];
for(const a of [.25,.5,.75,1,1.5,2,3,4])for(const b of [.25,.5,.75,1,1.5,2,3,4])for(const c of [.10,.25,.5,.75,1,1.5,2,3,4]){
 let worst=0,at=0,pass=true;
 for(let i=0;i<=20;i++){const g=i/20,pose=structuredClone(base);pose.handFingerFlex[0].pinky=closed.map((value,j)=>open[j]+(value-open[j])*g**[a,b,c][j]);character.pose(pose);
  for(const sample of character.getSurfaceSamples({stride:1,parts:['leftHand']})){if(!chosen.has(`${sample.mesh}:${sample.vertex}`))continue;const point=new THREE.Vector3(...sample.position).sub(center),along=point.dot(axis),radial=point.addScaledVector(axis,-along).length(),depth=Math.min(.016-radial,.19-Math.abs(along));if(depth>worst){worst=depth;at=g;}}
  if(worst>.0009){pass=false;break;}
 }
 if(pass)candidates.push({powers:[a,b,c],maxDepth:worst,at,cost:Math.abs(Math.log(a))+Math.abs(Math.log(b))+Math.abs(Math.log(c))});
}
candidates.sort((a,b)=>a.cost-b.cost);writeFileSync('artifacts/dumbbell-fingers-v013/grasp-candidates.json',JSON.stringify({closed,open,candidates},null,2));console.log(JSON.stringify({count:candidates.length,best:candidates.slice(0,12)}));character.dispose();
