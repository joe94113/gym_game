import {MeshoptSimplifier} from 'three/addons/libs/meshopt_simplifier.module.js';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createNpcLodFixture} from './npc-lod-fixture-v010.mjs';
import {createEquipmentFixture} from './equipment-batching-fixture.mjs';
import {attributeFingerprint} from '../src/npc-geometry-lod-v010.js';
import {buildLocomotionPose} from '../src/locomotion.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const triangleKey=t=>[t.join(','),[t[1],t[2],t[0]].join(','),[t[2],t[0],t[1]].join(',')].sort()[0];
export function protectedTriangleOffsets(actor){
  const parts=new Map();for(const sample of actor.getSurfaceSamples({stride:1})){if(!parts.has(sample.mesh))parts.set(sample.mesh,new Map());parts.get(sample.mesh).set(sample.vertex,sample.regionPart);}
  const result=new Map();actor.group.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const geometry=mesh.geometry,indices=geometry.index.array,n=geometry.attributes.position.count,labels=[];
    for(let i=0;i<n;i++)labels.push(['formMuscleA','formMuscleB','formMuscleC','formMuscleD'].flatMap(name=>Array.from({length:4},(_,j)=>geometry.attributes[name].getComponent(i,j))).join(',')+':'+Math.sign(geometry.attributes.formMuscleSide.getX(i)));
    const offsets=new Set();
    for(let i=0;i<indices.length;i+=3){const tri=[indices[i],indices[i+1],indices[i+2]];
      if(tri.some(v=>['head','hands','feet'].includes(parts.get(mesh.name).get(v)))||tri.some(v=>labels[v]!==labels[tri[0]]))offsets.add(i);
    }
    result.set(mesh.name,offsets);
  });return result;
}

export async function generateNpcLod(){
  const fixture=await createNpcLodFixture(),variants=[{}, {bodyProfile:'feminine'}, {age:65}, {bodyProfile:'feminine',age:65}];
  const actors=variants.map(appearance=>fixture.instantiate({appearance})),actor=actors[0],meshes=[];actor.group.traverse(mesh=>{if(mesh.isSkinnedMesh)meshes.push(mesh);});
  const protections=actors.map(protectedTriangleOffsets),equipment=await createEquipmentFixture(),metrics=actor.getAssetInfo().metrics;
  const poses=[buildLocomotionPose(metrics,0,0),buildLocomotionPose(metrics,1.03,1.15)];
  for(const id of ['squat-rack','chest-press','lat-pulldown','bike']){const machine=equipment.machines.get(id);poses.push(machine.sampleActivity(.48,.48));}
  const samples=meshes.map(mesh=>new Float32Array(mesh.geometry.attributes.position.count*poses.length*3));
  poses.forEach((pose,poseIndex)=>{
    actor.pose(pose);actor.group.updateMatrixWorld(true);for(const skeleton of new Set(meshes.map(mesh=>mesh.skeleton)))skeleton.update();
    const point=new fixture.THREE.Vector3();meshes.forEach((mesh,m)=>{for(let v=0;v<mesh.geometry.attributes.position.count;v++){mesh.getVertexPosition(v,point);samples[m].set(point.toArray(),(v*poses.length+poseIndex)*3);}});
  });
  await MeshoptSimplifier.ready;
  const chunks=[],entries=[],proof=[];let offset=0;
  meshes.forEach((mesh,m)=>{
    const geometry=mesh.geometry,n=geometry.attributes.position.count,indices=geometry.index.array,protectedOffsets=new Set(protections.flatMap(map=>[...map.get(mesh.name)])),locks=new Uint8Array(n);
    for(const i of protectedOffsets)for(let c=0;c<3;c++)locks[indices[i+c]]=1;
    const stride=5+poses.length*3,attributes=new Float32Array(n*stride);
    for(let v=0;v<n;v++)attributes.set([geometry.attributes.normal.getX(v),geometry.attributes.normal.getY(v),geometry.attributes.normal.getZ(v),geometry.attributes.uv.getX(v),geometry.attributes.uv.getY(v),...samples[m].subarray(v*poses.length*3,(v+1)*poses.length*3)],v*stride);
    const weights=[.25,.25,.25,.5,.5,...Array(poses.length*3).fill(1)];
    const levels=[],runs=[];
    for(const ratio of [.65,.4]){
      const target=Math.max(3,Math.floor(indices.length*ratio/3)*3),[candidate,error]=MeshoptSimplifier.simplifyWithAttributes(indices,geometry.attributes.position.array,3,attributes,stride,weights,locks,target,.005,['LockBorder']);
      const reduced=new Uint16Array(candidate),triangles=new Set();for(let i=0;i<reduced.length;i+=3)triangles.add(triangleKey(Array.from(reduced.subarray(i,i+3))));
      const missing=[...protectedOffsets].filter(i=>!triangles.has(triangleKey(Array.from(indices.subarray(i,i+3))))).length;
      if(missing)throw new Error(`Protected triangles changed: ${mesh.name}: ${missing}`);
      const bytes=Buffer.from(reduced.buffer);levels.push({offset,count:reduced.length});offset+=bytes.length;chunks.push(bytes);runs.push({requestedRatio:ratio,triangles:reduced.length/3,error,protectedTriangles:protectedOffsets.size,missingProtectedTriangles:missing});
    }
    const source=fixture.sourceMeshes.find(source=>source.name===mesh.name).geometry;
    entries.push({name:mesh.name,vertices:n,originalIndices:indices.length,fingerprint:attributeFingerprint(source),levels});proof.push({mesh:mesh.name,triangles:indices.length/3,lockedVertices:locks.reduce((a,b)=>a+b,0),runs});
  });
  const directory=new URL('../public/models/athlete/lod-v010/',import.meta.url);mkdirSync(directory,{recursive:true});const binary=Buffer.concat(chunks);
  const manifest={format:'form-npc-index-lod-v010',binary:'indices.bin',componentType:'uint16',binaryBytes:binary.length,binarySha256:hash(binary),source:'../athlete.glb',sourceSha256:hash(fixture.source),generatedWith:'Three.js bundled meshoptimizer 1.1, MIT',constraints:'Index-only; union of all head/hand/foot and muscle/side-boundary triangles in four appearance variants; LockBorder; normal/UV and six actual skinned pose attribute errors. Full source attributes and weights unchanged.',meshes:entries};
  writeFileSync(new URL('indices.bin',directory),binary);writeFileSync(new URL('manifest.json',directory),JSON.stringify(manifest,null,2));
  const report={scope:'Offline index generation, CPU only. Not a visual or professional motion review.',sourceSha256:manifest.sourceSha256,sourceUnchanged:hash(readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url)))===manifest.sourceSha256,binarySha256:manifest.binarySha256,binaryBytes:binary.length,appearanceVariants:variants,poseConstraints:poses.length,totalFullTriangles:proof.reduce((s,p)=>s+p.triangles,0),totalLodTriangles:[0,1].map(i=>proof.reduce((s,p)=>s+p.runs[i].triangles,0)),proof};
  mkdirSync(new URL('../artifacts/npc-lod-v010/',import.meta.url),{recursive:true});writeFileSync(new URL('../artifacts/npc-lod-v010/generation.json',import.meta.url),JSON.stringify(report,null,2));
  actors.forEach(a=>a.dispose());equipment.character.dispose();return report;
}
if(process.argv[1]&&new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\','/').split('/').at(-1)))console.log(JSON.stringify(await generateNpcLod()));
