import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {THREE,metrics,character} from './dumbbell-test-helpers.mjs';
import {createActivityRig} from '../.local-tools/v011-before/src/extended-rig.js';
import {CHANGED_DB_GRIPS_V013,protectedDumbbellPoseV013,protectedDumbbellFrameV013,physicalDumbbellStateV013} from './legacy-grip-contract-v013.mjs';

const originalPath='tests/fixtures/legacy-rig-v011.json',original=JSON.parse(readFileSync(originalPath)),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),rig=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics}),motions={};
for(const id of CHANGED_DB_GRIPS_V013){
 const loops=original.phases.map(p=>rig.sample(id,p,p));
 assert.equal(hash(loops),original.motions[id].loop,`${id}: archived rig must first reproduce the original full loop hash`);
 assert.equal(hash(rig.getLifecycle(id)),original.motions[id].metadata,`${id}: archived metadata must match the existing fixture`);
 const lifecycle=['enter','exit'].flatMap(mode=>original.phases.map(p=>rig.sampleLifecycle(id,mode,p)));
 if(id!=='dumbbell-bench-press')assert.equal(hash(lifecycle),original.motions[id].lifecycle,`${id}: archived full lifecycle must match`);
 motions[id]={protectedLoop:hash(loops.map(pose=>protectedDumbbellPoseV013(pose))),originalHandProfile:hash(loops.map(pose=>pose.handFingerFlex)),physicalLoops:hash(original.phases.map(p=>{rig.sample(id,p,p);return physicalDumbbellStateV013(rig,id);})),...(id==='dumbbell-bench-press'?{}:{protectedLifecycle:hash(lifecycle.map(protectedDumbbellFrameV013))})};
}
rig.end({keepVisible:false});assert.ok(rig.setEquipmentSettings('dumbbell-bench-press',{benchAngle:30}).ok);
const bench30=original.phases.map(p=>rig.sample('dumbbell-bench-press',p,p));assert.equal(hash(bench30),original.bench30,'30° archived full pose hash must match');
const report={source:'Only the unchanged fields of the original v0.10 full-hash fixture; never a recapture of the new grip.',originalFixture:{path:originalPath,sha256:createHash('sha256').update(readFileSync(originalPath)).digest('hex')},phases:original.phases,archivedSourceHashes:Object.fromEntries(['src/extended-rig.js','src/dumbbell-grip.js','src/rig-lifecycle.js','src/skinned-character.js'].map(path=>[path,createHash('sha256').update(readFileSync('.local-tools/v011-before/'+path)).digest('hex')])),motions,bench30:{protectedLoop:hash(bench30.map(pose=>protectedDumbbellPoseV013(pose))),physicalLoops:hash(original.phases.map(p=>{rig.sample('dumbbell-bench-press',p,p);return physicalDumbbellStateV013(rig,'dumbbell-bench-press');}))}};
writeFileSync('tests/fixtures/legacy-grip-protected-v013.json',JSON.stringify(report,null,2)+'\n');character.dispose();console.log('Original full hashes verified; scoped legacy projections captured.');
