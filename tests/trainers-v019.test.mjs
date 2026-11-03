import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {coachRoster,receptionSceneAnchors} from '../src/reception-scenes.js';
import {trainerBindings,floorTrainerPlacements,trainerUpdateBudget,trainerMetadataForActor} from '../src/trainer-layout-v019.js';
import {createSocialCrowd} from '../src/social-crowd.js';
import {gymLayout,floorHeightAt} from '../src/gym-layout.js';

const metrics={neutral:{hip:[0,.934,0],shoulder:[0,1.389,0],head:[0,1.598,0],hands:[[-.27,.86,.02],[.27,.86,.02]],feet:[[-.12,0,.12],[.12,0,.12]]},torsoLength:.455,arms:[{shoulderOffset:[-.2,0,0],upper:.28,lower:.26,palmLength:.09},{shoulderOffset:[.2,0,0],upper:.28,lower:.26,palmLength:.09}]};
function fakeCharacter(){const clones=[];return{clones,getAssetInfo:()=>({metrics}),createClone(){const group=new THREE.Group(),body={group,lastPose:null,pose(pose){this.lastPose=pose;},getContactPoints(){return this.lastPose;},getAssetInfo:()=>({metrics,kind:'skinned-human'}),setMuscleHighlights(){},setMuscleOverlayEnabled(){},setConservativeCulling(){},setGeometryLod(){},dispose(){}};clones.push(body);return body;}};}
const actor=(crowd,id)=>crowd.getUpdateDiagnostics().actors.find(actor=>actor.id===id);

test('all sixteen roster portraits map once to twenty actual social actor definitions and preserve original class/desk IDs',()=>{
 assert.equal(coachRoster.length,16);assert.equal(trainerBindings.length,16);assert.equal(new Set(trainerBindings.map(x=>x.coachId)).size,16);assert.equal(new Set(trainerBindings.map(x=>x.actorId)).size,16);assert.equal(floorTrainerPlacements.length,13);
 const character=fakeCharacter(),social=createSocialCrowd({THREE,scene:new THREE.Scene(),character,anchors:receptionSceneAnchors,floorHeight:floorHeightAt}),info=social.getUpdateDiagnostics();assert.equal(info.count,20);assert.equal(info.coachCount,16);
 for(const coach of coachRoster){const row=actor(social,coach.actorId);assert.equal(row.coachId,coach.id);const body=character.clones.find(x=>x.group.name==='social-'+coach.actorId);assert.equal(body.group.userData.coachId,coach.id);assert.equal(body.group.userData.portraitIndex,coach.portraitIndex);assert.equal(trainerMetadataForActor(coach.actorId,coachRoster).coachName,coach.name);}
 for(const id of ['receptionist','trainer-desk-staff','consultation-1','consultation-2','class-instructor','class-participant-1','class-participant-2'])assert.ok(actor(social,id));social.dispose();
});

test('floor-coach bays have valid floors, separate centres and leave the classroom, bathroom and primary crossing aisles open',()=>{
 const anchors=receptionSceneAnchors.floorTrainers;for(const anchor of anchors){const [x,y,z]=anchor.position;assert.equal(y,floorHeightAt(x,z));assert.ok(x>gymLayout.bounds.minX+1&&x<gymLayout.bounds.maxX-1);assert.ok(z>gymLayout.bounds.minZ+1&&z<gymLayout.bounds.maxZ-1);assert.ok(Math.abs(x+9)>1.3&&Math.abs(x-10)>1.3);assert.ok(Math.abs(z-8)>1.3);assert.ok(!(x>=11&&z>=8),'No coach in bathroom');assert.ok(!(x<=-13&&z>=21),'No extra coach in class-room mounts');}
 for(let i=0;i<anchors.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(anchors[i].x-anchors[j].x,anchors[i].z-anchors[j].z)>2);
});

test('distance and visibility budgets retain near people and keep active classes protected',()=>{
 const position=[0,0,0];assert.equal(trainerUpdateBudget({position,cameraPosition:[0,0,30],playerPosition:[0,0,4],visible:false,quality:'flow'}).hz,15);assert.equal(trainerUpdateBudget({position,cameraPosition:[0,0,30],playerPosition:[0,0,35],quality:'flow'}).hz,4);assert.equal(trainerUpdateBudget({position,cameraPosition:[0,0,30],playerPosition:[0,0,35],visible:false,quality:'flow'}).hz,-1);assert.equal(trainerUpdateBudget({position,classActor:true,required:true,roomUpdating:false,visible:false}).hz,0);assert.equal(trainerUpdateBudget({position,classActor:true,roomUpdating:false,visible:false}).hz,-1);
});

test('hidden floor coaches do no pose work and return in the same view submission with current-clock pose and LOD selection',()=>{
 const character=fakeCharacter(),social=createSocialCrowd({THREE,scene:new THREE.Scene(),character,anchors:receptionSceneAnchors}),id='floor-coach-3';social.setViewContext({cameraPosition:[100,0,100],playerPosition:[100,0,100],isVisible:()=>false,quality:'flow'});const start=actor(social,id).updates;for(let i=0;i<120;i++)social.update(1/60);assert.equal(actor(social,id).updates,start);assert.equal(actor(social,id).visible,false);assert.ok(actor(social,id).culledFrames>=120);
 social.setViewContext({cameraPosition:[-32,1,2],playerPosition:[-32,0,2],isVisible:()=>true,quality:'flow'});const restored=actor(social,id);assert.equal(restored.visible,true);assert.equal(restored.restores,1);assert.equal(restored.updates,start+1);assert.equal(restored.poseAgeSeconds,0);assert.equal(restored.poseHz,15);social.dispose();
});

test('near and distant cadence counts match elapsed time and sleeping class actors recover when a player follows the course',()=>{
 const character=fakeCharacter(),social=createSocialCrowd({THREE,scene:new THREE.Scene(),character,anchors:receptionSceneAnchors}),id='floor-coach-3';social.setViewContext({cameraPosition:[-32,0,2],playerPosition:[-32,0,2],isVisible:()=>true,quality:'flow'});let initial=actor(social,id).updates;for(let i=0;i<120;i++)social.update(1/60);assert.equal(actor(social,id).updates-initial,30);
 social.setViewContext({cameraPosition:[-5,0,0],playerPosition:[-5,0,0],isVisible:()=>true,quality:'flow'});initial=actor(social,id).updates;for(let i=0;i<120;i++)social.update(1/60);assert.equal(actor(social,id).updates-initial,8);
 social.setClassRoomActivity({visible:false,updating:false});initial=actor(social,'class-instructor').updates;social.update(.02);assert.equal(actor(social,'class-instructor').updates,initial);social.update(.02,{classPhase:.3});assert.equal(actor(social,'class-instructor').updates,initial+1);assert.equal(actor(social,'class-instructor').visible,true);social.dispose();
});

test('LOD work caches actual levels, retries unavailable data, and immediately restores full geometry near the camera',()=>{
 const character=fakeCharacter(),social=createSocialCrowd({THREE,scene:new THREE.Scene(),character,anchors:receptionSceneAnchors});let ready=false,calls=0;
 for(const body of character.clones){body.getGeometryLodDiagnostics=()=>{throw Error('Frame loop must not allocate full LOD diagnostics');};body.setGeometryLod=level=>{calls++;return ready?level:0;};}
 const far={cameraPosition:[100,0,100],playerPosition:[100,0,100],quality:'flow'};social.setViewContext(far);const failedCalls=calls;assert.ok(failedCalls>0);social.setViewContext(far);assert.ok(calls>failedCalls,'actual zero must retry when LOD is unavailable');ready=true;social.setViewContext(far);const loadedCalls=calls;for(let i=0;i<10;i++)social.setViewContext(far);assert.equal(calls,loadedCalls,'actual loaded level is cached');social.setViewContext({cameraPosition:[-32,0,0],playerPosition:[-32,0,0],quality:'flow'});assert.ok(calls>loadedCalls,'near actor restores original full geometry');social.dispose();
});

test('a visible distant coach catches up immediately when approached and real camera turns resume hidden actors without a render',()=>{
 const character=fakeCharacter(),social=createSocialCrowd({THREE,scene:new THREE.Scene(),character,anchors:receptionSceneAnchors}),id='floor-coach-3';social.setViewContext({cameraPosition:[-5,0,0],playerPosition:[-5,0,0],isVisible:()=>true,quality:'flow'});for(let i=0;i<7;i++)social.update(1/60);const previous=actor(social,id);assert.equal(previous.visible,true);assert.equal(previous.poseHz,4);assert.ok(previous.poseAgeSeconds>.1);social.setViewContext({cameraPosition:[-32,1,2],playerPosition:[100,0,100],quality:'flow'});assert.equal(actor(social,id).updates,previous.updates+1);assert.equal(actor(social,id).poseAgeSeconds,0);
 const camera=new THREE.PerspectiveCamera(51,1,.1,150);camera.position.set(-32,1.5,25);camera.lookAt(-32,1.5,50);social.setViewContext({camera,cameraPosition:camera.position,playerPosition:[100,0,100],quality:'flow'});assert.equal(actor(social,id).visible,false);social.update(.05);camera.lookAt(-32,1,0);social.setViewContext({camera,cameraPosition:camera.position,playerPosition:[100,0,100],quality:'flow'});assert.equal(actor(social,id).visible,true);assert.equal(actor(social,id).poseAgeSeconds,0);social.dispose();
});

test('thirteen new coaches spread15Hz work across rendered frames instead of sharing one update burst',()=>{
 const character=fakeCharacter(),social=createSocialCrowd({THREE,scene:new THREE.Scene(),character,anchors:receptionSceneAnchors}),counts=[];let previous=new Map(social.getUpdateDiagnostics().actors.map(actor=>[actor.id,actor.updates]));
 for(let frame=0;frame<120;frame++){social.update(1/60);const now=social.getUpdateDiagnostics().actors;counts.push(now.filter(actor=>actor.role==='floor-trainer'&&actor.updates>previous.get(actor.id)).length);previous=new Map(now.map(actor=>[actor.id,actor.updates]));}
 assert.equal(counts.reduce((sum,value)=>sum+value,0),13*30);assert.ok(Math.max(...counts)<=4,'At most four of the thirteen15Hz updates share a60Hz frame');assert.equal(new Set(social.getUpdateDiagnostics().actors.filter(actor=>actor.role==='floor-trainer').map(actor=>actor.schedulePhase)).size,13);social.dispose();
});
