import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {THREE,character,metrics,rig,machines} from './equipment-settings-v013-test-helpers.mjs';
import {createMachineLifecycle} from '../src/machine-lifecycle.js';
import {equipmentOptionsFor} from '../src/equipment-options.js';
import {CABLE_CALIBRATION_IDS} from '../src/equipment-calibration-v013.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
const pilot=process.argv.includes('--pilot'),phases=pilot?21:101,results=[],failures=[];
const files=['src/equipment.js','src/additional-equipment.js','src/equipment-options.js','src/equipment-calibration-v013.js','src/extended-rig.js','src/exercise-rig.js','src/cable-stages-v011.js','src/straight-bar-pushdown.js','src/rig-lifecycle.js','src/skinned-character.js','src/dumbbell-grip.js','src/machine-lifecycle.js','src/auxiliary-strength-paths.js','src/barbell-lifecycle-paths.js','src/additional-lifecycle.js','src/additional-hip-lifecycle.js','public/models/athlete/athlete.glb'];
const hashes=()=>Object.fromEntries(files.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),sourceHashes=hashes(),up=new THREE.Vector3(0,1,0);
const transform=(point,frame)=>new THREE.Vector3(...point).applyAxisAngle(up,frame.rotation||0).add(new THREE.Vector3(...(frame.offset||[0,0,0]))).toArray();
function check(id,settings,runner){
 const result={id,settings,poses:0,maxContactError:0,maxReachError:0,collisions:[],self:[],surface:[]};runner.start(settings);
 for(const direction of ['enter','exit'])for(let i=0;i<phases;i++){
  const phase=i/(phases-1),frame=runner.frame(direction,phase);character.pose(frame.pose);const local=character.getContactPoints(),body={maxReachError:local.maxReachError};
  for(const [key,value]of Object.entries(local))if(Array.isArray(value)&&Array.isArray(value[0]))body[key]=value.map(point=>transform(point,frame));
  const volumes=runner.volumes(),targets=runner.contacts?.();result.poses++;result.maxReachError=Math.max(result.maxReachError,local.maxReachError);
  for(const kind of ['hands','feet'])for(let side=0;side<2;side++)if(frame.contacts?.[kind]?.[side]){
   const expected=kind==='hands'&&targets?.hands?.[side]?targets.hands[side]:transform(frame.pose[kind][side],frame);
   result.maxContactError=Math.max(result.maxContactError,Math.hypot(...expected.map((value,j)=>value-body[kind][side][j])));
  }
  const details={direction,phase,stage:frame.stage};
  for(const [key,evaluation]of [['collisions',evaluateExerciseClearance(body,volumes)],['self',evaluateSelfClearance(body)]])for(const hit of evaluation.collisions)if(!result[key].some(old=>old.bodyPart===hit.bodyPart&&old.volumeId===hit.volumeId))result[key].push({...hit,...details,...(pilot?{frame:structuredClone(frame),body,volume:volumes.find(volume=>volume.id===hit.volumeId)}:{})});
  if(!pilot&&i%10===0){const samples=character.getSurfaceSamples({stride:20}).map(sample=>({...sample,position:transform(sample.position,frame)}));for(const hit of evaluateSurfaceClearance(samples,volumes).collisions)if(!result.surface.some(old=>old.bodyPart===hit.bodyPart&&old.volumeId===hit.volumeId))result.surface.push({...hit,...details});}
 }
 runner.end?.();result.pass=result.maxContactError<.015&&result.maxReachError<.015&&!result.collisions.length&&!result.self.length&&!result.surface.length;if(!result.pass)failures.push(result);results.push(result);
}
for(const [stationId,machine]of machines){
 const rules=machine.getEquipmentOptions?.().adjustments||[];if(!rules.length)continue;const defaults=machine.getEquipmentSettings(),configs=[defaults];
 for(const rule of rules)for(const value of [rule.min,rule.max])configs.push({...defaults,[rule.key]:value});
 if('plateLoadKg'in defaults)configs.push({...defaults,plateLoadKg:38.75});
 if('gripWidthCm'in defaults)for(const seatHeightCm of [62,66])for(const gripWidthCm of [76,84])configs.push({...defaults,seatHeightCm,gripWidthCm});
 let lifecycle;
 for(const settings of configs)check(`machine-${stationId}`,settings,{start:s=>{if(!machine.setEquipmentSettings(s).ok)throw Error(stationId);machine.setLifecycleState?.({open:0});lifecycle=createMachineLifecycle({THREE,machine,metrics});},frame:(direction,phase)=>lifecycle.sample(direction,phase),contacts:()=>machine.getActualContacts(),volumes:()=>machine.getCollisionVolumes()});
 machine.setEquipmentSettings(defaults);
}
for(const id of CABLE_CALIBRATION_IDS){
 const defaults=rig.getEquipmentSettings(id),configs=[defaults];for(const rule of equipmentOptionsFor(id).adjustments)for(const value of [rule.min,rule.max])configs.push({...defaults,[rule.key]:value});if(id==='rope-pushdown')configs.push({...defaults,handle:'straight-bar',pulleyHeightCm:204},{...defaults,handle:'straight-bar',pulleyHeightCm:224});
 for(const settings of configs)check(id,settings,{start:s=>{rig.end({keepVisible:false});if(!rig.setEquipmentSettings(id,s).ok)throw Error(id);rig.prepare(id);},frame:(direction,phase)=>rig.sampleLifecycle(id,direction,phase),contacts:()=>rig.getActualContacts(id),volumes:()=>rig.getCollisionVolumes(id),end:()=>rig.end({keepVisible:false})});rig.setEquipmentSettings(id,defaults);
}
const final=hashes(),changedSources=files.filter(path=>sourceHashes[path]!==final[path]),report={pass:!failures.length&&!changedSources.length,pilot,phases,sourceHashes,changedSources,results,failures,scope:'Actual production human, both complete entry and exit at the configured seat/grip/pulley/load endpoints and representative combinations; full run additionally samples actual deformed skin. Finite numerical coverage is not professional biomechanics review.'};mkdirSync('artifacts/equipment-settings-v013',{recursive:true});const file=`artifacts/equipment-settings-v013/lifecycles-${pilot?'pilot':'qualification'}.json`;writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({file,pass:report.pass,configurations:results.length,poses:results.reduce((n,r)=>n+r.poses,0),changedSources,failures}));character.dispose();if(!report.pass)process.exitCode=1;
