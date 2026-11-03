import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createFloorProgram} from '../src/classes/floor-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';
import {createHash} from 'node:crypto';
import {buildLocomotionPose} from '../src/locomotion.js';
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),''),metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));


const actor=createSkinnedCharacterFromModel({THREE,scene:new THREE.Scene(),model:gltf.scene,metadata});
const metrics=actor.getAssetInfo().metrics,bar=createFloorProgram({THREE,kind:'barbell',metrics,group:new THREE.Group()}),mat=createFloorProgram({THREE,kind:'pilates',metrics,group:new THREE.Group()});
const baselinePose=buildLocomotionPose(metrics,0,0),poses=[baselinePose,...[.1,.4,.9,1.3,2.6].map(t=>buildLocomotionPose(metrics,t,1)),bar.sample(0),bar.sample(.5),mat.sample(0),mat.sample(.5),{...structuredClone(baselinePose),handFingerFlex:[{thumb:[.1,.8,.4],index:[.2,.5,.8]},{middle:[.7,.4,.6]}],handThumbOpposition:[.9,.2]}];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function snapshot(character,p){character.pose(p);const bones={};character.group.traverse(o=>{if(o.isBone)bones[o.name]=[...o.matrixWorld.elements];});return{bones:hash(bones),contacts:hash(character.getContactPoints()),skin:hash(character.getSurfaceSamples({stride:1}))};}
const signatures=poses.map(p=>snapshot(actor,p)),meshes=[];actor.group.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
const sourceText=readFileSync(new URL('../src/skinned-character.js',import.meta.url),'utf8');
const originalText=sourceText.replace(/^  const uniqueSkeletons=\[\.\.\.new Set\(meshList\.map\(mesh=>mesh\.skeleton\)\)\];\r?\n/m,'').replace(/for\(const skeleton of uniqueSkeletons\)skeleton\.update\(\);/g,'for(const mesh of meshList)mesh.skeleton.update();');
const sourceForImport=originalText.replace(/from '([^']+)'/g,(_,specifier)=>`from '${import.meta.resolve(specifier)}'`);
const prior=await import(`data:text/javascript;base64,${Buffer.from(sourceForImport).toString('base64')}`),priorGltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),''),before=prior.createSkinnedCharacterFromModel({THREE,scene:new THREE.Scene(),model:priorGltf.scene,metadata});
const previous=poses.map(p=>snapshot(before,p));
for(let i=0;i<400;i++){actor.pose(poses[i%poses.length]);before.pose(poses[i%poses.length]);}
const time=(a,n)=>{const t=performance.now();for(let i=0;i<n;i++)a.pose(poses[i%poses.length]);return(performance.now()-t)/n;};
const timings=[];for(let i=0;i<12;i++){if(i%2){const afterMs=time(actor,750),beforeMs=time(before,750);timings.push({beforeMs,afterMs});}else{const beforeMs=time(before,750),afterMs=time(actor,750);timings.push({beforeMs,afterMs});}}
const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
const report={pass:JSON.stringify(signatures)===JSON.stringify(previous),meshCount:meshes.length,uniqueSkeletons:new Set(meshes.map(m=>m.skeleton)).size,cases:poses.length,fullSkinStride:1,caseHashes:signatures,previousCaseHashes:previous,sourceHash:createHash('sha256').update(sourceText).digest('hex'),beforeReconstructedHash:createHash('sha256').update(originalText).digest('hex'),timings,beforeMedianMs:median(timings.map(t=>t.beforeMs)),afterMedianMs:median(timings.map(t=>t.afterMs)),scope:'Actual GLB, identical input poses including default walk, grounded/lying classes, finger-flex and thumb-opposition overrides. Interleaved Node CPU pose benchmark, not GPU or user-device FPS.'};
mkdirSync('artifacts/performance',{recursive:true});writeFileSync('artifacts/performance/character-skeleton-dedup.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,caseHashes:undefined,previousCaseHashes:undefined}));if(!report.pass)process.exitCode=1;
