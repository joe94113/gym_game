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

const station=facilityStations.find(s=>s.id==='group-class'),system=createGroupClassSystem({THREE,scene,metrics,materials,geometries,extraMaterials,architecture,station}),anchors=architecture.getSceneAnchors();
const actorInfo=[{id:'player',lag:0,origin:station.setup.origin,rotation:station.setup.rotation||0},{id:'class-instructor',lag:0,...anchors.classInstructor,origin:anchors.classInstructor.position},{id:'class-participant-1',lag:.10,...anchors.classParticipants[0],origin:anchors.classParticipants[0].position},{id:'class-participant-2',lag:.18,...anchors.classParticipants[1],origin:anchors.classParticipants[1].position}];
const up=new THREE.Vector3(0,1,0),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),worldPoint=(p,actor)=>new THREE.Vector3(...p).applyAxisAngle(up,actor.rotation||0).add(new THREE.Vector3(...actor.origin));
const requiredRoomFixtures=['classroom-wall-west','classroom-wall-front','classroom-wall-back','classroom-wall-entry-front','classroom-wall-entry-back','classroom-stage'];
const phaseSamples=[0,.13,.25,.38,.5,.63,.75,.87,1],boundaryOffsets=[-3,-1,-.05,0,.05,1,3],results=[],coverage=[],readyBodies=new Map();
const checkedSources=['src/equipment.js','src/skinned-character.js','src/hand-contact-frame.js','src/cardio-lifecycle-paths.js','src/machine-lifecycle.js','src/classes/course-plans.js','src/classes/class-timeline.js','src/classes/class-data.js','src/classes/group-class-system.js','src/classes/equipment-programs.js','src/classes/floor-programs.js','src/classes/warmup-program.js'];
const hashes=()=>Object.fromEntries(checkedSources.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),sourceHashes=hashes();

// Verify the course/UI registry against the actual instantiated motion library
// before allowing the slower real-skin and complete-room checks to begin.
for(const d of groupClassDefinitions){
  const plan=coursePlanFor(d.classKind);if(!plan||d.duration!==plan.duration||d.duration!==(d.classKind==='warmup'?900:1800))throw new Error(`Course duration not integrated: ${d.id} ${d.duration}`);
  const group=new THREE.Group(),context={THREE,kind:d.classKind,metrics,group,materials,geometries,extraMaterials},program=d.classKind==='warmup'?createWarmupProgram(context):['dance','barbell','pilates'].includes(d.classKind)?createFloorProgram(context):createEquipmentProgram(context);
  const ids=program.getCourseMotionIds(),used=[...new Set(plan.blocks.map(b=>b.motionId))],missing=used.filter(id=>!ids.includes(id));coverage.push({id:d.id,kind:d.classKind,blocks:plan.blocks.length,motionIds:used,missing});if(missing.length)throw new Error(`Unknown course motions ${d.id}: ${missing.join(', ')}`);
  character.pose(program.sample(0,0));readyBodies.set(d.classKind,structuredClone(character.getContactPoints()));
}
console.log(JSON.stringify({motionCoverage:coverage}));

function timestamps(plan){
  const points=new Map(),add=(seconds,index)=>{const t=Math.max(0,Math.min(plan.duration,seconds)),key=t.toFixed(9);if(!points.has(key))points.set(key,{seconds:t,owners:new Set()});points.get(key).owners.add(index);};
  for(const b of plan.blocks){
    for(const boundary of [b.startSeconds,b.endSeconds]){for(const offset of boundaryOffsets)add(boundary+offset,b.index);for(const lag of [.10,.18])for(const offset of [-.05,.05])add(boundary+lag+offset,b.index);}
    const period=b.seconds/b.repetitions,index=Math.floor((b.repetitions-1)/2),start=b.startSeconds+index*period;for(const phase of phaseSamples)add(start+phase*period,b.index);
  }
  return[...points.values()].sort((a,b)=>a.seconds-b.seconds).map(p=>({seconds:p.seconds,blocks:[...p.owners]}));
}
const makeActor=id=>({id,poses:0,maxReach:0,maxTarget:0,maxHandContact:0,maxFootContact:0,maxClockError:0,minSkinFloor:null,minSoleFloor:null,maxDeclaredFootSupportGap:0,surfacePairs:0,strictShoePairs:0,proxyPairs:0,collisions:[],self:[],skin:[],strictShoe:[],floorIssues:[],missingFixtures:[],completedReady:false});
for(const d of groupClassDefinitions){
  const plan=coursePlanFor(d.classKind),times=timestamps(plan),result={id:d.id,kind:d.classKind,duration:d.duration,stageDurations:plan.stageDurations,blocks:plan.blocks.map(b=>({index:b.index,id:b.id,motionId:b.motionId,start:b.startSeconds,end:b.endSeconds,repetitions:b.repetitions,samplesAttributed:times.filter(t=>t.blocks.includes(b.index)).length})),timestamps:times.map(t=>t.seconds),timeSamples:times.length,actorResults:actorInfo.map(a=>makeActor(a.id)),flags:[],fixtureIds:[]};
  system.prepare(d.id);let ready=false;for(let step=0;step<2400;step++){system.update(.05,{phase:null,active:false});if(system.getDiagnostics().npcs.every(a=>a.kind===d.classKind&&a.status==='using')){ready=true;result.prepareSeconds=step*.05;break;}}if(!ready)throw new Error(`NPC course preparation timed out: ${d.id}`);system.begin(d.id);
  const fixtureIds=new Set();
  for(const time of times){
    const phase=time.seconds/d.duration,pose=system.sample(d.id,phase),playerFrame={pose,offset:[0,0,0],rotation:0,contacts:system.getPoseContacts(d.id),course:courseTimelineAt(d.classKind,time.seconds)};system.update(0,{phase,active:true});
    for(let ai=0;ai<actorInfo.length;ai++){
      const actor=actorInfo[ai],r=result.actorResults[ai],frame=ai?system.sampleNPC(actor.id,phase):playerFrame,targets=ai?system.getNPCActualContacts(actor.id):system.getActualContacts(d.id),volumes=ai?system.getNPCCollisionVolumes(actor.id):system.getCollisionVolumes(d.id);
      for(const volume of volumes)if(volume.id.startsWith('classroom-'))fixtureIds.add(volume.id);
      const missing=requiredRoomFixtures.filter(id=>!volumes.some(v=>v.id===id||v.id.startsWith(id+'-')));for(const id of missing)if(!r.missingFixtures.includes(id))r.missingFixtures.push(id);
      character.pose(frame.pose);const local=character.getContactPoints(),body=transformBody(local,frame);r.poses++;r.maxReach=Math.max(r.maxReach,local.maxReachError);
      const expectedTime=phase>=1?d.duration:Math.max(0,time.seconds-actor.lag);r.maxClockError=Math.max(r.maxClockError,Math.abs((frame.course?.elapsed??-100)-expectedTime));
      for(const field of ['hands','feet'])for(let side=0;side<2;side++)r.maxTarget=Math.max(r.maxTarget,distance(local[field][side],frame.pose[field][side]));
      for(let side=0;side<2;side++){if(frame.contacts?.hands[side]&&targets?.hands?.[side])r.maxHandContact=Math.max(r.maxHandContact,distance(body.hands[side],targets.hands[side]));if(frame.contacts?.feet[side]&&targets?.feet?.[side])r.maxFootContact=Math.max(r.maxFootContact,distance(body.feet[side],targets.feet[side]));}
      const details={seconds:time.seconds,actorSeconds:frame.course?.elapsed,motionId:frame.course?.motionId,block:frame.course?.index};
      const record=(key,hits)=>{for(const hit of hits){const same=r[key].find(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId&&h.otherBodyPart===hit.otherBodyPart&&h.motionId===details.motionId);if(!same)r[key].push({...hit,...details});else if(hit.depth>same.depth)Object.assign(same,hit,details);}};
      const proxy=evaluateExerciseClearance(body,volumes);r.proxyPairs+=proxy.testedPairs;record('collisions',proxy.collisions);record('self',evaluateSelfClearance(local).collisions);
      const samples=transformSurface(character.getSurfaceSamples({stride:20}),frame),skin=evaluateSurfaceClearance(samples,volumes);r.surfacePairs+=skin.testedPairs;record('skin',skin.collisions);
      for(const sample of samples){const point=worldPoint(sample.position,actor),gap=point.y-floorHeightAt(point.x,point.z);r.minSkinFloor=Math.min(r.minSkinFloor??Infinity,gap);}
      const shoes=transformSurface(character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),frame),strict=evaluateSurfaceClearance(shoes,volumes.map(v=>({...v,allowedBodyParts:(v.allowedBodyParts||[]).filter(p=>p!=='leftFoot'&&p!=='rightFoot')})));r.strictShoePairs+=strict.testedPairs;record('strictShoe',strict.collisions);
      const supportGaps=[Infinity,Infinity];for(const sample of shoes){const point=worldPoint(sample.position,actor),gap=point.y-floorHeightAt(point.x,point.z),side=sample.part==='leftFoot'?0:1;r.minSoleFloor=Math.min(r.minSoleFloor??Infinity,gap);supportGaps[side]=Math.min(supportGaps[side],gap);if(gap<-.004&&!r.floorIssues.some(h=>h.part===sample.part&&h.motionId===details.motionId))r.floorIssues.push({part:sample.part,gap,...details});}
      if(d.classKind!=='cycle')for(let side=0;side<2;side++)if(frame.contacts?.feet[side])r.maxDeclaredFootSupportGap=Math.max(r.maxDeclaredFootSupportGap,supportGaps[side]);
      if(time.seconds===d.duration){r.completedReady=frame.course?.complete===true&&frame.course.envelope===0;const reference=readyBodies.get(d.classKind);r.completionReadyError=0;for(const key of ['hands','feet','shoulders','hips','elbows','knees'])for(let side=0;side<2;side++)r.completionReadyError=Math.max(r.completionReadyError,distance(local[key][side],reference[key][side]));r.completionStable=r.completionReadyError<.001;}
    }
  }
  result.fixtureIds=[...fixtureIds].sort();for(const r of result.actorResults)if(r.maxDeclaredFootSupportGap>.025)result.flags.push({actor:r.id,type:'declared-foot-contact-gap',gap:r.maxDeclaredFootSupportGap});
  result.pass=result.actorResults.every(r=>r.maxReach<.001&&r.maxTarget<.001&&r.maxHandContact<.001&&r.maxFootContact<.001&&r.maxClockError<1e-7&&r.minSkinFloor>=-.008&&r.minSoleFloor>=-.004&&!r.collisions.length&&!r.self.length&&!r.skin.length&&!r.strictShoe.length&&!r.floorIssues.length&&!r.missingFixtures.length&&r.completedReady&&r.completionStable);results.push(result);console.log(JSON.stringify({id:result.id,timeSamples:times.length,pass:result.pass,actors:result.actorResults.map(r=>({id:r.id,poses:r.poses,reach:r.maxReach,hand:r.maxHandContact,sole:r.minSoleFloor,proxy:r.collisions.length,self:r.self.length,skin:r.skin.length,strictShoe:r.strictShoe.length,missingFixtures:r.missingFixtures,clock:r.maxClockError,ready:r.completedReady}))}));system.end();
}
const finalHashes=hashes(),changedSources=checkedSources.filter(path=>sourceHashes[path]!==finalHashes[path]);
const report={pass:results.every(r=>r.pass)&&!changedSources.length,scope:'Full elapsed-time course API, all authored blocks; representative repetition phases and block boundaries at ±0.05/1/3 seconds, plus student-lag boundary crossings. Actual player/instructor/two students, native 0/.10/.18 second lag; full classroom walls/stage, skin, contacts, self and every shoe vertex. No GPU or continuous-video review.',skinStride:20,shoeStride:1,actorLags:Object.fromEntries(actorInfo.map(a=>[a.id,a.lag])),sourceHashes,changedSources,motionCoverage:coverage,totals:{courses:results.length,blocks:results.reduce((a,r)=>a+r.blocks.length,0),sampledTimes:results.reduce((a,r)=>a+r.timeSamples,0),poses:results.reduce((a,r)=>a+r.actorResults.reduce((s,v)=>s+v.poses,0),0),surfacePairs:results.reduce((a,r)=>a+r.actorResults.reduce((s,v)=>s+v.surfacePairs,0),0),strictShoePairs:results.reduce((a,r)=>a+r.actorResults.reduce((s,v)=>s+v.strictShoePairs,0),0)},results};
writeFileSync('artifacts/full-course-room-qualification.json',JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;



