import {character,rig} from './dumbbell-test-helpers.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const baseline=JSON.parse(readFileSync('artifacts/v010-dumbbell-fingerprint-before.json')),results=[];
const sourcePaths=['src/dumbbell-lifecycle-paths.js','src/dumbbell-grip.js','src/free-dumbbell-shaft.js','src/rig-lifecycle.js','src/extended-rig.js','src/incline-bench.js','src/skinned-character.js','public/models/athlete/athlete.glb'];
const fileHash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,fileHash(p)]));
for(const c of baseline.cases){
 rig.end({keepVisible:false});if(c.settings)rig.setEquipmentSettings(c.id,c.settings);rig.prepare(c.id);
 const samples=c.samples.filter(s=>s.mode==='loop'),differences=[];
 for(const s of samples){
  const frame={pose:rig.sample(c.id,s.phase,s.phase),offset:[0,0,0],contacts:{hands:c.id==='dumbbell-single-arm-row'?[false,true]:[true,true],feet:[true,true]},stage:'exercise'};
  character.pose(frame.pose);const body=character.getContactPoints(),targets=rig.getActualContacts(c.id),actual=hash({frame,body,gear:rig.getLifecycleState(c.id),targets,colliders:rig.getCollisionVolumes(c.id)});
  if(actual!==s.hash)differences.push({phase:s.phase,before:s.hash,after:actual});
 }
 results.push({id:c.id,settings:c.settings,count:samples.length,differences,pass:!differences.length});
}
const changedSources=sourcePaths.filter(p=>fileHash(p)!==sourceHashes[p]),pass=results.every(r=>r.pass)&&!changedSources.length;
writeFileSync('artifacts/v010-dumbbell-loop-preservation.json',JSON.stringify({pass,sourceHashes,baselineSourceHashes:baseline.hashes,changedSources,count:results.reduce((n,r)=>n+r.count,0),scope:'Exact same sampled exercise poses, true GLB contacts, physical prop transforms and collision volumes; includes both 0 and 30 degree bench settings. Only new entry/exit paths may change.',results},null,2));
console.log(JSON.stringify({pass,count:results.reduce((n,r)=>n+r.count,0),differences:results.reduce((n,r)=>n+r.differences.length,0)}));character.dispose();if(!pass)process.exitCode=1;
