import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparationFixture} from '../scripts/preparation-fixture-v013.mjs';
import {preparationStepTurn} from '../src/preparation-step-turn-v013.js';
import {buildMovementPose} from '../src/locomotion.js';
import {evaluateExerciseClearance,evaluateSelfClearance} from '../src/collision-validation.js';

const fixture=await createPreparationFixture(),{THREE,character,metrics,machines,createMachineLifecycle}=fixture,up=new THREE.Vector3(0,1,0),V=value=>new THREE.Vector3(...value);
test.after(()=>character.dispose());
function sample(lifecycle,machine,direction,phase){
 const frame=lifecycle.sample(direction,phase);character.pose(frame.pose);const local=character.getContactPoints(),body={maxReachError:local.maxReachError};
 for(const key of ['hands','feet','shoulders','elbows','wrists','hips','knees','ankles'])body[key]=local[key].map(value=>V(value).applyAxisAngle(up,frame.rotation||0).add(V(frame.offset)).toArray());
 assert.ok(local.maxReachError<.015);assert.deepEqual(evaluateExerciseClearance(body,machine.getCollisionVolumes()).collisions,[]);assert.deepEqual(evaluateSelfClearance(body).collisions,[]);
 return{frame,body};
}

test('calf setup preserves authored free hand paths across steps instead of resetting arms',()=>{
 const machine=machines.get('calf-raise'),lifecycle=createMachineLifecycle({THREE,machine,metrics});assert.ok(lifecycle.entryDuration>=10);
 let maximum=0;
 for(const direction of ['enter','exit']){let previous=null;const count=2001,seconds=direction==='enter'?lifecycle.entryDuration:lifecycle.exitDuration;
  for(let i=0;i<count;i++){const {body}=sample(lifecycle,machine,direction,i/(count-1));if(previous)for(let side=0;side<2;side++)maximum=Math.max(maximum,V(body.hands[side]).distanceTo(V(previous.hands[side]))/(seconds/(count-1)));previous=body;}
 }
 // Regression bound for the old ~47 cm boundary jump. This is an animation
 // continuity test, not a clinical hand-speed recommendation.
 assert.ok(maximum<6,`unexpected hand snap: ${maximum} m/s`);
});

test('preparation knees avoid the rower axis flip and abrupt bike/hack swing liftoff',()=>{
 const machine=machines.get('rower'),lifecycle=createMachineLifecycle({THREE,machine,metrics});let maximum=0;
 for(const direction of ['enter','exit']){let previous=null;const count=1001,seconds=direction==='enter'?lifecycle.entryDuration:lifecycle.exitDuration;
  for(let i=0;i<count;i++){const {body}=sample(lifecycle,machine,direction,i/(count-1));if(previous)for(let side=0;side<2;side++)maximum=Math.max(maximum,V(body.knees[side]).distanceTo(V(previous.knees[side]))/(seconds/(count-1)));previous=body;}
 }
 assert.ok(maximum<8,`old knee-axis flip returned: ${maximum} m/s`);
 // The old sin(pi*u) foot lift had nonzero vertical speed at each planted
 // foot transition. Check actual knees immediately around that transition;
 // a larger but smooth mid-swing maximum is deliberately not prohibited.
 for(const [id,low,high]of [['bike',.061,.063],['hack-squat',.149,.151]]){
  const device=machines.get(id),path=createMachineLifecycle({THREE,machine:device,metrics}),height=phase=>path.sample('enter',phase).pose.feet.reduce((sum,point)=>sum+point[1],0);let a=low,b=high;
  for(let i=0;i<45;i++){const p=a+(b-a)/3,q=b-(b-a)/3;if(height(p)<height(q))b=q;else a=p;}
  const center=(a+b)/2,epsilon=1e-6;
  for(const direction of ['enter','exit']){
   const phase=direction==='enter'?center:1-center,seconds=direction==='enter'?path.entryDuration:path.exitDuration,points=[-1,0,1].map(sign=>sample(path,device,direction,phase+sign*epsilon).body.knees);
   for(let side=0;side<2;side++){
    const before=V(points[1][side]).sub(V(points[0][side])).divideScalar(seconds*epsilon),after=V(points[2][side]).sub(V(points[1][side])).divideScalar(seconds*epsilon);
    assert.ok(before.distanceTo(after)<.01,`${id} regained its planted-to-swing knee velocity crease`);
   }
  }
 }
});

test('leg-press side-gate turn does not cancel opposite knee poles or sweep into the outer plates',()=>{
 const machine=machines.get('leg-press'),lifecycle=createMachineLifecycle({THREE,machine,metrics});let maximum=0;
 for(const direction of ['enter','exit']){let previous=null;const count=1001,seconds=direction==='enter'?lifecycle.entryDuration:lifecycle.exitDuration;
  for(let i=0;i<count;i++){const {body}=sample(lifecycle,machine,direction,i/(count-1));if(previous)for(let side=0;side<2;side++)maximum=Math.max(maximum,V(body.knees[side]).distanceTo(V(previous.knees[side]))/(seconds/(count-1)));previous=body;}
 }
 // This bound catches the preparation's observed 8.36 m/s pole flip.
 assert.ok(maximum<6.5,`opposed knee-pole regression: ${maximum} m/s`);
});

test('side-access machines turn toward their steps and keep the crossing knees in front of the body',()=>{
 for(const id of ['leg-press','leg-extension','leg-curl','seated-row']){
  const machine=machines.get(id),lifecycle=createMachineLifecycle({THREE,machine,metrics});let turningSwing=0,crossingFrames=0;
  for(let i=0;i<=1000;i++){
   const {frame,body}=sample(lifecycle,machine,'exit',i/1000),yaw=frame.rotation||0;
   if(yaw<-.1&&yaw>-1.4&&!frame.contacts.feet.every(Boolean))turningSwing++;
   if(Math.abs(yaw+Math.PI/2)<.01&&frame.offset[0]<-.30&&frame.offset[0]>-.95){
    for(let side=0;side<2;side++){
     assert.ok(body.knees[side][0]<body.hips[side][0]+.10,`${id} knee turned against the crossing`);
     assert.ok(Math.abs(body.knees[side][2]-body.hips[side][2])<.22,`${id} returned to a sideways frog stance`);
    }
    crossingFrames++;
   }
  }
  assert.ok(turningSwing>10&&crossingFrames>20,`${id} lost its actual stepping turn`);
 }
});

test('hip-machine preparation rests the hands ahead of the thighs with lowered elbows',()=>{
 for(const id of ['hip-abduction','hip-adduction']){
  const machine=machines.get(id),lifecycle=createMachineLifecycle({THREE,machine,metrics});
  for(const direction of ['enter','exit']){
   let previous=null;
   for(let i=0;i<=1000;i++){
    const current=sample(lifecycle,machine,direction,i/1000);
    if(current.frame.stage==='坐穩椅墊'&&previous?.frame.stage==='坐穩椅墊')for(let side=0;side<2;side++)assert.ok(V(current.body.feet[side]).distanceTo(V(previous.body.feet[side]))<1e-6,'seating dragged a planted shoe');
    previous=current;
   }
  }
  for(const phase of [.43,.48,.68,.79,.83]){
   const {body}=sample(lifecycle,machine,'enter',phase);
   for(let side=0;side<2;side++){
    assert.ok(body.elbows[side][1]<body.shoulders[side][1]-.12,'free elbow rose into the old shoulder-high pose');
    assert.ok(body.hands[side][2]>body.hips[side][2]+(phase<.48?.10:.25),'free hand crossed back through the torso');
   }
  }
 }
});

test('raised seats and multiple change plates retain clear mounting paths at the narrow regression phases',()=>{
 for(const [id,settings]of [['leg-extension',{seatHeightCm:73}],['shoulder-press',{seatHeightCm:66}],['calf-raise',{plateLoadKg:38.75}]]){
  const machine=machines.get(id);assert.equal(machine.setEquipmentSettings(settings).ok,true);const lifecycle=createMachineLifecycle({THREE,machine,metrics});
  for(const direction of ['enter','exit'])for(let i=0;i<=300;i++)sample(lifecycle,machine,direction,i/300);
 }
});

test('preparation half-turn uses alternating feet and keeps each planted shoe fixed in machine space',()=>{
 const neutral=buildMovementPose(metrics,0,0,0),world=(point,frame)=>V(point).applyAxisAngle(up,frame.rotation).add(V(frame.offset));let previous=null,swingCounts=[0,0];
 for(let i=0;i<=800;i++){
  const frame=preparationStepTurn({neutral,offset:[0,0,1.25],from:Math.PI,to:0,phase:i/800,stage:'turn'});character.pose(frame.pose);const body=character.getContactPoints();assert.ok(body.maxReachError<.015);
  for(let side=0;side<2;side++){if(!frame.contacts.feet[side])swingCounts[side]++;if(previous?.contacts.feet[side]&&frame.contacts.feet[side])assert.ok(world(frame.pose.feet[side],frame).distanceTo(world(previous.pose.feet[side],previous))<1e-6);}
  previous=frame;
 }
 assert.ok(swingCounts.every(count=>count>100));
 const end=preparationStepTurn({neutral,offset:[0,0,1.25],from:Math.PI,to:0,phase:1,stage:'turn'});for(let side=0;side<2;side++)assert.ok(V(end.pose.feet[side]).distanceTo(V(neutral.feet[side]))<1e-7);
});

test('captured locomotion arm blending keeps the original fixed bones and torso clearance',()=>{
 let samples=0;
 for(const running of [0,.5,1])for(const moving of [0,.5,1])for(let i=0;i<=180;i++){
  character.pose(buildMovementPose(metrics,i/90,running,moving));const body=character.getContactPoints();assert.ok(body.maxReachError<.015);assert.deepEqual(evaluateSelfClearance(body).collisions,[]);
  for(let side=0;side<2;side++)for(const [a,b,length]of [['shoulders','elbows',metrics.arms[side].upper],['elbows','wrists',metrics.arms[side].lower],['hips','knees',metrics.legs[side].upper],['knees','ankles',metrics.legs[side].lower]])assert.ok(Math.abs(V(body[a][side]).distanceTo(V(body[b][side]))-length)<1e-5);
  samples++;
 }
 assert.equal(samples,1629);
});
