import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {makeArchitecture,THREE} from './room-test-helpers.mjs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createGroupClassSystem} from '../src/classes/group-class-system.js';
import {createSocialCrowd} from '../src/social-crowd.js';
import {groupClassDefinitions} from '../src/classes/class-data.js';
import {facilityStations} from '../src/gym-layout.js';
const paths=['src/room-zones.js','src/gym-architecture.js','src/classes/group-class-system.js','src/social-crowd.js','src/skinned-character.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json'];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),sourceHashes=Object.fromEntries(paths.map(p=>[p,hash(p)]));
const raw=readFileSync('public/models/athlete/athlete.glb'),length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length));
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}delete json.images;delete json.textures;delete json.samplers;
let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);const rest=raw.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+rest.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);const binary=Buffer.concat([header,bytes,rest]),model=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const h=makeArchitecture(),scene=h.scene,metadata=JSON.parse(readFileSync('public/models/athlete/rig.json')),pool={geometryCache:new WeakMap(),geometries:new Set(),textures:new Set(),instances:0,disposed:false};
const character=createSkinnedCharacterFromModel({THREE,scene,model:cloneSkeleton(model.scene),metadata,sharedResources:pool}),clones=[];
character.createClone=options=>{const clone=createSkinnedCharacterFromModel({THREE,scene,model:cloneSkeleton(model.scene),metadata,sharedResources:pool,...options});clones.push(clone);return clone;};
const metrics=character.getAssetInfo().metrics,a=h.architecture,classes=createGroupClassSystem({THREE,scene,metrics,materials:h.materials,geometries:h.geometries,extraMaterials:h.extraMaterials,architecture:a,station:facilityStations.find(s=>s.id==='group-class')}),social=createSocialCrowd({THREE,scene,character,anchors:a.getSceneAnchors(),groupClasses:classes});
let time=0,frames=0,maxContact=0,maxReach=0,skinPairs=0;const issues=[],courses=[];
const activeFrame=(dt,stationId,phase=null)=>{
 time+=dt;const rooms=a.updateRoomState({playerPosition:[0,0,-20],activeStationId:stationId,dt});classes.setRoomActivity(rooms.classroom);social.setClassRoomActivity(rooms.classroom);a.update(time,dt);classes.update(dt,{phase,active:phase!==null});social.update(dt,{classPhase:phase});frames++;
 return rooms;
};
const cloneSnapshot=()=>clones.filter(c=>c.group.name.startsWith('social-class-')).map(c=>({name:c.group.name,body:c.getContactPoints(),skin:c.getSurfaceSamples({stride:37}),overlay:c.getMuscleHighlights(),rotation:c.group.rotation.toArray(),position:c.group.position.toArray()}));
const logicalFixtures=JSON.stringify(a.getWorldCollisionVolumes());
try{
 let probe=null;clones.find(c=>c.group.name==='social-class-instructor').group.traverse(object=>{if(!probe&&object.isBone)probe=object;});assert.ok(probe);let visits=0;const originalMatrixUpdate=probe.updateMatrixWorld;probe.updateMatrixWorld=function(...args){visits++;return originalMatrixUpdate.apply(this,args);};scene.updateMatrixWorld(true);const attachedBoneVisits=visits;assert.ok(attachedBoneVisits>0);
 activeFrame(.05,null);const beforePause={classes:classes.getDiagnostics(),bodies:cloneSnapshot()},navBefore=JSON.stringify(classes.getNavigationObstacles());
 visits=0;for(let i=0;i<140;i++){activeFrame(.05,null);scene.updateMatrixWorld(true);}const dormantBoneVisits=visits;assert.equal(dormantBoneVisits,0);assert.equal(a.roomZones.getActivity().classroom.parked,true);assert.equal(a.roomZones.getActivity().classroom.attachedToRenderScene,false);
 const paused={classes:classes.getDiagnostics(),bodies:cloneSnapshot()};assert.equal(paused.classes.elapsed,beforePause.classes.elapsed);assert.deepEqual(paused.classes.npcs,beforePause.classes.npcs);assert.deepEqual(paused.bodies,beforePause.bodies);assert.equal(JSON.stringify(classes.getNavigationObstacles()),navBefore);assert.equal(JSON.stringify(a.getWorldCollisionVolumes()),logicalFixtures);
 const socialSleep=social.getDiagnostics().classRoomActivity;assert.ok(socialSleep.skipped>=140);assert.equal(socialSleep.elapsed,0);
 const room=a.updateRoomState({playerPosition:[-11.8,0,26.8],dt:0});classes.setRoomActivity(room.classroom);social.setClassRoomActivity(room.classroom);classes.update(0);social.update(0);assert.deepEqual(cloneSnapshot(),beforePause.bodies);
 visits=0;scene.updateMatrixWorld(true);const resumedBoneVisits=visits;assert.ok(resumedBoneVisits>0);assert.equal(a.roomZones.getActivity().classroom.attachedToRenderScene,true);
 for(const definition of groupClassDefinitions){
  const id=definition.id;classes.prepare(id);let ready=false;
  for(let i=0;i<4800;i++){
   const r=activeFrame(.05,'group-class');assert.equal(r.classroom.visible,true);assert.equal(r.classroom.attachedToRenderScene,true);assert.equal(r.classroom.parked,false);const d=classes.getDiagnostics();if(d.npcs.every(n=>n.kind===definition.classKind&&n.status==='using')){ready=true;break;}
  }assert.equal(ready,true,`NPC course setup timed out: ${id}`);classes.begin(id);
  const record={id,frames:[],maxContact:0,maxReach:0};
  for(const phase of [0,.125,.3,.5,.75,.9,1]){
   const pose=classes.sample(id,phase);character.pose(pose);maxReach=Math.max(maxReach,character.getContactPoints().maxReachError);record.maxReach=Math.max(record.maxReach,character.getContactPoints().maxReachError);
   // Even an incorrect dormant request may not suppress a real active lesson.
   classes.setRoomActivity({visible:false,updating:false});social.setClassRoomActivity({visible:false,updating:false});classes.update(.05,{phase,active:true});social.update(.05,{classPhase:phase});
   assert.equal(classes.getRoomActivity().updating,true);for(const npc of classes.getDiagnostics().npcs){const lag=npc.id==='class-instructor'?0:npc.id==='class-participant-1'?.10:.18,expected=phase>=1?1:Math.max(0,phase-lag/definition.duration);assert.ok(Math.abs(npc.phase-expected)<1e-10,`Course phase sync changed: ${id}/${npc.id}`);}const d=social.getDiagnostics({surfaceStride:40}),classActors=d.actors.filter(n=>n.role.startsWith('class-'));
   for(const actor of classActors){maxContact=Math.max(maxContact,actor.contactError);record.maxContact=Math.max(record.maxContact,actor.contactError);skinPairs+=actor.surface.testedPairs;for(const [kind,hits]of [['fixture',actor.collisions],['self',actor.selfCollisions],['skin',actor.surface.collisions]])for(const hit of hits)issues.push({id,phase,actor:actor.id,kind,...hit});assert.ok(clones.find(c=>c.group.name===`social-${actor.id}`).group.visible);}
   record.frames.push({phase,npcs:classes.getDiagnostics().npcs.map(n=>({id:n.id,phase:n.phase,status:n.status})),contact:Math.max(...classActors.map(n=>n.contactError))});
  }
  const duration=classes.beginReturn(id,1);for(let t=0;t<duration+.15;t+=.05)activeFrame(.05,'group-class');classes.beginExit();classes.end();courses.push(record);
 }
 assert.equal(issues.length,0,JSON.stringify(issues));assert.ok(maxReach<.015);assert.ok(maxContact<.015);assert.equal(JSON.stringify(a.getWorldCollisionVolumes()),logicalFixtures);
 const changedSources=paths.filter(p=>sourceHashes[p]!==hash(p));assert.deepEqual(changedSources,[]);
 const report={pass:true,sourceHashes,changedSources,scope:'Production GLB and real room/class/social implementations. Logical fixtures/navigation remain unchanged while interiors sleep; class NPC bones and skin freeze for 140 frames and resume at dt0 unchanged. Seven course switches finish, and contact/self/fixture/skin plus precise instructor/student delay are checked at seven authored phases per course, not at every switch frame. A real instructor bone is probed during 140 explicit render-scene matrix updates: zero visits while its room is resident-parked, then visits resume after same-frame reattachment. No GPU; textures omitted only in numerical harness. Resources remain resident, not unloaded.',frames,pausedFrames:140,matrixTraversal:{attachedBoneVisits,dormantSceneUpdates:140,dormantBoneVisits,resumedBoneVisits},activePhasesPerCourse:7,maxReach,maxContact,skinPairs,issues,roomDiagnostics:a.roomZones.getDiagnostics(),courses};mkdirSync('artifacts/performance-v09',{recursive:true});writeFileSync('artifacts/performance-v09/room-management-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,frames,courses:courses.length,maxReach,maxContact,skinPairs,matrixTraversal:report.matrixTraversal}));
}finally{social.dispose();character.dispose();h.dispose();}
