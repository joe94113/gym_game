import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {character,rig,machines} from './equipment-settings-v013-test-helpers.mjs';
import {equipmentOptionsFor} from '../src/equipment-options.js';
import {CABLE_CALIBRATION_IDS} from '../src/equipment-calibration-v013.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
const pilot=process.argv.includes('--pilot'),phases=pilot?11:101,results=[],failures=[];
const files=['src/equipment.js','src/additional-equipment.js','src/equipment-options.js','src/equipment-calibration-v013.js','src/extended-rig.js','src/exercise-rig.js','src/cable-stages-v011.js','src/straight-bar-pushdown.js','src/rig-lifecycle.js','src/skinned-character.js','src/dumbbell-grip.js','public/models/athlete/athlete.glb'];
const hashes=()=>Object.fromEntries(files.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),sourceHashes=hashes();
function qualify(id,settings,runner){
 const result={id,settings,poses:0,maxContactError:0,maxReachError:0,collisions:[],self:[],surface:[]};runner.start(settings);
 for(let i=0;i<phases;i++){
  const phase=i/(phases-1),pose=runner.sample(phase);character.pose(pose);const body=character.getContactPoints(),contacts=runner.contacts(),volumes=runner.volumes();result.poses++;
  result.maxReachError=Math.max(result.maxReachError,body.maxReachError);
  for(const kind of ['hands','feet'])for(let side=0;side<2;side++)if(contacts?.[kind]?.[side])result.maxContactError=Math.max(result.maxContactError,Math.hypot(...contacts[kind][side].map((value,j)=>value-body[kind][side][j])));
  for(const [key,check]of [['collisions',evaluateExerciseClearance(body,volumes)],['self',evaluateSelfClearance(body)]])for(const hit of check.collisions)if(!result[key].some(old=>old.bodyPart===hit.bodyPart&&old.volumeId===hit.volumeId))result[key].push({...hit,phase});
  if(!pilot&&i%10===0)for(const hit of evaluateSurfaceClearance(character.getSurfaceSamples({stride:20}),volumes).collisions)if(!result.surface.some(old=>old.bodyPart===hit.bodyPart&&old.volumeId===hit.volumeId))result.surface.push({...hit,phase});
 }
 runner.end?.();result.pass=result.maxContactError<.015&&result.maxReachError<.015&&!result.collisions.length&&!result.self.length&&!result.surface.length;if(!result.pass)failures.push({id,settings,maxReachError:result.maxReachError,collisions:result.collisions,self:result.self,surface:result.surface});results.push(result);
}
for(const [stationId,machine]of machines){
 const id=`machine-${stationId}`,rules=machine.getEquipmentOptions?.().adjustments||[];if(!rules.length)continue;
 const defaults=machine.getEquipmentSettings(),configs=[defaults];
 for(const rule of rules)for(const value of [rule.min,rule.max])configs.push({...defaults,[rule.key]:value});
 if('plateLoadKg'in defaults)configs.push({...defaults,plateLoadKg:38.75});
 if(rules.some(rule=>rule.key==='seatHeightCm')&&rules.some(rule=>rule.key==='gripWidthCm'))for(const seat of [rules.find(r=>r.key==='seatHeightCm').min,rules.find(r=>r.key==='seatHeightCm').max])for(const width of [76,84])configs.push({...defaults,seatHeightCm:seat,gripWidthCm:width});
 for(const settings of configs)qualify(id,settings,{start:s=>{const changed=machine.setEquipmentSettings(s);if(!changed.ok)throw Error(`invalid ${id}: ${JSON.stringify(s)}`);machine.setLifecycleState?.({open:0});},sample:p=>machine.sampleActivity(p,p),contacts:()=>machine.getActualContacts(),volumes:()=>machine.getCollisionVolumes()});
 machine.setEquipmentSettings(defaults);
}
for(const id of CABLE_CALIBRATION_IDS){
 const defaults=rig.getEquipmentSettings(id),rules=equipmentOptionsFor(id).adjustments,configs=[defaults];
 for(const rule of rules)for(const value of [rule.min,rule.max])configs.push({...defaults,[rule.key]:value});
 if(id==='rope-pushdown')configs.push({...defaults,handle:'straight-bar',pulleyHeightCm:204},{...defaults,handle:'straight-bar',pulleyHeightCm:224});
 for(const settings of configs)qualify(id,settings,{start:s=>{rig.end({keepVisible:false});if(!rig.setEquipmentSettings(id,s).ok)throw Error(`invalid ${id}`);rig.prepare(id);},sample:p=>rig.sample(id,p,p),contacts:()=>rig.getActualContacts(id),volumes:()=>rig.getCollisionVolumes(id),end:()=>rig.end({keepVisible:false})});
 rig.setEquipmentSettings(id,defaults);
}
const final=hashes(),changedSources=files.filter(path=>sourceHashes[path]!==final[path]),report={pass:!failures.length&&!changedSources.length,pilot,phases,sourceHashes,changedSources,results,failures,scope:'Actual production human GLB, installed machine and rig calibration endpoints, combinations, whole movement loops; full run additionally samples actual skin. Lifecycle configurations require separate root review.'};mkdirSync('artifacts/equipment-settings-v013',{recursive:true});const file=`artifacts/equipment-settings-v013/${pilot?'pilot':'qualification'}.json`;writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({file,pass:report.pass,configurations:results.length,poses:results.reduce((n,r)=>n+r.poses,0),failures}));character.dispose();if(!report.pass)process.exitCode=1;
