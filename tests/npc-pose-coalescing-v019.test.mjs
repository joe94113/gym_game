import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMocapFixtureV019} from '../scripts/trainer-fixture-v019.mjs';
import {createGymCrowd} from '../src/crowd.js';
import {createSocialCrowd} from '../src/social-crowd.js';
import {createGymCrowd as beforeGym} from '../.local-tools/v019-before-coalescing/src/crowd.js';
import {createSocialCrowd as beforeSocial} from '../.local-tools/v019-before-coalescing/src/social-crowd.js';
import {createGroupClassSystem} from '../src/classes/group-class-system.js';
import {receptionSceneAnchors} from '../src/reception-scenes.js';
import {activities} from '../src/activity-catalog.js';
import {floorHeightAt} from '../src/gym-layout.js';
import {stations} from '../src/data.js';

const proof={pass:false,gpu:false,baseline:'.local-tools/v019-before-coalescing',frames:0,actorComparisons:0,skinVertices:0,cases:[]};
after(()=>{
 const paths=['src/crowd.js','src/social-crowd.js','src/skinned-character.js','src/npc-world-matrices-v019.js','tests/npc-pose-coalescing-v019.test.mjs','.local-tools/v019-before-coalescing/src/crowd.js','.local-tools/v019-before-coalescing/src/social-crowd.js','public/models/athlete/athlete.glb'];
 proof.sourceHashes=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));proof.pass=proof.cases.length===3&&proof.cases.every(row=>row.pass);proof.completedAt=new Date().toISOString();
 mkdirSync('artifacts/release-v019',{recursive:true});writeFileSync('artifacts/release-v019/npc-pose-coalescing-qualification.json',JSON.stringify(proof,null,2)+'\n');
});
async function setup({before=false,gym=true,social=false,classes=false}={}){
 const f=await createMocapFixtureV019(),result={f};
 if(gym)result.gym=(before?beforeGym:createGymCrowd)({...f,activities,floorHeight:floorHeightAt});
 if(classes)result.classes=createGroupClassSystem({...f,architecture:{getSceneAnchors:()=>receptionSceneAnchors,roomZones:{registerRoot:(_,root)=>root}},station:stations.find(station=>station.id==='group-class')});
 if(social)result.social=(before?beforeSocial:createSocialCrowd)({...f,anchors:receptionSceneAnchors,floorHeight:floorHeightAt,groupClasses:result.classes});
 result.dispose=()=>{result.gym?.dispose();result.social?.dispose();f.character.dispose();};return result;
}
function nodes(body,kind){const out=[];body.group.updateMatrixWorld(true);body.group.traverse(node=>{if(node[kind])out.push(node);});return out;}
function compareBodies(current,baseline,label,{dense=false}={}){
 assert.equal(current.f.clones.length,baseline.f.clones.length);
 for(let i=0;i<current.f.clones.length;i++){
  const a=current.f.clones[i],b=baseline.f.clones[i];assert.equal(a.group.name,b.group.name);assert.deepEqual(a.group.position.toArray(),b.group.position.toArray(),label+' group position');assert.deepEqual(a.group.quaternion.toArray(),b.group.quaternion.toArray(),label+' group quaternion');assert.equal(a.group.visible,b.group.visible);assert.deepEqual(a.getContactPoints(),b.getContactPoints(),label+' palms/feet/body '+a.group.name);proof.actorComparisons++;
  if(dense){
   const aa=nodes(a,'isBone'),bb=nodes(b,'isBone');assert.deepEqual(aa.map(node=>[node.name,...node.matrixWorld.elements]),bb.map(node=>[node.name,...node.matrixWorld.elements]),label+' bone world');
   const am=nodes(a,'isSkinnedMesh'),bm=nodes(b,'isSkinnedMesh');for(let j=0;j<am.length;j++){am[j].skeleton.update();bm[j].skeleton.update();assert.deepEqual(am[j].skeleton.boneMatrices,bm[j].skeleton.boneMatrices,label+' GPU palette');assert.deepEqual(am[j].bindMatrixInverse.elements,bm[j].bindMatrixInverse.elements,label+' attached bind inverse');}
   const skin=a.getSurfaceSamples({stride:127});assert.deepEqual(skin,b.getSurfaceSamples({stride:127}),label+' skin');proof.skinVertices+=skin.length;
   const tabletA=a.group.getObjectByName('教練課表平板'),tabletB=b.group.getObjectByName('教練課表平板');if(tabletA)assert.deepEqual(tabletA.matrixWorld.elements,tabletB.matrixWorld.elements,label+' tablet');
  }
 }
}
function compareMechanisms(current,baseline,label){
 for(const stationId of ['chest-press','lat-pulldown','squat-rack','bike','plate-high-row','treadmill-2','treadmill-3','treadmill-4','bike-2','bike-3','bike-4']){
  const a=current.f.machines.get(stationId),b=baseline.f.machines.get(stationId);assert.deepEqual(a.getActualContacts(),b.getActualContacts(),label+' actual mechanism contacts '+stationId);a.group.updateMatrixWorld(true);b.group.updateMatrixWorld(true);const av=[],bv=[];a.group.traverse(node=>{if(node.isMesh)av.push([node.name,...node.matrixWorld.elements]);});b.group.traverse(node=>{if(node.isMesh)bv.push([node.name,...node.matrixWorld.elements]);});assert.deepEqual(av,bv,label+' mechanism matrices '+stationId);
 }
 const state=crowd=>crowd.getDiagnostics().actors.map(({id,stationId,state,stage,position,elapsed,lastSampledCycle,poseHz,skippedPoseUpdates,viewDeferred,viewSkipped,viewRestores,culled,visible})=>({id,stationId,state,stage,position,elapsed,lastSampledCycle,poseHz,skippedPoseUpdates,viewDeferred,viewSkipped,viewRestores,culled,visible}));
 assert.deepEqual(state(current.gym),state(baseline.gym),label+' logical crowd state');
}

test('default callers retain the exact before-coalescing body, gear, scheduler and pose counts',async()=>{
 const current=await setup({social:true,classes:true}),baseline=await setup({before:true,social:true,classes:true});
 try{
  for(let frame=0;frame<24;frame++){
   const dt=[.01,1/60,.04,.05][frame%4];for(const pair of [current,baseline]){pair.gym.update(dt,null,{quality:'clear'});pair.classes.update(dt);pair.social.update(dt);}compareBodies(current,baseline,'default '+frame,{dense:frame%8===0});compareMechanisms(current,baseline,'default '+frame);proof.frames++;
  }
  assert.equal(current.gym.getUpdateDiagnostics().poseUpdates,baseline.gym.getUpdateDiagnostics().poseUpdates);assert.equal(current.social.getUpdateDiagnostics().poseUpdates,baseline.social.getUpdateDiagnostics().poseUpdates);assert.equal(current.gym.getUpdateDiagnostics().deferredPoseUpdates,0);assert.equal(current.social.getUpdateDiagnostics().deferredPoseUpdates,0);
  proof.cases.push({name:'default-exact-before-coalescing',pass:true,frames:24});
 }finally{current.dispose();baseline.dispose();}
});

test('three RAF catch-up steps retain every gym mechanism tick and complete handoffs while solving each body only once at the end',async()=>{
 const current=await setup(),baseline=await setup({before:true}),stages=new Set();
 try{
  const camera=new current.f.THREE.PerspectiveCamera(51,1,.1,150);camera.position.set(0,1.5,28);camera.lookAt(0,1.5,50);
  const context={camera,cameraPosition:camera.position,playerPosition:[0,0,15],quality:'flow'},options={quality:'flow',viewerPosition:context.playerPosition};
  for(const pair of [current,baseline])pair.gym.setViewContext(context);
  current.gym.update(.05,null,{...options,deferPose:true});baseline.gym.update(.05,null,options);
  camera.lookAt(-7,1,-4);current.gym.setViewContext(context);baseline.gym.setViewContext(context);
  assert.ok(current.gym.getUpdateDiagnostics().viewRestores>0,'View restore happens within deferred substep');assert.ok(current.gym.getUpdateDiagnostics().pendingPoses>0);
  current.gym.update(0,null,options);baseline.gym.update(0,null,options);compareBodies(current,baseline,'deferred view restore',{dense:true});compareMechanisms(current,baseline,'deferred view restore');
  current.gym.setViewContext({});baseline.gym.setViewContext({});
  for(let frame=0;frame<150;frame++){
   if(frame===4)for(const pair of [current,baseline])for(const id of ['chest-press','lat-pulldown','squat-rack','bike','plate-high-row','treadmill-2'])assert.equal(pair.gym.requestHandoff(id),true);
   for(let step=0;step<3;step++){
    const dt=step===2?.04:.05;current.gym.update(dt,null,{quality:'clear',deferPose:step<2});baseline.gym.update(dt,null,{quality:'clear'});compareMechanisms(current,baseline,`catchup ${frame}/${step}`);
   }
   compareBodies(current,baseline,'catchup final '+frame,{dense:frame%15===0});assert.equal(current.gym.getUpdateDiagnostics().pendingPoses,0);for(const actor of current.gym.getDiagnostics().actors)stages.add(actor.stage);proof.frames++;
  }
  const a=current.gym.getUpdateDiagnostics(),b=baseline.gym.getUpdateDiagnostics();assert.ok(a.poseUpdates<b.poseUpdates*.55);assert.ok(a.deferredPoseUpdates>0);assert.ok(stages.has('return')&&stages.has('release')&&stages.has('walk')&&stages.has('idle'));
  assert.equal(current.gym.requestHandoff('not-a-station'),false);assert.equal(current.gym.getOccupancy('chest-press').state,'free');
  proof.cases.push({name:'gym-clock-gear-contact-and-handoff',pass:true,frames:150,current:a,baseline:{poseUpdates:b.poseUpdates},stages:[...stages]});
 }finally{current.dispose();baseline.dispose();}
});

test('social original/new/class actors flush the exact last due pose, class phase and tablet after restores and sleeping-room changes',async()=>{
 const current=await setup({gym:false,social:true,classes:true}),baseline=await setup({before:true,gym:false,social:true,classes:true});
 try{
  for(let frame=0;frame<60;frame++){
   for(let step=0;step<3;step++){
    const dt=step===2?.04:.05,phase=(frame*3+step)/240;
    for(const pair of [current,baseline]){pair.classes.update(dt,{phase,active:true});pair.social.update(dt,{classPhase:phase,deferPose:pair===current&&step<2});}
    if(frame===5||frame===7){const far=frame===5,context={cameraPosition:far?[100,0,100]:[-32,0,2],playerPosition:far?[100,0,100]:[-32,0,2],isVisible:()=>!far,quality:'flow'};current.social.setViewContext(context);baseline.social.setViewContext(context);}
   }
   if(frame===12)for(const pair of [current,baseline])pair.social.setClassRoomActivity({visible:false,updating:false});
   compareBodies(current,baseline,'social final '+frame,{dense:frame%10===0});assert.equal(current.social.getUpdateDiagnostics().pendingPoses,0);assert.deepEqual(current.classes.getDiagnostics(),baseline.classes.getDiagnostics());proof.frames++;
  }
  for(const pair of [current,baseline])pair.social.update(.05,{classPhase:.77,deferPose:pair===current});
  assert.ok(current.social.getUpdateDiagnostics().pendingPoses>=3);current.social.update(0);baseline.social.update(0);compareBodies(current,baseline,'class deferred then sleeping final',{dense:true});
  assert.ok(current.social.getUpdateDiagnostics().actors.filter(actor=>actor.role.startsWith('class-')).every(actor=>actor.reason==='sleeping-room'));
  // A due tick in a deferred step followed by an empty final step must keep
  // that earlier exact sample, not resample at the final clock.
  for(const pair of [current,baseline])pair.social.setViewContext({quality:'clear'});
  for(const pair of [current,baseline])pair.social.update(.05,{deferPose:pair===current});
  current.social.update(0);baseline.social.update(0);compareBodies(current,baseline,'flush no final due',{dense:true});assert.equal(current.social.getUpdateDiagnostics().pendingPoses,0);
  const a=current.social.getUpdateDiagnostics(),b=baseline.social.getUpdateDiagnostics();assert.ok(a.poseUpdates<b.poseUpdates);assert.ok(a.deferredPoseUpdates>0);assert.ok(a.flushedPoseUpdates>0);for(const actor of a.actors.filter(actor=>actor.role.startsWith('class-')))assert.equal(actor.lastPoseClock,b.actors.find(row=>row.id===actor.id).lastPoseClock);
  proof.cases.push({name:'social-original-new-course-and-tablet',pass:true,frames:60,current:a,baseline:{poseUpdates:b.poseUpdates}});
 }finally{current.dispose();baseline.dispose();}
});
