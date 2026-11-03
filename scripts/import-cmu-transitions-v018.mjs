import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parseCmuFullBody} from './cmu-fullbody-v017.mjs';

const research='artifacts/mocap-v018/research/',legacy='.local-tools/cmu-v015/';
const definitions=[
 {id:'sit-down-a',role:'sit-down',motion:'143_18',subject:'143',fps:120,first:76,last:193,metric:'pelvis-y-relative-ankles',action:'Standing to sitting in a chair.'},
 {id:'sit-down-b',role:'sit-down',motion:'143_18',subject:'143',fps:120,first:405,last:525,metric:'pelvis-y-relative-ankles',action:'Second standing-to-chair sitting.'},
 {id:'stand-up-a',role:'stand-up',motion:'143_18',subject:'143',fps:120,first:265,last:377,metric:'pelvis-y-relative-ankles',action:'First chair sit-to-stand.'},
 {id:'stand-up-b',role:'stand-up',motion:'143_18',subject:'143',fps:120,first:585,last:690,metric:'pelvis-y-relative-ankles',action:'Second chair sit-to-stand.'},
 {id:'object-lower-a',role:'object-lower',motion:'115_06',subject:'115',fps:120,first:48,last:99,metric:'pelvis-y-relative-ankles',action:'Bending knees to approach a box before picking it up; not a captured loaded putdown.'},
 {id:'object-rise-a',role:'object-rise',motion:'115_06',subject:'115',fps:120,first:99,last:166,metric:'pelvis-y-relative-ankles',action:'Rising after reaching for a box; box mass was not recorded.'},
 {id:'object-lower-b',role:'object-lower',motion:'143_10',subject:'143',fps:120,first:365,last:395,metric:'pelvis-y-relative-ankles',action:'Second stationary bend in a walk-and-toolbox recording; not dumbbell rack pickup.'},
 {id:'object-rise-b',role:'object-rise',motion:'143_10',subject:'143',fps:120,first:395,last:460,metric:'pelvis-y-relative-ankles',action:'Rising from the second toolbox bend; object markers and mass unavailable.'},
 {id:'held-raise-a',role:'held-raise',motion:'79_93',subject:'79',fps:60,first:90,last:181,metric:'mean-wrist-y-relative-pelvis',action:'Already holding dumbbells, raise from low carry toward shoulder position; not rack pickup.'},
 {id:'held-lower-a',role:'held-lower',motion:'79_93',subject:'79',fps:60,first:1045,last:1090,metric:'mean-wrist-y-relative-pelvis',action:'Already holding dumbbells, lower after the final press; not rack placement or release.'},
];
const sha=value=>createHash('sha256').update(value).digest('hex'),round=value=>Number(value.toFixed(6));
const mid=(a,b)=>a.map((value,i)=>(value+b[i])/2),clamp=value=>Math.max(0,Math.min(1,value));
export function transitionMetric(sample,metric){
 const p=sample.landmarks,hip=mid(p.lhipjoint,p.rhipjoint);
 if(metric==='pelvis-y-relative-ankles')return hip[1]-mid(p.ltibia,p.rtibia)[1];
 if(metric==='mean-wrist-y-relative-pelvis')return mid(p.lradius,p.rradius)[1]-hip[1];
 throw Error('Unsupported transition metric '+metric);
}
const resample=(values,count)=>Array.from({length:count},(_,i)=>{const at=i/(count-1)*(values.length-1),index=Math.floor(at),weight=at-index;return values[index]+((values[index+1]??values[index])-values[index])*weight;});

/** Actual scalar timing extraction only. Raw sampled measurements are retained
 * separately; monotonic cleanup and zero end tangents are adaptation choices. */
export function buildTransitionClip(motion,definition){
 const {first,last,metric}=definition;
 if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last>motion.frames||last<=first)throw Error('Invalid transition crop');
 const native=motion.samples.slice(first-1,last).map(sample=>transitionMetric(sample,metric));
 if(native.some(value=>!Number.isFinite(value)))throw Error('Nonfinite transition measurement');
 const smooth=native.map((_,i)=>{let sum=0;for(let j=-2;j<=2;j++)sum+=native[Math.max(0,Math.min(native.length-1,i+j))];return sum/5;});
 const delta=smooth.at(-1)-smooth[0];if(Math.abs(delta)<.05)throw Error('Insufficient captured transition range');
 const normalized=smooth.map(value=>(value-smooth[0])/delta);
 let peak=0,backtrack=0;for(const value of normalized){backtrack=Math.max(backtrack,peak-value);peak=Math.max(peak,value);}
 // Reject mixed clips with another action, rather than hiding it with a clamp.
 if(Math.min(...normalized)<-.15||Math.max(...normalized)>1.15||backtrack>.20)throw Error('Nonmonotone source contains another action or excessive reversal');
 const progress=resample(normalized,121).map(clamp);for(let i=1;i<progress.length;i++)progress[i]=Math.max(progress[i],progress[i-1]);progress[0]=0;progress[120]=1;
 const rawMetric=resample(native,121).map(round);
 return{id:definition.id,role:definition.role,sourceRef:'cmu-'+definition.motion.replace('_','-'),fps:definition.fps,first,last,metric,rawMetric,progress:progress.map(round),filter:{nativeMovingAverageRadius:2,monotonicCleanup:true,interpolation:'monotone cubic Hermite; zero endpoint slopes'},sourceDirection:'forward-capture',sourceAction:definition.action};
}

export const transitionSamplerSource=`
const timingCache=new Map();
export function sampleTransitionCapture(id,phase){
 const clip=typeof id==='string'?transitionCaptureClips.find(value=>value.id===id):id;
 if(!clip||!Number.isFinite(phase)||!Array.isArray(clip.progress)||clip.progress.length<3)return null;
 if(phase<=0)return 0;if(phase>=1)return 1;
 let slopes=timingCache.get(clip);if(!slopes){const a=clip.progress;slopes=new Float64Array(a.length);for(let i=1;i<a.length-1;i++){const l=a[i]-a[i-1],r=a[i+1]-a[i];slopes[i]=l*r>0?2*l*r/(l+r):0;}timingCache.set(clip,slopes);}
 const a=clip.progress,at=phase*(a.length-1),i=Math.min(a.length-2,Math.floor(at)),t=at-i,t2=t*t,t3=t2*t;
 return Math.max(0,Math.min(1,(2*t3-3*t2+1)*a[i]+(t3-2*t2+t)*slopes[i]+(-2*t3+3*t2)*a[i+1]+(t3-t2)*slopes[i+1]));
}
`;

export function buildTransitionDataset(){
 const sources=new Map(),clips=[],rawSourceHashes={};
 for(const d of definitions){if(!sources.has(d.motion)){
   const prefix=d.subject==='79'?legacy:research,asf=prefix+d.subject+'.asf',amc=prefix+d.motion+'.amc';
   rawSourceHashes[asf]=sha(readFileSync(asf));rawSourceHashes[amc]=sha(readFileSync(amc));sources.set(d.motion,parseCmuFullBody(readFileSync(asf,'utf8'),readFileSync(amc,'utf8'),{fps:d.fps}));
  }clips.push(buildTransitionClip(sources.get(d.motion),d));
 }
 const rejected=[];try{buildTransitionClip(sources.get('79_93'),{id:'rejected-ending',role:'held-lower',fps:60,first:836,last:1138,metric:'mean-wrist-y-relative-pelvis',motion:'79_93'});}catch(error){rejected.push({motion:'79_93',first:836,last:1138,reason:error.message,explanation:'This range contains another press ascent before the final lowering. Only frames1045–1090 are retained as lowering.'});}
 const module='// Actual measured CMU scalar timing, not captured gym-machine poses. Provenance: public/motions/cmu-transitions-v018.json.\nexport const transitionCaptureClips='+JSON.stringify(clips)+';\n'+transitionSamplerSource;
 const manifest={schemaVersion:1,source:'CMU Graphics Lab Motion Capture Database',termsURL:'https://mocap.cs.cmu.edu/faqs.php',commercialTermsURL:'https://mocap.cs.cmu.edu/',attribution:'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.',rawSourceHashes,generatorHashes:Object.fromEntries(['scripts/import-cmu-transitions-v018.mjs','scripts/cmu-fullbody-v017.mjs'].map(path=>[path,sha(readFileSync(path))])),dataModule:{path:'src/captured-transition-data-v018.js',bytes:Buffer.byteLength(module),sha256:sha(module)},clips:clips.map(({rawMetric,progress,...clip})=>({...clip,samples:progress.length,sourceDurationSeconds:(clip.last-clip.first)/clip.fps,rawRange:[Math.min(...rawMetric),Math.max(...rawMetric)],rawEndpoints:[rawMetric[0],rawMetric.at(-1)],rawSHA256:sha(JSON.stringify(rawMetric)),progressSHA256:sha(JSON.stringify(progress))})),rejected,scope:'Measured scalar timing only, to retime authored stationary body/contact paths. Source body/object/action differs from gym machines; no raw captured pose, root motion, fingers, weight load or marker-exact equipment contact is reproduced. No source clip is reversed. Any reversed runtime adaptation must be labeled as such.',professionalReview:{status:'pending',reviewer:null}};
 if(Buffer.byteLength(module)>30000)throw Error('Transition runtime module exceeds30KB');return{module,manifest,clips};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const data=buildTransitionDataset();mkdirSync('public/motions',{recursive:true});writeFileSync('src/captured-transition-data-v018.js',data.module);writeFileSync('public/motions/cmu-transitions-v018.json',JSON.stringify(data.manifest,null,2));console.log(JSON.stringify({clips:data.clips.map(({id,role,first,last})=>({id,role,first,last})),bytes:Buffer.byteLength(data.module),rejected:data.manifest.rejected}));}
