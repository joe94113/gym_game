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
import {coursePlanFor,courseTimelineAt} from '../src/classes/class-timeline.js';
import {createFloorProgram} from '../src/classes/floor-programs.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {createWarmupProgram} from '../src/classes/warmup-program.js';

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

const station=facilityStations.find(s=>s.id==='group-class'),results=[],npcResults=[],jointKeys=['hands','feet','shoulders','hips','elbows','knees'],npcOnly=process.argv.includes('--npc-only'),classes=process.argv.find(a=>a.startsWith('--classes='))?.slice(10).split(',');
const createSystem=()=>createGroupClassSystem({THREE,scene,metrics,materials,geometries,extraMaterials,architecture,station});
const bodyDelta=(a,b)=>Math.max(...jointKeys.flatMap(key=>[0,1].map(side=>Math.hypot(...a[key][side].map((v,i)=>v-b[key][side][i])))));
function inspect(system,d,frame,result,tag,actorId=null){
 character.pose(frame.pose);const local=character.getContactPoints(),body=transformBody(local,frame),volumes=actorId?system.getNPCCollisionVolumes(actorId):system.getCollisionVolumes(d.id),targets=actorId?system.getNPCActualContacts(actorId):system.getActualContacts(d.id);
 result.frames++;result.maxReach=Math.max(result.maxReach,local.maxReachError);
 for(let side=0;side<2;side++)if(frame.contacts?.hands?.[side])result.maxContact=Math.max(result.maxContact,Math.hypot(...body.hands[side].map((v,i)=>v-targets.hands[side][i])));
 const record=(key,items)=>{for(const hit of items)if(!result[key].some(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId&&h.actor===actorId))result[key].push({...hit,...tag,actor:actorId});};
 record('collisions',evaluateExerciseClearance(body,volumes).collisions);record('self',evaluateSelfClearance(local).collisions);
 const samples=transformSurface(character.getSurfaceSamples({stride:20}),frame);record('skin',evaluateSurfaceClearance(samples,volumes).collisions);result.skinPairs+=samples.length*volumes.length;
 const anchors=architecture.getSceneAnchors(),placement=actorId?actorId==='class-instructor'?anchors.classInstructor:anchors.classParticipants[actorId.endsWith('1')?0:1]:{position:station.setup.origin,rotation:station.setup.rotation};
 for(const sample of samples){const point=new THREE.Vector3(...sample.position).applyAxisAngle(new THREE.Vector3(0,1,0),placement.rotation||0).add(new THREE.Vector3(...placement.position));result.minSkinFloor=Math.min(result.minSkinFloor,point.y-floorHeightAt(point.x,point.z));}
 return body;
}
const recordFor=fields=>({...fields,frames:0,skinPairs:0,maxReach:0,maxContact:0,minSkinFloor:Infinity,maxStartDelta:0,maxEndDelta:0,maxJointStep:0,collisions:[],self:[],skin:[]});
for(const d of groupClassDefinitions.filter(d=>!classes||classes.includes(d.classKind))){
 const system=createSystem(),plan=coursePlanFor(d.classKind),seen=new Set(),cases=[];
 for(const block of plan.blocks){
  if(seen.has(block.motionId))continue;seen.add(block.motionId);
  if(block.motionId==='put-down-rest')continue;
  const cycleSeconds=block.seconds/block.repetitions,localSeconds=Math.min(block.seconds-4,Math.max(4,cycleSeconds*(Math.floor(4/cycleSeconds)+.37)));
  cases.push({motionId:block.motionId,block:block.id,elapsed:block.startSeconds+localSeconds,localSeconds});
 }
 if(d.classKind==='barbell'){
  const testedContexts=new Set();for(const block of plan.blocks)if(block.motionId==='put-down-rest'){
   const previous=plan.blocks[block.index-1],next=plan.blocks[block.index+1],key=`${block.seconds}:${previous?.motionId==='biceps-curl'}:${next?.motionId==='biceps-curl'}`;if(testedContexts.has(key))continue;
   testedContexts.add(key);for(const localSeconds of [.3,2,4.25,10,block.seconds-3,block.seconds-.5])cases.push({motionId:block.motionId,block:block.id,blockSeconds:block.seconds,previousMotion:previous?.motionId,nextMotion:next?.motionId,elapsed:block.startSeconds+localSeconds,localSeconds});
  }
 }
 for(const test of npcOnly?[]:cases){
  system.prepare(d.id);system.begin(d.id);const phase=test.elapsed/plan.duration,pose=system.sample(d.id,phase),source={pose,offset:[0,0,0],rotation:0,contacts:system.getPoseContacts(d.id)},result=recordFor({id:d.id,...test});
  const before=inspect(system,d,source,result,{u:null}),returnDuration=system.beginReturn(d.id,phase);result.returnDuration=returnDuration;let previous=null,first,last;
  for(let i=0;i<=100;i++){
   const u=i/100,frame=system.sampleReturn(d.id,u),body=inspect(system,d,frame,result,{u});if(i===0)first=body;if(previous)result.maxJointStep=Math.max(result.maxJointStep,bodyDelta(body,previous));previous=body;last=body;
  }
  result.maxStartDelta=bodyDelta(before,first);const exit=system.sampleLifecycle(d.id,'exit',0);character.pose(exit.pose);const exitBody=transformBody(character.getContactPoints(),exit);result.maxEndDelta=bodyDelta(last,exitBody);
  results.push(result);console.log(JSON.stringify(result));
 }
 // The same return must work at the instructor's stage height and both mat
 // placements. Let actors finish the normal old-gear/new-gear transition first.
 const npcSystem=createSystem();npcSystem.prepare(d.id);for(let i=0;i<1600&&!npcSystem.getDiagnostics().npcs.every(a=>a.kind===d.classKind&&a.status==='using');i++)npcSystem.update(.05,{active:false});
 npcSystem.begin(d.id);const representative=d.classKind==='barbell'?cases.find(c=>c.motionId==='biceps-curl'):cases.find(c=>c.motionId==='put-down-rest'&&c.localSeconds===10)||cases[Math.floor(cases.length/2)],phase=representative.elapsed/plan.duration,sourceNPCs=new Map();npcSystem.sample(d.id,phase);npcSystem.update(.01,{phase,active:true});
 for(const id of ['class-instructor','class-participant-1','class-participant-2']){const f=npcSystem.sampleNPC(id,phase);character.pose(f.pose);sourceNPCs.set(id,transformBody(character.getContactPoints(),f));}
 const duration=npcSystem.beginReturn(d.id,phase),perActor=new Map(['class-instructor','class-participant-1','class-participant-2'].map(id=>[id,recordFor({id:d.id,actorId:id,motionId:representative.motionId,returnDuration:duration})]));
 const npcSteps=Math.max(100,Math.ceil(duration/.05));let lastTime=0;for(let i=0;i<=npcSteps;i++){
  const time=duration*i/npcSteps;if(i)npcSystem.update(time-lastTime,{active:false});lastTime=time;
  for(const [id,result] of perActor){const f=npcSystem.sampleNPC(id,null),body=inspect(npcSystem,d,f,result,{u:i/npcSteps},id);if(i===0)result.maxStartDelta=bodyDelta(body,sourceNPCs.get(id));if(result.previousBody)result.maxJointStep=Math.max(result.maxJointStep,bodyDelta(body,result.previousBody));result.previousBody=body;}
 }
 for(const [id,result] of perActor){
  const final=npcSystem.sampleNPC(id,null),context={THREE,kind:d.classKind,metrics,group:new THREE.Group()},reference=d.classKind==='warmup'?createWarmupProgram(context):['dance','barbell','pilates'].includes(d.classKind)?createFloorProgram(context):createEquipmentProgram(context);
  // Reproduce the same grip-specific ready pose in an independent program.
  // A curl interruption exits with a supinated grip; natural completion is
  // pronated. Comparing every return with complete:true would hide that fact.
  reference.sampleCourse(final.course);const ready=d.classKind==='warmup'?{pose:reference.sample(0),offset:[0,0,0],rotation:0}:reference.sampleLifecycle('exit',0);character.pose(ready.pose);result.maxEndDelta=bodyDelta(result.previousBody,transformBody(character.getContactPoints(),ready));delete result.previousBody;npcResults.push(result);console.log(JSON.stringify(result));
 }
}
const reportFile=classes?'artifacts/course-floor-return-qualification.json':'artifacts/course-return-qualification.json',mainResults=npcOnly?JSON.parse(readFileSync(reportFile)).results:results;
writeFileSync(reportFile,JSON.stringify({stride:20,results:mainResults,npcResults},null,2));
const failed=r=>r.maxReach>.015||r.maxContact>.015||r.minSkinFloor<-.008||r.maxStartDelta>.015||r.maxEndDelta>.015||r.collisions.length||r.self.length||r.skin.length;
if([...mainResults,...npcResults].some(failed))process.exitCode=1;


