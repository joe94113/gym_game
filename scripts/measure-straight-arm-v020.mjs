import {createMocapFixtureV018} from './mocap-fixture-v018.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const f=await createMocapFixtureV018(),rows=[],id='cable-straight-arm-pulldown';
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
try{
 f.rig.prepare(id);f.character.setMuscleHighlights(['lats'],['triceps']);f.character.setMuscleOverlayEnabled(true);const muscles=f.character.getMuscleHighlights();
 for(let i=0;i<=200;i++){
  const phase=i/200,pose=f.rig.sample(id,phase,0);f.character.pose(pose);const b=f.character.getContactPoints();
  const angles=[0,1].map(side=>{const a=b.shoulders[side].map((v,j)=>v-b.elbows[side][j]),c=b.wrists[side].map((v,j)=>v-b.elbows[side][j]);return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,j)=>s+v*c[j],0)/(Math.hypot(...a)*Math.hypot(...c)))))*180/Math.PI;});
  rows.push({phase,angles,reach:b.maxReachError,wristDegrees:f.character.getHandDiagnostics().map(h=>h.wristBendRadians*180/Math.PI),muscleHighlightsRetained:f.character.getMuscleOverlayEnabled()&&JSON.stringify(f.character.getMuscleHighlights())===JSON.stringify(muscles)});
 }
 const before=JSON.parse(readFileSync('artifacts/public-teaching-v020/straight-arm-before.json'));
 const report={id,phaseCount:rows.length,gpu:false,sourceHashes:Object.fromEntries(['src/cable-stages-v011.js','src/skinned-character.js','src/dumbbell-grip.js','src/hand-contact-frame.js','scripts/measure-straight-arm-v020.mjs','public/models/athlete/athlete.glb'].map(p=>[p,sha(p)])),metrics:f.metrics.arms,before:{minimum:before.minimumElbowIncludedAngle,maximum:before.maximumElbowIncludedAngle},after:{minimum:Math.min(...rows.flatMap(r=>r.angles)),maximum:Math.max(...rows.flatMap(r=>r.angles)),maximumWristDegrees:Math.max(...rows.flatMap(r=>r.wristDegrees)),muscleHighlightsRetained:rows.every(r=>r.muscleHighlightsRetained)},rows,scope:'Actual production GLB shoulder-elbow-wrist included angle; 180 degrees denotes a straight elbow. Approximately 165 degrees is this model’s small fixed-bend design target, not a clinical or universal exercise prescription. The existing authored shoulder arc .83–2.51 radians is retained as a conservative demonstration, not a claim of every participant’s full exercise range. CPU measurements do not constitute human approval or GPU review.'};
 mkdirSync('artifacts/public-teaching-v020',{recursive:true});writeFileSync('artifacts/public-teaching-v020/straight-arm-angle-after.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,metrics:undefined,rows:undefined,sourceHashes:undefined}));
}finally{f.character.dispose();}
