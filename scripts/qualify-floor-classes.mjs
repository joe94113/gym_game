import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createFloorProgram} from '../src/classes/floor-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from '../src/collision-validation.js';
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),''),metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));

const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics,results=[];
for(const kind of ['dance','barbell','pilates']){
 const group=new THREE.Group();scene.add(group);const program=createFloorProgram({THREE,kind,metrics,group}),result={kind,maxReach:0,maxGearContact:0,minSurfaceY:Infinity,collisions:[],self:[],skin:[],worstReach:null};
 for(const mode of ['loop','enter','exit'])for(let i=0;i<=100;i++){
  const u=i/100,frame=mode==='loop'?{pose:program.sample(u),offset:[0,0,0],rotation:0}:program.sampleLifecycle(mode,u);character.pose(frame.pose);const local=character.getContactPoints(),body=transformBody(local,frame),volumes=program.getCollisionVolumes();
  if(local.maxReachError>result.maxReach){result.maxReach=local.maxReachError;result.worstReach={mode,u,pose:frame.pose};}
  const actual=program.getActualContacts();for(const side of [0,1])if(kind==='barbell'&&(mode==='loop'||frame.contacts?.hands[side]))result.maxGearContact=Math.max(result.maxGearContact,Math.hypot(...body.hands[side].map((v,i)=>v-actual.hands[side][i])));
  const record=(key,items)=>{for(const hit of items)if(!result[key].some(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId&&h.mode===mode))result[key].push({...hit,mode,u});};
  record('collisions',evaluateExerciseClearance(body,volumes).collisions);record('self',evaluateSelfClearance(local).collisions);
  if(i%1===0){const samples=transformSurface(character.getSurfaceSamples({stride:20}),frame);result.minSurfaceY=Math.min(result.minSurfaceY,...samples.map(p=>p.position[1]));result.skinPairs=(result.skinPairs||0)+samples.length*volumes.length;record('skin',evaluateSurfaceClearance(samples,volumes).collisions);}
 }
 result.propJumps=[];const meta=program.getMetadata();let seconds=0;for(const stage of meta.stages){seconds+=stage.duration;if(seconds>=meta.entryDuration-.000001)continue;const u=seconds/meta.entryDuration;program.sampleLifecycle('enter',u-.000001);const a=program.getPropState();program.sampleLifecycle('enter',u+.000001);const b=program.getPropState();if(a.barPosition&&b.barPosition){const jump=Math.hypot(...a.barPosition.map((v,i)=>v-b.barPosition[i]));if(jump>.003)result.propJumps.push({stage:stage.label,jump});}}
 results.push(result);console.log(JSON.stringify({...result,worstReach:undefined}));
}
writeFileSync('artifacts/floor-class-qualification.json',JSON.stringify({results},null,2));
if(results.some(r=>r.maxReach>.015||r.maxGearContact>.015||r.collisions.length||r.self.length||r.skin.length||r.propJumps.length||r.minSurfaceY<-.008))process.exitCode=1;
