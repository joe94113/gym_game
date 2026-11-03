import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const imuCurlRawPath='.local-tools/uci-wle-v018/Example_WearableComputing_weight_lifting_exercises_biceps_curl_variations.csv';
const sourceURL='https://archive.ics.uci.edu/static/public/273/weight+lifting+exercises+monitored+with+inertial+measurement+units.zip';
const datasetURL='https://archive.ics.uci.edu/dataset/273/weight+lifting+exercises+monitored+with+inertial+measurement+units';
const definitions=[{id:'uci-curl-roll-a',first:2464,last:2574},{id:'uci-curl-roll-b',first:2628,last:2737}];
const sha=x=>createHash('sha256').update(x).digest('hex'),round=x=>Number(x.toFixed(6)),clamp=x=>Math.max(0,Math.min(1,x));

// Preserve duplicate header names. Raw channels are located by their unique index;
// a DictReader/Object.fromEntries over all 159 columns would lose one column.
export function parseImuCurlCSV(text){
 const lines=text.replace(/\r/g,'').split('\n'),headerLine=lines.findIndex(line=>line.startsWith('user_name,'));
 if(headerLine<0)throw Error('Missing original IMU header');
 const parse=line=>{const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(value);value='';}else value+=c;}if(quoted)throw Error('Unclosed CSV quote');out.push(value);return out;};
 const headers=parse(lines[headerLine]),required=['user_name','classe','new_window','raw_timestamp_part_1','raw_timestamp_part_2','roll_forearm'];
 const indexes={};for(const key of required){const found=headers.flatMap((value,i)=>value===key?[i]:[]);if(found.length!==1)throw Error('Nonunique/missing raw IMU channel '+key);indexes[key]=found[0];}
 const records=[];for(let i=headerLine+1;i<lines.length;i++){if(!lines[i])continue;const values=parse(lines[i]);if(values.length!==headers.length)throw Error('Incorrect IMU column count on line '+(i+1));const record={row:records.length+1,fileLine:i+1};for(const key of required)record[key]=values[indexes[key]];
  const seconds=Number(record.raw_timestamp_part_1),fraction=Number(record.raw_timestamp_part_2);record.timeUs=seconds*1e6+fraction;record.scalar=Number(record.roll_forearm);
  if(!Number.isInteger(seconds)||!Number.isInteger(fraction)||fraction<0||fraction>=1e6||!Number.isSafeInteger(record.timeUs)||!Number.isFinite(record.scalar))throw Error('Invalid raw IMU measurement');records.push(record);
 }
 return{headers,headerLine:headerLine+1,records};
}

export function findCorrectImuRuns(records,maxGapSeconds=.2){
 const runs=[];let current=[];const flush=()=>{if(current.length)runs.push(current);current=[];};
 for(const record of records){if(record.classe!=='A'){flush();continue;}if(record.new_window==='yes')continue;
  const previous=current.at(-1);if(previous&&(record.user_name!==previous.user_name||record.timeUs<=previous.timeUs||record.timeUs-previous.timeUs>maxGapSeconds*1e6))flush();current.push(record);
 }flush();return runs;
}
export function unwrapImuDegrees(values){const out=[];for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))throw Error('Nonfinite IMU angle');if(!i){out.push(values[i]);continue;}let delta=values[i]-values[i-1];while(delta>180)delta-=360;while(delta< -180)delta+=360;out.push(out.at(-1)+delta);}return out;}
const interpolate=(times,values,target)=>{let lo=0,hi=times.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(times[m]<=target)lo=m;else hi=m;}const w=(target-times[lo])/(times[hi]-times[lo]);return values[lo]+(values[hi]-values[lo])*clamp(w);};

export function buildImuCurlClip(records,definition){
 const run=findCorrectImuRuns(records).find(run=>run.some(r=>r.row===definition.first)&&run.some(r=>r.row===definition.last));if(!run)throw Error('Crop crosses class/subject/timestamp gap or contains summary endpoint');
 const crop=run.filter(r=>r.row>=definition.first&&r.row<=definition.last);if(crop.length<30)throw Error('Insufficient raw IMU samples');
 const first=crop[0],last=crop.at(-1),duration=(last.timeUs-first.timeUs)/1e6,times=crop.map(r=>(r.timeUs-first.timeUs)/1e6),unwrapped=unwrapImuDegrees(crop.map(r=>r.scalar));if(duration<1||duration>5)throw Error('Invalid captured cycle duration');
 const unwrapped121=Array.from({length:121},(_,i)=>interpolate(times,unwrapped,duration*i/120));
 const smoothed=unwrapped121.map((_,i)=>{let sum=0;for(let j=-2;j<=2;j++)sum+=unwrapped121[Math.max(0,Math.min(120,i+j))];return sum/5;});
 const peak=Math.max(...smoothed),peakIndex=smoothed.indexOf(peak),start=smoothed[0],end=smoothed[120],amplitude=peak-Math.max(start,end);
 if(amplitude<80||peakIndex<18||peakIndex>102||Math.abs(start-end)>amplitude*.2)throw Error('No complete low/high/low IMU scalar excursion');
 const progress=smoothed.map((value,i)=>clamp(i<=peakIndex?(value-start)/(peak-start):(value-end)/(peak-end)));
 let maximumBacktrack=0,previous=0;for(let i=0;i<=peakIndex;i++){maximumBacktrack=Math.max(maximumBacktrack,previous-progress[i]);previous=Math.max(previous,progress[i]);progress[i]=previous;}
 previous=1;for(let i=peakIndex+1;i<=120;i++){maximumBacktrack=Math.max(maximumBacktrack,progress[i]-previous);previous=Math.min(previous,progress[i]);progress[i]=previous;}
 if(maximumBacktrack>.2)throw Error('Mixed/noncyclic IMU scalar crop');progress[0]=0;progress[peakIndex]=1;progress[120]=0;
 const nearest=Array.from({length:121},(_,i)=>{const target=duration*i/120;let index=0;for(let j=1;j<times.length;j++)if(Math.abs(times[j]-target)<Math.abs(times[index]-target))index=j;return index;});
 return{id:definition.id,sourceRef:'uci-wle-273',sourceClass:'A',subject:first.user_name,sensorChannel:'roll_forearm',units:'degree',first:first.row,last:last.row,firstFileLine:first.fileLine,lastFileLine:last.fileLine,firstTimeUs:first.timeUs,lastTimeUs:last.timeUs,durationSeconds:round(duration),rawCount:crop.length,maxGapSeconds:round(Math.max(...times.slice(1).map((t,i)=>t-times[i]))),peakIndex,peakPhase:round(peakIndex/120),rawMetric:nearest.map(i=>crop[i].scalar),rawSampleRows:nearest.map(i=>crop[i].row),unwrappedMetric:unwrapped121.map(round),progress:progress.map(round),sourceDirection:'forward-capture',scope:'Measured IMU sensor-roll scalar timing of a class-A unilateral loaded curl. Sensor mounting not calibrated to anatomy; not elbow angle, full-body mocap or marker-exact hand motion.',filter:{sampleCount:121,resampling:'linear in native source timestamp, not nominal frame index',unwrap:'adjacent Euler roll delta into [-180,180] degrees',nativeUnits:'raw timestamp integer seconds plus microseconds',smoothing:'five-point moving average after time resampling',monotonicPhaseCleanup:true,maximumBacktrack:round(maximumBacktrack)}};
}

export const imuSamplerSource=`
const imuTimingSlopes=new Map();
export function sampleImuCurlCapture(id,phase){
 const clip=typeof id==='string'?imuCurlCaptureClips.find(c=>c.id===id):id;
 if(!clip||!Number.isFinite(phase)||!Array.isArray(clip.progress)||clip.progress.length<3)return null;
 if(phase<=0||phase>=1)return 0;
 let slopes=imuTimingSlopes.get(clip);if(!slopes){const a=clip.progress;slopes=new Float64Array(a.length);for(let i=1;i<a.length-1;i++){const l=a[i]-a[i-1],r=a[i+1]-a[i];slopes[i]=l*r>0?2*l*r/(l+r):0;}imuTimingSlopes.set(clip,slopes);}
 const a=clip.progress,at=phase*(a.length-1),i=Math.min(a.length-2,Math.floor(at)),t=at-i,t2=t*t,t3=t2*t;
 return Math.max(0,Math.min(1,(2*t3-3*t2+1)*a[i]+(t3-2*t2+t)*slopes[i]+(-2*t3+3*t2)*a[i+1]+(t3-t2)*slopes[i+1]));
}
`;
export function buildImuCurlDataset(){
 const raw=readFileSync(imuCurlRawPath),parsed=parseImuCurlCSV(raw.toString('utf8')),clips=definitions.map(d=>buildImuCurlClip(parsed.records,d));
 const module='// Human IMU sensor timing only; no full-body pose is captured here. See public/motions/uci-curl-v018.json.\nexport const imuCurlCaptureClips='+JSON.stringify(clips)+';\n'+imuSamplerSource;
 const manifest={schemaVersion:1,title:'Class-A unilateral dumbbell curl IMU timing references',source:{name:'UCI Weight Lifting Exercises monitored with Inertial Measurement Units',doi:'10.24432/C5WK63',datasetURL,downloadURL:sourceURL,rawPath:imuCurlRawPath,rawSHA256:sha(raw),bytes:raw.length,exampleRows:parsed.records.length,headerLine:parsed.headerLine,columns:parsed.headers.length,scope:'Official 4024-row example file, not the complete 39242-row study data.'},license:{id:'CC-BY-4.0',url:'https://creativecommons.org/licenses/by/4.0/',explicitDatasetLicenseURL:datasetURL,credit:'Velloso, E. & Ugulino, W. (2013). Weight Lifting Exercises monitored with Inertial Measurement Units [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5WK63',adaptationNotice:'Selected class-A rows, removed window-summary rows, unwrapped one sensor-roll channel, resampled by source timestamps and adapted scalar timing. Changes are not original marker poses.'},paper:{doi:'10.1145/2459236.2459256',authorPDF:'https://collaborative-ai.org/publications/velloso13_ah.pdf',nominalSamplingHz:45,loadKg:1.25,placement:'Razor IMUs on glove, armband, lumbar belt and dumbbell; CSV uses forearm channel label.',classA:'According to the specified unilateral dumbbell biceps curl; other classes intentionally reproduce mistakes.'},extraction:{onlyClass:'A',removeRowsWithNewWindowYes:true,maxGapSeconds:.2,sourceClock:'integer raw_timestamp_part_1 seconds + raw_timestamp_part_2 microseconds; duration uses exact integer differences',nominalFpsUsedForResampling:false,calibration:'Sensor-to-anatomical-axis calibration and Euler convention not supplied with example CSV; roll is used only as a scalar timing proxy. No clinical elbow angle, arm/forearm subtraction or skeleton reconstruction.'},dataModule:{path:'src/imu-curl-data-v018.js',bytes:Buffer.byteLength(module),sha256:sha(module)},generatorSHA256:sha(readFileSync('scripts/import-imu-curl-v018.mjs')),clips:clips.map(({rawMetric,rawSampleRows,unwrappedMetric,progress,...clip})=>({...clip,rawRange:[Math.min(...unwrappedMetric),Math.max(...unwrappedMetric)],rawSHA256:sha(JSON.stringify(rawMetric)),unwrappedSHA256:sha(JSON.stringify(unwrappedMetric)),progressSHA256:sha(JSON.stringify(progress)),nativeSourceRows:parsed.records.filter(r=>r.row>=clip.first&&r.row<=clip.last&&r.new_window!=='yes').map(r=>r.row)})),runtimeScope:'Retiming reference for authored grip-safe paths only. Full source sensor excursion is not a clinical movement phase. Use a bounded influence and preserve hand/foot targets, authored geometry and collision checks.',professionalReview:{status:'pending',reviewer:null}};
 if(Buffer.byteLength(module)>30000)throw Error('IMU runtime exceeds 30KB');return{module,manifest,clips};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=buildImuCurlDataset();mkdirSync('public/motions',{recursive:true});writeFileSync('src/imu-curl-data-v018.js',d.module);writeFileSync('public/motions/uci-curl-v018.json',JSON.stringify(d.manifest,null,2));console.log(JSON.stringify({clips:d.clips.map(c=>({id:c.id,first:c.first,last:c.last,duration:c.durationSeconds,peak:c.peakPhase})),bytes:Buffer.byteLength(d.module)}));}
