import {createPreparationFixture} from './preparation-fixture-v013.mjs';
import {preparationSourceHashes} from './preparation-sources-v013.mjs';
import {LOOP_SCHEMA_V013,CHANGED_GRIP_IDS_V013,HAND_POSE_FIELDS_V013,INVARIANT_CONTACT_FIELDS_V013,preparationLoopIssuesV013,expectedPlatePegExtensionV013} from './preparation-loop-contract-v013.mjs';
import {dumbbellFingerEvidenceIssuesV013} from './validate-dumbbell-finger-evidence-v013.mjs';
import {evaluateExerciseClearance,evaluateSelfClearance} from '../src/collision-validation.js';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),baselineRoot='.local-tools/v013-before/',sourceHashes=preparationSourceHashes(),baselineSourceHashes=preparationSourceHashes(baselineRoot);
const validators=['scripts/qualify-preparation-loop-preservation-v013.mjs','scripts/preparation-loop-contract-v013.mjs','scripts/validate-dumbbell-finger-evidence-v013.mjs','scripts/preparation-sources-v013.mjs','scripts/preparation-fixture-v013.mjs','src/collision-validation.js'],validatorSourceHashes=Object.fromEntries(validators.map(path=>[path,hash(path)]));
const gripPath='artifacts/dumbbell-fingers-v013/qualification.json',gripEvidence={path:gripPath,verified:false,issues:[]};
if(existsSync(gripPath)){
 const grip=JSON.parse(readFileSync(gripPath,'utf8'));gripEvidence.sha256=hash(gripPath);gripEvidence.issues.push(...dumbbellFingerEvidenceIssuesV013(grip));
 if(grip.pass!==true||!Array.isArray(grip.changedSources)||grip.changedSources.length)gripEvidence.issues.push('dense grip proof failed or lacks source stability');
 if(!grip.sourceHashes||!Object.keys(grip.sourceHashes).length)gripEvidence.issues.push('dense grip source map missing');
 for(const [path,value]of Object.entries(grip.sourceHashes||{}))if(!existsSync(path)||hash(path)!==value)gripEvidence.issues.push('stale dense grip source '+path);
 gripEvidence.verified=!gripEvidence.issues.length;
}else gripEvidence.issues.push('dense grip qualification has not been produced');
const equipmentEvidence={verified:false,reports:[],issues:[]};
for(const path of ['artifacts/equipment-settings-v013/qualification.json','artifacts/equipment-settings-v013/lifecycles-qualification.json']){
 if(!existsSync(path)){equipmentEvidence.issues.push('missing '+path);continue;}
 const proof=JSON.parse(readFileSync(path,'utf8'));equipmentEvidence.reports.push({path,sha256:hash(path)});
 if(proof.pass!==true||proof.pilot!==false||proof.phases!==101||proof.results?.length!==152||!Array.isArray(proof.changedSources)||proof.changedSources.length||proof.results.some(item=>!item.pass||!(item.maxReachError<.015)||!(item.maxContactError<.015)||['collisions','self','surface'].some(key=>!Array.isArray(item[key])||item[key].length)))equipmentEvidence.issues.push('incomplete or failed '+path);
 for(const [source,value]of Object.entries(proof.sourceHashes||{}))if(!existsSync(source)||hash(source)!==value)equipmentEvidence.issues.push('stale equipment source '+source);
}
equipmentEvidence.verified=equipmentEvidence.reports.length===2&&!equipmentEvidence.issues.length;
const before=await createPreparationFixture({before:true}),after=await createPreparationFixture(),ids=['dumbbell-curl','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-bench-press','dumbbell-goblet-squat','dumbbell-romanian-deadlift'],cases=ids.map(id=>({id,kind:'dumbbell'})),seen=new Set();
for(const machine of before.machines.values()){if(machine.type==='dumbbellCurl'||seen.has(machine.type))continue;seen.add(machine.type);cases.push({id:machine.station.id,kind:'machine'});}

// A dominant "torso" label can still contain arm-bone skin weights. Protect
// vertices by their actual influences, including mixed-weight sleeve edges.
function armInfluencedVertices(character){
 const meshes=new Map();character.group.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),mask=new Uint8Array(indices.count),affected=mesh.skeleton.bones.map(bone=>/upperarm|upperar|lowerarm|forearm|hand|thumb|index|middle|ring|pinky|finger/i.test(bone.name));
  for(let vertex=0;vertex<indices.count;vertex++)for(let channel=0;channel<4;channel++)if(weights.getComponent(vertex,channel)>0&&affected[indices.getComponent(vertex,channel)])mask[vertex]=1;
  meshes.set(mesh.name,mask);
 });return meshes;
}
const oldAffected=armInfluencedVertices(before.character),newAffected=armInfluencedVertices(after.character),stripHands=pose=>Object.fromEntries(Object.entries(pose).filter(([key])=>!HAND_POSE_FIELDS_V013.includes(key))),select=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]])),distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
let poses=0,samples=0;const failures=[],results=[];
function note(result,check,phase){if(!result.failedChecks.some(item=>item.check===check))result.failedChecks.push({check,phase});}
try{for(const item of cases){
 const scoped=CHANGED_GRIP_IDS_V013.includes(item.id),result={...item,mode:scoped?'scoped-grip':'exact',poses:0,surfaceSamples:0,protectedSkinSamples:0,excludedArmHandSamples:0,poseInvariant:true,bodyInvariant:true,equipmentVolumesExact:true,equipmentInvariant:true,equipmentChanges:[],protectedSkinExact:true,allSkinExact:true,allBodyExact:true,handDiagnosticsExact:true,intentionalProfilePoses:0,maxReachError:0,maxContactError:0,maxBoneError:0,maxExcludedSurfaceDelta:0,maxArmContactDelta:{hands:0,elbows:0,wrists:0},changedPoseFields:[],collisions:[],self:[],failedChecks:[]};
 for(let phase=0;phase<=10;phase++){
  const p=phase/10,a=item.kind==='dumbbell'?before.rig.sample(item.id,p,p):before.machines.get(item.id).sampleActivity(p,p),b=item.kind==='dumbbell'?after.rig.sample(item.id,p,p):after.machines.get(item.id).sampleActivity(p,p),oldVolumes=item.kind==='dumbbell'?before.rig.getCollisionVolumes(item.id):before.machines.get(item.id).getCollisionVolumes(),newVolumes=item.kind==='dumbbell'?after.rig.getCollisionVolumes(item.id):after.machines.get(item.id).getCollisionVolumes();
  before.character.pose(a);after.character.pose(b);
  const old={body:before.character.getContactPoints(),hands:before.character.getHandDiagnostics(),skin:before.character.getSurfaceSamples({stride:256})},now={body:after.character.getContactPoints(),hands:after.character.getHandDiagnostics(),skin:after.character.getSurfaceSamples({stride:256})};samples+=old.skin.length;poses++;result.poses++;result.surfaceSamples+=old.skin.length;
  if(!same(scoped?stripHands(a):a,scoped?stripHands(b):b)){result.poseInvariant=false;note(result,'authored non-hand pose changed',p);}
  for(const key of new Set([...Object.keys(a),...Object.keys(b)]))if(!same(a[key],b[key])&&!result.changedPoseFields.includes(key))result.changedPoseFields.push(key);
  if(!same(scoped?select(old.body,INVARIANT_CONTACT_FIELDS_V013):old.body,scoped?select(now.body,INVARIANT_CONTACT_FIELDS_V013):now.body)){result.bodyInvariant=false;note(result,'protected actual contact changed',p);}
  result.allBodyExact&&=same(old.body,now.body);result.handDiagnosticsExact&&=same(old.hands,now.hands);result.allSkinExact&&=same(old.skin,now.skin);
  if(!same(oldVolumes,newVolumes)){
   result.equipmentVolumesExact=false;
   if(oldVolumes.length!==newVolumes.length){result.equipmentInvariant=false;note(result,'equipment collision volume count changed',p);}
   for(let i=0;i<oldVolumes.length;i++)if(!same(oldVolumes[i],newVolumes[i])){
    if(expectedPlatePegExtensionV013(item.id,oldVolumes[i],newVolumes[i])){if(!result.equipmentChanges.some(change=>change.before.id===oldVolumes[i].id))result.equipmentChanges.push({phase:p,before:oldVolumes[i],after:newVolumes[i],reason:'Plate peg extended from 42 to 48 cm for adjustable loading; separately qualified.'});}
    else{result.equipmentInvariant=false;note(result,'unaccounted physical equipment collision geometry change',p);}
   }
  }
  // The final fit may use the legacy bend axes. Require a real changed
  // finger profile, rather than requiring an optional API for its own sake.
  if(scoped&&b.handFingerFlex&&!same(a.handFingerFlex,b.handFingerFlex))result.intentionalProfilePoses++;
  if(old.skin.length!==now.skin.length){result.protectedSkinExact=false;note(result,'surface sampling topology changed',p);}
  for(let i=0;i<Math.min(old.skin.length,now.skin.length);i++){
   const x=old.skin[i],y=now.skin[i],oldMask=oldAffected.get(x.mesh),newMask=newAffected.get(y.mesh);
   if(x.mesh!==y.mesh||x.vertex!==y.vertex||x.part!==y.part||!oldMask||!newMask||oldMask[x.vertex]!==newMask[y.vertex]){result.protectedSkinExact=false;note(result,'skin identity/influence changed',p);continue;}
   if(scoped&&oldMask[x.vertex]){result.excludedArmHandSamples++;result.maxExcludedSurfaceDelta=Math.max(result.maxExcludedSurfaceDelta,distance(x.position,y.position));}
   else{result.protectedSkinSamples++;if(!same(x,y)){result.protectedSkinExact=false;note(result,'protected deformed skin changed',p);}}
  }
  result.maxReachError=Math.max(result.maxReachError,now.body.maxReachError);
  for(let side=0;side<2;side++){
   for(const key of ['hands','elbows','wrists'])result.maxArmContactDelta[key]=Math.max(result.maxArmContactDelta[key],distance(old.body[key][side],now.body[key][side]));
   for(const kind of ['hands','feet'])result.maxContactError=Math.max(result.maxContactError,distance(now.body[kind][side],b[kind][side]));
   for(const [x,y,length]of [['shoulders','elbows',after.metrics.arms[side].upper],['elbows','wrists',after.metrics.arms[side].lower],['hips','knees',after.metrics.legs[side].upper],['knees','ankles',after.metrics.legs[side].lower]])result.maxBoneError=Math.max(result.maxBoneError,Math.abs(distance(now.body[x][side],now.body[y][side])-length));
  }
  for(const [key,hits]of [['collisions',evaluateExerciseClearance(now.body,newVolumes).collisions],['self',evaluateSelfClearance(now.body).collisions]])for(const hit of hits)if(!result[key].some(value=>value.bodyPart===hit.bodyPart&&value.volumeId===hit.volumeId&&value.otherBodyPart===hit.otherBodyPart))result[key].push({...hit,phase:p});
 }
 if(!scoped&&(!result.allSkinExact||!result.handDiagnosticsExact||!result.allBodyExact))note(result,'default loop must remain fully exact',null);
 if(scoped&&result.intentionalProfilePoses!==11)note(result,'candidate grip profile not active throughout loop',null);
 result.pass=!result.failedChecks.length&&result.maxReachError<.015&&result.maxContactError<.015&&result.maxBoneError<1e-5&&!result.collisions.length&&!result.self.length;results.push(result);if(!result.pass)failures.push({id:item.id,checks:result.failedChecks,collisions:result.collisions,self:result.self});
}}finally{before.character.dispose();after.character.dispose();}
const finalSources=preparationSourceHashes(),finalBaseline=preparationSourceHashes(baselineRoot),changedSources=Object.keys(sourceHashes).filter(path=>finalSources[path]!==sourceHashes[path]),changedBaselineSources=Object.keys(baselineSourceHashes).filter(path=>finalBaseline[path]!==baselineSourceHashes[path]),changedValidators=validators.filter(path=>hash(path)!==validatorSourceHashes[path]);
if(gripEvidence.sha256&&hash(gripPath)!==gripEvidence.sha256)changedValidators.push(gripPath);
for(const leaf of equipmentEvidence.reports)if(hash(leaf.path)!==leaf.sha256)changedValidators.push(leaf.path);
const report={schemaVersion:LOOP_SCHEMA_V013,pass:!failures.length&&gripEvidence.verified&&equipmentEvidence.verified&&!changedSources.length&&!changedBaselineSources.length&&!changedValidators.length,sourceHashes,baselineSourceHashes,validatorSourceHashes,changedSources,changedBaselineSources,changedValidators,poses,samples,failures,results,gripEvidence,equipmentEvidence,dependencies:{...(gripEvidence.sha256?{[gripPath]:gripEvidence.sha256}:{}),...Object.fromEntries(equipmentEvidence.reports.map(leaf=>[leaf.path,leaf.sha256]))},scope:'32 machine types and the unmodified goblet loop require exact authored pose, actual contact, hand diagnostics and sampled deformed skin at 11 phases. Default collision geometry is exact except six specifically measured 42-to-48-cm plate-peg extensions on three added machines, requiring separate full configured-equipment evidence. Seven non-goblet DB loops preserve all non-hand pose fields, actual shoulder/hip/knee/ankle/foot contacts, hardware collision geometry and sampled vertices with zero arm/hand-bone influence. Arm/hand-weighted vertices and intentional palm/wrist/elbow/finger changes are measured separately and require independent dense actual-GLB grip evidence. Finite default loops only; this does not claim all 58,080 skin samples are unchanged.'};
const issues=preparationLoopIssuesV013(report);report.issues=issues;report.pass&&=!issues.length;
mkdirSync('artifacts/preparation-v013',{recursive:true});const output=`artifacts/preparation-v013/loop-preservation${process.argv.includes('--pilot')?'-pilot':''}.json`;writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({output,pass:report.pass,poses,samples,exactCases:results.filter(item=>item.mode==='exact').length,scopedCases:results.filter(item=>item.mode==='scoped-grip').length,failures,issues,changedSources,changedBaselineSources,changedValidators}));if(!report.pass)process.exitCode=1;
