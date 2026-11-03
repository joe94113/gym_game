import {buildLocomotionPose} from './locomotion.js';
import {sampleGroupClassPose} from './facility-poses.js';
import {evaluateSelfClearance,evaluateExerciseClearance,evaluateSurfaceClearance} from './collision-validation.js';
import {transformBody,transformSurface,transformPoint} from './lifecycle-frame.js';
import {selectNpcGeometryLod,summarizeNpcGeometryLod} from './npc-geometry-lod-v010.js';

const copy=value=>JSON.parse(JSON.stringify(value));

/** Actual skinned people for reception, a coach consultation and a small
 * group class. Their subtle background poses update at 15 Hz. */
export function createSocialCrowd({THREE,scene,character,anchors={},floorHeight=()=>0,groupClasses}) {
  const metrics=character.getAssetInfo().metrics,actors=[],resources={geometries:new Set(),materials:new Set(),textures:new Set()};
  let elapsed=0,poseAccumulator=0,classPhase=null,classElapsed=0,classUpdated=0,classSkipped=0,classRoomActivity={visible:true,updating:true},viewContext={},geometryLodEnabled=true;
  const playbackInfo={duration:24,selectedKind:'warmup'};
  const refreshPlayback=()=>{if(groupClasses?.getPlaybackInfo)groupClasses.getPlaybackInfo(playbackInfo);else if(groupClasses?.getDiagnostics)Object.assign(playbackInfo,groupClasses.getDiagnostics());};
  refreshPlayback();
  function updateGeometryLod(actor){actor.body.setGeometryLod?.(selectNpcGeometryLod({position:actor.body.group.position,...viewContext,previousLevel:actor.body.getGeometryLodDiagnostics?.().level||0,forceFull:!geometryLodEnabled||actor.role.startsWith('class-')}));}
  const definitions=[
    {id:'receptionist',anchor:anchors.receptionist,role:'receptionist',gesture:'接待與整理資料',appearance:{shirt:'#405f64',bodyProfile:'feminine',age:34,hair:'#46382e'},badge:'STAFF'},
    {id:'trainer-desk-staff',anchor:anchors.trainerDeskStaff,role:'trainer-desk',gesture:'查看課表',appearance:{shirt:'#344e67',age:39},badge:'COACH'},
    ...(anchors.conversation||[]).map((anchor,index)=>({id:`consultation-${index+1}`,anchor,role:index?'student':'coach',gesture:index?'聆聽與回應':'說明訓練安排',appearance:{shirt:index?'#b16f82':'#405b66',bodyProfile:index?'feminine':'default',age:index?46:37}})),
    {id:'class-instructor',anchor:anchors.classInstructor,role:'class-instructor',gesture:'帶領肩部暖身',appearance:{shirt:'#aa6c4e',bodyProfile:'feminine',age:42},badge:'COACH'},
    ...(anchors.classParticipants||[]).map((anchor,index)=>({id:`class-participant-${index+1}`,anchor,role:'class-participant',gesture:'跟著暖身',appearance:{shirt:index?'#83915c':'#766591',bodyProfile:index?'default':'feminine',age:index?57:51,grayHair:index?.45:0}})),
  ];
  function addBadge(body,text){
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
      if(context?.fillRect){context.fillStyle='#e9eee4';context.fillRect(0,0,192,256);context.fillStyle='#314c42';context.font='bold 43px sans-serif';context.textAlign='center';context.fillText('肌動',96,86);context.font='bold 28px sans-serif';context.fillText(text,96,158);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;resources.textures.add(texture);}
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
  function applyPose(actor){
    const time=(actor.role.startsWith('class-')?classElapsed:elapsed)+actor.index*.63;
    const pose=actor.role==='receptionist'||actor.role==='trainer-desk'?standingDeskPose(actor,time):actor.role.startsWith('class-')?classPose(actor,time):seatedConversationPose(actor,time);
    actor.body.pose(pose);actor.lastPose=pose;
  }
  for(const definition of definitions){
    if(!definition.anchor?.position)continue;
    const body=character.createClone({scene,appearance:definition.appearance});body.group.name=`social-${definition.id}`;
    const position=definition.anchor.position;body.group.position.set(position[0],position[1]??floorHeight(position[0],position[2]),position[2]);body.group.rotation.y=definition.anchor.rotation||0;
    body.setConservativeCulling?.(true);
    body.setMuscleHighlights();body.setMuscleOverlayEnabled(false);
    // These people stay beside furniture, so they need no repeated shadow pass.
    body.group.traverse(object=>{if(object.isMesh)object.castShadow=false;});
    if(definition.badge)addBadge(body,definition.badge);
    const actor={...definition,body,index:actors.length};actors.push(actor);applyPose(actor);
    if(actor.role.startsWith('class-'))groupClasses?.registerRoomRoot?.(body.group);
  }
  return{
    setViewContext(context={}){viewContext=context;actors.forEach(updateGeometryLod);},
    setGeometryLodEnabled(value=true){geometryLodEnabled=!!value;actors.forEach(updateGeometryLod);return geometryLodEnabled;},
    getGeometryLodDiagnostics(){return summarizeNpcGeometryLod(actors,geometryLodEnabled);},
    setClassRoomActivity(next={}){classRoomActivity={visible:next.visible!==false,updating:next.updating!==false};},
    update(dt,{classPhase:followPhase=null}={}){classPhase=followPhase;const delta=Math.max(0,Math.min(.05,dt));elapsed+=delta;poseAccumulator+=dt;const required=groupClasses?.getRoomActivity?.().forcedByCourse||followPhase!==null,show=classRoomActivity.visible||required,update=classRoomActivity.updating||required;for(const actor of actors)if(actor.role.startsWith('class-'))actor.body.group.visible=show;if(update){refreshPlayback();classElapsed+=delta;classUpdated++;actors.filter(actor=>actor.role.startsWith('class-')).forEach(applyPose);}else classSkipped++;if(poseAccumulator<1/15)return;poseAccumulator%=1/15;actors.filter(actor=>!actor.role.startsWith('class-')).forEach(applyPose);},
    getDiagnostics({surfaceStride=0}={}){return{count:actors.length,poseHz:15,classPoseHz:'frame',classRoomActivity:{...classRoomActivity,elapsed:classElapsed,updated:classUpdated,skipped:classSkipped},followingPlayer:classPhase!==null,actors:actors.map(actor=>{
      const body=actor.body.getContactPoints(),classActor=actor.role.startsWith('class-')&&groupClasses,volumes=classActor?groupClasses.getNPCCollisionVolumes(actor.id):actor.anchor.fixtureVolumes||[],fixtureBody=classActor&&actor.classFrame?transformBody(body,actor.classFrame):body,clearance=evaluateExerciseClearance(fixtureBody,volumes);
      return{id:actor.id,role:actor.role,gesture:actor.gesture,position:actor.body.group.position.toArray(),rotation:actor.body.group.rotation.y,seated:!!actor.anchor.seatHeight,overlayEnabled:actor.body.getMuscleOverlayEnabled(),modelKind:actor.body.getAssetInfo().kind,appearance:actor.body.getAssetInfo().appearance,contactError:body.maxReachError,classPhase:actor.classPhase??null,classKind:actor.classKind??null,classStage:actor.classFrame?.stage??null,selfCollisions:evaluateSelfClearance(body).collisions,collisions:clearance.collisions,fixtureCount:volumes.length,testedPairs:clearance.testedPairs,geometryLod:actor.body.getGeometryLodDiagnostics?.()||null,...(surfaceStride?{surface:evaluateSurfaceClearance(classActor&&actor.classFrame?transformSurface(actor.body.getSurfaceSamples({stride:surfaceStride}),actor.classFrame):actor.body.getSurfaceSamples({stride:surfaceStride}),volumes)}:{})};
    })};},
    dispose(){actors.forEach(actor=>actor.body.dispose());actors.length=0;for(const geometry of resources.geometries)geometry.dispose();for(const material of resources.materials)material.dispose();for(const texture of resources.textures)texture.dispose();},
  };
}
