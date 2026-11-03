// Read-only feasibility probe. Produces a new inspection JSON, never GLB or
// runtime assets; candidate indices are discarded after counting/checking.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptSimplifier} from 'three/addons/libs/meshopt_simplifier.module.js';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path='public/models/athlete/athlete.glb',source=readFileSync(path),sourceHash=createHash('sha256').update(source).digest('hex'),jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength));
for(const m of json.materials||[]){m.pbrMetallicRoughness={baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;delete m.extensions;}delete json.images;delete json.textures;delete json.samplers;
let jb=Buffer.from(JSON.stringify(json));if(jb.length%4)jb=Buffer.concat([jb,Buffer.alloc(4-jb.length%4,32)]);const remainder=source.subarray(20+jsonLength),h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(20+jb.length+remainder.length,8);h.writeUInt32LE(jb.length,12);h.writeUInt32LE(0x4e4f534a,16);const b=Buffer.concat([h,jb,remainder]),gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const scene=new THREE.Scene(),actor=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata:JSON.parse(readFileSync('public/models/athlete/rig.json','utf8'))}),parts=new Map();for(const sample of actor.getSurfaceSamples({stride:1})){if(!parts.has(sample.mesh))parts.set(sample.mesh,new Map());parts.get(sample.mesh).set(sample.vertex,sample.regionPart);}
await MeshoptSimplifier.ready;const meshes=[];actor.group.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});const results=[];
for(const mesh of meshes){
 const g=mesh.geometry,n=g.attributes.position.count,indices=g.index.array,positions=g.attributes.position.array,attrs=new Float32Array(n*5),normals=g.attributes.normal,uv=g.attributes.uv,maskNames=['formMuscleA','formMuscleB','formMuscleC','formMuscleD'],labels=[];
 for(let i=0;i<n;i++){attrs.set([normals.getX(i),normals.getY(i),normals.getZ(i),uv.getX(i),uv.getY(i)],i*5);labels.push(maskNames.flatMap(name=>Array.from({length:4},(_,j)=>g.attributes[name].getComponent(i,j))).join(','));}
 const locks=new Uint8Array(n),part=parts.get(mesh.name),protectedTriangles=[];
 for(let i=0;i<indices.length;i+=3){const triangle=[indices[i],indices[i+1],indices[i+2]],contact=triangle.some(v=>['head','hands','feet'].includes(part.get(v))),colorBorder=triangle.some(v=>labels[v]!==labels[triangle[0]]);if(contact||colorBorder)for(const v of triangle)locks[v]=1;if(contact)protectedTriangles.push(triangle);}
 const beforeAttrs=Object.fromEntries(Object.entries(g.attributes).map(([key,a])=>[key,createHash('sha256').update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex')])),runs=[];
 for(const ratio of [.65,.40]){
  const count=Math.max(3,Math.floor(indices.length*ratio/3)*3),[candidate,error]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attrs,5,[.25,.25,.25,.5,.5],locks,count,.005,['LockBorder']);
  const key=t=>{const p=[t.join(','),[t[1],t[2],t[0]].join(','),[t[2],t[0],t[1]].join(',')];return p.sort()[0];},triangles=new Set();for(let i=0;i<candidate.length;i+=3)triangles.add(key([candidate[i],candidate[i+1],candidate[i+2]]));const missingProtected=protectedTriangles.filter(t=>!triangles.has(key(t))).length;
  runs.push({requestedRatio:ratio,triangles:candidate.length/3,actualRatio:candidate.length/indices.length,error,referencedVertices:new Set(candidate).size,missingProtectedTriangles:missingProtected});
 }
 const afterAttrs=Object.fromEntries(Object.entries(g.attributes).map(([key,a])=>[key,createHash('sha256').update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex')]));results.push({mesh:mesh.name,vertices:n,triangles:indices.length/3,lockedVertices:locks.reduce((a,b)=>a+b,0),protectedTriangles:protectedTriangles.length,attributesUnchanged:JSON.stringify(beforeAttrs)===JSON.stringify(afterAttrs),runs});
}
const totals=[0,1].map(index=>({requestedRatio:[.65,.40][index],triangles:results.reduce((sum,r)=>sum+r.runs[index].triangles,0),missingProtectedTriangles:results.reduce((sum,r)=>sum+r.runs[index].missingProtectedTriangles,0)}));
const report={sourceHash,sourceUnchanged:sourceHash===createHash('sha256').update(readFileSync(path)).digest('hex'),scope:'In-memory offline feasibility only, default adult body. Index-only simplification with normals/UV error, locked head/hands/feet triangles and muscle-label borders. No animation/pose-space attributes yet; no default runtime enabled, no model asset changed, no GPU or visual qualification.',tool:{path:'three/addons/libs/meshopt_simplifier.module.js',version:'meshoptimizer1.1 bundled withThree0.186.1',license:'MIT, Arseny Kapoulkine2016-2026'},totals,results};writeFileSync('artifacts/npc-lod-inspection-v09.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));actor.dispose();
