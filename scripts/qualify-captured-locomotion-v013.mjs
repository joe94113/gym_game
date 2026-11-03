import {createPreparationFixture} from './preparation-fixture-v013.mjs';
import {buildMovementPose} from '../src/locomotion.js';
import {evaluateSelfClearance} from '../src/collision-validation.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fixture=await createPreparationFixture(),{character,metrics}=fixture,failures=[];
let samples=0,maxReachError=0,maxWristBend=0,maxHandStep=0;
for(const run of [0,.25,.5,.75,1])for(const moving of [0,.25,.5,.75,1]){
 let previous=null;
 for(let frame=0;frame<=240;frame++){
  const pose=buildMovementPose(metrics,frame/120,run,moving);character.pose(pose);
  const body=character.getContactPoints(),self=evaluateSelfClearance(body);samples++;maxReachError=Math.max(maxReachError,body.maxReachError);
  for(const hand of character.getHandDiagnostics())maxWristBend=Math.max(maxWristBend,hand.wristBendRadians);
  if(previous)for(let side=0;side<2;side++)maxHandStep=Math.max(maxHandStep,Math.hypot(...body.hands[side].map((v,i)=>v-previous[side][i])));previous=body.hands;
  if(body.maxReachError>=.015||self.collisions.length)failures.push({run,moving,frame,reach:body.maxReachError,self:self.collisions});
 }
}
const files=['src/locomotion.js','src/captured-locomotion-v013.js','src/mocap-samples-v013.js','src/skinned-character.js','public/motions/cmu-v013.json','public/models/athlete/athlete.glb'];
const report={pass:failures.length===0,samples,maxReachError,maxWristBendRadians:maxWristBend,maxHandStepAt120Hz:maxHandStep,failures,sourceHashes:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),scope:'Real original GLB at 120Hz, five run and five movement blends. Captured arm swing retargeted onto original foot contacts and fixed lengths; this is not all-exercise mocap or a professional biomechanical judgment.'};
mkdirSync('artifacts/v013',{recursive:true});writeFileSync('artifacts/v013/captured-locomotion.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,sourceHashes:undefined,failures:failures.slice(0,2)}));if(!report.pass)process.exitCode=1;
