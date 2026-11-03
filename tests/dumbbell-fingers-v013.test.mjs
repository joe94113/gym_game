import test from 'node:test';
import assert from 'node:assert/strict';
import {THREE,rig,character} from '../scripts/dumbbell-test-helpers.mjs';
import {cylinderHandMeasure} from '../scripts/equipment-grip-test-helpers.mjs';

test.after(()=>character.dispose());
test('both hands close and open around the real rack shafts before lifting and after putting down',()=>{
 const id='dumbbell-bench-press';rig.end({keepVisible:false});rig.setEquipmentSettings(id,{benchAngle:0});rig.prepare(id);
 const meta=rig.getLifecycle(id);let start=0,grasp=null;
 for(const stage of meta.stages){if(stage.label==='握穩啞鈴'){grasp={start,duration:stage.duration};break;}start+=stage.duration;}
 assert.ok(grasp,'the actual lifecycle contains a grasp interval');
 let closedSkin=null;
 for(const mode of['enter','exit'])for(let step=0;step<=40;step++){
  const progress=step/40,u=(grasp.start+grasp.duration*progress)/meta.entryDuration,frame=rig.sampleLifecycle(id,mode,mode==='exit'?1-u:u);
  character.pose(frame.pose);const props=rig.getLifecycleState(id);
  assert.equal(props.propPositions.length,2);
  if(progress<1-1e-8)assert.equal(frame.held,false,'the shafts remain on the rack while the fingers close or open');
  for(let side=0;side<2;side++){
   const skin=character.getSurfaceSamples({stride:1,parts:[side?'rightHand':'leftHand']}).map(sample=>({...sample,position:sample.position.map((value,index)=>value+frame.offset[index])}));
   assert.ok(skin.length>1700,'real complete hand skin was checked');
   const axis=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion(...props.propQuaternions[side])),measure=cylinderHandMeasure(skin,{center:props.propPositions[side],axis:axis.toArray(),halfLength:.19,radius:.016});
   assert.equal(measure.count,0,`${mode} ${progress} hand ${side}: no skin vertex enters the 32 mm shaft beyond 1 mm`);
   if(progress===1)assert.equal(measure.wraps,true,`closed hand ${side}: skin surrounds the shaft in cross-section`);
  }
  if(progress===1){
   assert.ok(frame.pose.handThumbOpposition[0]<-.5&&frame.pose.handThumbOpposition[1]>.5,'the thumbs oppose the fingers in mirrored directions');
   const skin=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']});
   if(closedSkin)assert.deepEqual(skin,closedSkin,'the same closed hand joins grasp and release');else closedSkin=skin;
  }
 }
});
