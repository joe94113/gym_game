import * as THREE from 'three';
import {createBenchFixtureV011} from './bench-fixture-v011.mjs';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// CPU only. The before environment imports the sealed v0.9 modules and model;
// it never imports mutable production modules and never writes to that snapshot.
const label=process.argv[2]||'pilot',count=Number(process.env.CONTINUITY_PHASE_COUNT||1001),selected=process.argv.slice(3).filter(x=>!x.startsWith('--'));
if(!['before','before-endpoints','after'].includes(label)&&!/^pilot(?:-[a-z0-9-]+)?$/.test(label))throw Error('Expected before, before-endpoints, pilot[-name], or after');
if(label==='after'&&!process.argv.includes('--frozen'))throw Error('Final after report requires the parent-announced source freeze and --frozen');
if(label==='before'&&existsSync('artifacts/v011-bench-continuity-before.json'))throw Error('The sealed v011 continuity baseline must not be overwritten.');
const isBefore=label.startsWith('before'),root=resolve(isBefore?'.local-tools/v011-before':'.'),sourcePaths=['src/dumbbell-lifecycle-paths.js','src/dumbbell-grip.js','src/hand-contact-frame.js','src/rig-lifecycle.js','src/extended-rig.js','src/exercise-rig.js','src/incline-bench.js','src/skinned-character.js','src/locomotion.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json'];
if(existsSync(resolve(root,'src/free-dumbbell-shaft.js')))sourcePaths.push('src/free-dumbbell-shaft.js');
const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex'),hashes=Object.fromEntries(sourcePaths.map(p=>[p,hash(p)]));
const {character,metrics,rig}=await createBenchFixtureV011({before:isBefore});
const V=p=>new THREE.Vector3(...p),dist=(a,b)=>V(a).distanceTo(V(b)),degrees=180/Math.PI,angle=(a,b)=>Math.acos(THREE.MathUtils.clamp(V(a).normalize().dot(V(b).normalize()),-1,1))*degrees,quatAngle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(new THREE.Quaternion(...a).dot(new THREE.Quaternion(...b)))))*degrees;
const empty=()=>({maxStep:0,maxSpeed:0,worstStep:null,worstSpeed:null});
function observe(out,delta,dt,where){if(delta>out.maxStep){out.maxStep=delta;out.worstStep=where;}if(dt>1e-9&&delta/dt>out.maxSpeed){out.maxSpeed=delta/dt;out.worstSpeed={...where,dt};}}
const points=['shoulders','elbows','wrists','hands','hips','knees','ankles','feet'];
const angles=isBefore?[0,30]:(process.env.BENCH_ANGLES||Array.from({length:46},(_,i)=>i).join(',')).split(',').map(Number),cases=angles.map(angle=>({id:'dumbbell-bench-press',settings:{benchAngle:angle}})),results=[];
for(const c of cases){
 rig.end({keepVisible:false});if(c.settings)rig.setEquipmentSettings(c.id,c.settings);rig.prepare(c.id);const meta=rig.getLifecycle(c.id),r={...c,duration:meta.entryDuration,frames:0,maxBoneError:0,maxReachError:0,maxHeldPalmError:0,maxPlantedSoleError:0,motion:{},byStage:{},stageSeams:[],endpointSeams:[],ownershipChanges:[],isolatedJumps:[]};
 const snapshot=(mode,p)=>{
  const f=mode==='loop'?{pose:rig.sample(c.id,p,p),offset:[0,0,0],stage:'exercise',contacts:{hands:c.id==='dumbbell-single-arm-row'?[false,true]:[true,true],feet:[true,true]}}:rig.sampleLifecycle(c.id,mode,p);
  character.pose(f.pose);const body=character.getContactPoints(),h=character.getHandDiagnostics(),target=rig.getActualContacts(c.id),state=rig.getLifecycleState(c.id);r.frames++;
  const b={};for(const key of points)b[key]=body[key].map(v=>v.map((x,i)=>x+f.offset[i]));
  r.maxReachError=Math.max(r.maxReachError,body.maxReachError);
  for(let side=0;side<2;side++){
   for(const [a,z,length] of [['shoulders','elbows',metrics.arms[side].upper],['elbows','wrists',metrics.arms[side].lower],['hips','knees',metrics.legs[side].upper],['knees','ankles',metrics.legs[side].lower]])r.maxBoneError=Math.max(r.maxBoneError,Math.abs(dist(b[a][side],b[z][side])-length));
   if(f.contacts.hands[side])r.maxHeldPalmError=Math.max(r.maxHeldPalmError,dist(b.hands[side],target.hands[side]));
   if(f.contacts.feet[side])r.maxPlantedSoleError=Math.max(r.maxPlantedSoleError,dist(b.feet[side],target.feet[side]));
  }
  return{mode,phase:p,time:p*meta.entryDuration,stage:f.stage,held:f.held,ownership:state.ownership,contacts:f.contacts,body:b,hands:h,positions:state.propPositions,quaternions:state.propQuaternions,axes:state.propQuaternions.map(q=>new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion(...q)).toArray())};
 };
 const compare=(a,b,out)=>{
  const dt=b.time-a.time,where={mode:b.mode,phase:b.phase,previousPhase:a.phase,stage:b.stage,previousStage:a.stage},deltas={};
  for(const key of points){const value=Math.max(...b.body[key].map((v,s)=>dist(v,a.body[key][s])));observe(out[key]??=empty(),value,dt,where);deltas[key]=value;}
  const propStep=Math.max(0,...b.positions.map((v,s)=>dist(v,a.positions[s])));observe(out.gearPosition??=empty(),propStep,dt,where);deltas.gearPosition=propStep;
  for(const [key,values] of [['gearQuaternion',b.quaternions.map((q,s)=>quatAngle(a.quaternions[s],q))],['gearSymmetricAxis',b.axes.map((v,s)=>Math.min(angle(v,a.axes[s]),180-angle(v,a.axes[s])))],['handAdvance',b.hands.map((h,s)=>angle(h.advance,a.hands[s].advance))],['palmNormal',b.hands.map((h,s)=>angle(h.palmNormal,a.hands[s].palmNormal))]]){const value=Math.max(0,...values);observe(out[key]??=empty(),value,dt,where);deltas[key]=value;}
  return{...where,dt,deltas};
 };
 for(const mode of ['enter','exit']){
  let elapsed=0;const boundarySeconds=[];for(const s of meta.stages){elapsed+=s.duration;if(elapsed<meta.entryDuration-1e-9)boundarySeconds.push(elapsed);}
  // Exit reverses the path and therefore also reverses its stage boundaries.
  if(mode==='exit')for(let i=0;i<boundarySeconds.length;i++)boundarySeconds[i]=meta.entryDuration-boundarySeconds[i];
  const phases=new Set(Array.from({length:count},(_,i)=>i/(count-1)));for(const sec of boundarySeconds)for(const eps of [-.0001,0,.0001])phases.add(THREE.MathUtils.clamp((sec+eps)/meta.entryDuration,0,1));
  let prev=null;const intervals=[];
  for(const p of [...phases].sort((a,b)=>a-b)){
   const f=snapshot(mode,p);if(prev){const d=compare(prev,f,r.motion),stage=r.byStage[`${mode}:${f.stage}`]??={};compare(prev,f,stage);intervals.push(d);if(f.ownership!==prev.ownership)r.ownershipChanges.push({...d,from:prev.ownership,to:f.ownership,heldBefore:prev.held,heldAfter:f.held});}prev=f;
  }
  // Seams get independent, fixed-duration bracketing; unlike the dense grid,
  // these tolerances remain meaningful when an entry duration changes.
  for(const sec of boundarySeconds){const a=snapshot(mode,(sec-.0001)/meta.entryDuration),b=snapshot(mode,(sec+.0001)/meta.entryDuration),out={};const seam=compare(a,b,out);r.stageSeams.push({...seam,time:sec,fromOwnership:a.ownership,toOwnership:b.ownership,motion:out});}
  for(const [endpoint,a,b] of [['start',snapshot(mode,0),snapshot(mode,.0001/meta.entryDuration)],['end',snapshot(mode,1-.0001/meta.entryDuration),snapshot(mode,1)]]){const motion={};r.endpointSeams.push({endpoint,...compare(a,b,motion),fromOwnership:a.ownership,toOwnership:b.ownership,motion});}
  // Localised spikes deserve review even if the overall historical maximum
  // happened to be larger elsewhere. This is a numerical jump detector, not ROM.
  for(let i=1;i<intervals.length-1;i++){const a=intervals[i-1],b=intervals[i],z=intervals[i+1];if(b.dt<1e-6)continue;for(const key of ['hands','elbows','wrists','feet','gearPosition','gearSymmetricAxis','handAdvance','palmNormal']){const speed=b.deltas[key]/b.dt,neighbors=Math.max(a.deltas[key]/Math.max(a.dt,1e-6),z.deltas[key]/Math.max(z.dt,1e-6));const minStep=['gearSymmetricAxis','handAdvance','palmNormal'].includes(key)?5:.005;if(b.deltas[key]>minStep&&speed>Math.max(neighbors*20,1))r.isolatedJumps.push({...b,key,speed,neighborMaxSpeed:neighbors});}}
 }
 const ready=snapshot('enter',1),loop=snapshot('loop',0);loop.time=ready.time+.0002;const readyMotion={};r.readySeam={...compare(ready,loop,readyMotion),motion:readyMotion};
 r.numericPass=r.maxBoneError<1e-5&&r.maxReachError<.015&&r.maxHeldPalmError<.015&&r.maxPlantedSoleError<.015&&[...r.stageSeams,...r.endpointSeams].every(s=>points.every(k=>s.motion[k].maxStep<.001)&&s.motion.gearPosition.maxStep<.001&&['gearQuaternion','gearSymmetricAxis','handAdvance','palmNormal'].every(k=>s.motion[k].maxStep<.5))&&points.every(k=>readyMotion[k].maxStep<.001)&&readyMotion.gearPosition.maxStep<.001;
 results.push(r);console.log(JSON.stringify({label,id:r.id,settings:r.settings,frames:r.frames,numericPass:r.numericPass,maxReachError:r.maxReachError,maxHeldPalmError:r.maxHeldPalmError,gearAngularSpeed:r.motion.gearSymmetricAxis.maxSpeed,palmAngularSpeed:r.motion.palmNormal.maxSpeed,elbowSpeed:r.motion.elbows.maxSpeed,isolatedJumps:r.isolatedJumps.length}));
}
const changedSources=sourcePaths.filter(p=>hash(p)!==hashes[p]),comparisons=[];let baselineHashes=null;
if(!isBefore){
 const baseline=JSON.parse(readFileSync('artifacts/v011-bench-continuity-before.json'));
 baselineHashes=baseline.hashes;
 for(const r of results){const reference=baseline.results.find(x=>JSON.stringify(x.settings)===JSON.stringify(r.settings)),b=reference||{motion:Object.fromEntries(Object.keys(r.motion).map(key=>[key,{maxSpeed:Math.max(...baseline.results.map(x=>x.motion[key].maxSpeed)),maxStep:Math.max(...baseline.results.map(x=>x.motion[key].maxStep))}])),isolatedJumps:[]};const checks=[];
  for(const [key,m]of Object.entries(r.motion)){
   const old=b.motion[key],angular=['gearQuaternion','gearSymmetricAxis','handAdvance','palmNormal'].includes(key),speedAllowance=angular?120:.5,stepAllowance=angular?5:.005;
   checks.push({metric:key,beforeSpeed:old.maxSpeed,afterSpeed:m.maxSpeed,beforeStep:old.maxStep,afterStep:m.maxStep,speedLimit:Math.max(old.maxSpeed*1.5,old.maxSpeed+speedAllowance),stepLimit:Math.max(old.maxStep*1.5,old.maxStep+stepAllowance),pass:m.maxSpeed<=Math.max(old.maxSpeed*1.5,old.maxSpeed+speedAllowance)&&m.maxStep<=Math.max(old.maxStep*1.5,old.maxStep+stepAllowance),worst:m.worstSpeed});
  }
  comparisons.push({id:r.id,settings:r.settings,referenceAngles:reference?[r.settings.benchAngle]:[0,30],checks,pass:checks.every(x=>x.pass)&&r.isolatedJumps.length<=b.isolatedJumps.length});
 }
}
const report={version:'0.11',label,environment:root,count,hashes,baselineHashes,baselineReport:isBefore?null:'artifacts/v011-bench-continuity-before.json',changedSources,scope:'Real production GLB bones, palm markers and hand frames; physical prop positions/quaternions. Enter/exit dense grid plus every exact stage boundary at ±0.1 ms, and one-sided start/end brackets of 0.1 ms. No GPU or medical/coach approval.',angularNote:'Quaternion speed includes axial roll from the rendering frame. A dumbbell has rotationally symmetric plates/shaft, so gearSymmetricAxis measures its unoriented shaft (q and -q, and shaft axes ±a, are equivalent). Skin hand frames retain their oriented normals.',comparisonRule:'Numerical regression screen only. Angles 0/30 compare their exact sealed references; new angles compare the maximum per-metric envelope of those two references. After speed/adjacent delta must remain below max(1.5×reference, reference+0.5m/s or +120deg/s; reference+5mm or +5deg). Fixed 0.2ms stage seams and 0.1ms endpoint brackets must stay below 1mm/0.5deg; ready seam below 1mm. Local isolated jumps >5mm/5deg at >20×neighbor speed are separately reported. These are continuity checks, not biomechanical safety limits.',results,comparisons,pass:!changedSources.length&&results.every(r=>r.numericPass)&&comparisons.every(c=>c.pass)};
writeFileSync(`artifacts/v011-bench-continuity-${label}.json`,JSON.stringify(report,null,2));character.dispose();if(!report.pass)process.exitCode=1;
