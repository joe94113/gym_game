import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const defaultIds=['dumbbell-curl','dumbbell-bench-press','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-goblet-squat','dumbbell-romanian-deadlift'],close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-10;
export function dumbbellFingerEvidenceIssuesV013(proof,{root='.',angle=0,ids=defaultIds,withBenches=true}={}){
 const issues=[],full=path=>resolve(root,path),hash=path=>createHash('sha256').update(readFileSync(full(path))).digest('hex'),results=proof?.results||[];
 if(proof?.schemaVersion!==1)return ['dense DB grip evidence schema v1 missing'];
 if(proof.pass!==true||proof.angle!==angle||proof.phaseCount!==201||proof.gripPhaseCount!==501||proof.handSkinStride!==1||proof.bodySkinStride!==24||proof.metalToleranceMetres!==.001)issues.push('formal 201/501-phase actual-hand grip coverage missing');
 if(results.length!==ids.length||new Set(results.map(item=>item.id)).size!==ids.length||ids.some(id=>!results.some(item=>item.id===id)))issues.push('dense DB case set incomplete');
 for(const key of ['changedSources','changedValidators'])if(!Array.isArray(proof[key])||proof[key].length)issues.push('dense grip source stability failed/missing '+key);
 for(const key of ['sourceHashes','validatorSourceHashes']){
  if(!proof[key]||!Object.keys(proof[key]).length)issues.push('dense grip hash map missing '+key);
  for(const [path,value]of Object.entries(proof[key]||{}))if(!existsSync(full(path))||!/^[a-f\d]{64}$/i.test(value)||hash(path)!==value.toLowerCase())issues.push('stale dense grip source '+path);
 }
 for(const item of results){
  const raw=item.rawFrames||[],minimum=201*3+501*2+(item.seams?.length||0)*2+2;
  if(item.pass!==true||item.frames!==raw.length||item.frames!==minimum||item.denseGripFrames?.enter!==501||item.denseGripFrames?.exit!==501||!(item.minimumHandSkinSamples>3000)||!(item.minimumPhysicalShafts>0)||!(item.maxContactError<.015)||!(item.maxReachError<.015)||!(item.maxMetalDepth<=.001)||!(item.maxBoneLengthError<1e-5)||!(item.readySeam<.001))issues.push('dense grip/contact/bone coverage failed '+item.id);
  if(item.benchAngle!==(item.id==='dumbbell-bench-press'?angle:null))issues.push('wrong configured bench '+item.id);
  for(const key of ['collisions','selfCollisions','surfaceCollisions','metalViolations','bodyMetalViolations','footErrors'])if(!Array.isArray(item[key])||item[key].length)issues.push('dense grip contains/omits collision list '+item.id+':'+key);
  if(!item.seams?.length||item.seams.some(seam=>!Number.isFinite(seam.jointDelta)||seam.jointDelta>=.001||!Number.isFinite(seam.handSkinDelta)||seam.handSkinDelta>=.001||!Number.isFinite(seam.propDelta)||seam.propDelta>=.001))issues.push('grip lifecycle seam evidence missing/failed '+item.id);
  if(!(item.maxBodyMetalDepth<=.004))issues.push('body/metal clearance failed '+item.id);
  for(let mode=0;mode<3;mode++)for(let i=0;i<201;i++)if(raw[mode*201+i]?.mode!==['loop','enter','exit'][mode]||!close(raw[mode*201+i]?.phase,i/200)){issues.push('raw whole-loop/lifecycle phases missing '+item.id);break;}
  const enter=raw.slice(603,1104),exit=raw.slice(1104,1605);
  if(enter.length!==501||exit.length!==501||!(enter.at(-1)?.phase>enter[0]?.phase)||enter.some((frame,index)=>frame.mode!=='enter'||!close(frame.phase,enter[0].phase+(enter.at(-1).phase-enter[0].phase)*index/500))||exit.some((frame,index)=>frame.mode!=='exit'||!close(frame.phase,1-enter[index]?.phase)))issues.push('raw dense grasp/release interval missing '+item.id);
  if(raw.some(frame=>!['loop','enter','exit'].includes(frame.mode)||!Number.isFinite(frame.phase)||frame.phase<0||frame.phase>1||!frame.stage||!(frame.handSkinSamples>3000)||!(frame.physicalShafts>0)||!(frame.physicalCylinders>=frame.physicalShafts)||!(frame.maxMetalDepth<=.001)||!(frame.maxReachError<.015)))issues.push('raw actual-hand/physical-metal sample failed '+item.id);
  if(raw.some(frame=>!Array.isArray(frame.gripStrength)||frame.gripStrength.length!==2||frame.gripStrength.some(value=>!Number.isFinite(value)||value<0||value>1)||!Array.isArray(frame.thumbOpposition)||frame.thumbOpposition.length!==2||frame.thumbOpposition.some(value=>!Number.isFinite(value))||!Array.isArray(frame.handFingerFlex)||frame.handFingerFlex.length!==2||frame.handFingerFlex.some(hand=>!hand||Object.entries(hand).some(([finger,joints])=>!['thumb','index','middle','ring','pinky'].includes(finger)||!Array.isArray(joints)||joints.length!==3||joints.some(value=>!Number.isFinite(value))))))issues.push('actual grip/finger-pose raw values missing '+item.id);
  if(raw.length&&(!close(Math.max(...raw.map(frame=>frame.maxMetalDepth)),item.maxMetalDepth)||!close(Math.max(...raw.map(frame=>frame.maxReachError)),item.maxReachError)||Math.min(...raw.map(frame=>frame.handSkinSamples))!==item.minimumHandSkinSamples||Math.min(...raw.map(frame=>frame.physicalShafts))!==item.minimumPhysicalShafts))issues.push('raw/summary grip extrema mismatch '+item.id);
 }
 if(withBenches){
  const leaves=proof.additionalBenchReports||[];
  if(leaves.length!==2)issues.push('30/45-degree dense bench grip evidence missing');
  for(const bench of [30,45]){
   const path=`artifacts/dumbbell-fingers-v013/qualification-bench${bench}.json`,leaf=leaves.find(item=>item.path===path);
   if(!leaf||!existsSync(full(path))||hash(path)!==leaf.sha256){issues.push('configured bench grip receipt missing/stale '+bench);continue;}
   try{issues.push(...dumbbellFingerEvidenceIssuesV013(JSON.parse(readFileSync(full(path),'utf8')),{root,angle:bench,ids:['dumbbell-bench-press'],withBenches:false}).map(issue=>`bench${bench}: ${issue}`));}catch(error){issues.push(`bench${bench}: ${error.message}`);}
  }
 }
 return issues;
}
