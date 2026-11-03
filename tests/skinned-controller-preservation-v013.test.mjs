import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPreparationFixture} from '../scripts/preparation-fixture-v013.mjs';

// The new DB grip is entirely an adapter calibration. The shared GLB
// controller still applies an identical supplied pose to all 53 bones and
// every real vertex; the seven intentional hand poses are checked separately.
const {character,rig}=await createPreparationFixture();
after(()=>character.dispose());
function snapshot(actor,pose){
 actor.pose(pose);
 const bones=[];actor.group.traverse(object=>{if(object.isBone)bones.push({name:object.name,matrix:object.matrixWorld.toArray()});});
 bones.sort((a,b)=>a.name.localeCompare(b.name));
 return{bones,skin:actor.getSurfaceSamples({stride:1})};
}
const available=existsSync(resolve('.local-tools/v013-before/src/skinned-character.js'));
test('the GLB controller stays bit-exact with v0.12 for all 53 bones and every stride-1 skin vertex',{skip:available?false:'local v0.12 snapshot is not shipped'},async()=>{
 const original=await createPreparationFixture({before:true});
 try {
  for(const [id,phase]of[['dumbbell-bench-press',.5],['dumbbell-curl',.12],['dumbbell-lateral-raise',.68]]){
   const pose=rig.sample(id,phase,phase),current=snapshot(character,pose),before=snapshot(original.character,pose);
   assert.equal(current.bones.length,53);assert.ok(current.skin.length>10_000);
   assert.deepEqual(current.bones,before.bones,`${id}: exact bone transforms for identical pose`);
   assert.deepEqual(current.skin,before.skin,`${id}: exact actual skin for identical pose`);
  }
 }finally{original.character.dispose();}
});
