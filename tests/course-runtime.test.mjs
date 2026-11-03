import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlayerActivity} from '../src/player-activity.js';
import {activityById} from '../src/activity-catalog.js';
import {courseTimelineAt} from '../src/classes/class-timeline.js';
import {buildLocomotionPose} from '../src/locomotion.js';

function harness(){
  const metrics={neutral:{hip:[0,1,0],shoulder:[0,1.5,0],head:[0,1.75,0],hands:[[-.25,.8,0],[.25,.8,0]],feet:[[-.14,.013,0],[.14,.013,0]]}};
  const pose=buildLocomotionPose(metrics,0,0),frames=[],events=[],progress=[],returnCalls=[];
  const character={group:new THREE.Group(),getAssetInfo:()=>({metrics}),pose:p=>frames.push(p),setMuscleHighlights(){}};
  const runtime={getSetup:id=>({origin:[0,0,0],duration:activityById(id).duration||6}),getLifecycle:()=>({gateOffset:[0,0,0],entryDuration:.1,exitDuration:.1}),prepare(){},begin(){},end(){},isReady:()=>true,sample:()=>pose,sampleLifecycle:()=>({pose,offset:[0,0,0],contacts:{hands:[false,false],feet:[true,true]}}),getSegment:(id,phase)=>activityById(id).facilityKind==='groupClass'?courseTimelineAt(activityById(id).classKind,phase*activityById(id).duration):null,beginReturn:(id,phase)=>{returnCalls.push({id,phase});return 2;},sampleReturn:()=>({pose,offset:[0,0,0],contacts:{hands:[false,false],feet:[true,true]}}),beginExit(){}};
  const a=createPlayerActivity({THREE,character,runtime,crowd:{getOccupancy:()=>({state:'free'}),requestHandoff(){}},findPath:()=>[],floorHeight:()=>0,onChange:e=>events.push(e),onProgress:p=>progress.push(p)});
  const ready=()=>{for(let i=0;i<100&&a.getState().stage!=='exercising';i++)a.update(.2);assert.equal(a.getState().stage,'exercising');};
  return{a,ready,events,progress,returnCalls};
}

test('seven complete lessons advance through every block once and hold their finish instead of looping',()=>{
  for(const id of ['group-class','class-dance','class-cycle','class-trx','class-barbell','class-aerial','class-pilates']){
    const {a,ready,progress}=harness();assert.equal(a.start(id),true);ready();const duration=activityById(id).duration;
    for(let t=0;t<duration;t+=.5)a.update(.5);
    const s=a.getState();assert.equal(s.stage,'completed');assert.equal(s.phase,1);assert.equal(s.course.elapsed,duration);assert.equal(s.course.attendedSeconds,duration);assert.equal(s.course.previewed,false);
    assert.deepEqual([...new Set(progress.filter(p=>p.classSegment).map(p=>p.classSegment.stage))],['warmup','main','cooldown']);
    assert.equal(new Set(progress.filter(p=>p.classSegment).map(p=>p.classSegment.block.id)).size,courseTimelineAt(activityById(id).classKind,0).total);
    a.update(90);assert.equal(a.getState().phase,1);assert.equal(a.getState().course.elapsed,duration);
  }
});

test('pause, slow playback and previews keep elapsed time honest; completed lessons can restart',()=>{
  const {a,ready}=harness();a.start('class-dance');ready();a.setPaused(true);a.update(8);assert.equal(a.getState().course.elapsed,0);
  a.setPaused(false);a.setSpeed(.5);a.update(4);assert.equal(a.getState().course.elapsed,2);
  a.seek(.8);assert.equal(a.getState().paused,true);assert.equal(a.getState().course.previewed,true);assert.equal(a.getState().course.attendedSeconds,2);
  a.seek(1);assert.equal(a.getState().stage,'completed');assert.equal(a.getState().phase,1);
  a.restartCourse();assert.equal(a.getState().stage,'counting-in');assert.equal(a.getState().course.countInRemaining,3);ready();assert.equal(a.getState().stage,'exercising');assert.equal(a.getState().course.elapsed,0);assert.equal(a.getState().course.previewed,false);
});

test('stopping a lesson uses the authored return path instead of rewinding the whole lesson',()=>{
  const {a,ready,returnCalls}=harness();a.start('class-barbell');ready();a.seek(.61);a.stop();assert.equal(a.getState().stage,'returning');assert.deepEqual(returnCalls,[{id:'class-barbell',phase:.61}]);a.update(2);assert.equal(a.getState().stage,'exiting');a.update(.2);assert.equal(a.getState().stage,'idle');
});

test('restarting midway safely returns and leaves before starting the lesson again',()=>{
  const {a,ready,events}=harness();a.start('class-trx');ready();a.update(20);a.restartCourse();assert.equal(a.getState().stage,'returning');assert.equal(a.getState().queuedExerciseId,'class-trx');ready();assert.equal(a.getState().course.elapsed,0);assert.equal(a.getState().course.previewed,false);assert.ok(events.some(e=>e.status==='finished'));
});


test('lessons hold their ready pose for three count-in seconds before starting the course clock',()=>{
 const {a}=harness();a.start('class-barbell');for(let i=0;i<100&&a.getState().stage!=='counting-in';i++)a.update(.1);
 assert.equal(a.getState().stage,'counting-in');assert.equal(a.getState().course.countInRemaining,3);assert.equal(a.getState().course.elapsed,0);
 a.update(1);assert.equal(a.getState().course.countInRemaining,2);a.update(1);assert.equal(a.getState().course.countInRemaining,1);assert.equal(a.getState().course.attendedSeconds,0);
 a.update(1);assert.equal(a.getState().stage,'exercising');assert.equal(a.getState().course.elapsed,0);a.update(.5);assert.equal(a.getState().course.elapsed,.5);
});
