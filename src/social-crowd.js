import {buildLocomotionPose} from './locomotion.js';
import {sampleGroupClassPose} from './facility-poses.js';
import {evaluateSelfClearance,evaluateExerciseClearance,evaluateSurfaceClearance} from './collision-validation.js';
import {transformBody,transformSurface,transformPoint} from './lifecycle-frame.js';
import {selectNpcGeometryLod,summarizeNpcGeometryLod} from './npc-geometry-lod-v010.js';
import {coachRoster} from './reception-scenes.js';
import {trainerMetadataForActor,trainerUpdateBudget} from './trainer-layout-v019.js';
import {sampleFloorTrainerPose} from './trainer-poses-v019.js';

const copy=value=>JSON.parse(JSON.stringify(value));

/** Actual skinned people for reception, a coach consultation and a small
 * group class, including sixteen roster-bound coaches. Background work follows
 * viewer distance/visibility; active class actors retain their course updates. */
export function createSocialCrowd({THREE,scene,character,anchors={},floorHeight=()=>0,groupClasses}) {
  const metrics=character.getAssetInfo().metrics,actors=[],resources={geometries:new Set(),materials:new Set(),textures:new Set()};
  let elapsed=0,classPhase=null,classElapsed=0,classUpdated=0,classSkipped=0,classRoomActivity={visible:true,updating:true},viewContext={},geometryLodEnabled=true;
  const frustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4(),visibilitySphere=new THREE.Sphere(new THREE.Vector3(),1.25);let hasFrustum=false;
  let frameCounts={updated:0,skipped:0,restored:0},updateCalls=0,deferPoses=false;
  const playbackInfo={duration:24,selectedKind:'warmup'};
  const refreshPlayback=()=>{if(groupClasses?.getPlaybackInfo)groupClasses.getPlaybackInfo(playbackInfo);else if(groupClasses?.getDiagnostics)Object.assign(playbackInfo,groupClasses.getDiagnostics());};
  refreshPlayback();
  function updateGeometryLod(actor){const wanted=selectNpcGeometryLod({position:actor.body.group.position,...viewContext,previousLevel:actor.geometryLevel,forceFull:!geometryLodEnabled||actor.role.startsWith('class-')});if(wanted!==actor.geometryLevel){const actual=actor.body.setGeometryLod?.(wanted);actor.geometryLevel=typeof actual==='number'?actual:0;}}
  const definitions=[
    {id:'receptionist',anchor:anchors.receptionist,role:'receptionist',gesture:'接待與整理資料',appearance:{shirt:'#405f64',bodyProfile:'feminine',age:34,hair:'#46382e'},badge:'STAFF'},
    {id:'trainer-desk-staff',anchor:anchors.trainerDeskStaff,role:'trainer-desk',gesture:'查看課表',appearance:{shirt:'#344e67',age:39},badge:'COACH'},
    ...(anchors.conversation||[]).map((anchor,index)=>({id:`consultation-${index+1}`,anchor,role:index?'student':'coach',gesture:index?'聆聽與回應':'說明訓練安排',appearance:{shirt:index?'#b16f82':'#405b66',bodyProfile:index?'feminine':'default',age:index?46:37}})),
    {id:'class-instructor',anchor:anchors.classInstructor,role:'class-instructor',gesture:'帶領肩部暖身',appearance:{shirt:'#aa6c4e',bodyProfile:'feminine',age:42},badge:'COACH'},
    ...(anchors.classParticipants||[]).map((anchor,index)=>({id:`class-participant-${index+1}`,anchor,role:'class-participant',gesture:'跟著暖身',appearance:{shirt:index?'#83915c':'#766591',bodyProfile:index?'default':'feminine',age:index?57:51,grayHair:index?.45:0}})),
    ...(anchors.floorTrainers||[]).map(anchor=>({id:anchor.actorId,anchor,role:'floor-trainer',motion:anchor.gesture,gesture:({reading:'查看課表',explaining:'說明訓練重點',demonstrating:'示範輕鬆抬臂',observing:'觀察與巡視'})[anchor.gesture],appearance:{shirt:['#405b66','#6b6558','#55715e','#6c5672'][anchor.index%4],bodyProfile:[5,6,7,8,10,12,14,16].includes(anchor.index)?'feminine':'default',age:[28,35,42,58,27,34,44,57,32,31,47,46,61,59,38,37][anchor.index-1],grayHair:anchor.index===13?.55:0},badge:'COACH'})),
  ].map(definition=>({...definition,...trainerMetadataForActor(definition.id,coachRoster)}));
  function addBadge(body,text,name){
    const chest=body.group.getObjectByName('spine_03');if(!chest)return;
    body.group.updateMatrixWorld(true);
    const material=new THREE.MeshStandardMaterial({color:'#e9eee4',roughness:.75});resources.materials.add(material);
    const geometry=new THREE.PlaneGeometry(.086,.117);resources.geometries.add(geometry);
    const badge=new THREE.Mesh(geometry,material);chest.add(badge);
    const place=(object,point)=>{object.position.copy(chest.worldToLocal(body.group.localToWorld(new THREE.Vector3(...point))));};
    place(badge,[0,metrics.neutral.shoulder[1]-.18,.159]);
    const parentQ=chest.getWorldQuaternion(new THREE.Quaternion()).invert();body.group.getWorldQuaternion(badge.quaternion);badge.quaternion.premultiply(parentQ);
    if(typeof document!=='undefined'){
      const canvas=document.createElement('canvas');canvas.width=192;canvas.height=256;const context=canvas.getContext('2d');
      if(context?.fillRect){context.fillStyle='#e9eee4';context.fillRect(0,0,192,256);context.fillStyle='#314c42';context.font='bold 43px sans-serif';context.textAlign='center';context.fillText('肌動',96,70);context.font='bold 28px sans-serif';context.fillText(text,96,137);if(name){context.font='bold 29px sans-serif';context.fillText(name,96,202);}const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;resources.textures.add(texture);}
    }
    const strapMaterial=new THREE.MeshStandardMaterial({color:'#b2ca94',roughness:.8});resources.materials.add(strapMaterial);
    for(const sign of [-1,1]){
      const points=[[sign*.055,metrics.neutral.shoulder[1]-.025,.094],[0,metrics.neutral.shoulder[1]-.125,.157]].map(point=>chest.worldToLocal(body.group.localToWorld(new THREE.Vector3(...point))));
      const curve=new THREE.LineCurve3(...points),strapGeometry=new THREE.TubeGeometry(curve,1,.0023,5,false);resources.geometries.add(strapGeometry);chest.add(new THREE.Mesh(strapGeometry,strapMaterial));
    }
  }
  function standingDeskPose(actor,time){
    const pose=buildLocomotionPose(metrics,time,0),trainer=actor.role==='trainer-desk';
    pose.shoulder[1]-=trainer?.025:.01;pose.shoulder[2]+=trainer?.16:.055;
    pose.hands=copy(actor.anchor.hands||[[-.24,1.16,.43],[.24,1.16,.43]]);
    for(let side=0;side<2;side++){pose.hands[side][1]+=Math.sin(time*2.3+side*1.5)*.006;pose.hands[side][2]+=Math.sin(time*1.8+side)*.009;}
    pose.handNormals=[[0,-1,0],[0,-1,0]];pose.elbowHints=[[-.7,-.4,.5],[.7,-.4,.5]];
    pose.headYaw=Math.sin(time*.32)*.11;pose.headPitch=trainer?.16:.035;
    return pose;
  }
  function seatedConversationPose(actor,time){
    const hipY=(actor.anchor.seatHeight??.48)+.125,torso=metrics.torsoLength,headHeight=metrics.neutral.head[1]-metrics.neutral.shoulder[1];
    const coach=actor.role==='coach',gesture=(.5+.5*Math.sin(time*.85))* (coach?1:.5),working=coach?1:0;
    const pose={hip:[0,hipY,0],shoulder:[0,hipY+torso,-.015],head:[0,hipY+torso+headHeight,-.015],feet:[[-.17,.013,.48],[.17,.013,.48]],hands:[[-.21,hipY+.07,.25],[.21,hipY+.07,.25]],handNormals:[[0,1,0],[0,1,0]],elbowHints:[[-.8,-.5,.4],[.8,-.5,.4]],kneeHints:[[0,0,1],[0,0,1]],handGripping:[false,false],gripping:false,relaxedHands:true,headYaw:Math.sin(time*.6)*.065,headPitch:Math.sin(time*(coach?.8:1.4))*(coach?.025:.065)};
    pose.hands[working][1]+=.17+gesture*.13;pose.hands[working][2]+=.07+gesture*.08;
    return pose;
  }
  function classPose(actor,time){
    const participant=Number(actor.id.split('-').at(-1))||1,lag=actor.role==='class-instructor'?0:.024+(participant-1)*.018;
    const phase=((classPhase??elapsed/(playbackInfo.duration||24))-lag+1)%1,frame=groupClasses?.sampleNPC(actor.id,classPhase!==null?classPhase:null),pose=frame?.pose||sampleGroupClassPose(metrics,phase);
    if(frame){const yaw=actor.anchor.rotation||0;actor.body.group.position.fromArray(transformPoint(frame.offset||[0,0,0],actor.anchor.position,yaw));actor.body.group.rotation.y=yaw+(frame.rotation||0);actor.classFrame=frame;actor.classKind=frame.classKind||playbackInfo.selectedKind;}
    if(!groupClasses||['warmup','dance'].includes(actor.classKind))pose.headYaw=actor.role==='class-instructor'?Math.sin(time*.4)*.12:0;
    actor.classPhase=frame?.phase??phase;
    return pose;
  }
  function applyBodyPose(actor,pose,poseClock){
    actor.body.pose(pose);actor.poseUpdates++;actor.lastPoseClock=poseClock;actor.pendingPose=null;
    if(actor.tablet){const hands=actor.body.getContactPoints().hands;actor.tablet.position.set((hands[0][0]+hands[1][0])/2,(hands[0][1]+hands[1][1])/2-.006,(hands[0][2]+hands[1][2])/2);actor.tablet.rotation.x=.18;}
  }
  function applyPose(actor){
    const time=(actor.role.startsWith('class-')?classElapsed:elapsed)+actor.index*.63;
    const pose=actor.role==='receptionist'||actor.role==='trainer-desk'?standingDeskPose(actor,time):actor.role.startsWith('class-')?classPose(actor,time):actor.role==='floor-trainer'?sampleFloorTrainerPose(metrics,time,actor.motion):seatedConversationPose(actor,time);
    actor.lastPose=pose;
    if(deferPoses){actor.pendingPose=structuredClone(pose);actor.pendingPoseClock=elapsed;actor.deferredPoseUpdates=(actor.deferredPoseUpdates||0)+1;return false;}
    applyBodyPose(actor,pose,elapsed);return true;
  }
  function flushPendingPoses(){for(const actor of actors)if(actor.pendingPose){applyBodyPose(actor,actor.pendingPose,actor.pendingPoseClock);actor.flushedPoseUpdates=(actor.flushedPoseUpdates||0)+1;frameCounts.updated++;}}
  function inView(actor){if(typeof viewContext.isVisible==='function')return viewContext.isVisible(actor.body.group.position,1.25)!==false;if(!hasFrustum)return true;visibilitySphere.center.copy(actor.body.group.position);visibilitySphere.center.y+=.9;return frustum.intersectsSphere(visibilitySphere);}
  function budget(actor){return trainerUpdateBudget({position:actor.body.group.position,cameraPosition:viewContext.cameraPosition,playerPosition:viewContext.playerPosition,quality:viewContext.quality,visible:inView(actor)});}
  function updateViewBudget(actor){
    if(actor.role.startsWith('class-')){updateGeometryLod(actor);return;}
    const next=budget(actor),wasHidden=actor.culled,wasHz=actor.poseHz;actor.poseHz=next.hz;actor.updateReason=next.reason;actor.culled=!next.visible;actor.body.group.visible=actor.role==='floor-trainer'?next.visible:true;
    const restored=next.visible&&(wasHidden||['near','detail-mode'].includes(next.reason)&&wasHz!==15);
    if(restored){actor.restores++;frameCounts.restored++;actor.poseAccumulator=actor.schedulePhase/actor.poseHz;if(applyPose(actor))frameCounts.updated++;}
    updateGeometryLod(actor);return restored;
  }
  for(const definition of definitions){
    if(!definition.anchor?.position)continue;
    const body=character.createClone({scene,appearance:definition.appearance});body.group.name=`social-${definition.id}`;
    const position=definition.anchor.position;body.group.position.set(position[0],position[1]??floorHeight(position[0],position[2]),position[2]);body.group.rotation.y=definition.anchor.rotation||0;
    body.setConservativeCulling?.(true);
    body.setMuscleHighlights();body.setMuscleOverlayEnabled(false);body.setBackgroundMaterialMode?.(!definition.role.startsWith('class-'));
    // These people stay beside furniture, so they need no repeated shadow pass.
    body.group.traverse(object=>{if(object.isMesh)object.castShadow=false;});
    if(definition.badge)addBadge(body,definition.badge,definition.coachName);
    body.group.userData={...body.group.userData,...trainerMetadataForActor(definition.id,coachRoster)};
    const schedulePhase=definition.role==='floor-trainer'?(definition.anchor.index*.618033988749895)%1:0;
    const actor={...definition,body,index:actors.length,schedulePhase,geometryLevel:0,poseUpdates:0,skippedPoseUpdates:0,culledFrames:0,restores:0,poseHz:definition.role.startsWith('class-')?0:15,poseAccumulator:schedulePhase/15,lastPoseClock:0,culled:false,updateReason:'initial'};
    if(definition.motion==='reading'){const geometry=new THREE.BoxGeometry(.20,.012,.24),material=new THREE.MeshStandardMaterial({color:'#253c41',roughness:.65});resources.geometries.add(geometry);resources.materials.add(material);actor.tablet=new THREE.Mesh(geometry,material);actor.tablet.name='教練課表平板';actor.tablet.castShadow=false;body.group.add(actor.tablet);}
    actors.push(actor);applyPose(actor);
    if(actor.role.startsWith('class-'))groupClasses?.registerRoomRoot?.(body.group);
  }
  function updateDiagnostics(){return{count:actors.length,coachCount:actors.filter(actor=>actor.coachId).length,updateCalls,lastFrame:{...frameCounts},poseUpdates:actors.reduce((sum,actor)=>sum+actor.poseUpdates,0),skippedPoseUpdates:actors.reduce((sum,actor)=>sum+actor.skippedPoseUpdates,0),deferredPoseUpdates:actors.reduce((sum,actor)=>sum+(actor.deferredPoseUpdates||0),0),flushedPoseUpdates:actors.reduce((sum,actor)=>sum+(actor.flushedPoseUpdates||0),0),pendingPoses:actors.filter(actor=>actor.pendingPose).length,culled:actors.filter(actor=>actor.culled).length,restores:actors.reduce((sum,actor)=>sum+actor.restores,0),actors:actors.map(actor=>({id:actor.id,coachId:actor.coachId??null,role:actor.role,poseHz:actor.poseHz,schedulePhase:actor.schedulePhase,reason:actor.updateReason,updates:actor.poseUpdates,skipped:actor.skippedPoseUpdates,culledFrames:actor.culledFrames,culled:actor.culled,visible:actor.body.group.visible,restores:actor.restores,lastPoseClock:actor.lastPoseClock,poseAgeSeconds:elapsed-actor.lastPoseClock}))};}
  return{
    setViewContext(context={}){viewContext=context;hasFrustum=!!context.camera;if(hasFrustum){context.camera.updateMatrixWorld();viewProjection.multiplyMatrices(context.camera.projectionMatrix,context.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(viewProjection);}actors.forEach(updateViewBudget);},
    setGeometryLodEnabled(value=true){geometryLodEnabled=!!value;actors.forEach(updateGeometryLod);return geometryLodEnabled;},
    setBackgroundMaterialMode(value=true){for(const actor of actors)actor.body.setBackgroundMaterialMode?.(value&&!actor.role.startsWith('class-'));return!!value;},
    getMaterialDiagnostics(){const entries=actors.map(actor=>({id:actor.id,role:actor.role,...actor.body.getMaterialDiagnostics?.()}));return{count:entries.length,backgroundActive:entries.filter(actor=>actor.backgroundActive).length,actors:entries};},
    getGeometryLodDiagnostics(){return summarizeNpcGeometryLod(actors,geometryLodEnabled);},
    setClassRoomActivity(next={}){classRoomActivity={visible:next.visible!==false,updating:next.updating!==false};},
    update(dt,{classPhase:followPhase=null,deferPose=false}={}){
      deferPoses=!!deferPose;classPhase=followPhase;const delta=Math.max(0,Math.min(.05,dt));elapsed+=delta;updateCalls++;frameCounts={updated:0,skipped:0,restored:0};
      const required=groupClasses?.getRoomActivity?.().forcedByCourse||followPhase!==null,show=classRoomActivity.visible||required,update=classRoomActivity.updating||required;
      if(update){refreshPlayback();classElapsed+=delta;classUpdated++;}else classSkipped++;
      for(const actor of actors){
        if(actor.role.startsWith('class-')){
          actor.body.group.visible=show;actor.poseHz=update?0:-1;actor.updateReason=required?'active-class':update?'class-frame':'sleeping-room';
          if(update){if(applyPose(actor))frameCounts.updated++;}else{actor.skippedPoseUpdates++;frameCounts.skipped++;}continue;
        }
        if(actor.culled){actor.culledFrames++;actor.skippedPoseUpdates++;frameCounts.skipped++;continue;}
        actor.poseAccumulator+=Math.max(0,dt);
        if(actor.poseAccumulator+1e-9<1/actor.poseHz){actor.skippedPoseUpdates++;frameCounts.skipped++;continue;}
        actor.poseAccumulator=Math.max(0,actor.poseAccumulator-Math.floor((actor.poseAccumulator+1e-9)*actor.poseHz)/actor.poseHz);
        if(applyPose(actor))frameCounts.updated++;
      }
      if(!deferPoses)flushPendingPoses();
    },
    getUpdateDiagnostics:updateDiagnostics,
    getDiagnostics({surfaceStride=0}={}){return{count:actors.length,coachCount:actors.filter(actor=>actor.coachId).length,poseHz:15,classPoseHz:'frame',updates:updateDiagnostics(),classRoomActivity:{...classRoomActivity,elapsed:classElapsed,updated:classUpdated,skipped:classSkipped},followingPlayer:classPhase!==null,actors:actors.map(actor=>{
      const body=actor.body.getContactPoints(),classActor=actor.role.startsWith('class-')&&groupClasses,volumes=classActor?groupClasses.getNPCCollisionVolumes(actor.id):actor.anchor.fixtureVolumes||[],fixtureBody=classActor&&actor.classFrame?transformBody(body,actor.classFrame):body,clearance=evaluateExerciseClearance(fixtureBody,volumes);
      return{id:actor.id,role:actor.role,coachId:actor.coachId??null,coachName:actor.coachName??null,specialty:actor.specialty??null,portraitIndex:actor.portraitIndex??null,gesture:actor.gesture,position:actor.body.group.position.toArray(),rotation:actor.body.group.rotation.y,seated:!!actor.anchor.seatHeight,overlayEnabled:actor.body.getMuscleOverlayEnabled(),materialMode:actor.body.getMaterialDiagnostics?.()||null,modelKind:actor.body.getAssetInfo().kind,appearance:actor.body.getAssetInfo().appearance,contactError:body.maxReachError,classPhase:actor.classPhase??null,classKind:actor.classKind??null,classStage:actor.classFrame?.stage??null,selfCollisions:evaluateSelfClearance(body).collisions,collisions:clearance.collisions,fixtureCount:volumes.length,testedPairs:clearance.testedPairs,geometryLod:actor.body.getGeometryLodDiagnostics?.()||null,...(surfaceStride?{surface:evaluateSurfaceClearance(classActor&&actor.classFrame?transformSurface(actor.body.getSurfaceSamples({stride:surfaceStride}),actor.classFrame):actor.body.getSurfaceSamples({stride:surfaceStride}),volumes)}:{})};
    })};},
    dispose(){actors.forEach(actor=>actor.body.dispose());actors.length=0;for(const geometry of resources.geometries)geometry.dispose();for(const material of resources.materials)material.dispose();for(const texture of resources.textures)texture.dispose();},
  };
}
