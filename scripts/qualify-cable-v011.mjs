import {THREE,character,metrics,rig} from './dumbbell-test-helpers.mjs';
import {CABLE_IDS_V011} from '../src/cable-exercises-v011.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
import {cylinderHandMeasure} from './equipment-grip-test-helpers.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const count=Number(process.env.CABLE_PHASE_COUNT||121),ids=process.argv.slice(2).length?process.argv.slice(2):CABLE_IDS_V011;
const move=(p,o)=>p.map((v,i)=>v+o[i]),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const sources=['src/cable-stages-v011.js','src/cable-exercises-v011.js','src/extended-rig.js','src/rig-lifecycle.js','src/skinned-character.js','public/models/athlete/athlete.glb'];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),hashes=Object.fromEntries(sources.map(p=>[p,hash(p)]));
function cylinders(root){root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),out=[];root.traverse(mesh=>{if(!mesh.isMesh||mesh.geometry?.type!=='CylinderGeometry')return;const p=mesh.geometry.parameters,scale=mesh.getWorldScale(new THREE.Vector3());out.push({center:mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).toArray(),axis:new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld).transformDirection(inverse).toArray(),radius:p.radiusTop*Math.max(scale.x,scale.z),halfLength:p.height*scale.y/2});});return out;}
function penetration(samples,cylinder){let depth=0,part;for(const sample of samples){const delta=sample.position.map((v,i)=>v-cylinder.center[i]),along=delta.reduce((sum,v,i)=>sum+v*cylinder.axis[i],0),radial=Math.sqrt(Math.max(0,delta.reduce((sum,v)=>sum+v*v,0)-along*along)),value=Math.min(cylinder.radius-radial,cylinder.halfLength-Math.abs(along));if(value>depth){depth=value;part=sample.part;}}return{depth,part};}
const results=[];
for(const id of ids){
  rig.prepare(id);const meta=rig.getLifecycle(id),r={id,frames:0,entryDuration:meta.entryDuration,maxContactError:0,maxReachError:0,maxBoneLengthError:0,maxHandMetalDepth:0,maxBodyMetalDepth:0,collisions:[],selfCollisions:[],surfaceCollisions:[],metalViolations:[],footErrors:[],gripErrors:[],seams:[]};
  const issue=(key,value)=>{if(!r[key].some(item=>item.stage===value.stage&&item.bodyPart===value.bodyPart&&item.volumeId===value.volumeId&&item.part===value.part))r[key].push(value);};
  function sample(mode,p){
    const frame=mode==='loop'?{pose:rig.sample(id,p,p),offset:[0,0,0],stage:'exercise',gear:'held',contacts:{hands:[true,true],feet:[true,true]}}:rig.sampleLifecycle(id,mode,p);
    character.pose(frame.pose);const local=character.getContactPoints(),body={...local};for(const k of ['hands','feet','shoulders','elbows','wrists','hips','knees','ankles'])body[k]=local[k].map(value=>move(value,frame.offset));
    const diagnostics=character.getHandDiagnostics();for(let side=0;side<2;side++){const degrees=diagnostics[side].wristBendRadians*180/Math.PI;r.maxWristDegrees=Math.max(r.maxWristDegrees||0,degrees);if(frame.contacts.hands[side])r.maxHeldWristDegrees=Math.max(r.maxHeldWristDegrees||0,degrees);}
    const target=rig.getActualContacts(id),volumes=rig.getCollisionVolumes(id);r.frames++;r.maxReachError=Math.max(r.maxReachError,body.maxReachError);
    for(let side=0;side<2;side++){
      r.maxBoneLengthError=Math.max(r.maxBoneLengthError,Math.abs(distance(body.shoulders[side],body.elbows[side])-metrics.arms[side].upper),Math.abs(distance(body.elbows[side],body.wrists[side])-metrics.arms[side].lower),Math.abs(distance(body.hips[side],body.knees[side])-metrics.legs[side].upper),Math.abs(distance(body.knees[side],body.ankles[side])-metrics.legs[side].lower));
      for(const key of ['hands','feet'])if(frame.contacts[key][side])r.maxContactError=Math.max(r.maxContactError,distance(target[key][side],body[key][side]));
    }
    if(body.maxReachError>=r.maxReachError)r.worstReach={mode,phase:p,stage:frame.stage,error:body.maxReachError};
    const all=character.getSurfaceSamples({stride:24}).map(value=>({...value,position:move(value.position,frame.offset)})),hand=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']}).map(value=>({...value,position:move(value.position,frame.offset)})),cs=cylinders(rig.getVisualRoot(id));
    for(let side=0;side<2;side++)if(frame.contacts.hands[side]&&(frame.pose.handGripStrength?.[side]??1)>.995){
      const part=side?'rightHand':'leftHand',grips=cs.filter(c=>Math.abs(c.radius-.016)<1e-5),shaft=grips.sort((a,b)=>distance(a.center,body.hands[side])-distance(b.center,body.hands[side]))[0];
      const measure=cylinderHandMeasure(hand.filter(value=>value.part===part),shaft);r.maxGripGap=Math.max(r.maxGripGap||0,measure.minGap||0);
      if(!measure.wraps||measure.minGap>.008||measure.maxDepth>.001)issue('gripErrors',{mode,phase:p,stage:frame.stage,part,...measure});
    }
    for(const c of cs){const h=penetration(hand,c),b=penetration(all.filter(s=>!['leftHand','rightHand'].includes(s.part)),c);r.maxHandMetalDepth=Math.max(r.maxHandMetalDepth,h.depth);r.maxBodyMetalDepth=Math.max(r.maxBodyMetalDepth,b.depth);if(h.depth>.001||b.depth>.004)issue('metalViolations',{mode,phase:p,stage:frame.stage,part:h.depth>.001?h.part:b.part,depth:Math.max(h.depth,b.depth),cylinder:c});}
    const shoes=character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}).map(value=>({...value,position:move(value.position,frame.offset)}));
    for(let side=0;side<2;side++){const part=side?'rightFoot':'leftFoot',gap=Math.min(...shoes.filter(v=>v.part===part).map(v=>v.position[1]));if(gap<-.008||(frame.contacts.feet[side]&&gap>.016))issue('footErrors',{mode,phase:p,stage:frame.stage,part,gap});}
    for(const [key,items]of [['collisions',evaluateExerciseClearance(body,volumes).collisions],['selfCollisions',evaluateSelfClearance(body).collisions],['surfaceCollisions',evaluateSurfaceClearance(all,volumes).collisions]])for(const item of items)issue(key,{...item,mode,phase:p,stage:frame.stage});
    return{body,hand,frame,props:rig.getLifecycleState(id)};
  }
  for(const mode of ['loop','enter','exit']){let previous;for(let i=0;i<count;i++){const current=sample(mode,i/(count-1));if(previous){const dt=(mode==='loop'?7:meta.entryDuration)/(count-1);for(let side=0;side<2;side++)r.maxElbowSpeed=Math.max(r.maxElbowSpeed||0,distance(current.body.elbows[side],previous.body.elbows[side])/dt);}previous=current;}}
  const discontinuity=(a,b)=>{let joint=0,skin=0,prop=0;for(const k of ['hands','feet','shoulders','elbows','wrists','hips','knees','ankles'])for(let i=0;i<2;i++)joint=Math.max(joint,distance(a.body[k][i],b.body[k][i]));for(let i=0;i<a.hand.length;i++)skin=Math.max(skin,distance(a.hand[i].position,b.hand[i].position));for(let i=0;i<a.props.propPositions.length;i++)prop=Math.max(prop,distance(a.props.propPositions[i],b.props.propPositions[i]));return{joint,skin,prop};};
  let elapsed=0;for(const node of meta.stages){elapsed+=node.duration;if(elapsed>=meta.entryDuration-1e-6)continue;const p=elapsed/meta.entryDuration,e=1e-4/meta.entryDuration;r.seams.push({stage:node.label,...discontinuity(sample('enter',p-e),sample('enter',p+e))});}
  r.readySeam=discontinuity(sample('enter',1),sample('loop',0));r.loopSeam=discontinuity(sample('loop',1),sample('loop',0));
  // These are authored animation budgets, not clinical joint safety limits.
  r.pass=r.maxContactError<.015&&r.maxReachError<.015&&r.maxBoneLengthError<1e-5&&r.maxHandMetalDepth<=.001&&r.maxBodyMetalDepth<=.004&&r.maxWristDegrees<32&&r.maxHeldWristDegrees<25&&r.maxElbowSpeed<2.5&&!['collisions','selfCollisions','surfaceCollisions','metalViolations','footErrors','gripErrors'].some(key=>r[key].length)&&[r.readySeam,r.loopSeam,...r.seams].every(seam=>Math.max(seam.joint,seam.skin,seam.prop)<.001);
  results.push(r);console.log(JSON.stringify({...r,seams:undefined}));
}
const changedSources=sources.filter(path=>hash(path)!==hashes[path]),report={count,hashes,changedSources,pass:results.every(r=>r.pass)&&!changedSources.length,results};writeFileSync(`artifacts/v011-cable-qualification-${process.env.CABLE_REPORT_LABEL||'pilot'}.json`,JSON.stringify(report,null,2));character.dispose();if(!report.pass)process.exitCode=1;
