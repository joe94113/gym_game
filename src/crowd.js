import { buildLocomotionPose } from './locomotion.js';
import { createMachineLifecycle } from './machine-lifecycle.js';
import {selectNpcGeometryLod,summarizeNpcGeometryLod} from './npc-geometry-lod-v010.js';

const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const pointMix=(a,b,t)=>a.map((value,index)=>mix(value,b[index],t));
const copy=value=>JSON.parse(JSON.stringify(value));
const NPC_STATIONS=['chest-press','lat-pulldown','squat-rack','bike','plate-high-row'];
const SENIOR_STATIONS=['treadmill-2','treadmill-3','treadmill-4','bike-2','bike-3','bike-4'];
const SHIRTS=['#4f8394','#b17d5a','#6c8160','#8c708f','#577181'];
const SENIOR_SHIRTS=['#b9778b','#758a65','#87729b','#6d8caa','#b18469','#8c9769'];
const exitOffset=type=>type==='bike'?[0,0,-1.35]:type==='treadmill'?[0,0,-1.7]:[0,0,1.35];

/** A contact-space exit from a released station. This is separate from the
 * exercise loop: hands open before the athlete stands and moves away. */
export function sampleStationExitPose(metrics,type,startPose,phase) {
  const t=smooth(phase),neutral=buildLocomotionPose(metrics,0,0);
  const bike=type==='bike';
  const treadmill=type==='treadmill';
  const offset=exitOffset(type);
  const target=copy(neutral);
  for(const key of ['hip','shoulder','head'])target[key]=target[key].map((value,axis)=>value+offset[axis]);
  for(const key of ['hands','feet'])target[key]=target[key].map(point=>point.map((value,axis)=>value+offset[axis]));
  const result={...target,hip:pointMix(startPose.hip,target.hip,t),shoulder:pointMix(startPose.shoulder,target.shoulder,t),head:pointMix(startPose.head||target.head,target.head,t),hands:[],feet:[],handGripping:[false,false],gripping:false};
  const deckDrop=treadmill?smooth((t-.74)/.26):t;
  if(treadmill)for(const key of ['hip','shoulder','head'])result[key][1]=mix(startPose[key][1],target[key][1],deckDrop);
  result.hands=startPose.hands.map((point,index)=>pointMix(point,target.hands[index],t));
  if(treadmill)result.hands.forEach((point,index)=>{point[1]=mix(startPose.hands[index][1],target.hands[index][1],deckDrop);});
  for(let index=0;index<2;index++){
    const step=t;
    result.feet[index]=pointMix(startPose.feet[index],target.feet[index],step);
    if(treadmill)result.feet[index][1]=mix(startPose.feet[index][1],target.feet[index][1],deckDrop);
    result.feet[index][1]+=bike?Math.sin(step*Math.PI)*.17:Math.max(0,Math.sin(step*Math.PI*2+(index?Math.PI:0)))*(treadmill?.07:.11);
  }
  // A small knee bend leaves enough reach for the moving support foot.
  const drop=Math.sin(t*Math.PI)*(bike?-.115:treadmill?0:.07);
  for(const key of ['hip','shoulder','head'])result[key][1]-=drop;
  if(bike)for(const hand of result.hands)hand[1]+=Math.sin(t*Math.PI)*.035;
  result.elbowHints=[[-.5,-.4,-1],[.5,-.4,-1]];
  if(bike)result.kneeHints=[[-.8,0,.6],[.8,0,.6]];
  return result;
}

/** Background athletes own distinct real-human skeletons. Machine motion is
 * sampled only while occupied; after a handoff the player owns that machine. */
export function createGymCrowd({THREE,scene,character,machines,activities=[],floorHeight=()=>0,findPath=null,blocked=()=>false}) {
  const metrics=character.getAssetInfo().metrics;
  const actors=[];
  let clock=0,quality='clear',forceFullPose=false,viewContext={},currentActiveStationId=null,geometryLodEnabled=true;
  function updateGeometryLod(actor){
    const stable=actor.state==='exercising'&&actor.stage==='exercise'||actor.state==='free'&&actor.stage==='idle';
    actor.body.setGeometryLod?.(selectNpcGeometryLod({position:actor.body.group.position,...viewContext,previousLevel:actor.body.getGeometryLodDiagnostics?.().level||0,forceFull:!geometryLodEnabled||!stable||forceFullPose||actor.stationId===currentActiveStationId}));
  }
  const vec=point=>new THREE.Vector3(...point);
  const localToWorld=(actor,point)=>vec(point).applyAxisAngle(new THREE.Vector3(0,1,0),actor.rotation).add(actor.origin);
  const rotate=(actor,heading)=>{const current=actor.body.group.rotation.y;actor.body.group.rotation.y+=Math.atan2(Math.sin(heading-current),Math.cos(heading-current))*.3;};
  const sampleActor=(actor,phase,cycle)=>{
    actor.lastSampledCycle=cycle;
    const pose=actor.machine.sampleActivity(phase,cycle);
    if(actor.ageGroup==='senior')pose.spineLean=.025;
    if(actor.machine.type==='treadmill'){pose.handNormals=[[1,0,0],[-1,0,0]];pose.relaxedHands=true;}
    return pose;
  };
  const poseActor=(actor,pose)=>{actor.body.pose(pose);actor.poseUpdates++;actor.lastPoseClock=clock;};
  function poseDue(actor,dt,options){
    const viewer=options.viewerPosition;
    const unthrottled=options.forceFullPose||options.quality==='clear'||!viewer;
    const x=Array.isArray(viewer)?viewer[0]:viewer?.x,z=Array.isArray(viewer)?viewer[2]:viewer?.z;
    if(unthrottled||!Number.isFinite(x)||!Number.isFinite(z)){
      actor.culled=false;actor.body.group.visible=true;actor.poseAccumulator=0;actor.poseHz=0;return true;
    }
    const distance=Math.hypot(actor.body.group.position.x-x,actor.body.group.position.z-z);
    const flow=options.quality==='flow',hideDistance=flow?34:40,wasCulled=actor.culled;
    actor.culled=distance>(wasCulled?hideDistance-3:hideDistance);actor.body.group.visible=!actor.culled;
    actor.poseHz=distance<(flow?16:24)?30:20;
    if(actor.culled){actor.skippedPoseUpdates++;return false;}
    actor.poseAccumulator+=dt;
    const interval=1/actor.poseHz;
    if(!wasCulled&&actor.poseAccumulator+1e-9<interval){actor.skippedPoseUpdates++;return false;}
    actor.poseAccumulator%=interval;return true;
  }

  for(const stationId of [...NPC_STATIONS,...SENIOR_STATIONS]){
    const machine=machines.get(stationId);
    if(!machine?.sampleActivity||!machine?.getSetup)continue;
    const setup=machine.getSetup(),index=actors.length;
    const seniorIndex=SENIOR_STATIONS.indexOf(stationId),senior=seniorIndex>=0,feminine=senior&&seniorIndex%2===0;
    const appearance=senior?{shirt:SENIOR_SHIRTS[seniorIndex],bodyProfile:feminine?'feminine':'default',age:62+seniorIndex*2,grayHair:.82+(seniorIndex%2)*.12,hair:seniorIndex%2?'#b7b6ae':'#c6c2b8'}:{shirt:SHIRTS[index%SHIRTS.length]};
    const body=character.createClone({scene,appearance});
    body.group.name=`gym-member-${index+1}`;body.setMuscleOverlayEnabled(false);body.setMuscleHighlights();
    const origin=vec(setup.origin),rotation=setup.rotation||0;
    body.group.position.copy(origin);body.group.rotation.y=rotation;
    body.setConservativeCulling?.(true);
    const activity=activities.find(item=>item.stationId===stationId&&item.runtime==='machine');
    const duration=(activity?.duration||setup.duration||6)*(senior?1.35:1);
    const actor={id:`member-${index+1}`,stationId,machine,body,origin,rotation,duration,elapsed:index*1.13,state:'exercising',stageTime:0,stage:'exercise',path:[],exitSide:index%2?1:-1,contactPose:null,ageGroup:senior?'senior':'adult',role:senior?'cardio-member':'member',genderPresentation:feminine?'feminine':'masculine',lastSampledCycle:0,poseAccumulator:0,poseUpdates:0,skippedPoseUpdates:0,lastPoseClock:0,poseHz:0,culled:false};
    actor.contactPose=sampleActor(actor,(actor.elapsed/duration)%1,actor.elapsed/duration);poseActor(actor,actor.contactPose);
    actors.push(actor);
  }

  function getOccupancy(stationId){
    const actor=actors.find(item=>item.stationId===stationId&&item.state!=='free');
    return actor?{state:actor.state,npcId:actor.id,stage:actor.stage}:{state:'free'};
  }
  function requestHandoff(stationId){
    const actor=actors.find(item=>item.stationId===stationId&&item.state!=='free');
    if(!actor)return false;
    if(actor.state==='leaving')return true;
    actor.state='leaving';actor.stage='return';actor.stageTime=0;
    actor.body.setGeometryLod?.(0);
    actor.culled=false;actor.body.group.visible=true;actor.poseAccumulator=0;
    // Start from the body/machine pair that was actually displayed. Logical
    // elapsed time may have moved ahead while a far actor skipped pose ticks.
    actor.returnStart=actor.lastSampledCycle;
    actor.returnEnd=Math.ceil(actor.returnStart+.001);
    actor.returnDuration=.30+Math.min(.35,(actor.returnEnd-actor.returnStart)*.45);
    return true;
  }
  function finishReturn(actor){
    actor.contactPose=copy(sampleActor(actor,0,actor.returnEnd));
    // The lap restraint must move out of the way before this athlete stands.
    // Share the player's collision-qualified path and visible mechanism state.
    if(['latPulldown','plateHighRow','squat','smithSquat'].includes(actor.machine.type)){
      actor.lifecycleExit=createMachineLifecycle({THREE,machine:actor.machine,metrics});
      actor.lifecycleTime=0;actor.stage='release';actor.stageTime=0;
      return;
    }
    actor.releaseStart=copy(actor.contactPose);actor.stage='release';actor.stageTime=0;
  }
  function releasePose(actor,phase){
    const pose=copy(actor.releaseStart),t=smooth(phase);
    // A barbell's fixed finger direction stops applying once the hands leave
    // the bar. Let the relaxed hand follow its forearm during the release.
    delete pose.handAdvances;
    pose.hands=pose.hands.map((point,index)=>pointMix(point,[(index?1:-1)*.29,pose.hip[1]+.04,pose.hip[2]+.12],t));
    pose.handGripping=[false,false];pose.gripping=false;pose.relaxedHands=true;
    pose.handNormals=[[1,0,0],[-1,0,0]];pose.elbowHints=[[-.7,-.3,.2],[.7,-.3,.2]];
    return pose;
  }
  function prepareWalk(actor,local=exitOffset(actor.machine.type),exitRotation=0){
    const from=localToWorld(actor,local);from.y=floorHeight(from.x,from.z);
    actor.body.group.position.copy(from);actor.body.group.rotation.y=actor.rotation+exitRotation;
    poseActor(actor,buildLocomotionPose(metrics,clock,0));
    const width=actor.machine.footprint?.w||2.4;
    const options=[actor.exitSide,-actor.exitSide].map(sign=>localToWorld(actor,[sign*(width/2+.95),0,local[2]]));
    const destination=options.find(point=>!blocked(point.x,point.z,.34))||options[0];
    destination.y=floorHeight(destination.x,destination.z);
    // Standing exits start inside the navigation footprint. This short
    // sidestep follows the machine's open front to a free waiting spot.
    actor.path=[destination];actor.destination=destination.clone();actor.stage='walk';actor.stageTime=0;
  }
  function update(dt,activeStationId=null,options={}){
    dt=Math.min(.05,Math.max(0,dt));clock+=dt;quality=options.quality||'balanced';forceFullPose=!!options.forceFullPose;currentActiveStationId=activeStationId;
    for(const actor of actors){
      updateGeometryLod(actor);
      if(actor.state==='exercising'){
        if(actor.stationId===activeStationId)continue;
        actor.elapsed+=dt;if(!poseDue(actor,dt,options))continue;
        const cycle=actor.elapsed/actor.duration;
        actor.contactPose=sampleActor(actor,cycle%1,cycle);poseActor(actor,actor.contactPose);
        continue;
      }
      actor.stageTime+=dt;
      if(actor.stage==='idle'){
        if(poseDue(actor,dt,options))poseActor(actor,buildLocomotionPose(metrics,clock,0));
        continue;
      }
      // Return, release, standing and walking keep full-rate body/mechanism
      // sampling, regardless of distance or the renderer's quality preset.
      actor.culled=false;actor.body.group.visible=true;actor.poseHz=0;actor.poseAccumulator=0;
      if(actor.lifecycleExit){
        const profile=actor.lifecycleExit;
        actor.lifecycleTime+=dt;
        const u=Math.min(1,actor.lifecycleTime/profile.exitDuration),frame=profile.sample('exit',u);
        actor.contactPose=frame.pose;
        actor.body.group.position.copy(localToWorld(actor,frame.offset));
        actor.body.group.rotation.y=actor.rotation+frame.rotation;
        poseActor(actor,frame.pose);
        const rackExit=['squat','smithSquat'].includes(actor.machine.type);
        const rackWalking=rackExit&&['走離槓架','退離槓架'].includes(frame.stage);
        const rackReleased=rackExit&&!frame.contacts?.hands?.some(Boolean);
        actor.stage=frame.stage==='leaving'||rackWalking?'walk':frame.stage==='standing'||rackReleased?'stand':'release';
        if(u>=1){actor.lifecycleExit=null;prepareWalk(actor,profile.gateOffset,profile.exitGateRotation??frame.rotation??profile.gateRotation??0);}
        continue;
      }
      if(actor.stage==='return'){
        const p=smooth(actor.stageTime/actor.returnDuration),cycle=mix(actor.returnStart,actor.returnEnd,p);
        actor.contactPose=sampleActor(actor,cycle%1,cycle);poseActor(actor,actor.contactPose);
        if(p>=1)finishReturn(actor);
      }else if(actor.stage==='release'){
        const p=Math.min(1,actor.stageTime/.32);actor.contactPose=releasePose(actor,p);poseActor(actor,actor.contactPose);
        if(p>=1){actor.exitStart=copy(actor.contactPose);actor.stage='stand';actor.stageTime=0;}
      }else if(actor.stage==='stand'){
        const p=Math.min(1,actor.stageTime/.90);actor.contactPose=sampleStationExitPose(metrics,actor.machine.type,actor.exitStart,p);poseActor(actor,actor.contactPose);
        if(p>=1)prepareWalk(actor);
      }else if(actor.stage==='walk'){
        const position=actor.body.group.position,target=actor.path[0],delta=target?.clone().sub(position);if(delta)delta.y=0;
        if(!target||delta.length()<.07){
          actor.path.shift();
          if(!actor.path.length){actor.state='free';actor.stage='idle';actor.stageTime=0;poseActor(actor,buildLocomotionPose(metrics,clock,0));continue;}
        }else{
          const step=Math.min(delta.length(),dt*1.75);delta.normalize();position.addScaledVector(delta,step);position.y=floorHeight(position.x,position.z);
          rotate(actor,Math.atan2(delta.x,delta.z));poseActor(actor,buildLocomotionPose(metrics,clock,1.15));
          // The station is available once the whole body is outside the base.
          const relative=position.clone().sub(actor.origin).applyAxisAngle(new THREE.Vector3(0,1,0),-actor.rotation);
          if(Math.abs(relative.x)>(actor.machine.footprint?.w||2.4)/2+.55)actor.state='free';
        }
      }else poseActor(actor,buildLocomotionPose(metrics,clock,0));
    }
  }
  return{
    update,requestHandoff,getOccupancy,
    setViewContext(context={}){viewContext=context;actors.forEach(updateGeometryLod);},
    setGeometryLodEnabled(value=true){geometryLodEnabled=!!value;actors.forEach(updateGeometryLod);return geometryLodEnabled;},
    getGeometryLodDiagnostics(){return summarizeNpcGeometryLod(actors,geometryLodEnabled);},
    getDiagnostics(){return{
      count:actors.length,
      quality,forceFullPose,
      actors:actors.map(actor=>({id:actor.id,stationId:actor.stationId,state:actor.state,stage:actor.stage,position:actor.body.group.position.toArray(),overlayEnabled:actor.body.getMuscleOverlayEnabled(),modelKind:actor.body.getAssetInfo().kind,contactError:actor.body.getContactPoints().maxReachError,ageGroup:actor.ageGroup,role:actor.role,genderPresentation:actor.genderPresentation,appearance:actor.body.getAssetInfo().appearance,elapsed:actor.elapsed,lastSampledCycle:actor.lastSampledCycle,poseUpdates:actor.poseUpdates,skippedPoseUpdates:actor.skippedPoseUpdates,poseHz:actor.poseHz,poseAgeSeconds:clock-actor.lastPoseClock,culled:actor.culled,visible:actor.body.group.visible,geometryLod:actor.body.getGeometryLodDiagnostics?.()||null})),
    };},
    dispose(){actors.forEach(actor=>actor.body.dispose());actors.length=0;},
  };
}
