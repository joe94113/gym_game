import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentSystem} from '../src/equipment.js';
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
const types=new Set(['chestPress','latPulldown','seatedRow','legPress','legExtension','shoulderPress','cableFly','squat','benchPress','dumbbellCurl','treadmill','bike','plateInclinePress','plateHighRow','plateShoulderPress','hackSquat','hipThrust','calfRaise','smithSquat','legCurl','pecDeck','lateralRaise','elliptical','rower','stairClimber']);
const {machines}=createEquipmentSystem({THREE,scene,stations:stations.filter(station=>types.has(station.type)),materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});

const selected=[...machines.values()].filter(m=>['bike','elliptical','rower'].includes(m.type)),seen=new Set(),results=[];
const axis=new THREE.Vector3(0,1,0),v=p=>new THREE.Vector3(...p),phaseCount=101;
for(const machine of selected){if(seen.has(machine.type))continue;seen.add(machine.type);const lifecycle=createMachineLifecycle({THREE,machine,metrics});
 for(const mode of ['loop','enter','exit']){const r={type:machine.type,id:machine.station.id,mode,minimumShoeGap:Infinity,maximumSupportedShoeGap:-Infinity,maximumTargetPlaneOffset:0,maxPedalMechanismError:0,supportedFootSamples:0,strictShoeCollisions:[],maxReachError:0};
 for(let i=0;i<phaseCount;i++){
 const phase=i/(phaseCount-1),frame=mode==='loop'?{pose:machine.sampleActivity(phase,phase),offset:[0,0,0],rotation:0}:lifecycle.sample(mode,phase);character.pose(frame.pose);const body=character.getContactPoints();r.maxReachError=Math.max(r.maxReachError,body.maxReachError);
 const transform=p=>v(p).applyAxisAngle(axis,frame.rotation||0).add(v(frame.offset||[0,0,0])).toArray();
 const feet=body.feet.map(transform),samples=character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}).map(p=>({...p,position:transform(p.position)})),volumes=machine.getCollisionVolumes();
 const footVolumes=volumes.map(volume=>({...volume,allowedBodyParts:(volume.allowedBodyParts||[]).filter(p=>!['leftFoot','rightFoot'].includes(p))})),strict=evaluateSurfaceClearance(samples,footVolumes,{tolerance:.004});
 for(const item of strict.collisions)if(!r.strictShoeCollisions.some(a=>a.bodyPart===item.bodyPart&&a.volumeId===item.volumeId))r.strictShoeCollisions.push({...item,phase,stage:frame.stage});
 const size=machine.type==='bike'?[.21,.035,.15]:machine.type==='elliptical'?[.23,.055,.57]:[.23,.45,.06],boards=volumes.filter(b=>b.shape==='box'&&b.size.every((n,k)=>Math.abs(n-size[k])<.0001));
 if(boards.length!==2)throw new Error(`Missing physical support meshes: ${machine.type} (${boards.length})`);
 if(mode==='loop')for(const board of boards){const sign=Math.sign(board.position[0]),angle=phase*Math.PI*2+(sign>0?Math.PI:0),expected=machine.type==='bike'?[sign*.18,.55+Math.sin(angle)*.17-.0175,.14+Math.cos(angle)*.17]:machine.type==='elliptical'?[sign*.22,.35+.09*Math.sin(angle)-.025,.02+.25*Math.cos(angle)]:[sign*.20,.27,.40];r.maxPedalMechanismError=Math.max(r.maxPedalMechanismError,v(expected).distanceTo(v(board.position)));}
 for(let side=0;side<2;side++){
 const board=boards.reduce((a,b)=>Math.abs(a.position[0]-feet[side][0])<Math.abs(b.position[0]-feet[side][0])?a:b),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...board.rotation)).invert(),local=p=>v(p).sub(v(board.position)).applyQuaternion(q),foot=local(feet[side]),thin=machine.type==='rower'?2:1,sign=machine.type==='rower'?-1:1,plane=board.size[thin]/2,projection=[0,1,2].filter(k=>k!==thin),footGap=sign*foot.getComponent(thin)-plane;
 if(mode!=='loop'&&(Math.abs(footGap)>.035||projection.some(k=>Math.abs(foot.getComponent(k))>board.size[k]/2+.03)))continue;
 if(mode!=='loop'&&!frame.contacts?.feet?.[side])continue;
 const over=samples.filter(p=>p.part===(side?'rightFoot':'leftFoot')).map(p=>local(p.position)).filter(p=>projection.every(k=>Math.abs(p.getComponent(k))<=board.size[k]/2+.0005));
 if(!over.length){if(mode==='loop')throw new Error(`No shoe mesh over ${machine.type} pedal at ${phase}`);continue;}
 const gap=Math.min(...over.map(p=>sign*p.getComponent(thin)-plane));r.minimumShoeGap=Math.min(r.minimumShoeGap,gap);r.maximumSupportedShoeGap=Math.max(r.maximumSupportedShoeGap,gap);r.maximumTargetPlaneOffset=Math.max(r.maximumTargetPlaneOffset,Math.abs(footGap));r.supportedFootSamples++;
 }
 }
 results.push(r);
 }
}
const report={phaseCount,allFootVertices:true,planeSource:'actual rendered pedal/footplate collision boxes, with foot exemptions removed',supportedPhaseDefinition:'all exercise phases; lifecycle feet marked planted and projecting over the physical support face',results};writeFileSync(new URL(`../artifacts/cardio-support-${process.env.FORM_SUPPORT_LABEL||'current'}.json`,import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(results));character.dispose();if(results.some(r=>r.strictShoeCollisions.length||r.maxReachError>.015||r.maxPedalMechanismError>.000001||r.minimumShoeGap<-.004||r.maximumSupportedShoeGap>.006))process.exitCode=1;
