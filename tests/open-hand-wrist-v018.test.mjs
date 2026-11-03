import test from 'node:test';
import assert from 'node:assert/strict';
import {character,rig} from '../scripts/dumbbell-test-helpers.mjs';

const phaseAt=(id,label,fraction)=>{const info=rig.getLifecycle(id);let elapsed=0;for(const stage of info.stages){if(stage.label===label)return(elapsed+stage.duration*fraction)/info.entryDuration;elapsed+=stage.duration;}throw Error('Missing stage '+label);};
const sample=(id,phase,direction='enter')=>{const frame=rig.sampleLifecycle(id,direction,phase);character.pose(frame.pose);return{frame,hands:character.getHandDiagnostics(),body:character.getContactPoints()};};
const degrees=hand=>hand.wristBendRadians*180/Math.PI;
test.after(()=>character.dispose());

test('open approach to the dumbbell rack does not force both palms onto a horizontal forearm frame',()=>{
 const id='dumbbell-shoulder-press';rig.prepare(id);const value=sample(id,phaseAt(id,'屈髖伸手',.98));
 assert.deepEqual(value.frame.contacts.hands,[false,false]);
 for(const hand of value.hands)assert.ok(degrees(hand)<20,'open approach wrist '+degrees(hand));
 assert.ok(value.body.maxReachError<.015);
});

test('inactive hand stays relaxed during single-arm-row carrying, then preserves the original flat bench support',()=>{
 const id='dumbbell-single-arm-row';rig.prepare(id);
 const carry=sample(id,phaseAt(id,'先在身側轉成自然垂握',.5));assert.equal(carry.frame.contacts.hands[0],false);assert.ok(degrees(carry.hands[0])<15);
 const ready=sample(id,1);assert.ok(ready.hands[0].palmNormal[1]<-.99);assert.ok(degrees(ready.hands[0])<75);assert.ok(Math.abs(ready.body.hands[0][1]-.65)<1e-5);
});

test('unheld wrist cleanup is symmetric for entry and return without moving palm or shoe targets',()=>{
 const id='dumbbell-shoulder-press';rig.prepare(id);const phase=phaseAt(id,'掌心對準握把',.1),enter=sample(id,phase),leave=sample(id,1-phase,'exit');
 for(const key of ['hands','feet'])for(let side=0;side<2;side++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(enter.body[key][side][axis]-leave.body[key][side][axis])<1e-7);
 for(let side=0;side<2;side++)assert.ok(Math.abs(degrees(enter.hands[side])-degrees(leave.hands[side]))<1e-5);
});
