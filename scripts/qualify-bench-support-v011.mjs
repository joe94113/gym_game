import {createBenchFixtureV011} from './bench-fixture-v011.mjs';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const before=process.argv.includes('--before');if(before&&existsSync('artifacts/v011-bench-support-before.json'))throw Error('The sealed v011 support reference must not be overwritten.');
const {THREE,rig,character,root:sourceRoot}=await createBenchFixtureV011({before}),id='dumbbell-bench-press',angles=before?[0,30]:(process.env.BENCH_ANGLES||Array.from({length:46},(_,i)=>i).join(',')).split(',').map(Number),count=Number(process.env.BENCH_SUPPORT_PHASES||101),results=[];
const files=['src/incline-bench.js','src/equipment-options.js','src/extended-rig.js','src/dumbbell-lifecycle-paths.js','src/dumbbell-grip.js','src/free-dumbbell-shaft.js','src/rig-lifecycle.js','src/skinned-character.js','public/models/athlete/athlete.glb'],hash=p=>createHash('sha256').update(readFileSync(resolve(sourceRoot,p))).digest('hex'),hashes=Object.fromEntries(files.map(p=>[p,hash(p)]));
function frameAtLabel(label){const meta=rig.getLifecycle(id);let elapsed=0;for(const stage of meta.stages){elapsed+=stage.duration;if(stage.label===label)return rig.sampleLifecycle(id,'enter',elapsed/meta.entryDuration);}throw Error(label);}
function seatSkin(){
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
for(const angle of angles){
 rig.end({keepVisible:false});rig.setEquipmentSettings(id,{benchAngle:angle});rig.prepare(id);const r={angle,loopPhases:count,minBackGap:Infinity,maxBackGap:-Infinity,minPelvisBackGap:Infinity,maxPelvisBackGap:-Infinity,backVertices:0};
 for(let i=0;i<count;i++){
  character.pose(rig.sample(id,i/(count-1),i/(count-1)));const volume=rig.getCollisionVolumes(id).find(v=>v.id==='bench-pad'),inverse=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0]))).invert();let back=Infinity,pelvis=Infinity;
  for(const sample of character.getSurfaceSamples({stride:1,parts:['torso','head','pelvis']})){
   const p=new THREE.Vector3(...sample.position).sub(new THREE.Vector3(...volume.position)).applyQuaternion(inverse);
   if(Math.abs(p.x)<volume.size[0]/2-.065&&Math.abs(p.z)<volume.size[2]/2-.065){const gap=p.y-volume.size[1]/2;r.backVertices++;if(sample.part==='pelvis')pelvis=Math.min(pelvis,gap);else back=Math.min(back,gap);}
  }
  r.minBackGap=Math.min(r.minBackGap,back);r.maxBackGap=Math.max(r.maxBackGap,back);r.minPelvisBackGap=Math.min(r.minPelvisBackGap,pelvis);r.maxPelvisBackGap=Math.max(r.maxPelvisBackGap,pelvis);
 }
 const frame=frameAtLabel('啞鈴先穩放大腿上');character.pose(frame.pose);r.seatedSupport=seatSkin();r.seatedWithin6mm=r.seatedSupport.tests>0&&r.seatedSupport.closestGap!==null&&Math.abs(r.seatedSupport.closestGap)<.006;r.pass=r.minBackGap>=-.001&&r.maxBackGap<.006&&r.minPelvisBackGap>=-.001&&r.maxPelvisBackGap<.02&&(before||r.seatedWithin6mm);
 results.push(r);console.log(JSON.stringify(r));
}
const changedSources=files.filter(p=>hash(p)!==hashes[p]),pass=results.every(r=>r.pass)&&!changedSources.length,report={pass,referenceOnly:before,count,angles,hashes,changedSources,scope:'True production torso/head/pelvis skin against the flat central support face at every angle and loop phase. Seated support uses ray intersections with actual rounded pad triangles for nearest/deepest candidate pelvis/thigh points. Before is a measurement reference and deliberately records the original unsupported flat sitting gap; final current support requires a real rounded-pad contact within 6mm. Finite pose/vertex sampling; no pressure, joint loading or trainer approval.',results};
writeFileSync(`artifacts/v011-bench-support-${before?'before':process.env.DB_REPORT_LABEL||'all'}.json`,JSON.stringify(report,null,2));character.dispose();if(!pass)process.exitCode=1;
