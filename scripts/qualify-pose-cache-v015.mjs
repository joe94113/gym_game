// Exact same-pose before/after comparison. Exercises are not reauthored here.
import {createPerformanceFixtureV015} from './performance-fixture-v015.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const current=await createPerformanceFixtureV015(),before=await createPerformanceFixtureV015({baseline:true}),{THREE,metrics,rig,machines,createMachineLifecycle}=current;
const load=name=>import(pathToFileURL(resolve('src',name)));
const [{catalogActivities},{buildMovementPose},{createFloorProgram},{createWarmupProgram},{createEquipmentProgram},{courseTimelineAt},{groupClassDefinitions},{equipmentOptionsFor},{CABLE_CALIBRATION_IDS},{sampleInBodyPose}]=await Promise.all(['activity-catalog.js','locomotion.js','classes/floor-programs.js','classes/warmup-program.js','classes/equipment-programs.js','classes/class-timeline.js','classes/class-data.js','equipment-options.js','equipment-calibration-v013.js','facility-poses.js'].map(load));
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const entries=['src/skinned-character.js','src/extended-rig.js','src/equipment.js','src/additional-equipment.js','src/machine-lifecycle.js','src/data.js','src/activity-catalog.js','src/locomotion.js','src/classes/floor-programs.js','src/classes/warmup-program.js','src/classes/equipment-programs.js','src/classes/class-timeline.js','src/classes/class-data.js','src/equipment-options.js','src/equipment-calibration-v013.js','src/facility-poses.js'];
function dependencyGraph(prefix=''){
 const found=new Set();function visit(path){if(found.has(path))return;found.add(path);const text=readFileSync(prefix+path,'utf8');for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){const next=relative(process.cwd(),resolve(dirname(path),match[1])).replaceAll('\\','/');if(existsSync(prefix+next))visit(next);}}
 for(const path of entries)visit(path);return [...found].sort();
}
const paths=[...dependencyGraph(),'scripts/qualify-pose-cache-v015.mjs','scripts/performance-fixture-v015.mjs','public/models/athlete/athlete.glb','public/models/athlete/rig.json'],sourceHashes=Object.fromEntries(paths.map(path=>[path,sha(path)]));
const baselineSourceHashes=Object.fromEntries(dependencyGraph('.local-tools/v015-before/').map(path=>[path,sha('.local-tools/v015-before/'+path)]));
const bones=actor=>{const result=[];actor.group.traverse(object=>{if(object.isBone)result.push(object);});return result.sort((a,b)=>a.name.localeCompare(b.name));},oldBones=bones(before.character),newBones=bones(current.character);
let count=0,skinPoses=0,skinVertices=0;const results=[],failures=[],timingPoses=[];
function compare(pose,label,{skin=false,stride=19,rootCase=0}={}){
 for(const actor of [before.character,current.character]){
  actor.group.position.set(...[[0,0,0],[2.71,.03,-4.19],[-8.2,1.2,14.1]][rootCase]);actor.group.rotation.set(0,[0,.79,-1.47][rootCase],0);actor.group.scale.setScalar([1,1.03,.97][rootCase]);
 }
 before.character.pose(pose);current.character.pose(pose);count++;
 try{
  for(let i=0;i<oldBones.length;i++){
   assert.deepEqual(newBones[i].matrixWorld.elements,oldBones[i].matrixWorld.elements,label+' world matrix '+oldBones[i].name);
   assert.deepEqual(newBones[i].position.toArray(),oldBones[i].position.toArray(),label+' local position');
   assert.deepEqual(newBones[i].quaternion.toArray(),oldBones[i].quaternion.toArray(),label+' local quaternion');
  }
  assert.deepEqual(current.character.getContactPoints(),before.character.getContactPoints(),label+' contacts');
  assert.deepEqual(current.character.getHandDiagnostics(),before.character.getHandDiagnostics(),label+' wrist orientation');
  if(skin){const a=current.character.getSurfaceSamples({stride}),b=before.character.getSurfaceSamples({stride});assert.deepEqual(a,b,label+' actual GLB skin');skinPoses++;skinVertices+=a.length;}
 }catch(error){failures.push({label,error:error.message});throw error;}
 if(timingPoses.length<600&&count%3===0)timingPoses.push(structuredClone(pose));
}
function phaseCase(label,sample,{samples=21,skin=true}={}){
 const first=count;for(let i=0;i<samples;i++){const t=i/(samples-1);compare(sample(t),`${label}:${i}`,{rootCase:i%3,skin:skin&&[0,Math.floor(samples/2),samples-1].includes(i)});}results.push({label,poses:count-first});
}
let error=null;
try{
 for(const activity of catalogActivities.filter(item=>['rig','machine'].includes(item.runtime))){
  if(activity.runtime==='rig'){
   rig.prepare(activity.id);phaseCase(activity.id+':loop',p=>rig.sample(activity.id,p,p));
   for(const direction of ['enter','exit'])phaseCase(activity.id+':'+direction,p=>rig.sampleLifecycle(activity.id,direction,p).pose,{samples:11});rig.end({keepVisible:false});
  }else{
   const machine=machines.get(activity.stationId);if(!machine)throw Error('No fixture machine '+activity.stationId);
   phaseCase(activity.id+':loop',p=>machine.sampleActivity(p,p));
   const lifecycle=createMachineLifecycle({THREE,machine,metrics});for(const direction of ['enter','exit'])phaseCase(activity.id+':'+direction,p=>lifecycle.sample(direction,p).pose,{samples:11});
  }
 }
 for(const [id,machine]of machines){
  const defaults=machine.getEquipmentSettings?.(),rules=machine.getEquipmentOptions?.().adjustments||[];if(!rules.length)continue;
  const configurations=[];for(const rule of rules)for(const value of [rule.min,rule.max])configurations.push({...defaults,[rule.key]:value});
  for(const [index,settings]of configurations.entries()){
   assert.equal(machine.setEquipmentSettings(settings).ok,true);machine.setLifecycleState?.({open:0});
   phaseCase(`setting:${id}:${index}:loop`,p=>machine.sampleActivity(p,p),{samples:5});
   const lifecycle=createMachineLifecycle({THREE,machine,metrics});for(const direction of ['enter','exit'])phaseCase(`setting:${id}:${index}:${direction}`,p=>lifecycle.sample(direction,p).pose,{samples:5,skin:false});
  }machine.setEquipmentSettings(defaults);
 }
 for(const id of CABLE_CALIBRATION_IDS){
  const defaults=rig.getEquipmentSettings(id),rules=equipmentOptionsFor(id).adjustments;
  for(const rule of rules)for(const value of [rule.min,rule.max]){rig.end({keepVisible:false});assert.equal(rig.setEquipmentSettings(id,{...defaults,[rule.key]:value}).ok,true);rig.prepare(id);phaseCase(`cable-setting:${id}:${rule.key}:${value}`,p=>rig.sample(id,p,p),{samples:5});for(const direction of ['enter','exit'])phaseCase(`cable-setting:${id}:${rule.key}:${value}:${direction}`,p=>rig.sampleLifecycle(id,direction,p).pose,{samples:5,skin:false});}rig.end({keepVisible:false});rig.setEquipmentSettings(id,defaults);
 }
 for(const angle of [0,1,15,30,44,45]){rig.end({keepVisible:false});rig.setEquipmentSettings('dumbbell-bench-press',{benchAngle:angle});rig.prepare('dumbbell-bench-press');for(const direction of ['enter','exit'])phaseCase(`bench:${angle}:${direction}`,p=>rig.sampleLifecycle('dumbbell-bench-press',direction,p).pose,{samples:11});}
 for(const run of [0,.25,.5,.75,1])for(const amount of [0,.25,.5,.75,1])phaseCase(`locomotion:${run}:${amount}`,t=>buildMovementPose(metrics,t*2,run,amount),{samples:25});
 phaseCase('inbody',p=>sampleInBodyPose(metrics,p));
 for(const kind of ['warmup','dance','barbell','pilates','cycle','trx','aerial']){
  const group=new THREE.Group();before.scene.add(group);const program=kind==='warmup'?createWarmupProgram({metrics}):['dance','barbell','pilates'].includes(kind)?createFloorProgram({THREE,kind,metrics,group}):createEquipmentProgram({kind,metrics,group});
  for(const motionId of program.getCourseMotionIds())phaseCase(`class:${kind}:${motionId}`,t=>program.sampleCourse({motionId,repPhase:t,progress:t,intensity:1,envelope:1,phase:t,localSeconds:t*120,block:{seconds:120}}),{samples:11});
  if(program.sampleLifecycle)for(const direction of ['enter','exit'])phaseCase(`class:${kind}:${direction}`,p=>program.sampleLifecycle(direction,p).pose,{samples:11});
  const definition=groupClassDefinitions.find(item=>item.classKind===kind);phaseCase(`class:${kind}:timeline`,p=>program.sampleCourse(courseTimelineAt(kind,p*definition.duration)),{samples:21});
 }
 // Full stride-1 skin at eight representative exercise poses, not a proxy.
 for(const [id,p]of [['dumbbell-curl',.37],['dumbbell-bench-press',.12],['dumbbell-single-arm-row',.51],['dumbbell-shoulder-press',.72],['dumbbell-lateral-raise',.4],['dumbbell-goblet-squat',.5],['dumbbell-romanian-deadlift',.68],['rope-pushdown',.5]]){rig.end({keepVisible:false});rig.prepare(id);compare(rig.sample(id,p,p),'full-skin:'+id,{skin:true,stride:1});}
}catch(e){error=e.stack||e.message;}
// Alternate actual controller calls on already-created poses. Pure CPU only.
const timing=[];
if(!error){for(const actor of [before.character,current.character])for(const pose of timingPoses.slice(0,150))actor.pose(pose);
 for(const which of ['before','after','after','before']){const actor=which==='before'?before.character:current.character;const started=performance.now();for(const pose of timingPoses)actor.pose(pose);const ms=performance.now()-started;timing.push({which,poses:timingPoses.length,totalMs:ms,meanPoseMs:ms/timingPoses.length});}}
const changedSources=paths.filter(path=>sha(path)!==sourceHashes[path]),report={pass:!error&&!failures.length&&!changedSources.length,sourceHashes,baselineSourceHashes,changedSources,bonesPerPose:oldBones.length,poses:count,skinPoses,skinVertices,exact:true,results,failures,error,cpuTiming:timing,cpuTimingScope:'Pure same-pose GLB controller, alternating ABBA calls; not RAF, GPU time, displayed FPS or full-game speedup.',scope:'Identical supplied pose through candidate and frozen v0.14 controller; all listed bone world matrices, local transforms, contact points, wrist diagnostics and sampled actual skin are compared with exact equality. Position/heading/uniform actor scale vary. This does not newly certify authored motion biomechanics.'};
mkdirSync('artifacts/performance-v015/profile',{recursive:true});writeFileSync('artifacts/performance-v015/profile/pose-equivalence.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,poses:count,skinPoses,skinVertices,error:error?.split('\n')[0],timing}));before.character.dispose();current.character.dispose();if(!report.pass)process.exitCode=1;
