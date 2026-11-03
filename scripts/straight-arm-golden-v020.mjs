import {createMocapFixtureV018} from './mocap-fixture-v018.mjs';
import {exercises} from '../src/exercises.js';
import {extendedExercises} from '../src/extended-exercises.js';
import {cableExercisesV011} from '../src/cable-exercises-v011.js';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const target='cable-straight-arm-pulldown',golden='artifacts/public-teaching-v020/unaffected-rig-before.json';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function collectUnchangedRigV020(){
 const f=await createMocapFixtureV018(),rows=[];
 try{for(const {id} of [...exercises,...extendedExercises,...cableExercisesV011].filter(x=>x.id!==target)){
  f.rig.prepare(id);const frames=[];
  for(const mode of ['loop','enter','exit'])for(const phase of [0,.13,.5,.83,1]){
   const frame=mode==='loop'?{pose:f.rig.sample(id,phase,0),offset:[0,0,0]}:f.rig.sampleLifecycle(id,mode,phase);
   f.character.pose(frame.pose);
   frames.push({mode,phase,pose:frame.pose,offset:frame.offset,contacts:f.rig.getActualContacts(id),volumes:f.rig.getCollisionVolumes(id),gear:f.rig.getLifecycleState(id),body:f.character.getContactPoints(),skin:f.character.getSurfaceSamples({stride:97})});
  }
  rows.push({id,frames:frames.length,sha256:sha(frames)});f.rig.end({keepVisible:false});
 }}finally{f.character.dispose();}return rows;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const rows=await collectUnchangedRigV020();mkdirSync('artifacts/public-teaching-v020',{recursive:true});
 if(process.argv.includes('--record')){writeFileSync(golden,JSON.stringify({recordedAt:new Date().toISOString(),source:sha(readFileSync('src/cable-stages-v011.js','utf8')),rows},null,2));console.log(JSON.stringify({recorded:true,activities:rows.length,frames:rows.reduce((s,r)=>s+r.frames,0)}));}
 else{const before=JSON.parse(readFileSync(golden)),changes=rows.filter(row=>before.rows.find(r=>r.id===row.id)?.sha256!==row.sha256),pass=!changes.length&&before.rows.length===rows.length;console.log(JSON.stringify({pass,activities:rows.length,changes}));if(!pass)process.exitCode=1;}
}
