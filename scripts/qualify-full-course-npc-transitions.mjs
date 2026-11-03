import * as THREE from 'three';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {stations} from '../src/data.js';
import {gymLayout,facilityStations,floorHeightAt} from '../src/gym-layout.js';
import {createGymArchitecture} from '../src/gym-architecture.js';
import {createGroupClassSystem} from '../src/classes/group-class-system.js';
import {groupClassDefinitions} from '../src/classes/class-data.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
import {coursePlanFor} from '../src/classes/class-timeline.js';
import {createHash} from 'node:crypto';

// Canvas drawing is irrelevant to CPU navigation/skin tests. Production geometry,
// collider dimensions, facility state and the real human skeleton are retained.
const noop=()=>{};
globalThis.document={createElement(){return {width:1,height:1,getContext(){return new Proxy({}, {get:(target,key)=>target[key]||noop,set:(target,key,value)=>(target[key]=value,true)});}};}};
const scene=new THREE.Scene(),geometries=new Set(),extraMaterials=new Set(),textures=new Set(),colliders=[];
const materials=Object.fromEntries(['rubber','rubberAlt','graphite','steel','chrome','pad','accent','cream','wood','black','white','grass','glass','light'].map(key=>[key,new THREE.MeshStandardMaterial()]));
const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);parent.add(object);return object;};
const box=(parent,x,y,z,w,h,d,material)=>mesh(parent,new THREE.BoxGeometry(w,h,d),material,x,y,z);
const cylinder=(parent,x,y,z,r,h,material,sides=12)=>mesh(parent,new THREE.CylinderGeometry(r,r,h,sides),material,x,y,z);
const sphere=(parent,x,y,z,r,material)=>mesh(parent,new THREE.SphereGeometry(r,10,8),material,x,y,z);
const rod=(parent,a,b,r=.05,material=materials.graphite)=>{const object=cylinder(parent,0,0,0,r,1,material),av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),direction=bv.sub(av);object.position.copy(av).addScaledVector(direction,.5);object.scale.y=direction.length();object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;};
const label=(parent,text,x,y,z)=>{const object=new THREE.Group();object.position.set(x,y,z);parent.add(object);return object;};
const collider=(x,z,w,d,padding=0)=>{const record={x,z,hx:w/2+padding,hz:d/2+padding};colliders.push(record);return record;};
const architecture=createGymArchitecture({THREE,scene,materials,geometries,extraMaterials,textures,box,cylinder,sphere,rod,label,collider,plant:noop,dumbbell:parent=>{const group=new THREE.Group();parent.add(group);return group;}});
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata,geometries,extraMaterials,textures}),metrics=character.getAssetInfo().metrics;

const station=facilityStations.find(s=>s.id==='group-class'),system=createGroupClassSystem({THREE,scene,metrics,materials,geometries,extraMaterials,architecture,station}),anchors=architecture.getSceneAnchors(),up=new THREE.Vector3(0,1,0),results=[],reportName=process.env.FORM_REPORT_NAME||'full-course-npc-transitions.json';
const actorInfo=[{id:'class-instructor',lag:0,...anchors.classInstructor},{id:'class-participant-1',lag:.10,...anchors.classParticipants[0]},{id:'class-participant-2',lag:.18,...anchors.classParticipants[1]}];
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),copy=v=>structuredClone(v);
const checkedSources=['src/equipment.js','src/skinned-character.js','src/hand-contact-frame.js','src/cardio-lifecycle-paths.js','src/machine-lifecycle.js','src/classes/course-plans.js','src/classes/class-timeline.js','src/classes/class-data.js','src/classes/group-class-system.js','src/classes/equipment-programs.js','src/classes/floor-programs.js','src/classes/warmup-program.js'];
const hashSources=()=>Object.fromEntries(checkedSources.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),sourceHashes=hashSources();
const requiredFixtures=['classroom-wall-west','classroom-wall-front','classroom-wall-back','classroom-wall-entry-front','classroom-wall-entry-back','classroom-stage'];
function sourceTime(d){const plan=coursePlanFor(d.classKind),main=plan.blocks.filter(b=>b.stage==='main'),motion={warmup:'shoulder-open',dance:'arm-combo',trx:'trx-alternating-row',barbell:'put-down-rest',aerial:'aerial-assisted-hinge',pilates:'bridge'}[d.classKind];let b=d.classKind==='cycle'?[...main].sort((a,b)=>b.cadenceRPM-a.cadenceRPM)[0]:main.find(b=>b.motionId===motion);if(!b)throw new Error(`No representative source block: ${d.id}`);const seconds=['cycle','barbell'].includes(d.classKind)?b.startSeconds+b.seconds*.5+.17:b.startSeconds+(Math.floor(b.repetitions*.45)+.5)*b.seconds/b.repetitions;return{seconds,blockId:b.id,motionId:b.motionId,cadenceRPM:b.cadenceRPM||0};}
function readyFor(d){return system.getDiagnostics().npcs.every(a=>a.kind===d.classKind&&a.status==='using');}
function settle(d){system.prepare(d.id);for(let step=0;step<2400;step++){system.update(.05,{phase:null,active:false});if(readyFor(d))return;}throw new Error(`Initial NPC preparation timed out: ${d.id}`);}
function actorResult(id){return{id,poses:0,maxReach:0,maxTarget:0,maxHandContact:0,maxFootContact:0,maxJointStep:0,maxClockError:0,minSkinFloor:null,minSoleFloor:null,proxyPairs:0,surfacePairs:0,strictShoePairs:0,collisions:[],self:[],skin:[],strictShoe:[],floorIssues:[],missingFixtures:[],statuses:[],sourceHands:null,clockSamples:0};}
function inspect(result,r,info,frame,state,step,seconds,previous,expectedClock=null){
  const volumes=system.getNPCCollisionVolumes(info.id),targets=system.getNPCActualContacts(info.id);character.pose(frame.pose);const local=character.getContactPoints(),body=transformBody(local,frame);r.poses++;r.maxReach=Math.max(r.maxReach,local.maxReachError);if(!r.statuses.includes(state.status))r.statuses.push(state.status);
  for(const id of requiredFixtures)if(!volumes.some(v=>v.id===id||v.id.startsWith(id+'-'))&&!r.missingFixtures.includes(id))r.missingFixtures.push(id);
  for(const field of ['hands','feet'])for(let side=0;side<2;side++)r.maxTarget=Math.max(r.maxTarget,distance(local[field][side],frame.pose[field][side]));
  for(let side=0;side<2;side++){if(frame.contacts?.hands[side]&&targets?.hands?.[side])r.maxHandContact=Math.max(r.maxHandContact,distance(body.hands[side],targets.hands[side]));if(frame.contacts?.feet[side]&&targets?.feet?.[side])r.maxFootContact=Math.max(r.maxFootContact,distance(body.feet[side],targets.feet[side]));}
  if(expectedClock!==null){r.clockSamples++;r.maxClockError=Math.max(r.maxClockError,Math.abs((frame.course?.elapsed??-100)-expectedClock));}
  if(previous)for(const key of ['hands','feet','shoulders','hips','elbows','knees'])for(let side=0;side<2;side++){const d=distance(body[key][side],previous.body[key][side]);if(d>r.maxJointStep){r.maxJointStep=d;r.worstJointStep={key,side,distance:d,step,seconds,status:state.status,kind:state.kind,stage:frame.stage,previousStatus:previous.state.status,previousStage:previous.frame.stage,from:previous.body[key][side],to:body[key][side],frame:copy(frame),previousFrame:previous.frame};}}
  const details={step,seconds,status:state.status,kind:state.kind,stage:frame.stage,motionId:frame.course?.motionId||null};
  const record=(key,hits)=>{for(const hit of hits){const same=r[key].find(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId&&h.otherBodyPart===hit.otherBodyPart&&h.status===details.status&&h.stage===details.stage),trace=key==='strictShoe'?{frame:copy(frame),volume:copy(volumes.find(v=>v.id===hit.volumeId))}:{};if(!same)r[key].push({...hit,...details,...trace});else if(hit.depth>same.depth)Object.assign(same,hit,details,trace);}};
  const proxy=evaluateExerciseClearance(body,volumes);r.proxyPairs+=proxy.testedPairs;record('collisions',proxy.collisions);record('self',evaluateSelfClearance(local).collisions);
  const samples=transformSurface(character.getSurfaceSamples({stride:32}),frame),skin=evaluateSurfaceClearance(samples,volumes);r.surfacePairs+=skin.testedPairs;record('skin',skin.collisions);
  const world=p=>new THREE.Vector3(...p).applyAxisAngle(up,info.rotation||0).add(new THREE.Vector3(...info.position));for(const sample of samples){const p=world(sample.position);r.minSkinFloor=Math.min(r.minSkinFloor??Infinity,p.y-floorHeightAt(p.x,p.z));}
  const shoes=transformSurface(character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),frame),strict=evaluateSurfaceClearance(shoes,volumes.map(v=>({...v,allowedBodyParts:(v.allowedBodyParts||[]).filter(p=>p!=='leftFoot'&&p!=='rightFoot')})));r.strictShoePairs+=strict.testedPairs;record('strictShoe',strict.collisions);
  for(const sample of shoes){const p=world(sample.position),gap=p.y-floorHeightAt(p.x,p.z);r.minSoleFloor=Math.min(r.minSoleFloor??Infinity,gap);if(gap<-.004&&!r.floorIssues.some(h=>h.part===sample.part&&h.status===state.status&&h.stage===frame.stage))r.floorIssues.push({part:sample.part,gap,...details});}
  return{body:copy(body),frame:copy(frame),state:copy(state)};
}
settle(process.env.FORM_FROM?groupClassDefinitions.find(d=>d.id===process.env.FORM_FROM):groupClassDefinitions[0]);
for(let index=0;index<groupClassDefinitions.length;index++){
  const from=groupClassDefinitions[index],to=groupClassDefinitions[(index+1)%groupClassDefinitions.length],source=sourceTime(from),result={from:from.id,to:to.id,source,dt:.05,timedOut:false,actorResults:actorInfo.map(a=>actorResult(a.id)),flags:[]},previous=new Map(),sourceClocks=new Map();
  if(process.env.FORM_FROM&&from.id!==process.env.FORM_FROM)continue;
  if(!readyFor(from))throw new Error(`Prior transition did not settle to ${from.id}`);system.begin(from.id);system.sample(from.id,source.seconds/from.duration);system.update(0,{phase:source.seconds/from.duration,active:true});
  for(let ai=0;ai<actorInfo.length;ai++){const info=actorInfo[ai],r=result.actorResults[ai],frame=system.sampleNPC(info.id,source.seconds/from.duration),state=system.getDiagnostics().npcs.find(a=>a.id===info.id),clock=Math.max(0,source.seconds-info.lag);sourceClocks.set(info.id,clock);r.sourceHands=copy(frame.contacts.hands);previous.set(info.id,inspect(result,r,info,frame,state,-1,0,null,clock));if(from.classKind==='barbell'&&frame.contacts.hands.some(Boolean))result.flags.push({actor:info.id,type:'barbell-source-not-empty-handed'});}
  // The deliberate seek above is not included in 50 ms velocity measurements.
  system.prepare(to.id);let steps=0;
  for(;steps<2400;steps++){
    system.update(.05,{phase:null,active:false});const states=system.getDiagnostics().npcs;
    for(let ai=0;ai<actorInfo.length;ai++){const info=actorInfo[ai],r=result.actorResults[ai],frame=system.sampleNPC(info.id),state=states.find(a=>a.id===info.id),clock=frame.course?sourceClocks.get(info.id):null;previous.set(info.id,inspect(result,r,info,frame,state,steps,(steps+1)*.05,previous.get(info.id),clock));}
    if(readyFor(to)){result.transitionSeconds=(steps+1)*.05;break;}
  }
  result.timedOut=steps>=2400;
  if(!result.timedOut){system.begin(to.id);for(let tick=0;tick<5;tick++){const elapsed=tick*.05,phase=elapsed/to.duration;system.sample(to.id,phase);system.update(tick?.05:0,{phase,active:true});const states=system.getDiagnostics().npcs;for(let ai=0;ai<actorInfo.length;ai++){const info=actorInfo[ai],r=result.actorResults[ai],frame=system.sampleNPC(info.id,phase),state=states.find(a=>a.id===info.id);previous.set(info.id,inspect(result,r,info,frame,state,steps+tick+1,result.transitionSeconds+elapsed,previous.get(info.id),Math.max(0,elapsed-info.lag)));}}}
  result.pass=!result.timedOut&&!result.flags.length&&result.actorResults.every(r=>r.maxReach<.001&&r.maxTarget<.001&&r.maxHandContact<.001&&r.maxFootContact<.001&&r.maxJointStep<=.25&&r.maxClockError<1e-7&&r.minSkinFloor>=-.008&&r.minSoleFloor>=-.004&&!r.collisions.length&&!r.self.length&&!r.skin.length&&!r.strictShoe.length&&!r.floorIssues.length&&!r.missingFixtures.length);
  results.push(result);writeFileSync('artifacts/full-course-npc-transitions-progress.json',JSON.stringify({results},null,2));console.log(JSON.stringify({from:result.from,to:result.to,seconds:result.transitionSeconds,pass:result.pass,actors:result.actorResults.map(r=>({id:r.id,poses:r.poses,jump:r.maxJointStep,reach:r.maxReach,hand:r.maxHandContact,sole:r.minSoleFloor,proxy:r.collisions.length,self:r.self.length,skin:r.skin.length,strictShoe:r.strictShoe.length,clock:r.maxClockError,worst:r.maxJointStep>.25?r.worstJointStep:undefined}))}));
}
const finalHashes=hashSources(),changedSources=checkedSources.filter(path=>sourceHashes[path]!==finalHashes[path]),report={pass:results.every(r=>r.pass)&&!changedSources.length,scope:'Full-course NPC handoffs, including Pilates to warmup in the default all-7 run. Seek actual main-stage poses before resetting velocity baseline; fast cycling and empty-handed barbell rest included. Continuous dt .05 through return, exit, transfer, enter and sync; start the next course only when all three NPCs are using the new kind. Production GLB, all classroom walls/stage, actual grip/foot targets, every-frame skin32/self/proxy and full shoe vertices with no foot exemptions.',dt:.05,skinStride:32,shoeStride:1,sourceHashes,changedSources,totals:{transitions:results.length,poses:results.reduce((s,r)=>s+r.actorResults.reduce((a,b)=>a+b.poses,0),0),surfacePairs:results.reduce((s,r)=>s+r.actorResults.reduce((a,b)=>a+b.surfacePairs,0),0),strictShoePairs:results.reduce((s,r)=>s+r.actorResults.reduce((a,b)=>a+b.strictShoePairs,0),0)},results};writeFileSync(`artifacts/${reportName}`,JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;





