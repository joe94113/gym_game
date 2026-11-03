import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createSkinnedCharacterFromModel as baselineCharacter} from '../.local-tools/v019-before-matrix/src/skinned-character.js';
import {createNpcLodFixture,readNpcLodData} from '../scripts/npc-lod-fixture-v010.mjs';
import {buildMovementPose} from '../src/locomotion.js';
import {createActivityRig} from '../src/extended-rig.js';

const proof={schema:1,baseline:'.local-tools/v019-before-matrix',gpu:false,poseSamples:0,surfaceVertices:0,renderLikePasses:0,cases:[],maxDifference:0};
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
after(()=>{
 const paths=['src/skinned-character.js','src/npc-world-matrices-v019.js','tests/npc-world-matrices-v019.test.mjs','.local-tools/v019-before-matrix/src/skinned-character.js','public/models/athlete/athlete.glb'];
 proof.sourceHashes=Object.fromEntries(paths.map(path=>[path,sha(path)]));proof.completedAt=new Date().toISOString();
 proof.pass=proof.cases.length===4;
 mkdirSync('artifacts/release-v019',{recursive:true});writeFileSync('artifacts/release-v019/npc-world-matrix-cache-qualification.json',JSON.stringify(proof,null,2)+'\n');
});
const meshes=actor=>{const values=[];actor.group.traverse(node=>{if(node.isSkinnedMesh)values.push(node);});return values;};
const model=actor=>actor.group.children[0];
const bones=actor=>{const values=[];actor.group.traverse(node=>{if(node.isBone)values.push(node);});return values;};
function equalArray(actual,expected,label){
 assert.equal(actual.length,expected.length,label+' length');
 for(let i=0;i<actual.length;i++){const difference=Math.abs(actual[i]-expected[i]);proof.maxDifference=Math.max(proof.maxDifference,difference);assert.equal(actual[i],expected[i],`${label}[${i}]`);}
}
function propagate(actor){actor.group.updateMatrixWorld(true);for(const skeleton of new Set(meshes(actor).map(mesh=>mesh.skeleton)))skeleton.update();proof.renderLikePasses++;}
function equalMatrices(actor,baseline,label){
 const aa=bones(actor),bb=bones(baseline);assert.equal(aa.length,bb.length);
 aa.forEach((bone,i)=>{assert.equal(bone.name,bb[i].name);equalArray(bone.matrixWorld.elements,bb[i].matrixWorld.elements,label+' bone '+bone.name);});
 const am=meshes(actor),bm=meshes(baseline);am.forEach((mesh,i)=>{equalArray(mesh.matrixWorld.elements,bm[i].matrixWorld.elements,label+' mesh '+i);equalArray(mesh.bindMatrixInverse.elements,bm[i].bindMatrixInverse.elements,label+' bindInverse '+i);equalArray(mesh.skeleton.boneMatrices,bm[i].skeleton.boneMatrices,label+' palette '+i);});
}
function equalDiagnostics(actor,baseline,label,{surfaceStride=127}={}){
 assert.deepEqual(actor.getContactPoints(),baseline.getContactPoints(),label+' palms/feet/body');
 assert.deepEqual(actor.getHandDiagnostics(),baseline.getHandDiagnostics(),label+' wrist/hand');
 const a=actor.getSurfaceSamples({stride:surfaceStride}),b=baseline.getSurfaceSamples({stride:surfaceStride});
 assert.deepEqual(a,b,label+' exact skinned surface');proof.surfaceVertices+=a.length;
 equalMatrices(actor,baseline,label);
}
async function pair(){
 const fixture=await createNpcLodFixture({data:readNpcLodData()}),actor=fixture.instantiate({geometryLodAllowed:true});
 const baseline=baselineCharacter({THREE,scene:fixture.scene,model:cloneSkeleton(fixture.gltf.scene),metadata:fixture.metadata,lodData:readNpcLodData(),geometryLodAllowed:true});
 for(const body of [actor,baseline]){body.setMuscleOverlayEnabled(false);body.setBackgroundMaterialMode(true);}
 return{fixture,actor,baseline,dispose(){actor.dispose();baseline.dispose();}};
}

test('managed background GLB cache exactly preserves 99 dense walking/running/idle poses, skin and GPU palettes',async()=>{
 const p=await pair(),{actor,baseline}=p;
 try{
  for(const [mode,run,moving]of [['idle',0,0],['walk',0,1],['run',1,1]])for(let i=0;i<=32;i++){
   const pose=buildMovementPose(actor.getAssetInfo().metrics,i/32*1.36,run,moving);
   actor.pose(pose);baseline.pose(pose);proof.poseSamples++;
   for(let frame=0;frame<4;frame++){propagate(actor);propagate(baseline);equalMatrices(actor,baseline,`${mode}/${i}/${frame}`);}
   equalDiagnostics(actor,baseline,`${mode}/${i}`,{surfaceStride:i===0?1:127});
  }
  const diagnostics=actor.getWorldMatrixCacheDiagnostics();assert.ok(diagnostics.skipped>=99*4);assert.equal(diagnostics.poseInProgress,false);assert.equal(diagnostics.eligible,true);
  proof.cases.push({name:'dense-pose-palette-surface',pass:true,samples:99,counters:diagnostics});
 }finally{p.dispose();}
});

test('parent translation/rotation/nonuniform scale, local matrices, pivots and reparenting invalidate the complete attached bind tree',async()=>{
 const p=await pair(),{fixture,actor,baseline}=p;
 try{
  const parents=[new THREE.Group(),new THREE.Group()];parents.forEach(parent=>fixture.scene.add(parent));parents[0].add(actor.group);parents[1].add(baseline.group);
  const actions=[
   ['parent-position',body=>body.group.parent.position.set(1.25,-.35,2.75)],
   ['parent-rotation',body=>body.group.parent.rotation.set(.17,-.7,.21)],
   ['parent-scale',body=>body.group.parent.scale.set(1.2,.91,.83)],
   ['group-position',body=>body.group.position.set(-2,.23,.57)],
   ['group-rotation',body=>body.group.rotation.y=.71],
   ['group-scale',body=>body.group.scale.set(.87,1.11,1.03)],
   ['model-local-position',body=>model(body).position.x+=.08],
   ['model-local-quaternion',body=>model(body).quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),.11)],
   ['model-local-scale',body=>model(body).scale.multiplyScalar(.94)],
   ['model-pivot',body=>model(body).pivot=new THREE.Vector3(.04,.03,-.02)],
   ['model-pivot-edit',body=>model(body).pivot.x+=.02],
   ['manual-local-matrix',body=>{const object=model(body);object.updateMatrix();object.matrixAutoUpdate=false;object.matrix.elements[12]+=.12;}],
   ['manual-local-matrix-edit',body=>model(body).matrix.elements[14]-=.14],
   ['local-auto-restored',body=>model(body).matrixAutoUpdate=true],
   ['manual-world-matrix',body=>{const object=model(body);object.matrixWorldAutoUpdate=false;object.matrixWorld.elements[12]+=.17;}],
   ['manual-world-matrix-edit',body=>model(body).matrixWorld.elements[14]-=.05],
   ['world-auto-restored',body=>model(body).matrixWorldAutoUpdate=true],
   ['reparent-identical-world',body=>{const parent=body.group.parent,next=new THREE.Group();next.copy(parent,false);fixture.scene.add(next);next.add(body.group);}],
  ];
  for(const[name,change]of actions){
   const before=actor.getWorldMatrixCacheDiagnostics();change(actor);change(baseline);fixture.scene.updateMatrixWorld(true);
   propagate(actor);propagate(baseline);equalMatrices(actor,baseline,name);equalDiagnostics(actor,baseline,name,{surfaceStride:name==='parent-scale'?1:83});
   assert.ok(actor.getWorldMatrixCacheDiagnostics().propagated>before.propagated,name+' forces propagation');
   const fresh=actor.getWorldMatrixCacheDiagnostics().skipped;propagate(actor);assert.ok(actor.getWorldMatrixCacheDiagnostics().skipped>fresh,name+' subsequent render skips');
  }
  proof.cases.push({name:'ancestor-local-transform-and-bind-inverse',pass:true,changes:actions.map(([name])=>name)});
 }finally{p.dispose();}
});

test('eight actual dumbbell entry/exit paths retain all closed/open hand poses and sampled skin during render skips',async()=>{
 const p=await pair(),{actor,baseline}=p,rig=createActivityRig({THREE,scene:new THREE.Scene(),characterMetrics:actor.getAssetInfo().metrics}),ids=['dumbbell-curl','dumbbell-bench-press','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-goblet-squat','dumbbell-romanian-deadlift'];let samples=0;
 try{
  for(const id of ids){rig.prepare(id);for(const direction of ['enter','exit'])for(const phase of [0,.17,.35,.5,.65,.83,1]){
   const frame=rig.sampleLifecycle(id,direction,phase);actor.pose(frame.pose);baseline.pose(frame.pose);proof.poseSamples++;samples++;
   for(const body of [actor,baseline]){body.group.position.fromArray(frame.offset);body.group.rotation.y=frame.rotation;}
   propagate(actor);propagate(baseline);propagate(actor);propagate(baseline);equalMatrices(actor,baseline,`${id}/${direction}/${phase}`);equalDiagnostics(actor,baseline,`${id}/${direction}/${phase}`,{surfaceStride:79});
  }rig.end();}
  proof.cases.push({name:'eight-dumbbell-enter-exit-grip',pass:true,samples,counters:actor.getWorldMatrixCacheDiagnostics()});
 }finally{rig.end();p.dispose();}
});

test('LOD, visibility, full-overlay toggles, explicit direct-bone invalidation and forced skin diagnostics remain independent',async()=>{
 const p=await pair(),{actor,baseline}=p;
 try{
  const secondary=p.fixture.instantiate(),original=model(actor).updateMatrixWorld;
  for(const level of [0,1,2,0]){
   actor.setGeometryLod(level);baseline.setGeometryLod(level);propagate(actor);propagate(baseline);equalDiagnostics(actor,baseline,'LOD '+level);
  }
  actor.group.visible=false;baseline.group.visible=false;const beforeHidden=actor.getWorldMatrixCacheDiagnostics().skipped;propagate(actor);propagate(baseline);assert.ok(actor.getWorldMatrixCacheDiagnostics().skipped>beforeHidden);equalMatrices(actor,baseline,'hidden');
  for(const enabled of [true,false,true,false]){
   actor.setMuscleOverlayEnabled(enabled);baseline.setMuscleOverlayEnabled(enabled);const before=actor.getWorldMatrixCacheDiagnostics();propagate(actor);propagate(baseline);equalDiagnostics(actor,baseline,'overlay '+enabled);const after=actor.getWorldMatrixCacheDiagnostics();assert.equal(after.eligible,!enabled);assert.ok(after.propagated>before.propagated);assert.equal(actor.getMuscleOverlayEnabled(),enabled);
  }
  for(const enabled of [false,true]){actor.setBackgroundMaterialMode(enabled);baseline.setBackgroundMaterialMode(enabled);propagate(actor);propagate(baseline);equalMatrices(actor,baseline,'background '+enabled);assert.equal(actor.getWorldMatrixCacheDiagnostics().eligible,enabled);}
  // Managed producers use pose(). Future direct bone edits must invalidate;
  // public diagnostic skin/hand reads force traversal even without that call.
  bones(actor)[5].rotation.z+=.08;bones(baseline)[5].rotation.z+=.08;actor.invalidateWorldMatrices();propagate(actor);propagate(baseline);equalMatrices(actor,baseline,'direct bone explicit invalidation');
  bones(actor)[8].rotation.x-=.07;bones(baseline)[8].rotation.x-=.07;equalDiagnostics(actor,baseline,'direct bone forced public diagnostics',{surfaceStride:1});
  const current=actor.getWorldMatrixCacheDiagnostics(),untouched=secondary.getWorldMatrixCacheDiagnostics();propagate(actor);propagate(actor);assert.ok(actor.getWorldMatrixCacheDiagnostics().skipped>current.skipped);assert.deepEqual(secondary.getWorldMatrixCacheDiagnostics(),untouched,'another actor owns its own cache');
  assert.equal(secondary.getWorldMatrixCacheDiagnostics().eligible,false);propagate(secondary);propagate(secondary);assert.equal(secondary.getWorldMatrixCacheDiagnostics().skipped,0,'player/class full mode never skips');
  actor.setWorldMatrixCacheEnabled(false);const disabled=actor.getWorldMatrixCacheDiagnostics().skipped;propagate(actor);propagate(actor);assert.equal(actor.getWorldMatrixCacheDiagnostics().skipped,disabled);equalMatrices(actor,baseline,'debug disabled');actor.setWorldMatrixCacheEnabled(true);propagate(actor);propagate(actor);assert.ok(actor.getWorldMatrixCacheDiagnostics().skipped>disabled);
  secondary.dispose();actor.dispose();assert.notEqual(model(actor).updateMatrixWorld,original,'dispose restores original method');assert.equal(actor.getWorldMatrixCacheDiagnostics().disposed,true);actor.dispose();
  proof.cases.push({name:'lod-mode-visibility-diagnostics-independence-disposal',pass:true,counters:actor.getWorldMatrixCacheDiagnostics()});
 }finally{p.dispose();}
});
