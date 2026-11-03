import {THREE,character,rig} from './dumbbell-test-helpers.mjs';
import {DUMBBELL_IDS} from '../src/dumbbell-grip.js';
import {cylinderHandMeasure} from './equipment-grip-test-helpers.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const count=301,V=p=>new THREE.Vector3(...p),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sources=['src/dumbbell-lifecycle-paths.js','src/dumbbell-grip.js','src/free-dumbbell-shaft.js','src/rig-lifecycle.js','src/hand-contact-frame.js','src/extended-rig.js','src/exercise-rig.js','src/incline-bench.js','src/skinned-character.js','public/models/athlete/athlete.glb'],hashes=Object.fromEntries(sources.map(p=>[p,hash(p)]));
const cases=[...DUMBBELL_IDS.filter(id=>id!=='dumbbell-goblet-squat').map(id=>({id,settings:id==='dumbbell-bench-press'?{benchAngle:0}:null})),{id:'dumbbell-bench-press',settings:{benchAngle:30}}],results=[];

// Cylinder parameters alone omit the rod's per-instance length/rotation.
// Transform the actual mesh endpoints back into the same rig-local frame as
// the skin samples (plus lifecycle offset); no authored contact targets enter.
function actualShafts(root){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),shafts=[];
 root.traverse(mesh=>{
  const p=mesh.geometry?.parameters;if(!mesh.isMesh||mesh.geometry.type!=='CylinderGeometry'||Math.abs(p.radiusTop-.016)>1e-8||Math.abs(p.radiusBottom-.016)>1e-8)return;
  const matrix=inverse.clone().multiply(mesh.matrixWorld),start=new THREE.Vector3(0,-p.height/2,0).applyMatrix4(matrix),end=new THREE.Vector3(0,p.height/2,0).applyMatrix4(matrix),delta=end.clone().sub(start),sx=new THREE.Vector3().setFromMatrixColumn(matrix,0).length(),sz=new THREE.Vector3().setFromMatrixColumn(matrix,2).length();
  shafts.push({center:start.add(end).multiplyScalar(.5).toArray(),axis:delta.clone().normalize().toArray(),halfLength:delta.length()/2,radius:p.radiusTop*Math.max(sx,sz),radialScaleDifference:Math.abs(sx-sz)});
 });return shafts;
}
function actualMaximumDepth(samples,shaft){
 const axis=V(shaft.axis),center=V(shaft.center);let max=0;
 for(const sample of samples){const p=V(sample.position).sub(center),along=p.dot(axis);if(Math.abs(along)>shaft.halfLength)continue;const radial=p.addScaledVector(axis,-along).length(),depth=Math.min(shaft.radius-radial,shaft.halfLength-Math.abs(along));max=Math.max(max,depth);}return max;
}
const observation=()=>({closedHandSamples:0,wrapFailures:0,maxMinGap:null,maxDepth:0,minSampleCount:Infinity,worstGap:null,worstDepth:null});
function observe(result,measure,depth,sampleCount,where){
 result.closedHandSamples++;result.wrapFailures+=measure.wraps?0:1;result.minSampleCount=Math.min(result.minSampleCount,sampleCount);
 if(measure.minGap===null||result.maxMinGap===null||measure.minGap>result.maxMinGap){result.maxMinGap=measure.minGap;result.worstGap={...where,gap:measure.minGap,wraps:measure.wraps};}
 if(depth>result.maxDepth){result.maxDepth=depth;result.worstDepth={...where,depth};}
}
for(const c of cases){
 rig.end({keepVisible:false});if(c.settings){const change=rig.setEquipmentSettings(c.id,c.settings);if(!change.ok)throw Error(JSON.stringify(change));}rig.prepare(c.id);
 const meta=rig.getLifecycle(c.id),r={...c,frames:0,skippedOpenOrUnownedHands:0,...observation(),byStage:{},violations:[]};
 for(const mode of ['loop','enter','exit']){
  const phases=new Set(Array.from({length:count},(_,i)=>i/(count-1)));
  if(mode!=='loop'){
   let elapsed=0;for(const stage of meta.stages){elapsed+=stage.duration;if(elapsed>=meta.entryDuration-1e-9)continue;const boundary=mode==='enter'?elapsed:meta.entryDuration-elapsed;for(const epsilon of [-.0001,0,.0001])phases.add(THREE.MathUtils.clamp((boundary+epsilon)/meta.entryDuration,0,1));}
   // Also sample the near-ready one-sided endpoints that exposed the inherited
   // elbow/palm seam, rather than checking the canonical endpoint alone.
   phases.add(.0001/meta.entryDuration);phases.add(1-.0001/meta.entryDuration);
  }
  for(const phase of [...phases].sort((a,b)=>a-b)){
   const frame=mode==='loop'?{pose:rig.sample(c.id,phase,phase),offset:[0,0,0],contacts:{hands:c.id==='dumbbell-single-arm-row'?[false,true]:[true,true]},stage:'exercise'}:rig.sampleLifecycle(c.id,mode,phase);
   character.pose(frame.pose);r.frames++;const shafts=actualShafts(rig.getVisualRoot(c.id)),one=c.id==='dumbbell-single-arm-row';if(shafts.length!==(one?1:2))throw Error(`${c.id} actual shaft count ${shafts.length}`);
   for(let side=0;side<2;side++){
    const strength=frame.pose.handGripStrength?.[side]??((frame.pose.handGripping?.[side]??frame.pose.gripping)?1:0);
    if(!frame.contacts.hands[side]||strength<.99){r.skippedOpenOrUnownedHands++;continue;}
    const part=side?'rightHand':'leftHand',samples=character.getSurfaceSamples({stride:1,parts:[part]}).map(s=>({...s,position:s.position.map((v,i)=>v+frame.offset[i])})),shaftIndex=one?0:side,shaft=shafts[shaftIndex],measure=cylinderHandMeasure(samples,shaft),depth=actualMaximumDepth(samples,shaft),where={mode,phase,stage:frame.stage,side,logicalPart:part,strength,shaftIndex,shaft};
    const stage=r.byStage[`${mode}:${frame.stage}`]??=observation();observe(r,measure,depth,samples.length,where);observe(stage,measure,depth,samples.length,where);
    if(!measure.wraps||measure.minGap===null||measure.minGap>.003||depth>.001||shaft.radialScaleDifference>1e-8){const failure={...where,wraps:measure.wraps,minGap:measure.minGap,maxDepth:depth,sampleCount:samples.length};r.violations.push(failure);if(r.violations.length<=3)console.log(JSON.stringify({failure:c.id,settings:c.settings,...failure}));}
   }
  }
 }
 r.pass=r.closedHandSamples>0&&!r.violations.length;results.push(r);console.log(JSON.stringify({id:r.id,settings:r.settings,frames:r.frames,closedHandSamples:r.closedHandSamples,maxMinGap:r.maxMinGap,maxDepth:r.maxDepth,wrapFailures:r.wrapFailures,violations:r.violations.length,pass:r.pass}));
}
const changedSources=sources.filter(p=>hash(p)!==hashes[p]),report={version:'0.10',count,hashes,changedSources,thresholds:{minimumGripStrength:.99,maximumGapMetres:.003,maximumDepthMetres:.001},scope:'Seven shaft-grip dumbbell activities plus the calibrated 30-degree bench. Actual production GLB logical single-hand skin vertices at stride 1 against the actual visual-root 16mm CylinderGeometry shaft dimensions. Per-mode 301 samples, all stage boundaries ±0.1ms, and one-sided lifecycle endpoints. Only owned, closed hands are included; cup support keeps its separate existing qualification.',limitations:'wraps means that the convex hull of ONE hand skin point projection contains the shaft axis over the finite cylinder span. It does not prove individual-finger contact, exact triangle collision freedom, continuous-time clearance, clinical load safety, or human coach approval. Open/unowned hands are excluded by contract; the separate ergonomics report checks their collision clearance.',results,pass:!changedSources.length&&results.every(r=>r.pass)};
writeFileSync('artifacts/v010-dumbbell-grip-closure.json',JSON.stringify(report,null,2));character.dispose();if(!report.pass)process.exitCode=1;
