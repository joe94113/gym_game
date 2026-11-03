// Pure reference sampler shared by offline qualification. No source upper-body
// motion or clinical joint model is inferred from these optical leg markers.
import {sameLimbClips,sameLimbSources,sameLimbChannelNames,decodeSameLimbClip} from '../src/same-limb-data-v018.js';

const cache=new Map(),clamp=x=>Math.max(0,Math.min(1,x));
const tasks=[...new Set(sameLimbClips.map(clip=>clip.task))];
const unit=point=>{const n=Math.hypot(...point);return n>1e-8?point.map(x=>x/n):[0,-1,0];};
function prepared(clip){
  if(cache.has(clip.id))return cache.get(clip.id);
  const values=decodeSameLimbClip(clip),progress=new Float32Array(clip.effortProgress),slopes=new Float32Array(progress.length);
  for(let i=1;i<progress.length-1;i++){const a=progress[i]-progress[i-1],b=progress[i+1]-progress[i];slopes[i]=a*b>0?2*a*b/(a+b):0;}
  const value={values,progress,slopes};cache.set(clip.id,value);return value;
}
function select(task,phase,cycle){
  if(!tasks.includes(task)||!Number.isFinite(phase)||!Number.isFinite(cycle))return null;
  const clips=sameLimbClips.filter(clip=>clip.task===task),clip=clips[((Math.floor(cycle)%clips.length)+clips.length)%clips.length];
  return{clip,...prepared(clip),phase:clamp(phase)};
}
function fields(row){return{anglesDeg:row.slice(0,4),pelvisRelativeAnkles:row.slice(4,7),thighDirections:[unit(row.slice(7,10)),unit(row.slice(10,13))],shinDirections:[unit(row.slice(13,16)),unit(row.slice(16,19))],ankleRelativeToe:[row.slice(19,22),row.slice(22,25)],pelvisRelativeToeMidpoint:row.slice(25,28)};}

export function sameLimbEffort({task,phase,cycle=0}={}){
  const sample=select(task,phase,cycle);if(!sample)return null;
  const p=sample.phase;if(p===0||p===1)return 0;
  const {progress,slopes}=sample,at=p*(progress.length-1),i=Math.min(progress.length-2,Math.floor(at)),t=at-i,t2=t*t,t3=t2*t;
  return clamp((2*t3-3*t2+1)*progress[i]+(t3-2*t2+t)*slopes[i]+(-2*t3+3*t2)*progress[i+1]+(t3-t2)*slopes[i+1]);
}

export function sampleSameLimbReference({task,phase,cycle=0}={}){
  const sample=select(task,phase,cycle);if(!sample)return null;
  const {clip,values}=sample,p=sample.phase,at=p*(clip.sampleCount-1),first=Math.floor(at),last=Math.min(first+1,clip.sampleCount-1),fraction=at-first;
  const row=sameLimbChannelNames.map((_,i)=>values[first*clip.stride+i]+(values[last*clip.stride+i]-values[first*clip.stride+i])*fraction);
  return{task,clipId:clip.id,sourceId:clip.sourceId,phase:p,sourceTimeSeconds:clip.startSeconds+(clip.endSeconds-clip.startSeconds)*p,effort:sameLimbEffort({task,phase:p,cycle}),...fields(row),reference:fields(Array.from(values.slice(0,clip.stride)))};
}

export function getSameLimbSourceInfo(task){
  if(!tasks.includes(task))return null;
  const source=sameLimbSources.find(value=>value.task===task);
  return{task,sourceId:source.id,sourceLoad:source.sourceLoad,sourceURL:source.url,nominalFPS:90,actualTimeIntervals:source.nativeIntervalSeconds,repetitions:3,
    measured:['four marker-defined knee/ankle angles','pelvis marker centre relative to ankle/toe markers','thigh/shin marker directions','ankle relative to toe marker'],
    positionUnits:'dimensionless initial ASIS-knee-ankle marker-path length proxy; no metre/mm assumption',
    axes:'Initial anatomical marker-derived right/up/forward frame; global source axes unspecified',
    scope:'Optical lower-limb and pelvis-marker reference. No upper body, true hip joint centres, clinical JCS, full IK, EMG muscle-intensity mapping or trainer approval.',
    license:'CC BY 4.0',humanApproval:false};
}
