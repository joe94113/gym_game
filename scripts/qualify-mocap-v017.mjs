import {createMocapFixtureV017} from './mocap-fixture-v017.mjs';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashMobileSources,changedHashes} from './mobile-performance-common-v016.mjs';

const start=new Date().toISOString(),hashes=hashMobileSources(),current=await createMocapFixtureV017(),before=await createMocapFixtureV017({baseline:true});
const rows=[],failures=[],distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),ids=['dumbbell-shoulder-press','dumbbell-goblet-squat'];
function cylinders(id){const {THREE}=current,root=current.rig.getVisualRoot(id);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),out=[];root.traverse(mesh=>{const p=mesh.geometry?.parameters;if(!mesh.isMesh||mesh.geometry.type!=='CylinderGeometry'||![.016,.036,.108,.115].some(radius=>Math.abs(p.radiusTop-radius)<1e-5))return;for(let node=mesh;node&&node!==root;node=node.parent)if(!node.visible)return;const scale=mesh.getWorldScale(new THREE.Vector3());out.push({center:mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).toArray(),axis:new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld).transformDirection(inverse).toArray(),radius:p.radiusTop*Math.max(scale.x,scale.z),halfLength:p.height*scale.y/2});});return out;}
function metalDepth(samples,cylinder){let max=0;for(const sample of samples){const delta=sample.position.map((value,i)=>value-cylinder.center[i]),along=delta.reduce((sum,value,i)=>sum+value*cylinder.axis[i],0),radial=Math.sqrt(Math.max(0,delta.reduce((sum,value)=>sum+value*value,0)-along*along));max=Math.max(max,Math.min(cylinder.radius-radial,cylinder.halfLength-Math.abs(along)));}return max;}
function compare(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function bodyCheck(id,pose,row,label,reference){
  current.character.pose(pose);const body=current.character.getContactPoints(),skin=current.character.getSurfaceSamples({stride:24}),volumes=current.rig.getCollisionVolumes(id),contacts=current.rig.getActualContacts(id);
  row.maxReachError=Math.max(row.maxReachError,body.maxReachError);row.poses++;
  for(const kind of ['hands','feet'])for(let side=0;side<2;side++)row.maxContactError=Math.max(row.maxContactError,distance(body[kind][side],contacts[kind][side]));
  for(let side=0;side<2;side++)row.maxBoneLengthError=Math.max(row.maxBoneLengthError,Math.abs(distance(body.shoulders[side],body.elbows[side])-current.metrics.arms[side].upper),Math.abs(distance(body.elbows[side],body.wrists[side])-current.metrics.arms[side].lower),Math.abs(distance(body.hips[side],body.knees[side])-current.metrics.legs[side].upper),Math.abs(distance(body.knees[side],body.ankles[side])-current.metrics.legs[side].lower));
  const handSkin=current.character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']});row.handSkinVertices+=handSkin.length;
  for(const cylinder of cylinders(id))row.maxMetalDepth=Math.max(row.maxMetalDepth,metalDepth(handSkin,cylinder));
  for(const [key,result]of [['body',evaluateExerciseClearance(body,volumes)],['self',evaluateSelfClearance(body)],['skin',evaluateSurfaceClearance(skin,volumes)]])for(const collision of result.collisions)if(!row.collisions.some(c=>c.kind===key&&c.bodyPart===collision.bodyPart&&c.volumeId===collision.volumeId))row.collisions.push({kind:key,label,...collision});
  if(reference)for(const key of ['hip','shoulder','head'])row.changedPosition[key]=Math.max(row.changedPosition[key]||0,distance(pose[key],reference[key]));
  if(row.raw.length<12)row.raw.push({label,pose,contactError:row.maxContactError,reachError:body.maxReachError});
}
for(const id of ids){
  current.rig.prepare(id);before.rig.prepare(id);
  const row={id,poses:0,loopPoses:0,lifecyclePoses:0,maxReachError:0,maxContactError:0,maxBoneLengthError:0,maxMetalDepth:0,handSkinVertices:0,changedPosition:{},collisions:[],raw:[],lifecycleIdentical:true};rows.push(row);
  for(let cycle=0;cycle<2;cycle++)for(let sample=0;sample<=100;sample++){
    const phase=sample/100,pose=current.rig.sample(id,phase,cycle+phase),reference=before.rig.sample(id,phase,cycle+phase);
    bodyCheck(id,pose,row,`${cycle}:${phase}`,reference);row.loopPoses++;
    if((phase===0||phase===1)&&!compare(pose,reference))failures.push({id,reason:'rest seam differs',cycle,phase});
  }
  // The new layer must leave the complete authored pickup/return path intact.
  for(const direction of ['enter','exit'])for(let sample=0;sample<=100;sample++){
    const phase=sample/100,a=current.rig.sampleLifecycle(id,direction,phase),b=before.rig.sampleLifecycle(id,direction,phase);row.lifecyclePoses++;
    if(!compare(a,b)){row.lifecycleIdentical=false;failures.push({id,direction,phase,reason:'lifecycle changed'});break;}
  }
  row.pass=row.maxReachError<.015&&row.maxContactError<.015&&row.maxBoneLengthError<1e-5&&row.maxMetalDepth<=.001&&!row.collisions.length&&row.lifecycleIdentical&&row.changedPosition.shoulder>.001;
  if(!row.pass)failures.push({id,reason:'qualification limits',maxReachError:row.maxReachError,maxContactError:row.maxContactError,maxBoneLengthError:row.maxBoneLengthError,collisions:row.collisions,changedPosition:row.changedPosition,lifecycleIdentical:row.lifecycleIdentical});
  current.rig.end({keepVisible:false});before.rig.end({keepVisible:false});
}
const changedSources=changedHashes(hashes,hashMobileSources()),report={pass:!failures.length&&!changedSources.length,startedAt:start,completedAt:new Date().toISOString(),sourceHashes:hashes,changedSources,rows,failures,modelSHA256:createHash('sha256').update(readFileSync('public/models/athlete/athlete.glb')).digest('hex'),scope:'Actual existing GLB and IK/skin controller; 202 loop samples and 202 lifecycle input comparisons per exercise. Source-driven constrained adaptation, not faithful all-bone playback or professional trainer approval. Skin sampling stride24 cannot certify all continuous motion/skin.'};
mkdirSync('artifacts/mocap-v017',{recursive:true});const name=process.argv.find(x=>x.startsWith('--name='))?.slice(7)||'qualification';writeFileSync(`artifacts/mocap-v017/${name}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,rows:rows.map(({raw,...r})=>r),failures:failures.slice(0,10),changedSources}));if(!report.pass)process.exitCode=1;
