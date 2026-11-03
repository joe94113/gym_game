import {capturedPressCurves,capturedSquatCurves} from './captured-exercise-curves-v015.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const prepare=clips=>clips.map(clip=>{
  const values=new Float32Array(clip.progress),slopes=new Float32Array(values.length);
  for(let i=1;i<values.length-1;i++){
    const before=values[i]-values[i-1],after=values[i+1]-values[i];
    slopes[i]=before*after>0?2*before*after/(before+after):0;
  }
  return{values,slopes};
});
const press=prepare(capturedPressCurves),squat=prepare(capturedSquatCurves);
/** Measured tempo only. The caller retains its original contact-safe pose path.
 * No root translation, finger shape, body lengths, hand/foot target or color changes. */
export function capturedExerciseEffort(id,phase,cycle=0){
  const curves=id==='dumbbell-shoulder-press'?press:id==='dumbbell-goblet-squat'?squat:null;
  if(!curves||!Number.isFinite(phase)||!Number.isFinite(cycle))return null;
  const p=clamp(phase);if(p===0||p===1)return 0;
  const curve=curves[((Math.floor(cycle)%curves.length)+curves.length)%curves.length],{values,slopes}=curve;
  const at=p*(values.length-1),index=Math.min(values.length-2,Math.floor(at)),t=at-index,t2=t*t,t3=t2*t;
  // Monotone cubic Hermite; endpoint tangents stay zero for rest/seam continuity.
  return clamp((2*t3-3*t2+1)*values[index]+(t3-2*t2+t)*slopes[index]+(-2*t3+3*t2)*values[index+1]+(t3-t2)*slopes[index+1]);
}

export const capturedExerciseScope=Object.freeze({exerciseIds:['dumbbell-shoulder-press','dumbbell-goblet-squat'],source:['CMU 79_93','CMU 13_29'],repetitions:4,capturedComponent:'measured shoulder-press and bodyweight-squat timing',contacts:'existing authored path and hand/foot IK',squatLoadInSource:'unweighted, adapted to the authored goblet-squat path',humanApproval:false});
