import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createActivityRig} from '../src/extended-rig.js';
import {extendedExercises} from '../src/extended-exercises.js';
import {exercises as baseExercises} from '../src/exercises.js';
import {createHash} from 'node:crypto';
const exercises=[...baseExercises,...extendedExercises].filter(e=>e.stationId!=='dumbbell-curl');
const sourcePaths=['src/rig-lifecycle.js','src/extended-rig.js','src/exercise-rig.js','src/dumbbell-grip.js','src/dumbbell-lifecycle-paths.js','src/skinned-character.js','src/hand-contact-frame.js','src/locomotion.js','src/exercises.js','src/extended-exercises.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json'],sourceHash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,sourceHash(p)]));
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';

// Numerical qualification uses the production model geometry, skin weights and
// controller. Only texture loading is omitted in memory because Node has no DOM.
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){
  material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};
  delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;
}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));
if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]);
const gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const scene=new THREE.Scene(),geometries=new Set(),extraMaterials=new Set(),textures=new Set();
const character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata,geometries,extraMaterials,textures});
const metrics=character.getAssetInfo().metrics;
const rig=createActivityRig({THREE,scene,geometries,extraMaterials,textures,characterMetrics:metrics});
const phaseCount=Number(process.env.FORM_PHASE_COUNT||101),results=[];
for(const exercise of exercises){
  rig.prepare(exercise.id);
  const result={id:exercise.id,maxContactError:0,maxReachError:0,maxPenetration:0,contacts:{hands:0,feet:0},collisions:[],surfaceCollisions:[],selfCollisions:[],samples:[]};
  for(let step=0;step<phaseCount;step++){
    const phase=step/(phaseCount-1),pose=rig.sample(exercise.id,phase,phase);character.pose(pose);
    const body=character.getContactPoints(),targets=rig.getActualContacts(exercise.id),volumes=rig.getCollisionVolumes(exercise.id);
    let contactError=0;
    for(const kind of ['hands','feet'])for(let side=0;side<2;side++){const error=Math.hypot(...targets[kind][side].map((value,index)=>value-body[kind][side][index]));contactError=Math.max(contactError,error);result.contacts[kind]=Math.max(result.contacts[kind],error);}
    const collision=evaluateExerciseClearance(body,volumes);
    const self=evaluateSelfClearance(body);
    result.maxContactError=Math.max(result.maxContactError,contactError);result.maxReachError=Math.max(result.maxReachError,body.maxReachError);result.maxPenetration=Math.max(result.maxPenetration,collision.maxPenetration);
    for(const item of collision.collisions)if(!result.collisions.some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId))result.collisions.push({...item,phase});
    for(const item of self.collisions)if(!result.selfCollisions.some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId))result.selfCollisions.push({...item,phase});
    result.samples.push({phase,contactError,reachError:body.maxReachError,maxPenetration:collision.maxPenetration});
    if(process.env.FORM_SURFACE==='1' && character.getSurfaceSamples){
      const surface=character.getSurfaceSamples({stride:Number(process.env.FORM_SURFACE_STRIDE||24)});
      if(!surface.length)throw new Error(`No surface samples for ${exercise.id}`);
      const clearance=evaluateSurfaceClearance(surface,volumes);
      result.surfaceSampleCount=Math.max(result.surfaceSampleCount||0,surface.length);
      result.surfaceTestedPairs=(result.surfaceTestedPairs||0)+clearance.testedPairs;
      for(const item of clearance.collisions)if(!result.surfaceCollisions.some(old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId))result.surfaceCollisions.push({...item,phase});
    }
  }
  results.push(result);
}
mkdirSync(new URL('../artifacts',import.meta.url),{recursive:true});
const changedSources=sourcePaths.filter(p=>sourceHash(p)!==sourceHashes[p]);
const pass=!changedSources.length&&!results.some(result=>!Number.isFinite(result.maxContactError)||result.maxContactError>.015||result.maxReachError>.015||result.collisions.length||result.surfaceCollisions.length||result.selfCollisions.length);
const report={pass,scope:'Fourteen non-dumbbell cable and turf exercises using the production full activity-rig facade: 101 loop phases, actual GLB bones, body/self proxies and skin stride24 every phase. No professional coaching sign-off.',sourceHashes,changedSources,phaseCount,surfaceStride:Number(process.env.FORM_SURFACE_STRIDE||24),surfaceEnabled:process.env.FORM_SURFACE==='1',metrics,results};
writeFileSync(new URL('../artifacts/nondumbbell-loop-regression-v08.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass,phaseCount,changedSources,results:results.map(({samples,...result})=>result)},null,2));
if(!pass||results.some(result=>!Number.isFinite(result.maxContactError)||result.maxContactError>.015||result.maxReachError>.015||result.collisions.length||result.surfaceCollisions.length||result.selfCollisions.length))process.exitCode=1;
character.dispose();
