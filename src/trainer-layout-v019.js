// The existing desk, consultation and class roles keep their runtime IDs.
// Every portrait is bound once; extra coaches stand outside the equipment bays.
export const trainerBindings=Object.freeze([
 {coachId:'coach-1',actorId:'trainer-desk-staff'},
 {coachId:'coach-2',actorId:'consultation-1'},
 ...[3,4,5,6,7,8,9,10,11,12,13].map(i=>({coachId:`coach-${i}`,actorId:`floor-coach-${i}`})),
 {coachId:'coach-14',actorId:'class-instructor'},
 ...[15,16].map(i=>({coachId:`coach-${i}`,actorId:`floor-coach-${i}`})),
].map(Object.freeze));

export const floorTrainerPlacements=Object.freeze([
 [3,-32,0,Math.PI/2,'demonstrating','自由重量區'],
 [4,-34.2,-17.2,Math.PI/2,'observing','有氧區旁'],
 [5,-17,-.5,-Math.PI/2,'explaining','自由重量區'],
 [6,-29,10,0,'demonstrating','草皮區旁'],
 [7,-21,16.5,Math.PI,'observing','伸展區旁'],
 [8,-31.5,16.5,Math.PI/2,'explaining','草皮區旁'],
 [9,-7,14.4,0,'reading','接待區'],
 [10,12,5.8,-Math.PI/2,'explaining','槓片區旁'],
 [11,4.2,.1,0,'demonstrating','固定器材走道'],
 [12,-1.8,13.7,Math.PI/2,'reading','教練服務區'],
 [13,25.8,6,-Math.PI/2,'observing','槓片區旁'],
 [15,-18,-6,Math.PI/2,'explaining','自由重量區'],
 [16,11.8,-7.7,Math.PI/2,'reading','器材走道'],
].map(([index,x,z,rotation,gesture,location])=>Object.freeze({coachId:`coach-${index}`,actorId:`floor-coach-${index}`,index,x,z,rotation,gesture,location,clearanceRadius:.7})));

export function trainerBindingForActor(id){return trainerBindings.find(binding=>binding.actorId===id)||null;}
export function trainerActorForCoach(id){return trainerBindings.find(binding=>binding.coachId===id)?.actorId||null;}
export function trainerLocationForCoach(id){return floorTrainerPlacements.find(item=>item.coachId===id)?.location??({'coach-1':'教練服務櫃台','coach-2':'接待區面談座位','coach-14':'團體教室'})[id]??null;}
export function createFloorTrainerAnchors(floorHeight=()=>0){return floorTrainerPlacements.map(item=>({...item,position:[item.x,floorHeight(item.x,item.z),item.z],role:'floor-trainer',fixtureVolumes:[]}));}
export function trainerMetadataForActor(id,roster=[]){const binding=trainerBindingForActor(id),coach=roster.find(item=>item.id===binding?.coachId);return coach?{coachId:coach.id,coachName:coach.name,specialty:coach.specialty,portraitIndex:coach.portraitIndex}:{};}

function distance(a,b){const ax=Array.isArray(a)?a[0]:a?.x,ay=Array.isArray(a)?a[1]:a?.y,az=Array.isArray(a)?a[2]:a?.z,bx=Array.isArray(b)?b[0]:b?.x,by=Array.isArray(b)?b[1]:b?.y,bz=Array.isArray(b)?b[2]:b?.z;return Number.isFinite(ax)&&Number.isFinite(ay)&&Number.isFinite(az)&&Number.isFinite(bx)&&Number.isFinite(by)&&Number.isFinite(bz)?Math.hypot(ax-bx,ay-by,az-bz):null;}
/** Near people are protected by either camera or player distance. Visibility
 * affects background work only; an active class always follows its course. */
export function trainerUpdateBudget({position,cameraPosition,playerPosition,quality='clear',visible=true,classActor=false,required=false,roomUpdating=true}){
 if(classActor)return{hz:required||roomUpdating?0:-1,visible:required||visible,reason:required?'active-class':roomUpdating?'class-frame':'sleeping-room'};
 if(quality==='clear')return{hz:15,visible:true,reason:'detail-mode'};
 const cameraDistance=distance(position,cameraPosition),playerDistance=distance(position,playerPosition),near=cameraDistance===null?(playerDistance??0):playerDistance===null?cameraDistance:Math.min(cameraDistance,playerDistance);
 if(near<10)return{hz:15,visible:true,reason:'near'};
 if(!visible||near>42)return{hz:-1,visible:false,reason:!visible?'outside-view':'distance'};
 if(near<20)return{hz:quality==='flow'?10:15,visible:true,reason:'middle'};
 return{hz:quality==='flow'?4:7.5,visible:true,reason:'distant'};
}
