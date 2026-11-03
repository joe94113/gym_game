import {character,rig} from './dumbbell-test-helpers.mjs';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const cases=[['dumbbell-bench-press',{benchAngle:30}],['rope-pushdown',{handle:'straight-bar'}]],results=[];
for(const [id,settings]of cases){rig.end({keepVisible:false});rig.setEquipmentSettings(id,settings);rig.prepare(id);const result={id,settings,closedHandSamples:0,maxClosedWristBendRadians:0,minimumLoopPalmNormalY:Infinity,maximumLoopPalmNormalY:-Infinity};
 for(const mode of ['loop','enter','exit'])for(let i=0;i<=300;i++){
  const phase=i/300,frame=mode==='loop'?{pose:rig.sample(id,phase,phase),contacts:{hands:[true,true]}}:rig.sampleLifecycle(id,mode,phase);character.pose(frame.pose);const hands=character.getHandDiagnostics();
  for(let side=0;side<2;side++)if(frame.contacts.hands[side]){result.closedHandSamples++;if(hands[side].wristBendRadians>result.maxClosedWristBendRadians){result.maxClosedWristBendRadians=hands[side].wristBendRadians;result.worst={mode,phase,side};}if(mode==='loop'){result.minimumLoopPalmNormalY=Math.min(result.minimumLoopPalmNormalY,hands[side].palmNormal[1]);result.maximumLoopPalmNormalY=Math.max(result.maximumLoopPalmNormalY,hands[side].palmNormal[1]);}}
 }
 result.maxClosedWristBendDegrees=result.maxClosedWristBendRadians*180/Math.PI;results.push(result);
}
const legacyComparison=[];for(const benchAngle of [0,30]){rig.end({keepVisible:false});rig.setEquipmentSettings('dumbbell-bench-press',{benchAngle});rig.prepare('dumbbell-bench-press');const phase=.4766666666666667,frame=rig.sampleLifecycle('dumbbell-bench-press','enter',phase);character.pose(frame.pose);legacyComparison.push({benchAngle,phase,stage:frame.stage,poseSHA256:createHash('sha256').update(JSON.stringify(frame.pose)).digest('hex'),wristBendDegrees:character.getHandDiagnostics().map(hand=>hand.wristBendRadians*180/Math.PI)});}
const report={scope:'Actual production GLB hand frames while hands are declared held. Wrist bend is an animation alignment measure, not a clinical load/safety limit. Straight-bar loop palm-normal Y is measured to distinguish true overhand grip from an underhand label.',results,legacyComparison};writeFileSync('artifacts/v09-equipment-hand-frames.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));character.dispose();
