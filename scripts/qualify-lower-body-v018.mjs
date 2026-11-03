import {createMocapFixtureV018} from './mocap-fixture-v018.mjs';
import {lowerBodyCapturedEffort,lowerBodyCaptureIds,lowerBodyCaptureInfo} from '../src/lower-body-capture-v018.js';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative} from 'node:path';

const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const option=(key,fallback)=>process.argv.find(x=>x.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
const ids=option('ids',lowerBodyCaptureIds.join(',')).split(','),name=option('name','lower-body-qualification');
if(ids.some(id=>!lowerBodyCaptureIds.includes(id))||!/^[a-z0-9-]+$/i.test(name))throw Error('Invalid qualification arguments');
function sourceFiles(){
 const found=new Set();function visit(path){if(found.has(path)||!existsSync(path))return;found.add(path);if(!/\.[cm]?js$/.test(path))return;for(const match of readFileSync(path,'utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){const next=relative(process.cwd(),resolve(dirname(path),match[1])).replaceAll('\\','/');visit(next);}}
 for(const file of ['src/extended-rig.js','src/equipment.js','src/skinned-character.js','src/collision-validation.js','src/data.js','scripts/mocap-fixture-v018.mjs','scripts/qualify-lower-body-v018.mjs','public/models/athlete/athlete.glb','public/models/athlete/rig.json'])visit(file);return[...found].sort();
}
const files=sourceFiles(),sourceHashes=Object.fromEntries(files.map(path=>[path,sha(path)])),baselineFiles=files.filter(path=>path.startsWith('src/')&&existsSync('.local-tools/v018-before/'+path)),baselineSourceHashes=Object.fromEntries(baselineFiles.map(path=>[path,sha('.local-tools/v018-before/'+path)]));
const startedAt=new Date().toISOString(),current=await createMocapFixtureV018(),before=await createMocapFixtureV018({baseline:true}),rows=[],failures=[];
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const joints=actor=>{const list=[];actor.group.traverse(object=>{if(object.isBone)list.push(object);});return list.sort((a,b)=>a.name.localeCompare(b.name));};
const currentBones=joints(current.character),beforeBones=joints(before.character);
function compare(actual,expected,label,row,tolerance=1e-9){
 if(typeof expected==='number'){if(typeof actual!=='number'||!Number.isFinite(actual)||!Number.isFinite(expected))throw Error(label+' nonfinite number');const delta=Math.abs(actual-expected);row.maxEquivalentPathDifference=Math.max(row.maxEquivalentPathDifference,delta);if(delta>tolerance)throw Error(label+' changed by '+delta);return;}
 if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length)throw Error(label+' array size');expected.forEach((v,i)=>compare(actual[i],v,label+'.'+i,row,tolerance));return;}
 if(expected&&typeof expected==='object'){if(!actual||JSON.stringify(Object.keys(actual).sort())!==JSON.stringify(Object.keys(expected).sort()))throw Error(label+' object fields');for(const key of Object.keys(expected))compare(actual[key],expected[key],label+'.'+key,row,tolerance);return;}
 if(actual!==expected)throw Error(label+' value changed');
}
const geometrySignatures=new WeakMap();
function geometrySignature(geometry){if(geometrySignatures.has(geometry))return geometrySignatures.get(geometry);const attributeSHA=attribute=>attribute?createHash('sha256').update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength)).digest('hex'):null;const signature={type:geometry.type,parameters:JSON.parse(JSON.stringify(geometry.parameters??null, (key,value)=>key==='uuid'?undefined:value)),positions:attributeSHA(geometry.attributes.position),normals:attributeSHA(geometry.attributes.normal),index:attributeSHA(geometry.index)};geometrySignatures.set(geometry,signature);return signature;}
function props(fixture,root){const {THREE}=fixture;root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),result=[];root.traverse(object=>{if(object.isMesh){matrix.multiplyMatrices(inverse,object.matrixWorld);result.push({geometry:geometrySignature(object.geometry),matrix:matrix.toArray()});}});return result;}
function cylinders(root){const {THREE}=current;root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),result=[];root.traverse(object=>{const p=object.geometry?.parameters;if(!object.isMesh||object.geometry.type!=='CylinderGeometry'||![.016,.036,.108,.115].some(r=>Math.abs(p.radiusTop-r)<1e-5))return;for(let node=object;node&&node!==root;node=node.parent)if(!node.visible)return;const scale=object.getWorldScale(new THREE.Vector3());result.push({center:object.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).toArray(),axis:new THREE.Vector3(0,1,0).transformDirection(object.matrixWorld).transformDirection(inverse).toArray(),radius:p.radiusTop*Math.max(scale.x,scale.z),halfLength:p.height*scale.y/2});});return result;}
function metalDepth(samples,cylinder){let max=0;for(const sample of samples){const d=sample.position.map((v,i)=>v-cylinder.center[i]),along=d.reduce((s,v,i)=>s+v*cylinder.axis[i],0),radial=Math.sqrt(Math.max(0,d.reduce((s,v)=>s+v*v,0)-along*along));max=Math.max(max,Math.min(cylinder.radius-radial,cylinder.halfLength-Math.abs(along)));}return max;}
function flexion(body,side){const a=body.knees[side].map((v,i)=>v-body.hips[side][i]),b=body.ankles[side].map((v,i)=>v-body.knees[side][i]);return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0)/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI;}
function originalPhase(effort){if(effort<=0)return 0;if(effort>=1)return .44;let lo=0,hi=1;for(let i=0;i<60;i++){const mid=(lo+hi)/2,value=mid*mid*(3-2*mid);if(value<effort)lo=mid;else hi=mid;}return .44*(lo+hi)/2;}
function measure(row,pose,contacts,volumes,root,referenceBody,label){
 const body=current.character.getContactPoints(),skin=current.character.getSurfaceSamples({stride:24});row.poses++;row.skinSamples+=skin.length;row.maxReachError=Math.max(row.maxReachError,body.maxReachError);
 for(const kind of ['hands','feet'])for(let side=0;side<2;side++)if(contacts?.[kind]?.[side])row.maxContactError=Math.max(row.maxContactError,dist(body[kind][side],contacts[kind][side]));
 for(let side=0;side<2;side++){
  row.maxBoneLengthError=Math.max(row.maxBoneLengthError,Math.abs(dist(body.shoulders[side],body.elbows[side])-current.metrics.arms[side].upper),Math.abs(dist(body.elbows[side],body.wrists[side])-current.metrics.arms[side].lower),Math.abs(dist(body.hips[side],body.knees[side])-current.metrics.legs[side].upper),Math.abs(dist(body.knees[side],body.ankles[side])-current.metrics.legs[side].lower));
  row.maxActualKneeFlexionDegrees=Math.max(row.maxActualKneeFlexionDegrees,flexion(body,side));if(referenceBody){row.maxOriginalKneeFlexionDegrees=Math.max(row.maxOriginalKneeFlexionDegrees,flexion(referenceBody,side));row.maxKneeFlexionDifferenceDegrees=Math.max(row.maxKneeFlexionDifferenceDegrees,Math.abs(flexion(body,side)-flexion(referenceBody,side)));}
 }
 for(const [kind,result]of [['body',evaluateExerciseClearance(body,volumes)],['self',evaluateSelfClearance(body)],['skin',evaluateSurfaceClearance(skin,volumes)]])for(const collision of result.collisions){row.collisionSamples++;if(!row.collisions.some(c=>c.kind===kind&&c.bodyPart===collision.bodyPart&&c.volumeId===collision.volumeId))row.collisions.push({kind,label,...collision});}
 if(row.mode==='pelvis-reference-and-tempo'){const hand=current.character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']});row.handSkinSamples+=hand.length;for(const cylinder of cylinders(root))row.maxHandMetalDepth=Math.max(row.maxHandMetalDepth,metalDepth(hand,cylinder));}
}

for(const id of ids){
 const info=lowerBodyCaptureInfo(id),rdl=id==='dumbbell-romanian-deadlift',station=id.replace(/^machine-/,''),now=rdl?current.rig:current.machines.get(station),old=rdl?before.rig:before.machines.get(station);
 const row={id,mode:info.kind,poses:0,grids:{phase101:0,phase121:0},uniquePhaseCountPerCycle:201,cycles:3,maxEquivalentPathDifference:0,maxReachError:0,maxContactError:0,maxBoneLengthError:0,maxHandMetalDepth:0,maxPelvisShiftPerAxis:0,maxPelvisTotalShift:0,maxActualKneeFlexionDegrees:0,maxOriginalKneeFlexionDegrees:0,maxKneeFlexionDifferenceDegrees:0,skinSamples:0,handSkinSamples:0,collisionSamples:0,collisions:[],fixedEndpointCases:0,errors:[],source:info};rows.push(row);
 try{
  if(!now||!old)throw Error('Machine fixture missing');if(rdl){now.prepare(id);old.prepare(id);}
  for(let cycle=0;cycle<3;cycle++)for(const divisions of [100,120])for(let index=0;index<=divisions;index++){
   const phase=index/divisions,clock=cycle+phase,effort=lowerBodyCapturedEffort(id,phase,clock),label=`cycle${cycle}/grid${divisions+1}/${index}`;
   const pose=rdl?now.sample(id,phase,clock):now.sampleActivity(phase,clock),reference=rdl?old.sample(id,originalPhase(effort),clock):old.update(effort,clock),root=rdl?now.getVisualRoot(id):now.group,oldRoot=rdl?old.getVisualRoot(id):old.group;
   current.character.pose(pose);before.character.pose(reference);const referenceBody=before.character.getContactPoints();
   if(!rdl){compare(pose,reference,label+' mechanism input pose',row);compare(props(current,root),props(before,oldRoot),label+' actual gear transforms',row);if(currentBones.length!==beforeBones.length)throw Error('Bone count changed');for(let i=0;i<currentBones.length;i++){compare(currentBones[i].matrixWorld.toArray(),beforeBones[i].matrixWorld.toArray(),label+' posed bone '+currentBones[i].name,row,1e-8);compare(currentBones[i].scale.toArray(),beforeBones[i].scale.toArray(),label+' bone scale',row);}if(phase===0||phase===.44||phase===1)row.fixedEndpointCases++;}
   else{
    compare(pose.feet,reference.feet,label+' fixed feet',row);compare(pose.handDirections,reference.handDirections,label+' fixed shaft directions',row,1e-8);
    const delta=pose.hip.map((v,i)=>v-reference.hip[i]);row.maxPelvisShiftPerAxis=Math.max(row.maxPelvisShiftPerAxis,...delta.map(Math.abs));row.maxPelvisTotalShift=Math.max(row.maxPelvisTotalShift,Math.hypot(...delta));
    for(const key of ['shoulder','head'])compare(pose[key].map((v,i)=>v-pose.hip[i]),reference[key].map((v,i)=>v-reference.hip[i]),label+' authored torso '+key,row,1e-8);
    for(let side=0;side<2;side++)compare(pose.hands[side].map((v,i)=>v-pose.hip[i]),reference.hands[side].map((v,i)=>v-reference.hip[i]),label+' authored arm relative path '+side,row,1e-8);
    if(phase===0||phase===1){compare(pose,reference,label+' common ready pose',row);row.fixedEndpointCases++;}
   }
   const contacts=rdl?now.getActualContacts(id):now.getActualContacts(),volumes=rdl?now.getCollisionVolumes(id):now.getCollisionVolumes();measure(row,pose,contacts,volumes,root,referenceBody,label);row.grids[divisions===100?'phase101':'phase121']++;
  }
  // Explicit canonical peak/rest check is separate from the 121-point grid.
  for(let cycle=0;cycle<3;cycle++)for(const phase of [0,.44,1]){const effort=lowerBodyCapturedEffort(id,phase,cycle);if(effort!==(phase===.44?1:0))throw Error('Canonical mechanism phase changed');if(!rdl){compare(now.sampleActivity(phase,cycle),old.update(effort,cycle),'canonical mounted pose',row);row.fixedEndpointCases++;}}
  row.pass=row.poses===666&&row.grids.phase101===303&&row.grids.phase121===363&&row.maxReachError<.015&&row.maxContactError<.015&&row.maxBoneLengthError<1e-5&&row.maxHandMetalDepth<=.001&&!row.collisions.length&&(!rdl||row.maxPelvisShiftPerAxis<=.00800001);
 }catch(error){row.pass=false;row.errors.push(error.stack||String(error));}
 if(!row.pass)failures.push({id,errors:row.errors,maxContactError:row.maxContactError,maxReachError:row.maxReachError,maxHandMetalDepth:row.maxHandMetalDepth,collisions:row.collisions});
 if(rdl){now.end({keepVisible:false});old.end({keepVisible:false});}
 console.log(JSON.stringify({id,pass:row.pass,poses:row.poses,maxContactError:row.maxContactError,maxReachError:row.maxReachError,maxHandMetalDepth:row.maxHandMetalDepth,maxPelvisShiftPerAxis:row.maxPelvisShiftPerAxis,maxPelvisTotalShift:row.maxPelvisTotalShift,maxKneeDifference:row.maxKneeFlexionDifferenceDegrees,collisions:row.collisions,errors:row.errors.map(x=>x.split('\n')[0])}));
}
current.character.dispose();before.character.dispose();
const changedSources=files.filter(path=>sha(path)!==sourceHashes[path]),changedBaselineSources=baselineFiles.filter(path=>sha('.local-tools/v018-before/'+path)!==baselineSourceHashes[path]);
const report={pass:!failures.length&&!changedSources.length&&!changedBaselineSources.length,startedAt,completedAt:new Date().toISOString(),ids,sourceHashes,baselineSourceHashes,changedSources,changedBaselineSources,rows,failures,totalPoses:rows.reduce((sum,row)=>sum+row.poses,0),scope:'Actual GLB skeleton/IK, local mechanism input poses, rendered gear transforms, fixed bone lengths, body/self and stride24 skin. Three source repetitions on 101- and121-point grids; overlapping samples are counted as executions,201 unique phases/cycle. Seven machines are retiming-only, compared at identical mechanism effort to frozen v0.17. RDL retains authored slight-knee/torso/hand geometry with bounded measured pelvis translation; full hand skin tests actual dumbbell metal at stride1. No threshold exemptions or trainer/continuous-motion certification.'};
mkdirSync('artifacts/mocap-v018',{recursive:true});writeFileSync(`artifacts/mocap-v018/${name}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,totalPoses:report.totalPoses,changedSources,changedBaselineSources,failures}));if(!report.pass)process.exitCode=1;
