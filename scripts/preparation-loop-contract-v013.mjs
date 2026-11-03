export const LOOP_SCHEMA_V013=2;
export const CHANGED_GRIP_IDS_V013=Object.freeze(['dumbbell-curl','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-bench-press','dumbbell-romanian-deadlift']);
export const HAND_POSE_FIELDS_V013=Object.freeze(['hands','elbows','elbowHints','handDirections','handNormals','handAdvances','handFingerFlex','handThumbOpposition']);
export const INVARIANT_CONTACT_FIELDS_V013=Object.freeze(['shoulders','hips','knees','ankles','feet']);
export const EXTENDED_PLATE_PEGS_V013=Object.freeze({'preacher-curl':['solid-18','solid-20'],'lying-chest-press':['solid-15','solid-17'],'decline-chest-press':['solid-15','solid-17']});
export function expectedPlatePegExtensionV013(id,old,now){
 if(!EXTENDED_PLATE_PEGS_V013[id]?.includes(old?.id)||old.shape!=='capsule'||now?.shape!=='capsule')return false;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),rest=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['start','end'].includes(key))),close=(a,b)=>Math.abs(a-b)<1e-10,sign=Math.sign(old.end[0]-old.start[0]);
 return same(rest(old),rest(now))&&old.start.every((value,index)=>close(value,now.start[index]))&&close(now.end[0]-old.end[0],sign*.06)&&[1,2].every(index=>close(old.end[index],now.end[index]));
}

export function preparationLoopIssuesV013(proof){
 if(proof?.schemaVersion!==LOOP_SCHEMA_V013)return ['scoped default-loop preservation schema v2 is missing'];
 const issues=[],results=proof?.results||[],ids=new Set(results.map(item=>item.id));
 if(proof?.schemaVersion!==LOOP_SCHEMA_V013||proof.poses!==440||proof.samples!==58080||results.length!==40||ids.size!==40)issues.push('full 40-loop/440-pose scoped preservation coverage missing');
 if(proof?.pass!==true||!Array.isArray(proof.failures)||proof.failures.length)issues.push('scoped default-loop preservation failed');
 if(results.filter(item=>item.mode==='exact').length!==33||results.filter(item=>item.mode==='scoped-grip').length!==7)issues.push('33 exact / 7 explicitly scoped DB cases missing');
 for(const item of results){
  if(item.pass!==true||item.poses!==11||!item.poseInvariant||!item.bodyInvariant||!item.equipmentInvariant||!item.protectedSkinExact||!(item.protectedSkinSamples>0)||!(item.maxReachError<.015)||!(item.maxContactError<.015)||!(item.maxBoneError<1e-5)||item.collisions?.length||item.self?.length)issues.push('loop invariant/safety failed '+item.id);
  if(item.equipmentVolumesExact!==true&&(!EXTENDED_PLATE_PEGS_V013[item.id]||item.equipmentChanges?.length!==2||item.equipmentChanges.some(change=>!expectedPlatePegExtensionV013(item.id,change.before,change.after))))issues.push('unaccounted equipment geometry change '+item.id);
  if(item.mode==='exact'&&(!item.allSkinExact||!item.handDiagnosticsExact||!item.allBodyExact))issues.push('exact default loop changed '+item.id);
  if(item.mode==='scoped-grip'&&(!CHANGED_GRIP_IDS_V013.includes(item.id)||item.intentionalProfilePoses!==11||!(item.excludedArmHandSamples>0)))issues.push('invalid/unapplied explicit DB scope '+item.id);
 }
 if(CHANGED_GRIP_IDS_V013.some(id=>!results.some(item=>item.id===id&&item.mode==='scoped-grip')))issues.push('expected DB scope set is incomplete');
 if(proof?.gripEvidence?.verified!==true||!proof.gripEvidence.path||!proof.gripEvidence.sha256)issues.push('independent dense DB grip evidence missing');
 if(proof?.equipmentEvidence?.verified!==true||proof.equipmentEvidence.reports?.length!==2)issues.push('configured-equipment evidence for extended pegs missing');
 if(!Array.isArray(proof?.changedSources)||proof.changedSources.length||!Array.isArray(proof.changedBaselineSources)||proof.changedBaselineSources.length||!Array.isArray(proof.changedValidators)||proof.changedValidators.length)issues.push('loop source start/end stability missing or failed');
 return issues;
}
