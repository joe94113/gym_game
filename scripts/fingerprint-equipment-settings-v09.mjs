import {character,rig} from './dumbbell-test-helpers.mjs';
import {DUMBBELL_IDS} from '../src/dumbbell-grip.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex'),sources=['src/rig-lifecycle.js','src/dumbbell-grip.js','src/dumbbell-lifecycle-paths.js','src/extended-rig.js','src/skinned-character.js'],sourceHashes=Object.fromEntries(sources.map(p=>[p,hash(readFileSync(p,'utf8'))])),frames=[];
for(const id of DUMBBELL_IDS){rig.prepare(id);for(const mode of ['loop','enter','exit'])for(let i=0;i<=100;i++){const phase=i/100,frame=mode==='loop'?{pose:rig.sample(id,phase,phase),offset:[0,0,0],rotation:0}:rig.sampleLifecycle(id,mode,phase);character.pose(frame.pose);const value={frame,markers:rig.getActualContacts(id),bones:character.getContactPoints(),gear:rig.getLifecycleState(id),colliders:rig.getCollisionVolumes(id),navigation:rig.getNavigationVolumes(id)};frames.push({id,mode,phase,hash:hash(value)});}}
const record={sourceHashes,count:frames.length,hash:hash(frames),frames},mode=process.argv[2]||'baseline';
if(mode==='baseline'){writeFileSync('artifacts/v09-db-settings-default-before.json',JSON.stringify(record,null,2));console.log(JSON.stringify({mode,count:record.count,hash:record.hash}));}
else{const baseline=JSON.parse(readFileSync('artifacts/v09-db-settings-default-before.json')),differences=frames.filter((f,i)=>f.hash!==baseline.frames[i]?.hash),pass=!differences.length&&frames.length===baseline.count;writeFileSync('artifacts/v09-db-settings-default-equivalence.json',JSON.stringify({pass,baselineSourceHashes:baseline.sourceHashes,currentSourceHashes:sourceHashes,baselineHash:baseline.hash,currentHash:record.hash,count:frames.length,differences},null,2));console.log(JSON.stringify({pass,count:frames.length,differences:differences.length,hash:record.hash}));if(!pass)process.exitCode=1;}
character.dispose();
