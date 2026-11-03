// A captured timing curve may change when a pose appears, not its safe path.
import {createPerformanceFixtureV015} from './performance-fixture-v015.mjs';
import {capturedExerciseEffort} from '../src/captured-exercise-v015.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';

const current=await createPerformanceFixtureV015(),before=await createPerformanceFixtureV015({baseline:true}),{THREE,metrics}=current;
const tolerance=1e-9,sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function graph(prefix=''){
 const found=new Set();function visit(path){if(found.has(path))return;found.add(path);for(const m of readFileSync(prefix+path,'utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){const next=relative(process.cwd(),resolve(dirname(path),m[1])).replaceAll('\\','/');if(existsSync(prefix+next))visit(next);}}
 for(const path of ['src/skinned-character.js','src/extended-rig.js','src/collision-validation.js','src/lifecycle-frame.js'])visit(path);return [...found].sort();
}
const files=[...graph(),'scripts/qualify-retimed-exercise-v015.mjs','scripts/performance-fixture-v015.mjs','public/models/athlete/athlete.glb','public/models/athlete/rig.json','public/motions/cmu-exercise-v015.json','public/motions/cmu-squat-v015.json'];
const sourceHashes=Object.fromEntries(files.map(path=>[path,sha(path)])),baselineSourceHashes=Object.fromEntries(graph('.local-tools/v015-before/').map(path=>[path,sha('.local-tools/v015-before/'+path)]));
const baselineEffortDefinition='const effort=p=>p<=.44?ease(p/.44):1-ease((p-.44)/.56);';
if(!readFileSync('.local-tools/v015-before/src/extended-rig.js','utf8').includes(baselineEffortDefinition))throw Error('Legacy effort definition changed; inverse must be rederived.');
function inverseLegacyEffort(effort,descending=false){
 if(effort<=0)return descending?1:0;if(effort>=1)return .44;
 const target=descending?1-effort:effort;let low=0,high=1;
 for(let i=0;i<60;i++){const mid=(low+high)/2,value=mid*mid*(3-2*mid);if(value<target)low=mid;else high=mid;}
 return descending?.44+.56*((low+high)/2):.44*((low+high)/2);
}
const rows=[],failures=[],bones=actor=>{const list=[];actor.group.traverse(o=>{if(o.isBone)list.push(o);});return list.sort((a,b)=>a.name.localeCompare(b.name));},oldBones=bones(before.character),newBones=bones(current.character);
let poses=0,lifecyclePoses=0,skinVertices=0,handSkinVertices=0,maxNumericError=0;
function compare(a,b,label){
 if(typeof a==='number'&&typeof b==='number'){if(!Number.isFinite(a)||!Number.isFinite(b))throw Error(label+' nonfinite');const error=Math.abs(a-b);maxNumericError=Math.max(maxNumericError,error);if(error>tolerance)throw Error(label+' differs '+error);return;}
 if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)throw Error(label+' array length');for(let i=0;i<a.length;i++)compare(a[i],b[i],label+'['+i+']');return;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){const keys=Object.keys(a).sort(),other=Object.keys(b).sort();if(JSON.stringify(keys)!==JSON.stringify(other))throw Error(label+' fields');for(const key of keys)compare(a[key],b[key],label+'.'+key);return;}
 if(a!==b)throw Error(label+' values differ');
}
function props(rig,id){const root=rig.getVisualRoot(id);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),out=[];root.traverse(object=>{if(object.isMesh){matrix.multiplyMatrices(inverse,object.matrixWorld);out.push({geometry:object.geometry.type,parameters:object.geometry.parameters,matrix:matrix.toArray()});}});return out;}
function cylinders(rig,id){const root=rig.getVisualRoot(id);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),out=[];root.traverse(mesh=>{const p=mesh.geometry?.parameters;if(!mesh.isMesh||mesh.geometry.type!=='CylinderGeometry'||![.016,.036,.108,.115].some(radius=>Math.abs(p.radiusTop-radius)<1e-5))return;const scale=mesh.getWorldScale(new THREE.Vector3());out.push({center:mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).toArray(),axis:new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld).transformDirection(inverse).toArray(),radius:p.radiusTop*Math.max(scale.x,scale.z),halfLength:p.height*scale.y/2});});return out;}
function metalDepth(samples,cylinder){let max=0;for(const sample of samples){const delta=sample.position.map((value,i)=>value-cylinder.center[i]),along=delta.reduce((sum,value,i)=>sum+value*cylinder.axis[i],0),radial=Math.sqrt(Math.max(0,delta.reduce((sum,value)=>sum+value*value,0)-along*along));max=Math.max(max,Math.min(cylinder.radius-radial,cylinder.halfLength-Math.abs(along)));}return max;}
const dist=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]));
function check(id,frame,reference,row,label){
 compare(frame.pose,reference.pose,label+' input pose');compare(frame.offset,reference.offset,label+' offset');compare(frame.rotation,reference.rotation,label+' heading');
 compare(props(current.rig,id),props(before.rig,id),label+' physical gear');
 current.character.pose(frame.pose);before.character.pose(reference.pose);poses++;
 for(let i=0;i<oldBones.length;i++){compare(newBones[i].matrixWorld.toArray(),oldBones[i].matrixWorld.toArray(),label+' bone '+oldBones[i].name);compare(newBones[i].scale.toArray(),oldBones[i].scale.toArray(),label+' bone scale');}
 const actual=current.character.getContactPoints(),old=before.character.getContactPoints();compare(actual,old,label+' body contacts');compare(current.character.getHandDiagnostics(),before.character.getHandDiagnostics(),label+' hand orientation');
 const skin=current.character.getSurfaceSamples({stride:24}),oldSkin=before.character.getSurfaceSamples({stride:24});compare(skin,oldSkin,label+' real skin');skinVertices+=skin.length;
 const body=transformBody(actual,frame),worldSkin=transformSurface(skin,frame),volumes=current.rig.getCollisionVolumes(id),targets=current.rig.getActualContacts(id);
 row.maxReachError=Math.max(row.maxReachError,actual.maxReachError);
 for(const kind of ['hands','feet'])for(let side=0;side<2;side++)if(frame.contacts[kind][side])row.maxContactError=Math.max(row.maxContactError,dist(body[kind][side],targets[kind][side]));
 for(let side=0;side<2;side++)row.maxBoneLengthError=Math.max(row.maxBoneLengthError,Math.abs(dist(actual.shoulders[side],actual.elbows[side])-metrics.arms[side].upper),Math.abs(dist(actual.elbows[side],actual.wrists[side])-metrics.arms[side].lower),Math.abs(dist(actual.hips[side],actual.knees[side])-metrics.legs[side].upper),Math.abs(dist(actual.knees[side],actual.ankles[side])-metrics.legs[side].lower));
 for(const [key,result]of [['collisions',evaluateExerciseClearance(body,volumes)],['self',evaluateSelfClearance(body)],['surface',evaluateSurfaceClearance(worldSkin,volumes)]])for(const hit of result.collisions)if(!row[key].some(old=>old.bodyPart===hit.bodyPart&&old.volumeId===hit.volumeId))row[key].push({label,...hit});
 const hand=current.character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']}),worldHand=transformSurface(hand,frame);handSkinVertices+=hand.length;for(const cylinder of cylinders(current.rig,id))row.maxMetalDepth=Math.max(row.maxMetalDepth,metalDepth(worldHand,cylinder));
 row.poses++;
}
let error=null;
try{
 for(const id of ['dumbbell-shoulder-press','dumbbell-goblet-squat']){
  current.rig.prepare(id);before.rig.prepare(id);
  const row={id,poses:0,loopPoses:0,lifecyclePoses:0,cycles:[],maxReachError:0,maxContactError:0,maxBoneLengthError:0,maxMetalDepth:0,maxEffortDifferenceBetweenCycles:0,collisions:[],self:[],surface:[]};rows.push(row);
  for(let cycle=0;cycle<2;cycle++){
   const raw=[];for(let i=0;i<=100;i++){
    const phase=i/100,effort=capturedExerciseEffort(id,phase,cycle+phase);if(!Number.isFinite(effort))throw Error('Captured curve missing '+id);
    const inversePhase=inverseLegacyEffort(effort),pose=current.rig.sample(id,phase,cycle+phase),reference=before.rig.sample(id,inversePhase,inversePhase);
    check(id,{pose,offset:[0,0,0],rotation:0,contacts:{hands:[true,true],feet:[true,true]}},{pose:reference,offset:[0,0,0],rotation:0},row,`${id}:cycle${cycle}:${i}`);row.loopPoses++;
    // Verify both branches of the actual legacy path at the same effort.
    const descendingPhase=inverseLegacyEffort(effort,true),descendingPose=before.rig.sample(id,descendingPhase,descendingPhase);compare(pose,descendingPose,`${id}:cycle${cycle}:${i}:legacy descending pose`);compare(props(current.rig,id),props(before.rig,id),`${id}:cycle${cycle}:${i}:legacy descending gear`);
    raw.push({phase,effort,inversePhase,descendingPhase});row.maxEffortDifferenceBetweenCycles=Math.max(row.maxEffortDifferenceBetweenCycles,Math.abs(capturedExerciseEffort(id,phase,phase)-capturedExerciseEffort(id,phase,1+phase)));
   }row.cycles.push({cycle,raw});
  }
  for(const direction of ['enter','exit'])for(let i=0;i<=100;i++){
   const phase=i/100,frame=current.rig.sampleLifecycle(id,direction,phase),reference=before.rig.sampleLifecycle(id,direction,phase);
   check(id,frame,reference,row,`${id}:${direction}:${i}`);row.lifecyclePoses++;lifecyclePoses++;
  }
  row.pass=row.loopPoses===202&&row.lifecyclePoses===202&&row.maxReachError<.015&&row.maxContactError<.015&&row.maxBoneLengthError<1e-5&&row.maxMetalDepth<=.001&&!row.collisions.length&&!row.self.length&&!row.surface.length&&row.maxEffortDifferenceBetweenCycles>1e-5;
  if(!row.pass)failures.push({id,...Object.fromEntries(Object.entries(row).filter(([key])=>key!=='cycles'))});current.rig.end({keepVisible:false});before.rig.end({keepVisible:false});
 }
}catch(e){error=e.stack||e.message;failures.push({error:e.message});}
const changedSources=files.filter(path=>sha(path)!==sourceHashes[path]),changedBaselineSources=Object.keys(baselineSourceHashes).filter(path=>sha('.local-tools/v015-before/'+path)!==baselineSourceHashes[path]);
const report={pass:!error&&!failures.length&&!changedSources.length&&!changedBaselineSources.length,sourceHashes,baselineSourceHashes,changedSources,changedBaselineSources,numericTolerance:tolerance,legacyInverse:{definition:baselineEffortDefinition,method:'60-step bisection of smoothstep x*x*(3-2*x); ascending phase .44*x, descending phase .44+.56*x with target 1-effort',bothLegacyDirectionsCompared:true,initialCosineAssumptionWasWrong:true,preservedInitialDiagnostic:'artifacts/mocap-v015/retimed-path-runs/cosine-inverse-initial/qualification.json'},poses,loopPoses:poses-lifecyclePoses,lifecyclePoses,bonesPerPose:oldBones.length,skinStride:24,skinVertices,handSkinStride:1,handSkinVertices,maxNumericError,results:rows,failures,error,scope:'Two captured timing adaptations, two cycles each at 101 phases, matched to both branches of the actual frozen v0.14 smoothstep path using its numerical inverse. Input pose, physical mesh transforms, 53 bone matrices/scales, contact points, wrist orientation and sampled true skin preserve the old path within 1e-9. Also validates full unchanged 101-phase entry/exit paths, actual current collisions/contact/bone lengths, whole-body stride24 skin and stride1 hand skin against rendered dumbbell metal. This is finite geometry qualification, not new full-body mocap or human trainer approval.'};
mkdirSync('artifacts/mocap-v015',{recursive:true});writeFileSync('artifacts/mocap-v015/retimed-path-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,poses,loopPoses:report.loopPoses,lifecyclePoses,skinVertices,handSkinVertices,maxNumericError,results:rows.map(row=>({...row,cycles:undefined})),error:error?.split('\n')[0]}));before.character.dispose();current.character.dispose();if(!report.pass)process.exitCode=1;
