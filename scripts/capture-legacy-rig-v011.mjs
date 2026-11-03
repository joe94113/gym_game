import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {THREE,metrics,character} from './dumbbell-test-helpers.mjs';
import {createActivityRig} from '../.local-tools/v011-before/src/extended-rig.js';
import {exercises} from '../.local-tools/v011-before/src/exercises.js';
import {extendedExercises} from '../.local-tools/v011-before/src/extended-exercises.js';

const rig=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics}),phases=[0,.17,.43,.71,1],hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),motions={};
for(const {id}of [...exercises,...extendedExercises])motions[id]={loop:hash(phases.map(p=>rig.sample(id,p,p))),metadata:hash(rig.getLifecycle(id)),...(id==='dumbbell-bench-press'?{}:{lifecycle:hash(['enter','exit'].flatMap(mode=>phases.map(p=>rig.sampleLifecycle(id,mode,p))))})};
rig.end({keepVisible:false});rig.setEquipmentSettings('dumbbell-bench-press',{benchAngle:30});
const bench30=hash(phases.map(p=>rig.sample('dumbbell-bench-press',p,p))),modelSha256=createHash('sha256').update(readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url))).digest('hex');
mkdirSync(new URL('../tests/fixtures',import.meta.url),{recursive:true});writeFileSync(new URL('../tests/fixtures/legacy-rig-v011.json',import.meta.url),JSON.stringify({source:'frozen v0.10.0 before v0.11 work',exception:'Only flat-bench lifecycle seating height may improve; its loop remains exact.',phases,modelSha256,motions,bench30},null,2)+'\n');character.dispose();
