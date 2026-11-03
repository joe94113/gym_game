import {createFloorProgram} from './floor-programs.js';
import {createEquipmentProgram} from './equipment-programs.js';
import {createWarmupProgram} from './warmup-program.js';
import {groupClassDefinitions} from './class-data.js';
import {createFacilityLifecycle} from '../facility-lifecycle.js';
import {buildLocomotionPose} from '../locomotion.js';
import {floorHeightAt} from '../gym-layout.js';
import {courseTimelineAt} from './class-timeline.js';

const C=value=>structuredClone(value),clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),add=(a,b)=>a.map((v,i)=>v+b[i]);
const BODY_ON_MAT=['pelvis','torso','head','leftThigh','rightThigh','leftShin','rightShin','leftFoot','rightFoot','leftForearm','rightForearm','leftHand','rightHand','leftUpperArm','rightUpperArm'];

/** The room owns participants and placements; a course owns its actual gear,
 * contact-space motion and mounting. Switching a course never replaces gear
 * while somebody is still inside it. */
export function createGroupClassSystem({THREE,scene,metrics,materials={},geometries=new Set(),extraMaterials=new Set(),architecture,station}){
  const V=p=>new THREE.Vector3(...p),A=v=>v.toArray(),UP=new THREE.Vector3(0,1,0),actors=new Map(),byId=new Map(groupClassDefinitions.map(d=>[d.id,d]));
  const anchors=architecture.getSceneAnchors?.()||{},placement={origin:[...station.setup.origin],rotation:station.setup.rotation||0};
  let selectedId='group-class',active=false,awaitingPlayerStart=false,elapsed=0,lastMainFrame=null,navigationDirty=true,navigationCache=[],sharedPhase=0,sharedLoops=0,previousSharedPhase=0;
  let roomActivity={visible:true,updating:true},roomUpdateTicks=0,roomSkippedTicks=0;
  const definition=id=>byId.get(id)||groupClassDefinitions.find(d=>d.classKind===id);
  const yawOf=p=>p.rotation||0;
  const transform=(point,p)=>V(point).applyAxisAngle(UP,yawOf(p)).add(V(p.origin));
  const inverse=(point,p)=>V(point).sub(V(p.origin)).applyAxisAngle(UP,-yawOf(p));
  const actorRecords=[{id:'player',placement},
    ...(anchors.classInstructor?[{id:'class-instructor',placement:{origin:[...anchors.classInstructor.position],rotation:anchors.classInstructor.rotation||0}}]:[]),
    ...(anchors.classParticipants||[]).map((anchor,index)=>({id:`class-participant-${index+1}`,placement:{origin:[...anchor.position],rotation:anchor.rotation||0}}))];
  for(const record of actorRecords)actors.set(record.id,{...record,programs:new Map(),kind:'warmup',targetKind:'warmup',status:'using',phase:0,time:0,frame:null,walkingToKind:null});
  function idlePose(){const p=buildLocomotionPose(metrics,0,0);p.feet=p.feet.map(point=>[point[0],.013,point[2]]);p.kneeHints=[[0,0,1],[0,0,1]];return p;}
  function warmupLifecycle(program,isPlayer){
    if(isPlayer){
      const proxy={...architecture,sampleFacility:(_,phase)=>program.sample(phase)};
      const lifecycle=createFacilityLifecycle({station,architecture:proxy,metrics});
      return{getMetadata:()=>({...lifecycle,stages:['走進教室','走到空墊','站穩準備']}),sampleLifecycle:(direction,u)=>lifecycle.sample(direction,u)};
    }
    return{getMetadata:()=>({gateOffset:[0,0,0],gateRotation:0,exitGateRotation:0,restPhase:0,entryDuration:.5,exitDuration:.5}),sampleLifecycle:(direction,u)=>({pose:program.sample(0),offset:[0,0,0],rotation:0,stage:direction==='exit'?'站穩準備換課':'站穩加入課程',contacts:{hands:[false,false],feet:[true,true]}})};
  }
  function getProgram(actor,kind){
    if(actor.programs.has(kind))return actor.programs.get(kind);
    const group=new THREE.Group();group.name=`class-${actor.id}-${kind}`;group.position.fromArray(actor.placement.origin);group.rotation.y=yawOf(actor.placement);group.visible=false;scene.add(group);
    architecture.roomZones?.registerRoot('classroom',group);
    const context={THREE,kind,metrics,group,materials,geometries,extraMaterials};
    let program=kind==='warmup'?createWarmupProgram(context):['dance','barbell','pilates'].includes(kind)?createFloorProgram(context):createEquipmentProgram(context);
    if(kind==='warmup')program={...program,...warmupLifecycle(program,actor.id==='player')};
    const record={kind,group,program,lastFrame:null};actor.programs.set(kind,record);return record;
  }
  function meta(actor,kind){const m=getProgram(actor,kind).program.getMetadata();return kind==='cycle'?{...m,entryDuration:m.entryDuration*1.4,exitDuration:m.exitDuration*1.4}:m;}
  function showOnly(actor,kind){getProgram(actor,kind);for(const record of actor.programs.values())record.group.visible=record.kind===kind;navigationDirty=true;}
  function adaptFrame(actor,kind,source){
    const frame={...source,pose:C(source.pose),offset:[...(source.offset||[0,0,0])],rotation:source.rotation||0,contacts:C(source.contacts||{hands:[false,false],feet:[true,true]})},p=frame.pose;
    // The supported aerial program calibrates actor, fabric and hand grips to
    // one local floor plane. Airborne feet must never be snapped to terrain.
    if(kind==='aerial'&&p.aerialCalibrated)return frame;
    // Mat floor bodies and bicycle pedals have their own calibrated supports.
    if(kind==='pilates'&&!/走/.test(frame.stage||''))return frame;
    if(kind==='warmup')p.feet=p.feet.map(point=>[point[0],Math.max(.013,point[1]),point[2]]);
    const root=V(frame.offset),hip=V([p.hip[0],0,p.hip[2]]).applyAxisAngle(UP,frame.rotation).add(root),absolute=transform(A(hip),actor.placement),surface=floorHeightAt(absolute.x,absolute.z),base=actor.placement.origin[1];
    const oldOffsetY=frame.offset[1],preservePedals=kind==='cycle'&&p.feet.some(point=>point[1]>.18);if(!preservePedals)frame.offset[1]=surface-base;
    const shift=frame.offset[1]-oldOffsetY;
    p.hands=p.hands.map((point,i)=>frame.contacts.hands[i]?[point[0],point[1]-shift,point[2]]:point);
    const terrainDrops=[];p.feet=p.feet.map(point=>{
      if(point[1]>.18)return[point[0],point[1]-shift,point[2]];
      const local=V(point).applyAxisAngle(UP,frame.rotation).add(V(frame.offset)),world=transform(A(local),actor.placement),height=Math.max(...[[0,0],[.11,0],[-.11,0],[0,.11],[0,-.11]].map(([dx,dz])=>floorHeightAt(world.x+dx,world.z+dz))),drop=height-(base+frame.offset[1]);terrainDrops.push(drop);return[point[0],point[1]+drop,point[2]];
    });
    const drop=Math.min(0,...terrainDrops);if(drop<-.015){const bend=Math.min(.07,-drop*.85);for(const key of ['hip','shoulder','head'])p[key][1]-=bend;p.hands=p.hands.map((point,i)=>frame.contacts.hands[i]?point:[point[0],point[1]-bend,point[2]]);if(p.elbows)p.elbows=p.elbows.map(point=>[point[0],point[1]-bend,point[2]]);}
    return frame;
  }
  function remember(actor,kind,frame){const adapted=adaptFrame(actor,kind,{...frame,phase:frame.phase??actor.phase??0});getProgram(actor,kind).lastFrame=adapted;actor.frame=adapted;if(actor.id==='player')lastMainFrame=adapted;navigationDirty=true;return adapted;}
  function useSample(actor,kind,phase,cycle=phase){const program=getProgram(actor,kind).program,pose=program.sample(clamp(phase),cycle);return remember(actor,kind,{pose,phase:clamp(phase),offset:[0,0,0],rotation:0,stage:'課程示範',contacts:program.getCourseContacts?.()||{hands:kind==='barbell'||['cycle','trx','aerial'].includes(kind)?[true,true]:[false,false],feet:pose.feet.map(p=>p[1]<.03||kind==='cycle')}});}
  function useCourse(actor,kind,phase,override=null){
    const frame=override||courseTimelineAt(kind,clamp(phase)*(definition(kind)?.duration||1800)),program=getProgram(actor,kind).program;
    const pose=program.sampleCourse?program.sampleCourse(frame):program.sample(frame.repPhase);
    actor.courseFrame=frame;actor.phase=frame.phase;
    return remember(actor,kind,{pose,phase:frame.phase,classKind:kind,course:frame,offset:[0,0,0],rotation:0,stage:frame.complete?'課程結束':frame.label,contacts:program.getCourseContacts?.()||{hands:['barbell','cycle','trx','aerial'].includes(kind)?[true,true]:[false,false],feet:pose.feet.map(p=>p[1]<.03||kind==='cycle')}});
  }
  function lifeSample(actor,kind,direction,u){actor.courseFrame=null;return remember(actor,kind,getProgram(actor,kind).program.sampleLifecycle(direction,clamp(u)));}
  function prepareReturn(actor){
    const source=actor.courseFrame||courseTimelineAt(actor.kind,0),turns=source.cycleTurns,targetTurns=Math.ceil(turns-1e-8)+1;
    actor.courseReturn={source,targetTurns};
    if(source.complete){actor.courseReturn.targetTurns=turns;return .5;}
    if(actor.kind==='barbell'&&source.motionId==='put-down-rest'&&!source.complete){
      const m=meta(actor,actor.kind),travel=m.entryDuration-(m.stages[0]?.duration||2.5),seconds=source.block.seconds;
      const from=source.localSeconds<travel?source.localSeconds:Math.max(source.localSeconds,seconds-travel),to=source.localSeconds<travel?0:seconds;
      actor.courseReturn.restLocal={from,to};return Math.max(.5,Math.abs(to-from));
    }
    if(actor.kind==='aerial')return getProgram(actor,actor.kind).program.getCourseReturnDuration(source);
    return actor.kind==='cycle'?Math.max(1.5,2*(targetTurns-turns)/Math.max(.5,source.cadenceRPM/60)):2;
  }
  function returnCourse(actor,u){
    const {source,targetTurns}=actor.courseReturn,t=ease(u),cycleTurns=source.cycleTurns+(targetTurns-source.cycleTurns)*(2*clamp(u)-clamp(u)**2);
    // Re-sample the authored movement as effort eases to its common ready pose;
    // the program also moves its real grips, crank and held weights.
    const restLocal=actor.courseReturn.restLocal,localSeconds=restLocal?restLocal.from+(restLocal.to-restLocal.from)*t:source.localSeconds;
    return useCourse(actor,actor.kind,source.phase,{...source,complete:false,envelope:source.envelope*(1-t),localSeconds,cycleTurns,cumulativeTurns:cycleTurns,returning:true,returnProgress:clamp(u)});
  }
  function beginNPCSwitch(actor){actor.status='returning';actor.time=0;actor.returnFrom=actor.phase;actor.returnTo=actor.phase>.5?1:0;actor.returnDuration=actor.courseFrame?prepareReturn(actor):Math.max(.9,Math.abs(actor.returnTo-actor.returnFrom)*(actor.kind==='cycle'?24:6));}
  function changeNPCs(kind){for(const actor of actors.values())if(actor.id!=='player'){actor.targetKind=kind;if(actor.status==='using'&&actor.kind!==kind)beginNPCSwitch(actor);}}
  function angleMix(a,b,t){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*ease(t);}
  function movingFrame(actor,from,to,u,heading,stage){
    const t=ease(u),offset=mix(from,to,t),pose=buildLocomotionPose(metrics,u*actor.walkDuration,Math.min(1,u*5,(1-u)*5));
    return remember(actor,actor.kind,{pose,offset,rotation:heading,stage,contacts:{hands:[false,false],feet:pose.feet.map(p=>p[1]<.03)}});
  }
  function turnFrame(actor,point,a,b,u,stage){const pose=idlePose(),t=ease(u);pose.feet=pose.feet.map((p,i)=>[p[0],p[1]+.025*Math.max(0,Math.sin(t*Math.PI*2+(i?Math.PI:0))),p[2]]);return remember(actor,actor.kind,{pose,offset:point,rotation:angleMix(a,b,u),stage,contacts:{hands:[false,false],feet:[false,false]}});}
  function startOutsideTransfer(actor){
    const oldMeta=meta(actor,actor.kind),nextKind=actor.targetKind,nextMeta=meta(actor,nextKind);actor.oldGate=C(oldMeta.gateOffset||oldMeta.gate?.offset||[0,0,0]);actor.newGate=C(nextMeta.gateOffset||nextMeta.gate?.offset||[0,0,0]);actor.walkingToKind=nextKind;actor.exitHeading=oldMeta.exitGateRotation??oldMeta.gateRotation??0;actor.entryHeading=nextMeta.gateRotation??0;
    actor.walkHeading=Math.atan2(actor.newGate[0]-actor.oldGate[0],actor.newGate[2]-actor.oldGate[2]);actor.walkDuration=Math.max(.75,Math.hypot(actor.newGate[0]-actor.oldGate[0],actor.newGate[2]-actor.oldGate[2])/1.0);actor.time=0;actor.status='turning-out';getProgram(actor,actor.kind).group.visible=false;getProgram(actor,nextKind).group.visible=false;navigationDirty=true;
  }
  function updateActor(actor,dt,followPhase){
    actor.time+=dt;
    if(actor.status==='using'){
      if(actor.targetKind!==actor.kind){beginNPCSwitch(actor);return;}
      if(followPhase!==null&&active){const duration=definition(actor.kind)?.duration||1800,lag=actor.id==='class-instructor'?0:actor.id==='class-participant-1'?.10:.18;const phase=followPhase>=1?1:Math.max(0,followPhase-lag/duration);useCourse(actor,actor.kind,phase);return;}
      if(actor.courseFrame&&!awaitingPlayerStart)return;
      actor.phase=awaitingPlayerStart&&actor.kind===definition(selectedId)?.classKind?0:(actor.phase+dt/32)%1;useSample(actor,actor.kind,actor.phase);return;
    }
    if(actor.status==='course-returning'){
      returnCourse(actor,clamp(actor.time/actor.returnDuration));if(actor.time>=actor.returnDuration){actor.status='using';actor.time=0;}return;
    }
    if(actor.status==='returning'){
      const t=clamp(actor.time/actor.returnDuration),p=actor.returnFrom+(actor.returnTo-actor.returnFrom)*ease(t);if(actor.courseReturn&&actor.courseFrame)returnCourse(actor,t);else useSample(actor,actor.kind,p,p);
      if(t>=1){actor.time=0;actor.status='exiting';lifeSample(actor,actor.kind,'exit',0);}return;
    }
    if(actor.status==='exiting'){
      const duration=meta(actor,actor.kind).exitDuration,t=clamp(actor.time/duration);lifeSample(actor,actor.kind,'exit',t);if(t>=1)startOutsideTransfer(actor);return;
    }
    if(actor.status==='turning-out'){
      turnFrame(actor,actor.oldGate,actor.exitHeading,actor.walkHeading,clamp(actor.time/.65),'轉向下一堂課的位置');if(actor.time>=.65){actor.status='walking';actor.time=0;}return;
    }
    if(actor.status==='walking'){
      movingFrame(actor,actor.oldGate,actor.newGate,clamp(actor.time/actor.walkDuration),actor.walkHeading,'走到下一堂課的器材外');if(actor.time>=actor.walkDuration){actor.status='turning-in';actor.time=0;}return;
    }
    if(actor.status==='turning-in'){
      turnFrame(actor,actor.newGate,actor.walkHeading,actor.entryHeading,clamp(actor.time/.65),'調整站位再使用新器材');if(actor.time>=.65){actor.kind=actor.walkingToKind;actor.status='entering';actor.time=0;showOnly(actor,actor.kind);lifeSample(actor,actor.kind,'enter',0);}return;
    }
    if(actor.status==='entering'){
      const duration=meta(actor,actor.kind).entryDuration,t=clamp(actor.time/duration);lifeSample(actor,actor.kind,'enter',t);if(t>=1){const target=followPhase??0,wrapped=target>.5&&actor.kind!=='cycle'?target-1:target;actor.status='syncing';actor.time=0;actor.phase=0;actor.syncTarget=wrapped;actor.syncLastPhase=target;actor.syncDuration=actor.kind==='aerial'?14:Math.max(1.4,Math.abs(wrapped)*(actor.kind==='cycle'?28:8));}return;
    }
    if(actor.status==='syncing'){
      const target=followPhase??(awaitingPlayerStart&&actor.kind===definition(selectedId)?.classKind?0:(actor.syncLastPhase+dt/(definition(actor.kind)?.duration||24))%1),delta=Math.atan2(Math.sin((target-actor.syncLastPhase)*Math.PI*2),Math.cos((target-actor.syncLastPhase)*Math.PI*2))/(Math.PI*2);actor.syncTarget+=delta;actor.syncLastPhase=target;
      const t=clamp(actor.time/actor.syncDuration),cycle=actor.syncTarget*ease(t),phase=(cycle%1+1)%1;actor.phase=phase;if(actor.kind==='aerial'&&followPhase!==null&&active){const frame=courseTimelineAt('aerial',clamp(followPhase)*definition('aerial').duration);useCourse(actor,'aerial',clamp(followPhase),{...frame,joining:true,joinProgress:t});}else useSample(actor,actor.kind,phase,cycle);if(t>=1){actor.status='using';actor.time=0;}return;
    }
  }
  function transformVolume(volume,from,to){
    const out=C(volume),qFrom=new THREE.Quaternion().setFromAxisAngle(UP,yawOf(from)),qTo=new THREE.Quaternion().setFromAxisAngle(UP,-yawOf(to));
    for(const key of ['position','start','end'])if(volume[key])out[key]=A(inverse(A(transform(volume[key],from)),to));
    if(volume.shape==='box'){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0])));q.premultiply(qFrom).premultiply(qTo);out.rotation=new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3);}return out;
  }
  function subtractMatFootprint(volume){
    const [x,y,z]=volume.position,[w,h,d]=volume.size,minX=x-w/2,maxX=x+w/2,minZ=z-d/2,maxZ=z+d/2,bounds=[-.86,.86,-1.31,1.31],parts=[];
    const addPart=(a,b,c,d,suffix)=>{if(b-a<.001||d-c<.001)return;parts.push({...C(volume),id:`${volume.id}-${suffix}`,position:[(a+b)/2,y,(c+d)/2],size:[b-a,h,d-c],rotation:[0,0,0]});};
    addPart(minX,Math.min(maxX,bounds[0]),minZ,maxZ,'left');addPart(Math.max(minX,bounds[1]),maxX,minZ,maxZ,'right');const left=Math.max(minX,bounds[0]),right=Math.min(maxX,bounds[1]);addPart(left,right,minZ,Math.min(maxZ,bounds[2]),'back');addPart(left,right,Math.max(minZ,bounds[3]),maxZ,'front');return parts;
  }
  function fixtures(actor,kind){
    const worldVolumes=architecture.getWorldCollisionVolumes?.(),base=worldVolumes?worldVolumes.filter(v=>v.position&&v.position[0]>=-35.2&&v.position[0]<=-11&&v.position[2]>=20.8&&v.position[2]<=31.2):architecture.getCollisionVolumes?.('group-class')||[],from=worldVolumes?{origin:[0,0,0],rotation:0}:placement,out=base.map(v=>transformVolume(v,from,actor.placement));
    const ownMat=actor.id==='player'?'classroom-mat-2':actor.id==='class-participant-1'?'classroom-mat-1':actor.id==='class-participant-2'?'classroom-mat-3':null;
    if(actor.id==='class-instructor'){if(!out.some(v=>v.id==='classroom-stage'))out.push({id:'class-instructor-stage',shape:'box',position:[0,-.11,0],size:[14,.22,3.6],allowedBodyParts:['leftFoot','rightFoot']});}
    else if(!out.some(v=>v.id===ownMat))out.push({id:ownMat,shape:'box',position:[0,-.003,0],size:[1.7,.006,2.6],allowedBodyParts:['leftFoot','rightFoot']});
    return out.flatMap(volume=>{
      if(kind!=='pilates')return[volume];
      if(volume.id===ownMat)return[{...volume,allowedBodyParts:[...BODY_ON_MAT]}];
      // The floor under a mat is covered by that mat. Keep its exposed edges
      // solid, and validate the skin against the real floor in qualification.
      if(['classroom-floor','class-instructor-stage','classroom-stage'].includes(volume.id))return subtractMatFootprint(volume);
      return[volume];
    });
  }
  function collisionVolumes(actor,kind){return[...getProgram(actor,kind).program.getCollisionVolumes(),...fixtures(actor,kind)];}
  function contactsOf(actor,kind){
    const record=getProgram(actor,kind),frame=record.lastFrame,contacts=record.program.getActualContacts?.()||{hands:C(frame?.pose.hands||[]),feet:C(frame?.pose.feet||[])};
    if(frame)contacts.feet=frame.pose.feet.map(point=>A(V(point).applyAxisAngle(UP,frame.rotation).add(V(frame.offset))));return contacts;
  }
  function navigationObstacles(){
    if(!navigationDirty)return navigationCache;navigationDirty=false;navigationCache=[];
    for(const actor of actors.values())for(const record of actor.programs.values())if(record.group.visible){
      for(const volume of record.program.getCollisionVolumes()){
        const bounds=new THREE.Box3();if(volume.shape==='box'){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0])));for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])bounds.expandByPoint(transform(A(new THREE.Vector3(x*volume.size[0]/2,y*volume.size[1]/2,z*volume.size[2]/2).applyQuaternion(q).add(V(volume.position))),actor.placement));}
        else if(volume.shape==='capsule')for(const point of [volume.start,volume.end]){const p=transform(point,actor.placement);bounds.expandByPoint(p.clone().addScalar(volume.radius));bounds.expandByPoint(p.clone().addScalar(-volume.radius));}
        if(bounds.isEmpty()||bounds.max.y<actor.placement.origin[1]+.12||bounds.min.y>actor.placement.origin[1]+1.90)continue;navigationCache.push({x:(bounds.min.x+bounds.max.x)/2,z:(bounds.min.z+bounds.max.z)/2,hx:(bounds.max.x-bounds.min.x)/2,hz:(bounds.max.z-bounds.min.z)/2});
      }
    }return navigationCache;
  }
  function currentRoomActivity(){
    const transitioning=[...actors.values()].some(actor=>actor.id!=='player'&&actor.status!=='using'),forced=active||awaitingPlayerStart||transitioning;
    return{visible:roomActivity.visible||forced,updating:roomActivity.updating||forced,forcedByCourse:forced};
  }
  for(const actor of actors.values())if(actor.id!=='player'){const warmup=getProgram(actor,'warmup');warmup.group.visible=true;useSample(actor,'warmup',0);}
  return{
    getSetup(id){const d=definition(id);if(!d)return null;return{...C(station.setup),origin:[...placement.origin],rotation:placement.rotation,exerciseId:d.id,stationId:station.id,duration:d.duration,cameraDistance:d.classKind==='pilates'?4.5:station.setup.cameraDistance||9,attachmentId:d.attachmentId,setupLabel:d.setupLabel};},
    getLifecycle(id){const d=definition(id);if(!d)return null;const m=meta(actors.get('player'),d.classKind);return{gateOffset:C(m.gateOffset||m.gate?.offset||[0,0,0]),gateRotation:m.gateRotation??m.gate?.rotation??0,exitGateRotation:m.exitGateRotation??m.gateRotation??m.gate?.rotation??0,entryDuration:m.entryDuration,exitDuration:m.exitDuration,restPhase:m.restPhase??0,stages:C(m.stages||[])};},
    prepare(id){const d=definition(id);if(!d)return false;selectedId=d.id;awaitingPlayerStart=true;const player=actors.get('player');player.kind=d.classKind;player.targetKind=d.classKind;showOnly(player,d.classKind);lifeSample(player,d.classKind,'enter',0);changeNPCs(d.classKind);active=false;return true;},
    begin(id){if(selectedId!==id)this.prepare(id);active=true;awaitingPlayerStart=false;sharedPhase=0;sharedLoops=0;previousSharedPhase=0;for(const actor of actors.values())actor.courseReturn=null;architecture.beginFacility?.(station.id);},
    beginReturn(id,phase){const d=definition(id);if(!d)return 2;active=false;const player=actors.get('player');if(!player.courseFrame)useCourse(player,d.classKind,phase);const duration=prepareReturn(player);for(const actor of actors.values())if(actor.id!=='player'&&actor.status==='using'&&actor.kind===d.classKind){actor.returnDuration=duration;prepareReturn(actor);actor.status='course-returning';actor.time=0;}return duration;},
    sampleReturn(id,u){const d=definition(id);return d?returnCourse(actors.get('player'),clamp(u)):null;},
    beginExit(){active=false;awaitingPlayerStart=false;architecture.endFacility?.(station.id);},end(){active=false;awaitingPlayerStart=false;architecture.endFacility?.(station.id);},
    sample(id,phase,cycle=phase){const d=definition(id);if(!d)return null;return useCourse(actors.get('player'),d.classKind,phase).pose;},
    sampleLifecycle(id,direction,u){const d=definition(id);if(!d)return null;return lifeSample(actors.get('player'),d.classKind,direction,u);},
    getCollisionVolumes(id){const d=definition(id);return d?collisionVolumes(actors.get('player'),d.classKind):[];},
    getActualContacts(id){const d=definition(id);return d?contactsOf(actors.get('player'),d.classKind):null;},
    getSegment(id,phase){const d=definition(id);return d?courseTimelineAt(d.classKind,clamp(phase)*d.duration):null;},
    getPoseContacts(id){const d=definition(id);return d?C(actors.get('player').frame?.contacts):null;},
    getVisualRoots(id){const d=definition(id);return d?[getProgram(actors.get('player'),d.classKind).group]:[];},getNavigationObstacles:navigationObstacles,
    setRoomActivity(next={}){roomActivity={visible:next.visible!==false,updating:next.updating!==false};return currentRoomActivity();},
    getRoomActivity:currentRoomActivity,
    getPlaybackInfo(out={}){const selected=definition(selectedId);out.selectedId=selectedId;out.selectedKind=selected?.classKind;out.duration=selected?.duration||24;return out;},
    registerRoomRoot(root){return architecture.roomZones?.registerRoot('classroom',root)||root;},
    getInventoryRoots(){return [...actors.values()].flatMap(actor=>[...actor.programs.values()].map(record=>record.group));},
    update(dt,{phase=null,active:following=active}={}){if(!currentRoomActivity().updating){roomSkippedTicks++;return;}roomUpdateTicks++;const delta=Math.max(0,Math.min(.05,dt));elapsed+=delta;if(following&&phase!==null)sharedPhase=clamp(phase);for(const actor of actors.values())if(actor.id!=='player')updateActor(actor,delta,following&&phase!==null?clamp(phase):null);},
    sampleNPC(actorId,phase=null){const actor=actors.get(actorId);if(!actor)return null;if(actor.status==='using'&&phase!==null&&active){const d=definition(actor.kind),lag=actorId==='class-instructor'?0:actorId==='class-participant-1'?.10:.18;return useCourse(actor,actor.kind,phase>=1?1:Math.max(0,phase-lag/d.duration));}return actor.frame||useSample(actor,actor.kind,actor.phase);},
    getNPCCollisionVolumes(actorId){const actor=actors.get(actorId);if(!actor)return[];return['turning-out','walking','turning-in'].includes(actor.status)?fixtures(actor,actor.kind):collisionVolumes(actor,actor.kind);},
    getNPCActualContacts(actorId){const actor=actors.get(actorId);return actor?contactsOf(actor,actor.kind):null;},
    getDiagnostics(){const suspension=[...actors.values()].map(actor=>{const record=actor.programs.get('aerial');return record?{actorId:actor.id,visible:record.group.visible,...record.program.getSuspensionDiagnostics()}:null;}).filter(Boolean);return{selectedId,selectedKind:definition(selectedId)?.classKind,duration:definition(selectedId)?.duration||24,active,elapsed,suspension,roomActivity:{...currentRoomActivity(),updated:roomUpdateTicks,skipped:roomSkippedTicks},course:courseTimelineAt(definition(selectedId)?.classKind,sharedPhase*(definition(selectedId)?.duration||0)),npcs:[...actors.values()].filter(a=>a.id!=='player').map(actor=>({id:actor.id,kind:actor.kind,targetKind:actor.targetKind,status:actor.status,phase:actor.phase,courseElapsed:actor.courseFrame?.elapsed??null,motionId:actor.courseFrame?.motionId??null,blockId:actor.courseFrame?.block.id??null,transitioning:actor.status!=='using',visibleKinds:[...actor.programs.values()].filter(r=>r.group.visible).map(r=>r.kind),frame:actor.frame?{offset:C(actor.frame.offset),rotation:actor.frame.rotation,stage:actor.frame.stage}:null}))};},
  };
}
