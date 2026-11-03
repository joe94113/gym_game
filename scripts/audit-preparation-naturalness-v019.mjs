import {createMocapFixtureV017} from './mocap-fixture-v017.mjs';
import {transformBody} from '../src/lifecycle-frame.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Diagnostic only: no collision exemptions, thresholds, or fixture edits.
const f=await createMocapFixtureV017(),{character,rig,metrics,THREE,machines,createMachineLifecycle}=f;
const keys=['hands','feet','elbows','knees','wrists','ankles','shoulders','hips'];
const inverseSmooth=x=>{let a=0,b=1;for(let i=0;i<50;i++){const m=(a+b)/2;if(m*m*(3-2*m)<x)a=m;else b=m;}return(a+b)/2;};
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i])),subtract=(a,b,scale=1)=>a.map((x,i)=>(x-b[i])*scale),V=p=>new THREE.Vector3(...p);
function sample(run,mode,phase){const frame=run(mode,Math.min(1,Math.max(0,phase)));character.pose(frame.pose);return{frame,body:transformBody(character.getContactPoints(),frame),wrist:character.getHandDiagnostics().map(x=>x.wristBendRadians*180/Math.PI)};}
const dbIds=['dumbbell-curl','dumbbell-bench-press','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-goblet-squat','dumbbell-romanian-deadlift'];
const cases=dbIds.map(id=>({id,kind:'dumbbell',prepare(){rig.prepare(id);},sample:(m,p)=>rig.sampleLifecycle(id,m,p),meta:()=>rig.getLifecycle(id),finish:()=>rig.end({keepVisible:false})}));
for(const m of machines.values())if(['squat','smithSquat','chestPress','shoulderPress','latPulldown','seatedRow','legExtension','legCurl','pecDeck','plateInclinePress','plateShoulderPress','plateHighRow','benchPress'].includes(m.type)){let life;cases.push({id:m.station.id,type:m.type,kind:'machine',prepare(){life=createMachineLifecycle({THREE,machine:m,metrics});life.sample('enter',0);},sample:(mode,p)=>life.sample(mode,p),meta(){const coverage=life.getCapturedTransitionCoverage?.();return{entryDuration:life.entryDuration,exitDuration:life.exitDuration,stages:life.stages,coverage};},finish(){}});}
const files=['src/dumbbell-lifecycle-paths.js','src/barbell-lifecycle-paths.js','src/rig-lifecycle.js','src/machine-lifecycle.js','src/skinned-character.js','src/extended-rig.js','public/models/athlete/athlete.glb'],hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),sourceHashes=Object.fromEntries(files.map(p=>[p,hash(p)])),rows=[],only=process.argv.find(x=>x.startsWith('--only='))?.slice(7)?.split(',');
for(const c of cases.filter(x=>!only||only.includes(x.id)||only.includes(x.type))){c.prepare();const meta=c.meta(),duration=meta.entryDuration,points=[];let elapsed=0;
 if(meta.stages?.every(s=>typeof s==='object'))for(const s of meta.stages){const start=elapsed;elapsed+=s.duration;if(elapsed<duration-1e-8)points.push({phase:elapsed/duration,label:s.label,kind:'stage-boundary'});
  if(c.kind==='dumbbell'&&/沿啞鈴架|走到架前|走近啞鈴架|持鈴走到/.test(s.label)){const a=c.sample('enter',start/duration),b=c.sample('enter',elapsed/duration),distance=V(a.offset).distanceTo(V(b.offset)),steps=Math.max(2,Math.ceil(distance/.2/2)*2);for(let step=1;step<steps;step++)points.push({phase:(start+s.duration*inverseSmooth(step/steps))/duration,label:s.label,kind:'walking-contact-boundary'});}
 }else for(const s of meta.coverage?.segments||[])if(s.range[1]<1-1e-8)points.push({phase:1-s.range[1],label:s.stage,kind:'stage-boundary'});
 const row={id:c.id,type:c.type,duration,observations:[],stationaryStages:[]};
 for(const mode of ['enter','exit'])for(const p of points){const phase=mode==='enter'?p.phase:1-p.phase,h=.0001/duration,a=sample(c.sample,mode,phase-h),b=sample(c.sample,mode,phase),d=sample(c.sample,mode,phase+h);let worst={speedJump:0};
  for(const key of keys)for(let side=0;side<2;side++){const beforeVelocity=subtract(b.body[key][side],a.body[key][side],1/.0001),afterVelocity=subtract(d.body[key][side],b.body[key][side],1/.0001),speedJump=distance(beforeVelocity,afterVelocity);if(speedJump>worst.speedJump)worst={speedJump,key,side,beforeSpeed:Math.hypot(...beforeVelocity),afterSpeed:Math.hypot(...afterVelocity),tinyStep:distance(a.body[key][side],d.body[key][side])};}
  row.observations.push({...p,mode,phase,...worst});
 }
 if(c.kind==='dumbbell'){elapsed=0;for(const stage of meta.stages){const a=sample(c.sample,'enter',(elapsed+stage.duration*.05)/duration),b=sample(c.sample,'enter',(elapsed+stage.duration*.95)/duration);let movement=0;for(const key of keys)for(let side=0;side<2;side++)movement=Math.max(movement,distance(a.body[key][side],b.body[key][side]));if(movement<.00001)row.stationaryStages.push({label:stage.label,duration:stage.duration,movement});elapsed+=stage.duration;}}
 row.observations.sort((a,b)=>b.speedJump-a.speedJump);rows.push(row);c.finish();console.log(JSON.stringify({id:c.id,duration,worst:row.observations.slice(0,4),stationaryStages:row.stationaryStages}));
}
character.dispose();mkdirSync('artifacts/release-v019',{recursive:true});const changedSources=files.filter(p=>hash(p)!==sourceHashes[p]),name=process.argv.find(x=>x.startsWith('--name='))?.slice(7)||'preparation-naturalness-audit';writeFileSync(`artifacts/release-v019/${name}.json`,JSON.stringify({sourceHashes,changedSources,rows,scope:'Actual GLB joints at stage boundaries and known dumbbell foot-contact boundaries. One-sided 0.1ms velocities are diagnostics, not clinical acceleration limits or trainer approval. Static holds are flagged for review, not automatically errors.'},null,2));
