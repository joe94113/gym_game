import {stations} from './data.js';
import {exercises} from './exercises.js';
import {extendedExercises} from './extended-exercises.js';
import {cableExercisesV011} from './cable-exercises-v011.js';
import {reverseFlyActivity} from './additional-equipment-data.js';
import {groupClassActivities,groupWarmupActivity} from './classes/class-data.js';

const canonicalMachine=new Map();
for(const station of stations)if(!canonicalMachine.has(station.type))canonicalMachine.set(station.type,station.id);
const ordinary=stations.filter(station=>!['dumbbellCurl','stretchZone','facility'].includes(station.type)).map(station=>({
  ...station,id:`machine-${station.id}`,stationId:station.id,runtime:'machine',
  movementId:`machine-${canonicalMachine.get(station.type)}`,
  category:station.category==='cardio'?'cardio':'strength',side:'both',
  duration:station.category==='cardio'?4:6,attachmentId:station.plateLoaded?'plate-loaded-mechanism':'machine-handles',
  setupLabel:station.equipmentTag||station.name,
  ...(station.type==='cableFly'?{name:'D 形手把夾胸',attachmentId:'dual-d-handles',setupLabel:'雙滑輪・D 形手把'}:{}),
  ...(station.id==='pec-deck'?{name:'蝴蝶機夾胸',attachmentId:'pec-deck-handles',setupLabel:'靠穩背墊・夾胸'}:{}),
}));

const facilities=stations.filter(station=>station.type==='facility').map(station=>({...station,stationId:station.id,runtime:'facility',duration:station.duration||10,side:'both',muscleKeys:station.muscleKeys||[],secondaryMuscleKeys:station.secondaryMuscleKeys||[],...(station.id==='group-class'?groupWarmupActivity:{})}));
export const activities=[...exercises.map(exercise=>({...exercise,runtime:'rig',movementId:exercise.id})),...[...extendedExercises,...cableExercisesV011].map(exercise=>({...exercise,runtime:'rig',movementId:exercise.id})),...ordinary,{...reverseFlyActivity,movementId:reverseFlyActivity.id},...facilities.map(facility=>({...facility,movementId:facility.id})),...groupClassActivities];
// Multiple installed treadmills are places to do the same learned movement.
// Keep an activity for each interaction point while showing one library entry.
const listed=new Set();
export const catalogActivities=activities.filter(activity=>{if(listed.has(activity.movementId))return false;listed.add(activity.movementId);return true;});
export const activityById=id=>activities.find(activity=>activity.id===id);
export const activitiesForStation=stationId=>activities.filter(activity=>activity.stationId===stationId);
