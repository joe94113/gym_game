import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createFloorProgram} from '../src/classes/floor-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';
import {createHash} from 'node:crypto';
import {buildLocomotionPose,buildRunningPose,buildMovementPose} from '../src/locomotion.js';
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),''),metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));


const sourcePaths=['src/locomotion.js','src/skinned-character.js','src/collision-validation.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json'],hashes=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const actor=createSkinnedCharacterFromModel({THREE,scene:new THREE.Scene(),model:gltf.scene,metadata}),metrics=actor.getAssetInfo().metrics;
const phases=121,strideSeconds=.68,limits={maxReach:.015,maxBoneDeviation:.000001,minShoeFloor:-.001,maxStanceFloorGap:.006,maxWristBend:1.0,c0Boundary:.0005},records=[];let referenceLengths=null;
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
function testPose(record,pose,time,runAmount,movementAmount,fullRun){
 actor.pose(pose);const body=actor.getContactPoints(),self=evaluateSelfClearance(body),hands=actor.getHandDiagnostics();
 record.poses++;record.maxReach=Math.max(record.maxReach,body.maxReachError);
 hands.forEach((h,side)=>{if(h.wristBendRadians>record.maxWristBend){record.maxWristBend=h.wristBendRadians;record.worstWrist={side,time,runAmount,movementAmount,radians:h.wristBendRadians};}});
 for(const part of ['hands','feet'])for(let side=0;side<2;side++){const error=dist(body[part][side],pose[part][side]);if(error>record.maxTargetError[part][side]){record.maxTargetError[part][side]=error;record.worstTarget[part][side]={time,runAmount,movementAmount,error};}}
 if(body.maxReachError===record.maxReach)record.worstReach={time,runAmount,movementAmount};
 actor.group.traverse(o=>{if(o.isBone&&o.matrixWorld.elements.some(x=>!Number.isFinite(x)))record.nonFiniteBones.push({name:o.name,time});});
 const lengths=[...body.shoulders.map((p,i)=>dist(p,body.elbows[i])),...body.elbows.map((p,i)=>dist(p,body.wrists[i])),...body.hips.map((p,i)=>dist(p,body.knees[i])),...body.knees.map((p,i)=>dist(p,body.ankles[i]))];
 if(!referenceLengths)referenceLengths=lengths;lengths.forEach((v,i)=>record.maxBoneDeviation=Math.max(record.maxBoneDeviation,Math.abs(v-referenceLengths[i])));
 for(const c of self.collisions){const old=record.self.find(v=>v.bodyPart===c.bodyPart&&v.otherBodyPart===c.otherBodyPart);if(!old)record.self.push({...c,time,runAmount,movementAmount});else if(c.depth>old.depth)Object.assign(old,{...c,time,runAmount,movementAmount});}
 const skin=actor.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),min=[Infinity,Infinity];record.shoeVertexSamples+=skin.length;
 for(const s of skin){const i=s.part==='leftFoot'?0:1;min[i]=Math.min(min[i],s.position[1]);if(s.position.some(v=>!Number.isFinite(v)))record.nonFiniteSkin++;}
 if(!skin.length)throw new Error('No true shoe/foot skin samples');
 const lowest=Math.min(...min);if(lowest<record.minShoeFloor){record.minShoeFloor=lowest;record.worstFloor={time,runAmount,movementAmount,min};}
 if(fullRun){
  if(min.every(y=>y>.04))record.flightFrames++;
  for(let i=0;i<2;i++){const u=((time/.68+i*.5)%1+1)%1;if(u<=.24){record.stanceSamples++;record.maxStanceFloorGap=Math.max(record.maxStanceFloorGap,min[i]);}}
 }
 return body;
}
function record(name){return{name,poses:0,maxReach:0,maxBoneDeviation:0,maxWristBend:0,maxTargetError:{hands:[0,0],feet:[0,0]},worstTarget:{hands:[null,null],feet:[null,null]},minShoeFloor:Infinity,maxStanceFloorGap:0,stanceSamples:0,flightFrames:0,shoeVertexSamples:0,nonFiniteBones:[],nonFiniteSkin:0,self:[]};}
const r=record('walk-run-movement blends');
for(const runAmount of [0,.25,.5,.75,1])for(const movementAmount of [0,.25,.5,.75,1])for(let i=0;i<phases;i++){const time=i/(phases-1)*strideSeconds;testPose(r,buildMovementPose(metrics,time,runAmount,movementAmount),time,runAmount,movementAmount,runAmount===1&&movementAmount===1);}
records.push(r);
const full=record('direct complete running stride');let start,end;
for(let i=0;i<phases;i++){const time=i/(phases-1)*strideSeconds,b=testPose(full,buildRunningPose(metrics,time),time,1,1,true);if(i===0)start=b;if(i===phases-1)end=b;}
full.strideBoundaryDelta=Math.max(...['hands','feet','shoulders','elbows','wrists','hips','knees','ankles'].flatMap(k=>start[k].map((p,i)=>dist(p,end[k][i]))));records.push(full);
const flags=[];for(const r of records){for(const key of ['maxReach','maxBoneDeviation','maxStanceFloorGap','maxWristBend'])if(r[key]>limits[key])flags.push({name:r.name,key,value:r[key],limit:limits[key]});if(r.minShoeFloor<limits.minShoeFloor)flags.push({name:r.name,key:'minShoeFloor',value:r.minShoeFloor,limit:limits.minShoeFloor});if(r.self.length||r.nonFiniteBones.length||r.nonFiniteSkin)flags.push({name:r.name,key:'finite/self',self:r.self,nonFiniteBones:r.nonFiniteBones,nonFiniteSkin:r.nonFiniteSkin});}
if(full.strideBoundaryDelta>limits.c0Boundary)flags.push({key:'stride boundary',value:full.strideBoundaryDelta});if(full.flightFrames===0)flags.push({key:'distinct running flight missing'});
const report={pass:!flags.length,scope:'True production GLB. Five run blends and five movement blends over a complete 0.68s stride, plus direct running gait; exact bone lengths, all tagged shoe vertices, actual palm/sole contacts and existing self-proxy pairs. No GPU, not a human motion-capture or coaching review.',sourceHashes:hashes,changedSources:sourcePaths.filter(p=>createHash('sha256').update(readFileSync(p)).digest('hex')!==hashes[p]),limits,phases,strideSeconds,records,flags};
if(report.changedSources.length)report.pass=false;mkdirSync('artifacts/performance',{recursive:true});writeFileSync('artifacts/performance/running-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));actor.dispose();if(!report.pass)process.exitCode=1;
