import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {exercises} from '../src/exercises.js';
import {extendedExercises} from '../src/extended-exercises.js';
const ids=[...exercises,...extendedExercises].filter(e=>e.stationId!=='dumbbell-curl').map(e=>e.id),sources=['src/rig-lifecycle.js','src/extended-rig.js','src/exercise-rig.js','src/dumbbell-grip.js','src/dumbbell-lifecycle-paths.js'],hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),sourceHashes=Object.fromEntries(sources.map(p=>[p,hash(p)]));
// The optional report name preserves historical evidence during v0.8 checks.
const result=spawnSync(process.execPath,['scripts/qualify-rig-lifecycles.mjs',...ids],{cwd:process.cwd(),env:{...process.env,FORM_PHASE_COUNT:'101',FORM_SURFACE:'1',FORM_SURFACE_COUNT:'101',FORM_SURFACE_STRIDE:'24',FORM_REPORT_NAME:'v08-nondumbbell-life-detail.json'},encoding:'utf8'});
const changedSources=sources.filter(p=>hash(p)!==sourceHashes[p]),report=JSON.parse(readFileSync('artifacts/v08-nondumbbell-life-detail.json')),pass=result.status===0&&!changedSources.length;
writeFileSync('artifacts/nondumbbell-rig-regression-v08.json',JSON.stringify({pass,sourceHashes,changedSources,status:result.status,ids,scope:'All non-DB custom rig lifecycles: both directions, 101 frames each, fixed human skeleton, body/self, skin stride24 at every frame, true shoe-floor support. This checks the cable/stretch branches that share rig-lifecycle.js.',...report},null,2));
console.log(JSON.stringify({pass,status:result.status,ids,summary:report.results.map(r=>({id:r.id,reach:r.maxReachError,contact:r.maxContactError,collisions:r.collisions.length,self:r.selfCollisions.length,skin:r.surfaceCollisions.length,feet:r.footSupportErrors.length,props:r.propDiscontinuities.length})),changedSources}));if(!pass){console.error(result.stderr);process.exitCode=1;}
