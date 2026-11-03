import {activityById} from './activity-catalog.js';

const movementOf=value=>typeof value==='object'&&value?value.movementId||activityById(value.id)?.movementId||value.id:activityById(value)?.movementId||value;
/** Exploration steps are separate from the global movement-learning Set.
 * The same machine can be visited for warm-up and again for cooldown. */
export function createTrainingRoute(plan){
 const steps=(plan?.steps||[]).map((step,index)=>({...step,key:`step-${index}:${step.stage}:${step.id}`,index,movementId:movementOf(step.id)}));
 return{steps,cursor:0,completedKeys:[]};
}
export function currentTrainingRouteStep(route){return route?.steps?.[route.cursor]||null;}
export function trainingStepMatchesActivity(step,activity){return !!step&&step.movementId===movementOf(activity);}
export function trainingRouteProgress(route){
 const steps=route?.steps||[],keys=new Set(route?.completedKeys||[]),done=steps.filter(step=>keys.has(step.key)).length;
 return{done,total:steps.length,complete:steps.length>0&&done===steps.length,current:currentTrainingRouteStep(route)};
}
export function selectTrainingRouteStep(route,key){
 const index=route?.steps?.findIndex(step=>step.key===key)??-1;return index<0?route:{...route,cursor:index};
}
export function acknowledgeTrainingRouteStep(route,activity){
 const step=currentTrainingRouteStep(route);
 if(!trainingStepMatchesActivity(step,activity))return{route,acknowledged:false,added:false,step:null,nextStep:step,complete:trainingRouteProgress(route).complete};
 const completed=new Set(route.completedKeys),added=!completed.has(step.key);completed.add(step.key);
 let cursor=route.steps.findIndex((candidate,index)=>index>route.cursor&&!completed.has(candidate.key));
 if(cursor<0)cursor=route.steps.findIndex(candidate=>!completed.has(candidate.key));if(cursor<0)cursor=route.steps.length;
 const next={...route,cursor,completedKeys:[...completed]};
 return{route:next,acknowledged:true,added,step,nextStep:currentTrainingRouteStep(next),complete:trainingRouteProgress(next).complete};
}
