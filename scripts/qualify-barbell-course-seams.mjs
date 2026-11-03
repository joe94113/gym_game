import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createFloorProgram} from '../src/classes/floor-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';
import {coursePlanFor,courseTimelineAt} from '../src/classes/class-timeline.js';
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),''),metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));

const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics,results=[];
const program=createFloorProgram({THREE,kind:'barbell',metrics,group:new THREE.Group()}),plan=coursePlanFor('barbell');
const snapshot=seconds=>{const frame=courseTimelineAt('barbell',seconds),pose=program.sampleCourse(frame);character.pose(pose);return{motion:frame.motionId,mode:program.getPropState().gripMode,pose,body:character.getContactPoints(),skin:character.getSurfaceSamples({stride:1})};};
const inspect=(label,a,b,dt)=>{let maxJoint=0,maxSkin=0;for(const key of ['hands','feet','elbows','knees','shoulders','hips'])for(let side=0;side<2;side++)maxJoint=Math.max(maxJoint,Math.hypot(...a.body[key][side].map((v,j)=>v-b.body[key][side][j])));for(let i=0;i<a.skin.length;i++)maxSkin=Math.max(maxSkin,Math.hypot(...a.skin[i].position.map((v,j)=>v-b.skin[i].position[j])));const result={label,fromMotion:a.motion,toMotion:b.motion,fromGrip:a.mode,toGrip:b.mode,dt,maxJoint,maxSkin};results.push(result);console.log(JSON.stringify(result));};
for(const block of plan.blocks.slice(0,-1)){const t=block.endSeconds,epsilon=.0001;inspect(`block ${block.id} endpoint`,snapshot(t-epsilon),snapshot(t+epsilon),epsilon*2);}
for(const block of plan.blocks.filter(b=>b.motionId==='put-down-rest')){for(const local of [4.25,block.seconds-4.25])inspect(`grip transfer ${block.id}:${local}`,snapshot(block.startSeconds+local-.0001),snapshot(block.startSeconds+local+.0001),.0002);}
writeFileSync('artifacts/barbell-course-seam-qualification.json',JSON.stringify({fullSkinStride:1,results},null,2));if(results.some(r=>r.maxJoint>.001||r.maxSkin>.001))process.exitCode=1;

