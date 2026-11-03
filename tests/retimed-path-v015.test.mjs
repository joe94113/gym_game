import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {THREE,metrics,character} from '../scripts/dumbbell-test-helpers.mjs';
import {createActivityRig} from '../src/extended-rig.js';
import {capturedExerciseEffort} from '../src/captured-exercise-v015.js';
import {capturedPressCurves,capturedSquatCurves} from '../src/captured-exercise-curves-v015.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/retimed-path-v015.json',import.meta.url),'utf8'));
// This historical test protects the v0.15 timing layer on its own. The v0.17
// source-pose layer has separate actual-data, IK and surface qualification.
const rig=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:metrics,capturedPose:false});
function close(actual,expected,path=''){
 if(typeof expected==='number'){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-9,path);return;}
 if(Array.isArray(expected)){assert.equal(actual.length,expected.length,path);expected.forEach((v,i)=>close(actual[i],v,path+'.'+i));return;}
 if(expected&&typeof expected==='object'){assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),path);for(const key of Object.keys(expected))close(actual[key],expected[key],path+'.'+key);return;}
 assert.equal(actual,expected,path);
}
function props(id){const root=rig.getVisualRoot(id);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),out=[];root.traverse(object=>{if(object.isMesh){matrix.multiplyMatrices(inverse,object.matrixWorld);out.push({geometry:object.geometry.type,parameters:object.geometry.parameters,matrix:matrix.toArray()});}});return out;}
test.after(()=>character.dispose());
test('v0.15 captured tempos retain the archived path with newer pose retargeting disabled',()=>{
 assert.equal(fixture.sourceVersion,'0.14.0');assert.deepEqual(Object.keys(fixture.motions).sort(),['dumbbell-goblet-squat','dumbbell-shoulder-press']);
 for(const [id,frames]of Object.entries(fixture.motions))for(let cycle=0;cycle<2;cycle++){
  const curve=(id==='dumbbell-shoulder-press'?capturedPressCurves:capturedSquatCurves)[cycle].progress,peak=curve.indexOf(Math.max(...curve))/(curve.length-1);
  for(const frame of frames){let lo=frame.phase<=.44?0:peak,hi=frame.phase<=.44?peak:1;
   for(let i=0;i<60;i++){const mid=(lo+hi)/2,at=capturedExerciseEffort(id,mid,cycle);if((frame.phase<=.44&&at<frame.effort)||(frame.phase>.44&&at>frame.effort))lo=mid;else hi=mid;}
   const phase=frame.effort===0?(frame.phase<=.44?0:1):frame.effort===1?peak:(lo+hi)/2;
   // Fixtures store JSON wire data; undefined optional pose fields are absent.
   close(JSON.parse(JSON.stringify(rig.sample(id,phase,cycle))),frame.pose,id+' pose');close(JSON.parse(JSON.stringify(props(id))),frame.props,id+' gear');
  }
 }
});
