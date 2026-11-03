import {transitionCaptureClips,sampleTransitionCapture} from './captured-transition-data-v018.js';

const DB_IDS=new Set(['dumbbell-curl','dumbbell-bench-press','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-goblet-squat','dumbbell-romanian-deadlift']);
const SEATED_TYPES=new Set(['chestPress','shoulderPress','latPulldown','seatedRow','legExtension','legCurl','pecDeck','plateInclinePress','plateShoulderPress','plateHighRow']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),clamp=x=>Math.max(0,Math.min(1,x));
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const grip=(pose,i)=>pose.handGripStrength?.[i]??((pose.handGripping?.[i]??pose.gripping??true)?1:0);
const meanHandY=pose=>pose.hands.reduce((sum,p)=>sum+p[1],0)/pose.hands.length-pose.hip[1];
const plane=pose=>[0,1].map(i=>pose.handNormals?.[i]||null);
const no=reason=>({applied:false,reason});
const choose=(role,seed)=>{const clips=transitionCaptureClips.filter(clip=>clip.role===role);let hash=0;for(const c of seed)hash=(hash*31+c.charCodeAt(0))>>>0;return clips[hash%clips.length];};

/** Select real measured scalar tempo for an already calibrated path. No source
 * actor pose, bone length, hand target, duration or equipment state is copied. */
export function planCapturedTransition({domain,id,type,from,to,stage='',walk=false,stepFeet=false,kind=null,fromHeld=false,toHeld=false,fromGear,toGear,clipping=false,stateA,stateB,gripChange=null}={}){
  if(domain==='dumbbell'?!DB_IDS.has(id):domain==='machine'?!SEATED_TYPES.has(type):true)return no('unsupported-activity');
  if(walk||stepFeet||['walk','step','turn'].includes(kind))return no('walking-stepping-or-turning');
  if(!from||!to||!finitePoint(from.hip)||!finitePoint(to.hip)||!finitePoint(from.shoulder)||!finitePoint(to.shoulder)||!from.feet?.every(finitePoint)||!to.feet?.every(finitePoint)||from.feet.length!==2||to.feet.length!==2)return no('missing-pose');
  if(from.feet.some((p,i)=>distance(p,to.feet[i])>1e-7))return no('feet-move');
  for(const key of ['footDirections','footNormals'])if([0,1].some(i=>distance(from[key]?.[i]||(key==='footNormals'?[0,1,0]:[0,0,1]),to[key]?.[i]||(key==='footNormals'?[0,1,0]:[0,0,1]))>(key==='footDirections'?.15:1e-7)))return no('foot-frame-changes');
  if(Math.abs((from.yaw||0)-(to.yaw||0))>1e-7)return no('turning');
  if(clipping||!!fromHeld!==!!toHeld||fromGear!==toGear||!same(stateA,stateB))return no('attachment-or-mechanism-changes');
  if(gripChange&&Math.abs(gripChange[0]-gripChange[1])>1e-8)return no('grip-changes');
  if([0,1].some(i=>Math.abs(grip(from,i)-grip(to,i))>1e-7))return no('grip-changes');
  for(const key of ['dbSettleToExercise','dbFreeShaftWeight','dbNaturalGrip'])if((from[key]||0)!==(to[key]||0))return no('grip-frame-changes');
  const fromPlanes=plane(from),toPlanes=plane(to);
  if([...fromPlanes,...toPlanes].some(p=>p&&Math.abs(p[1])>.8)&&!same(fromPlanes,toPlanes))return no('hand-support-frame-changes');
  if(/後躺|背部靠穩|靠穩椅墊|扶穩椅墊|支撐手/.test(stage))return no('special-support-or-recline');
  const hipDelta=to.hip[1]-from.hip[1];let role;
  if(domain==='machine'){
    if(Math.abs(hipDelta)<.055)return no('no-seated-height-change');
    role=hipDelta>0?'stand-up':'sit-down';
  }else if(/坐上|入座|坐穩/.test(stage)&&Math.abs(hipDelta)>.055){role=hipDelta>0?'stand-up':'sit-down';}
  else if(Math.abs(hipDelta)>.025)role=hipDelta>0?'object-rise':'object-lower';
  else if(fromHeld&&toHeld&&from.hands?.length===2&&to.hands?.length===2&&from.hands.every(finitePoint)&&to.hands.every(finitePoint)){
    const amount=meanHandY(to)-meanHandY(from);if(Math.abs(amount)<.04)return no('no-body-or-held-height-change');role=amount>0?'held-raise':'held-lower';
  }else return no('no-body-or-held-height-change');
  const clip=choose(role,String(id||type)+':'+stage+':'+role);if(!clip)return no('no-licensed-source-role');
  return{applied:true,kind:'captured-transition-timing',role,captureId:clip.id,sourceRef:clip.sourceRef,sourceFrames:[clip.first,clip.last],sourceFPS:clip.fps,sourceDirection:'forward-capture',metric:clip.metric,sourceAction:clip.sourceAction,adaptation:'Measured scalar timing along the original calibrated geometry; not captured gym-machine or rack choreography.'};
}

/** reversePath means that the stored node/segment is traversed backward. The
 * profile itself is independently chosen for that actual playback direction. */
export function capturedTransitionProgress(profile,storedPhase,{reversePath=false}={}){
  if(!profile?.applied||!Number.isFinite(storedPhase))return null;
  const p=clamp(storedPhase),actualPhase=reversePath?1-p:p,value=sampleTransitionCapture(profile.captureId,actualPhase);
  return value===null?null:reversePath?1-value:value;
}

export function inverseAuthoredSmooth(progress){const value=clamp(progress);if(value===0||value===1)return value;let low=0,high=1;for(let i=0;i<55;i++){const x=(low+high)/2,v=x*x*(3-2*x);if(v<value)low=x;else high=x;}return(low+high)/2;}

export const capturedTransitionScope=Object.freeze({kind:'captured-transition-timing',components:['measured-sit-stand-pelvis-tempo','measured-object-body-lower-rise-tempo','measured-held-dumbbell-height-tempo'],sourcePoseApplied:false,durationsChanged:false,endpointTargetsChanged:false,humanApproval:false,excluded:['walk','step','turn','grip-change','mechanism-change','custom-barbell-rack','TRX','aerial','recline']});
