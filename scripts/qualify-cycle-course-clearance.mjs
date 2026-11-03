import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {createMachineLifecycle} from '../src/machine-lifecycle.js';
import {stations} from '../src/data.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';

const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
const remainder=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics;
globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
const materials={};for(const key of ['graphite','steel','chrome','black','accent'])materials[key]=new THREE.MeshStandardMaterial();

const group=new THREE.Group();scene.add(group);const program=createEquipmentProgram({kind:'cycle',metrics,group,materials,geometries:new Set(),extraMaterials:new Set()}),phaseCount=Number(process.env.FORM_PHASE_COUNT||1001),results=[];
if(process.env.FORM_MATCH_NPC==='1'){
  const hit=JSON.parse(readFileSync('artifacts/cycle-npc-clearance-before.json')).results[0].actorResults[0].strictShoe[0],point=(frame)=>new THREE.Vector3(...frame.pose.feet[1]).applyAxisAngle(new THREE.Vector3(0,1,0),frame.rotation||0).add(new THREE.Vector3(...frame.offset)),target=point(hit.frame);let low=3.95/6.7,high=4.6/6.7;
  for(let i=0;i<50;i++){const mid=(low+high)/2,p=point(program.sampleLifecycle('exit',mid));if(p.x>target.x)low=mid;else high=mid;}
  const u=(low+high)/2,frame=program.sampleLifecycle('exit',u),volume=program.getCollisionVolumes().find(v=>v.id===hit.volumeId),out={u,target:target.toArray(),rawTarget:point(frame).toArray(),frame,npcFrame:hit.frame,volume};
  character.pose(frame.pose);out.rawShoe=evaluateSurfaceClearance(transformSurface(character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),frame),[{...volume,allowedBodyParts:[]}]).collisions;
  character.pose(hit.frame.pose);out.npcShoe=evaluateSurfaceClearance(transformSurface(character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),hit.frame),[{...hit.volume,allowedBodyParts:[]}]).collisions;
  writeFileSync('artifacts/cycle-course-crossing-inspection.json',JSON.stringify(out,null,2));console.log(JSON.stringify({u,target:out.target,rawTarget:out.rawTarget,rawHits:out.rawShoe.length,npcHits:out.npcShoe.length,maxRaw:Math.max(0,...out.rawShoe.map(h=>h.depth)),maxNPC:Math.max(0,...out.npcShoe.map(h=>h.depth))}));process.exit();
}
for(const mode of ['enter','exit']){
  const observed=.6335034013605425,phases=[...new Set([...Array.from({length:phaseCount},(_,i)=>i/(phaseCount-1)),...[-.0002,-.0001,-.00005,0,.00005,.0001,.0002].map(d=>mode==='exit'?observed+d:1-observed+d)])].sort((a,b)=>a-b);
  const r={mode,phaseCount,sampleCount:phases.length,maxReachError:0,maxGripError:0,maxJointStep:0,proxy:[],self:[],skin:[],strictShoe:[],surfacePairs:0,shoePairs:0};let previous=null;
  for(const u of phases){
    const frame=program.sampleLifecycle(mode,u);character.pose(frame.pose);const local=character.getContactPoints(),body=transformBody(local,frame),volumes=program.getCollisionVolumes(),targets=program.getActualContacts();r.maxReachError=Math.max(r.maxReachError,local.maxReachError);
    for(let side=0;side<2;side++)if(frame.contacts?.hands[side])r.maxGripError=Math.max(r.maxGripError,Math.hypot(...body.hands[side].map((v,j)=>v-targets.hands[side][j])));
    if(previous)for(const key of ['hands','feet','knees','elbows','hips'])for(let side=0;side<2;side++)r.maxJointStep=Math.max(r.maxJointStep,Math.hypot(...body[key][side].map((v,j)=>v-previous[key][side][j])));previous=body;
    const record=(key,hits)=>{for(const hit of hits){const old=r[key].find(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId);if(!old)r[key].push({...hit,u,frame,volume:volumes.find(v=>v.id===hit.volumeId)});else if(hit.depth>old.depth)Object.assign(old,hit,{u,frame,volume:volumes.find(v=>v.id===hit.volumeId)});}};
    record('proxy',evaluateExerciseClearance(body,volumes).collisions);record('self',evaluateSelfClearance(local).collisions);
    const skin=evaluateSurfaceClearance(transformSurface(character.getSurfaceSamples({stride:20}),frame),volumes);r.surfacePairs+=skin.testedPairs;record('skin',skin.collisions);
    const shoes=evaluateSurfaceClearance(transformSurface(character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),frame),volumes.map(v=>({...v,allowedBodyParts:(v.allowedBodyParts||[]).filter(p=>p!=='leftFoot'&&p!=='rightFoot')})));r.shoePairs+=shoes.testedPairs;record('strictShoe',shoes.collisions);
  }
  results.push(r);console.log(JSON.stringify({mode,maxReach:r.maxReachError,maxJointStep:r.maxJointStep,strictShoe:r.strictShoe.map(h=>({part:h.bodyPart,volume:h.volumeId,u:h.u,depth:h.depth,stage:h.frame.stage,contacts:h.frame.contacts,volumeShape:h.volume})),proxy:r.proxy.length,self:r.self.length,skin:r.skin.length}));
}
const pass=results.every(r=>r.maxReachError<.001&&r.maxGripError<.015&&!r.proxy.length&&!r.self.length&&!r.skin.length&&!r.strictShoe.length);writeFileSync(`artifacts/${process.env.FORM_REPORT_NAME||'cycle-course-clearance.json'}`,JSON.stringify({pass,results},null,2));if(!pass)process.exitCode=1;


