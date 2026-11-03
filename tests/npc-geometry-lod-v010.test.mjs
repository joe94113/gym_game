import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createNpcLodFixture,readNpcLodData} from '../scripts/npc-lod-fixture-v010.mjs';
import {decodeNpcLodData,loadNpcLodData,selectNpcGeometryLod} from '../src/npc-geometry-lod-v010.js';
import {createGymCrowd} from '../src/crowd.js';
import {createSocialCrowd} from '../src/social-crowd.js';
import {createEquipmentFixture} from '../scripts/equipment-batching-fixture.mjs';
import {createGroupClassSystem} from '../src/classes/group-class-system.js';
import {stations} from '../src/data.js';
import {buildLocomotionPose} from '../src/locomotion.js';

const data=readNpcLodData(),meshes=actor=>{const result=[];actor.group.traverse(mesh=>{if(mesh.isSkinnedMesh)result.push(mesh);});return result;};
const far={cameraPosition:[90,1.7,90],playerPosition:[90,0,90]},sha=array=>createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex');

test('derived binary is validated and failed loading leaves the full human available',async()=>{
  const manifest=data.manifest,binary=readFileSync(new URL('../public/models/athlete/lod-v010/indices.bin',import.meta.url)),buffer=binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength);
  const loaded=await loadNpcLodData({fetcher:async url=>url.endsWith('.json')?{ok:true,json:async()=>manifest}:{ok:true,arrayBuffer:async()=>buffer}});assert.equal(loaded.meshes.size,8);
  await assert.rejects(loadNpcLodData({fetcher:async()=>({ok:false,status:404})}));
  const damaged=buffer.slice(0);new Uint8Array(damaged)[0]^=1;
  await assert.rejects(loadNpcLodData({fetcher:async url=>url.endsWith('.json')?{ok:true,json:async()=>manifest}:{ok:true,arrayBuffer:async()=>damaged}}),/驗證失敗/);
  assert.throws(()=>decodeNpcLodData({...manifest,binaryBytes:2},buffer));
  const invalid=structuredClone(manifest);invalid.meshes[0].levels[0].offset=1;assert.throws(()=>decodeNpcLodData(invalid,buffer));
  const fixture=await createNpcLodFixture(),npc=fixture.instantiate({geometryLodAllowed:true});fixture.lodState.status='failed';assert.equal(npc.setGeometryLod(2),0);assert.equal(npc.getGeometryLodDiagnostics().triangles,56185);npc.dispose();
});

test('camera and player proximity use hysteresis and missing view data always keeps full geometry',()=>{
  const position={x:0,y:0,z:0},at=distance=>({position,cameraPosition:[distance,0,0],playerPosition:[distance,0,0]});
  assert.equal(selectNpcGeometryLod({...at(15),previousLevel:0}),0);assert.equal(selectNpcGeometryLod(at(17)),1);
  assert.equal(selectNpcGeometryLod({...at(14),previousLevel:1}),1);assert.equal(selectNpcGeometryLod({...at(12),previousLevel:1}),0);
  assert.equal(selectNpcGeometryLod({...at(27),previousLevel:1}),2);assert.equal(selectNpcGeometryLod({...at(23),previousLevel:2}),2);assert.equal(selectNpcGeometryLod({...at(21),previousLevel:2}),1);
  assert.equal(selectNpcGeometryLod({...at(40),cameraPosition:[5,0,0]}),0);assert.equal(selectNpcGeometryLod({...at(40),playerPosition:[5,0,0]}),0);
  assert.equal(selectNpcGeometryLod({position,playerPosition:[40,0,0]}),0);assert.equal(selectNpcGeometryLod({...at(40),forceFull:true}),0);
});

test('player never simplifies; all four appearance caches share exact attributes, weights, skeletons and muscle uniforms at both NPC levels',async()=>{
  const fixture=await createNpcLodFixture({data}),player=fixture.instantiate();assert.equal(player.setGeometryLod(2),0);
  const variants=[{}, {bodyProfile:'feminine'}, {age:65}, {bodyProfile:'feminine',age:65}];
  for(const appearance of variants){
    const actor=fixture.instantiate({geometryLodAllowed:true,appearance}),list=meshes(actor),full=list.map(mesh=>mesh.geometry),skeletons=list.map(mesh=>mesh.skeleton),materials=list.map(mesh=>mesh.material),attributes=full.map(g=>Object.fromEntries(Object.entries(g.attributes).map(([key,a])=>[key,sha(a.array)])));
    actor.pose(buildLocomotionPose(actor.getAssetInfo().metrics,.93,1));actor.setMuscleOverlayEnabled(true);actor.setMuscleHighlights(['chest'],['triceps']);
    const contacts=actor.getContactPoints(),bones=[];actor.group.traverse(b=>{if(b.isBone)bones.push([b,b.position.toArray(),b.quaternion.toArray()]);});
    const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};list[0].material.onBeforeCompile(shader);const uniforms=shader.uniforms;
    for(const level of [1,2,0]){
      assert.equal(actor.setGeometryLod(level),level);assert.deepEqual(actor.getContactPoints(),contacts);assert.equal(actor.getMuscleOverlayEnabled(),true);assert.deepEqual(actor.getMuscleHighlights(),{primary:['chest'],secondary:['triceps']});
      list.forEach((mesh,i)=>{assert.equal(mesh.skeleton,skeletons[i]);assert.equal(mesh.material,materials[i]);for(const[key,a]of Object.entries(mesh.geometry.attributes)){assert.equal(a,full[i].attributes[key]);assert.equal(sha(a.array),attributes[i][key]);}assert.equal(mesh.geometry.attributes.formMuscleA,full[i].attributes.formMuscleA);});
      for(const[b,p,q]of bones){assert.deepEqual(b.position.toArray(),p);assert.deepEqual(b.quaternion.toArray(),q);}
      const nextShader={uniforms:{},vertexShader:shader.vertexShader,fragmentShader:shader.fragmentShader};list[0].material.onBeforeCompile(nextShader);for(const key of Object.keys(uniforms))assert.equal(nextShader.uniforms[key],uniforms[key]);
      assert.equal(actor.getGeometryLodDiagnostics().triangles,[56185,42369,35847][level]);
    }
    actor.dispose();
  }
  player.dispose();assert.equal(fixture.resources.disposed,true);
});

test('late optional data applies to existing NPCs and a mismatched source fails closed as one whole character',async()=>{
  const fixture=await createNpcLodFixture(),npc=fixture.instantiate({geometryLodAllowed:true});assert.equal(npc.setGeometryLod(1),0);
  fixture.lodState.data=data;fixture.lodState.status='ready';assert.equal(npc.setGeometryLod(1),1);npc.dispose();
  const corrupt=await createNpcLodFixture({data});corrupt.sourceMeshes[0].geometry.attributes.position.array[0]+=.01;
  const other=corrupt.instantiate({geometryLodAllowed:true});assert.equal(other.setGeometryLod(2),0);assert.equal(other.getGeometryLodDiagnostics().reason,'source-mismatch');assert.equal(other.getGeometryLodDiagnostics().triangles,56185);other.dispose();
});

test('shared LOD wrappers are cached by appearance and never disposed until the last actor releases shared attribute buffers',async()=>{
  const fixture=await createNpcLodFixture({data}),player=fixture.instantiate(),a=player.createClone({appearance:{bodyProfile:'feminine'}}),b=player.createClone({appearance:{bodyProfile:'feminine'}});
  a.setGeometryLod(1);b.setGeometryLod(1);const ga=meshes(a),gb=meshes(b);ga.forEach((mesh,i)=>assert.equal(mesh.geometry,gb[i].geometry));
  let disposed=0;const all=[...fixture.resources.geometries];all.forEach(g=>g.addEventListener('dispose',()=>disposed++));a.dispose();a.dispose();assert.equal(disposed,0);player.dispose();assert.equal(disposed,0);
  b.pose(buildLocomotionPose(b.getAssetInfo().metrics,.4,.5));b.setGeometryLod(2);b.setGeometryLod(0);assert.equal(disposed,0);b.dispose();assert.equal(disposed,all.length);assert.equal(fixture.resources.instances,0);
});

test('distant exercising NPCs simplify, proximity restores full, handoff/return/walking remain full and the A/B switch restores all originals',async()=>{
  const fixture=await createNpcLodFixture({data}),player=fixture.instantiate(),equipment=await createEquipmentFixture(),crowd=createGymCrowd({THREE:fixture.THREE,scene:fixture.scene,character:player,machines:equipment.machines});
  crowd.setViewContext(far);assert.ok(crowd.getGeometryLodDiagnostics().levels[2]>0);const before=crowd.getGeometryLodDiagnostics();assert.ok(before.selectedTriangles<before.fullTriangles);
  crowd.setGeometryLodEnabled(false);assert.equal(crowd.getGeometryLodDiagnostics().selectedTriangles,before.fullTriangles);crowd.setGeometryLodEnabled(true);
  const bike=crowd.getDiagnostics().actors.find(a=>a.stationId==='bike');crowd.setViewContext({cameraPosition:bike.position,playerPosition:far.playerPosition});assert.equal(crowd.getDiagnostics().actors.find(a=>a.id===bike.id).geometryLod.level,0);
  crowd.setViewContext(far);assert.equal(crowd.requestHandoff('bike'),true);assert.equal(crowd.getDiagnostics().actors.find(a=>a.id===bike.id).geometryLod.level,0);
  const seen=new Set();for(let i=0;i<180;i++){crowd.update(.05,null,{quality:'clear'});crowd.setViewContext(far);const a=crowd.getDiagnostics().actors.find(a=>a.id===bike.id);seen.add(a.stage);if(a.stage!=='idle')assert.equal(a.geometryLod.level,0);if(a.stage==='idle')break;}
  assert.ok(seen.has('return'));assert.ok(seen.has('release'));assert.ok(seen.has('stand'));assert.ok(seen.has('walk'));assert.ok(seen.has('idle'));
  crowd.dispose();player.dispose();equipment.character.dispose();
});

test('all seven actual group class programs keep the instructor and every participant full while far stable desk staff may simplify',async()=>{
  const fixture=await createNpcLodFixture({data}),player=fixture.instantiate(),anchors={receptionist:{position:[0,0,0]},classInstructor:{position:[0,0,5]},classParticipants:[{position:[-2,0,7]},{position:[2,0,7]}]};
  const architecture={getSceneAnchors:()=>anchors,getCollisionVolumes:()=>[],getFacilityCollisionVolumes:()=>[],toggleDoor(){}},station=stations.find(s=>s.id==='group-class');
  const classes=createGroupClassSystem({THREE:fixture.THREE,scene:fixture.scene,metrics:player.getAssetInfo().metrics,architecture,station}),social=createSocialCrowd({THREE:fixture.THREE,scene:fixture.scene,character:player,anchors,groupClasses:classes});
  for(const id of ['group-class','class-dance','class-cycle','class-trx','class-barbell','class-aerial','class-pilates']){
    classes.prepare(id);classes.begin(id);classes.update(.05,{phase:.48,active:true});social.update(.05,{classPhase:.48});social.setViewContext(far);
    const diagnostic=social.getGeometryLodDiagnostics();assert.equal(diagnostic.actors.find(a=>a.id==='receptionist').level,2);
    for(const actor of diagnostic.actors.filter(a=>a.id.startsWith('class-'))){assert.equal(actor.level,0,id);assert.equal(actor.triangles,56185,id);}
  }
  social.setGeometryLodEnabled(false);assert.equal(social.getGeometryLodDiagnostics().selectedTriangles,social.getGeometryLodDiagnostics().fullTriangles);social.dispose();classes.dispose?.();player.dispose();
});
