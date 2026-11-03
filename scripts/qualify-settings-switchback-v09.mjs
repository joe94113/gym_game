import {character,rig} from './dumbbell-test-helpers.mjs';
import {exercises} from '../src/exercises.js';
import {extendedExercises} from '../src/extended-exercises.js';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const ids=[...exercises,...extendedExercises].map(e=>e.id),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function defaults(){const frames=[];for(const id of ids){rig.prepare(id);for(const mode of ['loop','enter','exit'])for(let i=0;i<=100;i++){const phase=i/100,frame=mode==='loop'?{pose:rig.sample(id,phase,phase),offset:[0,0,0],rotation:0}:rig.sampleLifecycle(id,mode,phase);character.pose(frame.pose);frames.push({id,mode,phase,hash:hash({frame,body:character.getContactPoints(),markers:rig.getActualContacts(id),gear:rig.getLifecycleState(id),colliders:rig.getCollisionVolumes(id),navigation:rig.getNavigationVolumes(id)})});}}rig.end({keepVisible:false});return frames;}
const before=defaults(),switches=[];
for(let round=0;round<3;round++)for(const [id,settings]of [['dumbbell-bench-press',{benchAngle:30}],['rope-pushdown',{handle:'straight-bar'}]]){
 const changed=rig.setEquipmentSettings(id,settings);if(!changed.ok)throw new Error(JSON.stringify(changed));rig.prepare(id);for(const mode of ['enter','loop','exit'])for(let i=0;i<=100;i++)mode==='loop'?rig.sample(id,i/100):rig.sampleLifecycle(id,mode,i/100);rig.end({keepVisible:true});switches.push({id,settings});
 rig.setEquipmentSettings('dumbbell-bench-press',{benchAngle:0});rig.setEquipmentSettings('rope-pushdown',{handle:'triceps-rope'});
}
const after=defaults(),differences=after.filter((frame,i)=>frame.hash!==before[i].hash),pass=!differences.length&&before.length===after.length;
const report={pass,count:before.length,switches,beforeHash:hash(before),afterHash:hash(after),differences,scope:'Actual production rig/GLB. All 22 default profiles before and after three complete uses and idle switches of each configured incline and straight-bar profile; compare every loop/enter/exit 101 phases, exact poses, skeleton contacts, gear, collider and navigation data.'};
writeFileSync('artifacts/v09-settings-switchback-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass,count:before.length,differences:differences.length}));character.dispose();if(!pass)process.exitCode=1;
