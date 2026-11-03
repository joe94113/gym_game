import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCmuMotion} from './cmu-motion-v015.mjs';
import {capturedExerciseEffort} from '../src/captured-exercise-v015.js';
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),record=JSON.parse(readFileSync('public/motions/cmu-exercise-v015.json','utf8')),squatRecord=JSON.parse(readFileSync('public/motions/cmu-squat-v015.json','utf8'));
const sources=['scripts/cmu-motion-v015.mjs','scripts/import-cmu-exercise-v015.mjs','scripts/qualify-captured-exercise-v015.mjs','src/captured-exercise-v015.js','src/captured-exercise-curves-v015.js','public/motions/cmu-exercise-v015.json','public/motions/cmu-squat-v015.json'];
const sourceHashes=Object.fromEntries(sources.map(path=>[path,sha(path)])),failures=[];
const rawSourceHashes={...record.rawSourceHashes,...squatRecord.rawSourceHashes};
for(const [path,expected]of Object.entries(rawSourceHashes))if(sha(path)!==expected)failures.push('Raw provenance mismatch '+path);
for(const data of [record,squatRecord]){const imported=parseCmuMotion(readFileSync(`.local-tools/cmu-v015/${data.subject}.asf`,'utf8'),readFileSync(`.local-tools/cmu-v015/${data.motion}.amc`,'utf8'),{fps:data.fps});
 for(const clip of data.clips){
  const derived=JSON.stringify(imported.samples.slice(clip.firstFrame-1,clip.lastFrame));
  if(derived!==JSON.stringify(clip.samples))failures.push('Captured direction/frame mismatch '+clip.id);
  if(createHash('sha256').update(derived).digest('hex')!==clip.derivedSampleSHA256||createHash('sha256').update(JSON.stringify(clip.progress)).digest('hex')!==clip.derivedTimingSHA256)failures.push('Derived crop fingerprint mismatch '+clip.id);
 }}
const curves=[];
for(const id of ['dumbbell-shoulder-press','dumbbell-goblet-squat'])for(let cycle=0;cycle<2;cycle++){
 const samples=Array.from({length:10001},(_,i)=>capturedExerciseEffort(id,i/10000,cycle)),peak=samples.indexOf(Math.max(...samples)),h=1e-7;
 const result={exerciseId:id,cycle,samples:samples.length,min:Math.min(...samples),max:Math.max(...samples),peakPhase:peak/10000,start:samples[0],end:samples.at(-1),startDerivative:capturedExerciseEffort(id,h,cycle)/h,endDerivative:capturedExerciseEffort(id,1-h,cycle)/h,ascending:true,descending:true};
 for(let i=1;i<samples.length;i++){if(i<=peak&&samples[i]<samples[i-1]-1e-10)result.ascending=false;if(i>peak&&samples[i]>samples[i-1]+1e-10)result.descending=false;}
 result.pass=result.min===0&&result.max>.99999&&result.max<=1&&result.start===0&&result.end===0&&result.ascending&&result.descending&&Math.abs(result.startDerivative)<.001&&Math.abs(result.endDerivative)<.001;
 if(!result.pass)failures.push('Unsafe timing curve '+cycle);curves.push(result);
}
const changedSources=sources.filter(path=>sha(path)!==sourceHashes[path]),report={pass:!failures.length&&!changedSources.length,sourceHashes,rawSourceHashes,changedSources,samples:40004,curves,failures,scope:'Timing-only qualification of actual press and unweighted squat captures adapted to authored paths. Exact original source SHA and reimported frame directions verified; this does not certify weighted/full-body contact or trainer approval.'};
mkdirSync('artifacts/mocap-v015',{recursive:true});writeFileSync('artifacts/mocap-v015/captured-timing-qualification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,sourceHashes:undefined,rawSourceHashes:undefined}));if(!report.pass)process.exitCode=1;
