import {activityById} from './activity-catalog.js';
import {buildLocomotionPose} from './locomotion.js';
import {transformPoint} from './lifecycle-frame.js';
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
/** A session owns the whole approach/use/return sequence, including cancellation. */
export function createPlayerActivity({THREE,character,runtime,crowd,findPath,floorHeight,onChange=()=>{},onFrame=()=>{},onProgress=()=>{}}){
  const metrics=character.getAssetInfo().metrics;
  let session=null,queued=null,speed=1,paused=false,walkClock=0,lastFrame=null,lastCompleted=null,inspection=null;
  const labels={approaching:'走向器材',waiting:'等對方離開器材',aligning:'調整站位',entering:'準備使用','waiting-class':'等教練與學員就位','counting-in':'準備開始',exercising:'動作示範',completed:'課程結束',returning:'控制重量回位',exiting:'放回器材並離開',canceling:'收回器材並退回走道'};
  const actionLabels={positioning:'調整站位',sitting:'坐穩並調整姿勢',taking:'拿起器材',grasping:'握穩握把',returning:'把重量放回支撐處',releasing:'鬆開握把',standing:'扶穩起身',leaving:'離開器材',ready:'準備完成','stepping-up':'站上平台'};
  const isCourse=s=>s?.definition.facilityKind==='groupClass';
  const phaseOf=s=>s?(s.forced??(isCourse(s)?clamp(s.clock/s.duration):(s.clock/s.duration)%1)):0;
  const state=()=>({exerciseId:session?.id||null,stationId:session?.definition.stationId,stage:session?.stage||'idle',phase:phaseOf(session),paused,speed,waitingForOccupant:session?.stage==='waiting',transitioning:!!session&&!['exercising','completed'].includes(session.stage),queuedExerciseId:queued,lifecyclePhase:session?.progress||0,course:isCourse(session)?{elapsed:Math.min(session.duration,session.clock),duration:session.duration,remaining:Math.max(0,session.duration-session.clock),complete:session.stage==='completed',previewed:session.previewed,attendedSeconds:session.attendedSeconds,countInRemaining:session.stage==='counting-in'?Math.max(0,Math.ceil(3-session.time)):0}:null});
  function report(){if(!session)return;const s=state(),classSegment=runtime.getSegment?.(session.id,s.phase)||null;onProgress({...s,classSegment,actionStage:lastFrame?.stage,reps:Math.floor(session.clock/session.duration),label:session.stage==='exercising'?(classSegment?.label||(session.definition.runtime==='facility'?'使用中':session.definition.category==='stretch'?'穩定伸展':s.phase<.44?'平穩出力':'控制回程')):(['entering','exiting','canceling'].includes(session.stage)?lastFrame?.stageLabel||actionLabels[lastFrame?.stage]||lastFrame?.stage||labels[session.stage]:labels[session.stage])});}
  function setStage(stage){if(!session)return;session.stage=stage;session.time=0;session.history.push(stage);onChange({id:session.id,status:stage});report();}
  function apply(frame){if(!session||!frame?.pose)return;const setup=session.setup,offset=frame.offset||[0,0,0];character.group.position.fromArray(transformPoint(offset,setup.origin,setup.rotation||0));character.group.rotation.y=(setup.rotation||0)+(frame.rotation||0);character.pose(frame.pose);if(session.actions.at(-1)!==frame.stage)session.actions.push(frame.stage);lastFrame={...frame,offset,rotation:frame.rotation||0};onFrame(lastFrame);}
  function poseExercise(phase,cycle){if(!session)return;const pose=runtime.sample(session.id,phase,cycle);if(isCourse(session)){const block=runtime.getSegment(session.id,phase)?.block,primary=block?.primaryMuscles||session.definition.muscleKeys||[],secondary=block?.secondaryMuscles||session.definition.secondaryMuscleKeys||[],key=JSON.stringify([primary,secondary]);if(key!==session.highlightKey){character.setMuscleHighlights(primary,secondary,{side:'both'});session.highlightKey=key;}}apply({pose,offset:[0,0,0],rotation:0,stage:session.stage==='completed'?'completed':'exercising',contacts:runtime.getPoseContacts?.(session.id)||{hands:[true,true],feet:[true,true]}});}
  function completeCourse(){if(!session)return;session.clock=session.duration;session.forced=null;paused=true;poseExercise(1,1);setStage('completed');}
  function startExerciseClock(){if(!session)return;session.clock=(session.meta.restPhase??0)*session.duration;session.forced=null;runtime.begin(session.id);setStage('exercising');poseExercise(session.clock/session.duration,session.clock/session.duration);}
  function readyToStart(){if(isCourse(session)){session.clock=0;session.forced=null;setStage('counting-in');}else startExerciseClock();}
  function beginEntry(){if(!session)return;runtime.prepare(session.id);session.prepared=true;session.progress=0;setStage('entering');apply(runtime.sampleLifecycle(session.id,'enter',0));character.setMuscleHighlights(session.definition.muscleKeys||[],session.definition.secondaryMuscleKeys||[],{side:session.definition.side||'both',secondarySide:session.definition.category==='stretch'?'both':session.definition.side||'both'});}
  function atGate(){if(!session)return;if(crowd.getOccupancy(session.definition.stationId).state!=='free'){setStage('waiting');return;}setStage('aligning');}
  function start(id){
    inspection=null;
    const definition=activityById(id);if(!definition)return false;
    if(session){queued=id;stop({preserveQueue:true});return true;}
    const setup=runtime.getSetup(id),meta=runtime.getLifecycle(id);if(!setup||!meta)return false;
    const gateOffset=meta.gateOffset||meta.gate?.offset||[0,0,2.3],gate=new THREE.Vector3().fromArray(transformPoint(gateOffset,setup.origin,setup.rotation||0));
    gate.y=floorHeight(gate.x,gate.z);
    const startPoint=character.group.position.clone(),route=findPath(startPoint,gate);
    if(startPoint.distanceTo(gate)>.15&&!route.length)return false;
    session={id,definition,setup,meta,gate,gateOffset,gateYaw:(setup.rotation||0)+(meta.gateRotation??meta.gate?.rotation??0),route,index:0,stage:'approaching',time:0,clock:0,forced:null,progress:0,duration:setup.duration||definition.duration||6,history:['approaching'],actions:[],prepared:false,previewed:false,attendedSeconds:0};
    paused=false;lastFrame=null;character.setMuscleHighlights();crowd.requestHandoff(definition.stationId);onChange({id,status:'approaching'});report();
    if(startPoint.distanceTo(gate)<.15)atGate();
    return true;
  }
  function finish(atCurrent=false){
    if(!session)return;const previous=session;
    if(!atCurrent){character.group.position.copy(previous.gate);character.group.rotation.y=(previous.setup.rotation||0)+(previous.meta.exitGateRotation??previous.meta.gateRotation??previous.meta.gate?.rotation??0);}
    if(previous.prepared)runtime.end();
    lastCompleted={id:previous.id,history:[...previous.history,'finished'],actions:[...previous.actions],gate:previous.gate.toArray(),position:character.group.position.toArray(),course:isCourse(previous)?{duration:previous.duration,elapsed:previous.clock,complete:previous.clock>=previous.duration,previewed:previous.previewed,attendedSeconds:previous.attendedSeconds}:null};
    session=null;lastFrame=null;paused=false;character.pose(buildLocomotionPose(metrics,walkClock,0));character.setMuscleHighlights();onFrame(null);onChange({id:previous.id,status:'finished',history:previous.history});
    if(queued){const next=queued;queued=null;start(next);}
  }
  function beginExit(){if(!session)return;runtime.beginExit?.(session.id);session.progress=0;setStage('exiting');apply(runtime.sampleLifecycle(session.id,'exit',0));}
  function stop({preserveQueue=false}={}){
    inspection=null;
    if(!preserveQueue)queued=null;
    if(!session)return;
    if(['approaching','waiting','aligning'].includes(session.stage)){finish(true);return;}
    if(['entering','waiting-class','counting-in'].includes(session.stage)){session.reverseFrom=session.progress;setStage('canceling');return;}
    if(['returning','exiting','canceling'].includes(session.stage))return;
    if(isCourse(session)){
      session.returnDuration=runtime.beginReturn?.(session.id,phaseOf(session))||2;session.courseReturning=true;paused=false;setStage('returning');return;
    }
    const phase=session.forced??session.clock/session.duration%1,rest=session.meta.restPhase??0;
    const target=[rest-1,rest,rest+1].sort((a,b)=>Math.abs(a-phase)-Math.abs(b-phase))[0];
    session.returnFrom=phase;session.returnTo=target;session.returnDuration=Math.max(.5,Math.min(3,Math.abs(target-phase)*session.duration));paused=false;setStage('returning');
  }
  function update(dt){
    if(!session)return;if(inspection){apply(runtime.sampleLifecycle(session.id,inspection.direction,inspection.u));report();return;}session.time+=dt;const s=session;
    if(s.stage==='approaching'){
      while(s.index<s.route.length&&Math.hypot(s.route[s.index].x-character.group.position.x,s.route[s.index].z-character.group.position.z)<.10)s.index++;
      const target=s.route[s.index];if(!target){character.group.position.copy(s.gate);atGate();return;}
      const delta=target.clone().sub(character.group.position);delta.y=0;const step=Math.min(delta.length(),dt*1.8);delta.normalize();character.group.position.addScaledVector(delta,step);character.group.position.y=floorHeight(character.group.position.x,character.group.position.z);
      const desired=Math.atan2(delta.x,delta.z),old=character.group.rotation.y,angle=Math.atan2(Math.sin(desired-old),Math.cos(desired-old));character.group.rotation.y+=Math.max(-dt*2.5,Math.min(dt*2.5,angle));
      walkClock+=dt;const intensity=Math.min(1,s.time/.35,character.group.position.distanceTo(s.gate)/.55),pose=buildLocomotionPose(metrics,walkClock,intensity);character.pose(pose);lastFrame={pose,walking:true,stage:'approaching',offset:[0,0,0],rotation:0};onFrame(lastFrame);
    }else if(s.stage==='waiting'){
      const pose=buildLocomotionPose(metrics,walkClock,0);character.pose(pose);lastFrame={pose,walking:true,stage:'waiting',offset:[0,0,0],rotation:0};onFrame(lastFrame);if(crowd.getOccupancy(s.definition.stationId).state==='free')setStage('aligning');
    }else if(s.stage==='aligning'){
      const old=character.group.rotation.y,angle=Math.atan2(Math.sin(s.gateYaw-old),Math.cos(s.gateYaw-old));character.group.rotation.y+=angle*Math.min(1,dt*7);const pose=buildLocomotionPose(metrics,walkClock,0);character.pose(pose);lastFrame={pose,walking:true,stage:'aligning',offset:[0,0,0],rotation:0};onFrame(lastFrame);
      if(Math.abs(angle)<.035||s.time>.9)beginEntry();
    }else if(s.stage==='entering'){
      s.progress=clamp(s.time/s.meta.entryDuration);apply(runtime.sampleLifecycle(s.id,'enter',s.progress));
      if(s.progress>=1){if(runtime.isReady?.(s.id)===false)setStage('waiting-class');else readyToStart();}
    }else if(s.stage==='waiting-class'){
      apply(runtime.sampleLifecycle(s.id,'enter',1));if(runtime.isReady?.(s.id)!==false)readyToStart();
    }else if(s.stage==='counting-in'){
      apply(runtime.sampleLifecycle(s.id,'enter',1));if(s.time>=3)startExerciseClock();
    }else if(s.stage==='exercising'){
      if(!paused){const increment=isCourse(s)?Math.min(dt*speed,s.duration-s.clock):dt*speed;s.clock+=increment;s.attendedSeconds+=increment;s.forced=null;}const cycle=s.clock/s.duration;poseExercise(phaseOf(s),cycle);if(isCourse(s)&&s.clock>=s.duration)completeCourse();
    }else if(s.stage==='completed'){
      poseExercise(1,1);
    }else if(s.stage==='returning'){
      const t=clamp(s.time/s.returnDuration);if(s.courseReturning){apply(runtime.sampleReturn(s.id,t));}else{const cycle=s.returnFrom+(s.returnTo-s.returnFrom)*ease(t);poseExercise((cycle%1+1)%1,cycle);}if(t>=1)beginExit();
    }else if(s.stage==='exiting'){
      s.progress=clamp(s.time/s.meta.exitDuration);apply(runtime.sampleLifecycle(s.id,'exit',s.progress));if(s.progress>=1)finish();
    }else if(s.stage==='canceling'){
      const u=Math.max(0,s.reverseFrom-s.time/s.meta.entryDuration);s.progress=u;apply(runtime.sampleLifecycle(s.id,'enter',u));if(u<=0)finish();
    }
    report();
  }
  return {
    start,stop,update,getState:state,isActive:()=>!!session,getFrame:()=>lastFrame,getHistory:()=>session?.history||[],getLastCompleted:()=>lastCompleted,
    setSpeed(value){speed=Math.max(.25,Math.min(2,Number(value)||1));},setPaused(value){paused=!!value;report();},
    seek(phase){inspection=null;if(!['exercising','completed'].includes(session?.stage))return false;const wasComplete=session.stage==='completed';session.forced=clamp(Number(phase)||0);session.clock=session.forced*session.duration;if(isCourse(session)){session.previewed=true;paused=true;if(wasComplete){runtime.begin(session.id);setStage('exercising');}}poseExercise(session.forced,session.forced);if(isCourse(session)&&session.clock>=session.duration)completeCourse();report();return true;},
    restartCourse(){if(!isCourse(session)||!['exercising','completed'].includes(session.stage))return false;if(session.stage==='completed'){session.clock=0;session.forced=null;session.previewed=false;session.attendedSeconds=0;paused=false;session.progress=1;readyToStart();}else{queued=session.id;stop({preserveQueue:true});}return true;},
    inspect(phase,cycle=phase){inspection=null;if(session?.stage!=='exercising')return false;poseExercise(clamp(phase),cycle);return true;},
    inspectLifecycle(direction,u){if(!session)return null;if(!session.prepared){runtime.prepare(session.id);session.prepared=true;}inspection={direction,u:clamp(u)};const frame=runtime.sampleLifecycle(session.id,direction,clamp(u));apply(frame);return frame;},
    getMetadata(){return session?.meta||null;},getSetup(){return session?.setup||null;},
  };
}
