import {sameLimbClips,sameLimbSources,decodeSameLimbClip} from './same-limb-data-v018.js';

const mappings={
 'dumbbell-romanian-deadlift':{task:'deadlift',mode:'pelvis-reference-and-tempo',direction:'flexion'},
 'machine-squat-rack':{task:'deep_squat',mode:'measured-tempo',direction:'flexion'},
 'machine-smith-squat':{task:'deep_squat',mode:'measured-tempo',direction:'flexion'},
 'machine-hack-squat':{task:'deep_squat',mode:'measured-tempo',direction:'flexion'},
 'machine-leg-press':{task:'deep_squat',mode:'measured-tempo',direction:'extension'},
 'machine-leg-extension':{task:'deep_squat',mode:'measured-tempo',direction:'extension'},
 'machine-leg-curl':{task:'deep_squat',mode:'measured-tempo',direction:'flexion'},
 'machine-calf-raise':{task:'heel_raise',mode:'measured-tempo',direction:'flexion'},
};
const cache=new Map(),clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10);};
function curve(input){const values=Float32Array.from(input),slopes=new Float32Array(values.length);for(let i=1;i<values.length-1;i++){const a=values[i]-values[i-1],b=values[i+1]-values[i];slopes[i]=a*b>0?2*a*b/(a+b):0;}return{values,slopes};}
function paced(input){const a=[...input],limit=1.8/(a.length-1);a[0]=0;a[a.length-1]=1;for(let i=1;i<a.length;i++)a[i]=Math.min(a[i],a[i-1]+limit);a[a.length-1]=1;for(let i=a.length-2;i>=0;i--)a[i]=Math.max(a[i],a[i+1]-limit);return curve(a.map((v,i)=>v*.75+(i/(a.length-1))**2*(3-2*i/(a.length-1))*.25));}
function clips(task){if(!cache.has(task))cache.set(task,sameLimbClips.filter(clip=>clip.task===task).map(clip=>{const record={clip,...curve(clip.effortProgress),peak:clip.effortProgress.indexOf(Math.max(...clip.effortProgress))/(clip.effortProgress.length-1),body:null};record.flexion=paced(Array.from({length:61},(_,i)=>evaluate(record,record.peak*i/60)));record.extension=paced(Array.from({length:61},(_,i)=>1-evaluate(record,record.peak+(1-record.peak)*i/60)));return record;}));return cache.get(task);}
function choose(task,cycle){const group=clips(task);return group[((Math.floor(cycle)%group.length)+group.length)%group.length];}
function evaluate(record,phase){const {values,slopes}=record,p=clamp(phase);if(p===0)return values[0];if(p===1)return values.at(-1);const at=p*(values.length-1),i=Math.min(values.length-2,Math.floor(at)),t=at-i,t2=t*t,t3=t2*t;return clamp((2*t3-3*t2+1)*values[i]+(t3-2*t2+t)*slopes[i]+(-2*t3+3*t2)*values[i+1]+(t3-t2)*slopes[i+1]);}
/** Measured lower-limb timing, aligned to the existing mechanism's .44 peak.
 * This preserves all authored ranges and the phase used for mounting/rest. */
export function lowerBodyCapturedEffort(id,phase,cycle=0){const mapping=mappings[id];if(!mapping||!Number.isFinite(phase)||!Number.isFinite(cycle))return null;const p=clamp(phase);if(p===0||p===1)return 0;if(p===.44)return 1;const record=choose(mapping.task,cycle),out=mapping.direction==='extension'?record.extension:record.flexion,back=mapping.direction==='extension'?record.flexion:record.extension;
 return p<.44?evaluate(out,p/.44):1-evaluate(back,(p-.44)/.56);
}
export function sampleLowerBodyReference(task,phase,cycle=0){if(!sameLimbSources.some(source=>source.task===task)||!Number.isFinite(phase)||!Number.isFinite(cycle))return null;const record=choose(task,cycle);record.body??=decodeSameLimbClip(record.clip);const at=clamp(phase)*(record.clip.sampleCount-1),i=Math.floor(at),j=Math.min(i+1,record.clip.sampleCount-1),t=at-i,stride=record.clip.stride;
 const vector=(start,index=i)=>[0,1,2].map(axis=>record.body[index*stride+start+axis]);
 const interpolate=start=>{const a=vector(start),b=vector(start,j);return a.map((v,k)=>v+(b[k]-v)*t);};
 return{clipId:record.clip.id,sourceId:record.clip.sourceId,pelvis:interpolate(4),restPelvis:vector(4,0),thighs:[interpolate(7),interpolate(10)],restThighs:[vector(7,0),vector(10,0)],sourceUnit:'initial-pose marker-segment length proxy; not metres or anatomical hip joints',scope:'Measured pelvis/lower-limb skin-marker reference only; no trunk, head or arm capture.'};
}
/** A small pelvis reference on the authored RDL, not the source box-lift's
 * deep knee motion or missing upper body. Feet and grips remain constrained. */
export function applyLowerBodyReference({id,phase,cycle=0,pose,metrics}={}){if(id!=='dumbbell-romanian-deadlift'||!Number.isFinite(phase)||!Number.isFinite(cycle)||!pose?.hip||!metrics?.legs?.length)return pose;const p=clamp(phase);if(!p||p===1)return pose;const record=choose('deadlift',cycle),effort=lowerBodyCapturedEffort(id,p,cycle);let low=p<.44?0:record.peak,high=p<.44?record.peak:1;for(let i=0;i<24;i++){const mid=(low+high)/2,v=evaluate(record,mid);if(p<.44?v<effort:v>effort)low=mid;else high=mid;}const source=sampleLowerBodyReference('deadlift',(low+high)/2,cycle),legLength=metrics.legs.reduce((sum,leg)=>sum+leg.upper+leg.lower,0)/metrics.legs.length,envelope=smooth(Math.min(p,1-p)/.12),delta=source.pelvis.map((v,i)=>Math.max(-.008,Math.min(.008,(v-source.restPelvis[i])*legLength*.12))*envelope);
 const result={...pose};for(const key of ['hip','shoulder','head'])result[key]=pose[key].map((v,i)=>v+delta[i]);result.hands=pose.hands.map(point=>point.map((v,i)=>v+delta[i]));if(pose.elbows)result.elbows=pose.elbows.map(point=>point.map((v,i)=>v+delta[i]));return result;
}
export function lowerBodyCaptureInfo(id){const mapping=mappings[id];if(!mapping)return null;const source=sameLimbSources.find(item=>item.task===mapping.task);return{exerciseId:id,sourceId:source.id,kind:mapping.mode,task:mapping.task,sourceLoad:source.sourceLoad,sourceURL:'https://dongxutang918-afk.github.io/SAME-Limb/',license:'CC BY 4.0',repetitions:clips(mapping.task).length,upperBodyCaptured:false,handAndFootIK:'Authored machine/grip targets and bone lengths retained',phaseAlignment:'Peak mapped to original .44 rest phase; knee extension uses the recorded extension branch first.',humanApproval:false,scope:mapping.mode==='measured-tempo'?'Lower-limb marker-derived timing adapted to the existing mechanism. Not a capture of this machine.':'Box-lift lower-limb tempo and a pelvis reference bounded to 8mm per axis (13.86mm vector maximum). RDL upper body, hand path and slight knee bend remain authored; not a dumbbell RDL capture.'};}
export const lowerBodyCaptureIds=Object.freeze(Object.keys(mappings));
