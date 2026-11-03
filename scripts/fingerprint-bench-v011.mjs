import {createBenchFixtureV011} from './bench-fixture-v011.mjs';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const mode=process.argv[2]||'compare',before=mode==='before';
if(before&&existsSync('artifacts/v011-bench-before.json'))throw Error('The sealed v011 bench baseline must not be overwritten.');
const {character,rig,root}=await createBenchFixtureV011({before}),id='dumbbell-bench-press',hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),files=['src/incline-bench.js','src/equipment-options.js','src/extended-rig.js','src/dumbbell-lifecycle-paths.js','src/dumbbell-grip.js','src/free-dumbbell-shaft.js','src/rig-lifecycle.js','src/skinned-character.js','src/hand-contact-frame.js','public/models/athlete/athlete.glb'],fileHash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex'),hashes=Object.fromEntries(files.map(p=>[p,fileHash(p)])),samples=[];
for(const angle of [0,30]){
 rig.end({keepVisible:false});rig.setEquipmentSettings(id,{benchAngle:angle});rig.prepare(id);const meta=rig.getLifecycle(id);
 for(const mode of ['loop','enter','exit']){
  const phases=new Set(Array.from({length:301},(_,i)=>i/300));if(mode!=='loop'){let seconds=0;for(const stage of meta.stages){seconds+=stage.duration;const boundary=mode==='enter'?seconds:meta.entryDuration-seconds;if(boundary>0&&boundary<meta.entryDuration)for(const delta of [-.0001,0,.0001])phases.add((boundary+delta)/meta.entryDuration);}}
  for(const phase of [...phases].sort((a,b)=>a-b)){
   const frame=mode==='loop'?{pose:rig.sample(id,phase,phase),offset:[0,0,0],stage:'exercise'}:rig.sampleLifecycle(id,mode,phase);character.pose(frame.pose);
   const body=character.getContactPoints(),hands=character.getHandDiagnostics(),gear=rig.getLifecycleState(id),targets=rig.getActualContacts(id),colliders=rig.getCollisionVolumes(id),value={frame,body,hands,gear,targets,colliders};
   if(Math.abs(phase*10-Math.round(phase*10))<1e-9)value.skin=character.getSurfaceSamples({stride:24});
   samples.push({angle,mode,phase,hash:hash(value)});
  }
 }
}
const changedSources=files.filter(p=>fileHash(p)!==hashes[p]);
if(before){writeFileSync('artifacts/v011-bench-before.json',JSON.stringify({hashes,changedSources,samples},null,2));console.log(JSON.stringify({mode,count:samples.length,changedSources}));}
else{
 const baseline=JSON.parse(readFileSync('artifacts/v011-bench-before.json')),differences=samples.filter((s,i)=>s.hash!==baseline.samples[i]?.hash||s.angle!==baseline.samples[i]?.angle||s.mode!==baseline.samples[i]?.mode||s.phase!==baseline.samples[i]?.phase),unexpected=differences.filter(s=>s.angle!==0||s.mode==='loop'),protectedCount=samples.filter(s=>s.angle!==0||s.mode==='loop').length,pass=!unexpected.length&&!changedSources.length&&samples.length===baseline.samples.length;
 writeFileSync('artifacts/v011-bench-preservation.json',JSON.stringify({pass,scope:'Exact 0/30 degree exercise loops and complete 30-degree entry/exit, production GLB joints/palm diagnostics/physical props/colliders, critical skin samples. Only the flat-bench entry/exit seat landing is intentionally corrected; equipment settings UI metadata excluded.',baselineHashes:baseline.hashes,currentHashes:hashes,changedSources,count:samples.length,protectedCount,protectedMatchingCount:protectedCount-unexpected.length,intendedDifferences:differences.filter(s=>s.angle===0&&s.mode!=='loop'),unexpected},null,2));console.log(JSON.stringify({mode,pass,count:samples.length,protectedCount,intendedDifferences:differences.length-unexpected.length,unexpected:unexpected.length,changedSources}));if(!pass)process.exitCode=1;
}
character.dispose();if(changedSources.length)process.exitCode=1;
