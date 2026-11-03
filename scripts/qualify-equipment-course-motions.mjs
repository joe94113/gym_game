import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {solveHandContactFrame} from '../src/hand-contact-frame.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';

// Load the production human rig and skin without requesting a GPU or textures.
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
const remainder=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url))),scene=new THREE.Scene();
const character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics;
globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
const materials={};for(const key of ['graphite','steel','chrome','black','accent'])materials[key]=new THREE.MeshStandardMaterial();
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),results=[],phaseCount=101,weights=[0,.25,.5,.75,1];
for(const kind of ['cycle','trx','aerial']){
  const group=new THREE.Group();scene.add(group);const program=createEquipmentProgram({kind,metrics,group,materials,geometries:new Set(),extraMaterials:new Set()}),ready=program.sample(0,0);
  for(const motionId of program.getCourseMotionIds()){
    const r={kind,motionId,sampleCount:0,maxTargetError:0,maxReachError:0,maxGripError:0,maxGripAxisError:0,maxBoneDeviation:0,maxReadyBoundaryError:0,maxStrapLengthError:0,minShoeFloorGap:null,proxyCollisions:[],selfCollisions:[],surfaceCollisions:[],strictShoeCollisions:[],surfacePairs:0,strictShoePairs:0};let boneLengths=null;
    const record=(field,hits,phase,envelope)=>{for(const hit of hits)if(!r[field].some(old=>old.bodyPart===hit.bodyPart&&old.volumeId===hit.volumeId&&old.otherBodyPart===hit.otherBodyPart))r[field].push({...hit,phase,envelope});};
    for(const envelope of weights)for(let i=0;i<phaseCount;i++){
      const phase=i/(phaseCount-1),frame={motionId,repPhase:phase,cycleTurns:phase,phase,envelope,intensity:1},pose=program.sampleCourse(frame);character.pose(pose);const body=character.getContactPoints(),volumes=program.getCollisionVolumes(),actual=program.getActualContacts(),axes=program.getActualGripAxes();r.sampleCount++;
      r.maxReachError=Math.max(r.maxReachError,body.maxReachError);
      for(const key of ['hands','feet'])for(let side=0;side<2;side++)r.maxTargetError=Math.max(r.maxTargetError,distance(body[key][side],pose[key][side]));
      for(let side=0;side<2;side++){r.maxGripError=Math.max(r.maxGripError,distance(body.hands[side],actual.hands[side]));const expected=solveHandContactFrame(metrics,pose,side);r.maxGripAxisError=Math.max(r.maxGripAxisError,1-Math.abs(new THREE.Vector3(...expected.axis).dot(new THREE.Vector3(...axes[side]))));if(kind==='trx')r.maxStrapLengthError=Math.max(r.maxStrapLengthError,Math.abs(distance(program.getHardGripCylinders()[side].center,[(side?1:-1)*.25,2.65,1.35])-1.82));}
      const lengths=[...body.shoulders.map((v,j)=>distance(v,body.elbows[j])),...body.elbows.map((v,j)=>distance(v,body.wrists[j])),...body.hips.map((v,j)=>distance(v,body.knees[j])),...body.knees.map((v,j)=>distance(v,body.ankles[j]))];if(!boneLengths)boneLengths=lengths;for(let j=0;j<lengths.length;j++)r.maxBoneDeviation=Math.max(r.maxBoneDeviation,Math.abs(lengths[j]-boneLengths[j]));
      if(envelope===0&&kind!=='cycle')for(const key of ['hip','shoulder','head','hands','feet']){if(Array.isArray(pose[key][0]))for(let side=0;side<2;side++)r.maxReadyBoundaryError=Math.max(r.maxReadyBoundaryError,distance(pose[key][side],ready[key][side]));else r.maxReadyBoundaryError=Math.max(r.maxReadyBoundaryError,distance(pose[key],ready[key]));}
      record('proxyCollisions',evaluateExerciseClearance(body,volumes).collisions,phase,envelope);record('selfCollisions',evaluateSelfClearance(body).collisions,phase,envelope);
      const skin=evaluateSurfaceClearance(character.getSurfaceSamples({stride:20}),volumes);r.surfacePairs+=skin.testedPairs;record('surfaceCollisions',skin.collisions,phase,envelope);
      const shoes=character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),strictVolumes=volumes.map(v=>({...v,allowedBodyParts:(v.allowedBodyParts||[]).filter(p=>p!=='leftFoot'&&p!=='rightFoot')})),strict=evaluateSurfaceClearance(shoes,strictVolumes);r.strictShoePairs+=strict.testedPairs;record('strictShoeCollisions',strict.collisions,phase,envelope);
      if(kind!=='cycle')r.minShoeFloorGap=Math.min(r.minShoeFloorGap??Infinity,...shoes.map(v=>v.position[1]));
    }
    results.push(r);console.log(JSON.stringify(r));
  }
}
const pass=results.every(r=>r.maxTargetError<.001&&r.maxReachError<.001&&r.maxGripError<.001&&r.maxGripAxisError<.0001&&r.maxBoneDeviation<.00001&&r.maxReadyBoundaryError<.000001&&r.maxStrapLengthError<.000001&&(r.minShoeFloorGap===null||r.minShoeFloorGap>=-.004)&&!r.proxyCollisions.length&&!r.selfCollisions.length&&!r.surfaceCollisions.length&&!r.strictShoeCollisions.length);
writeFileSync(new URL('../artifacts/equipment-course-motion-qualification.json',import.meta.url),JSON.stringify({phaseCount,weights,surfaceStride:20,shoeStride:1,pass,results},null,2));if(!pass)process.exitCode=1;
