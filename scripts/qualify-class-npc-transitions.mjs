import * as THREE from 'three';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {stations} from '../src/data.js';
import {gymLayout,facilityStations,floorHeightAt} from '../src/gym-layout.js';
import {createGymArchitecture} from '../src/gym-architecture.js';
import {createGroupClassSystem} from '../src/classes/group-class-system.js';
import {groupClassDefinitions} from '../src/classes/class-data.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';

// Canvas drawing is irrelevant to CPU navigation/skin tests. Production geometry,
// collider dimensions, facility state and the real human skeleton are retained.
const noop=()=>{};
globalThis.document={createElement(){return {width:1,height:1,getContext(){return new Proxy({}, {get:(target,key)=>target[key]||noop,set:(target,key,value)=>(target[key]=value,true)});}};}};
const scene=new THREE.Scene(),geometries=new Set(),extraMaterials=new Set(),textures=new Set(),colliders=[];
const materials=Object.fromEntries(['rubber','rubberAlt','graphite','steel','chrome','pad','accent','cream','wood','black','white','grass','glass','light'].map(key=>[key,new THREE.MeshStandardMaterial()]));
const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);parent.add(object);return object;};
const box=(parent,x,y,z,w,h,d,material)=>mesh(parent,new THREE.BoxGeometry(w,h,d),material,x,y,z);
const cylinder=(parent,x,y,z,r,h,material,sides=12)=>mesh(parent,new THREE.CylinderGeometry(r,r,h,sides),material,x,y,z);
const sphere=(parent,x,y,z,r,material)=>mesh(parent,new THREE.SphereGeometry(r,10,8),material,x,y,z);
const rod=(parent,a,b,r=.05,material=materials.graphite)=>{const object=cylinder(parent,0,0,0,r,1,material),av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),direction=bv.sub(av);object.position.copy(av).addScaledVector(direction,.5);object.scale.y=direction.length();object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;};
const label=(parent,text,x,y,z)=>{const object=new THREE.Group();object.position.set(x,y,z);parent.add(object);return object;};
const collider=(x,z,w,d,padding=0)=>{const record={x,z,hx:w/2+padding,hz:d/2+padding};colliders.push(record);return record;};
const architecture=createGymArchitecture({THREE,scene,materials,geometries,extraMaterials,textures,box,cylinder,sphere,rod,label,collider,plant:noop,dumbbell:parent=>{const group=new THREE.Group();parent.add(group);return group;}});
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata,geometries,extraMaterials,textures}),metrics=character.getAssetInfo().metrics;


const station=facilityStations.find(s=>s.id==='group-class'),system=createGroupClassSystem({THREE,scene,metrics,materials,geometries,extraMaterials,architecture,station}),results=[];let clock=0;
for(const d of groupClassDefinitions){
 system.prepare(d.id);let started=false,readyTime=null,mainClock=0;const result={id:d.id,maxReach:0,maxContact:0,maxJump:0,minFloor:Infinity,collisions:[],self:[],skin:[],timedOut:false,jump:null};const previous={};
 for(let step=0;step<1600;step++){
  clock+=.05;if(started)mainClock+=.05;const phase=(mainClock/d.duration)%1;system.update(.05,{phase:started?phase:null,active:started});
  for(const id of ['class-instructor','class-participant-1','class-participant-2']){
   const frame=system.sampleNPC(id,started?phase:null),localBefore=frame.pose;character.pose(localBefore);const local=character.getContactPoints(),body=transformBody(local,frame),volumes=system.getNPCCollisionVolumes(id);result.maxReach=Math.max(result.maxReach,local.maxReachError);
   const targets=system.getNPCActualContacts(id);for(let side=0;side<2;side++)if(frame.contacts?.hands[side]&&targets?.hands?.[side])result.maxContact=Math.max(result.maxContact,Math.hypot(...body.hands[side].map((v,i)=>v-targets.hands[side][i])));
   if(previous[id])for(const key of ['hands','feet','shoulders','hips','elbows','knees'])for(let side=0;side<2;side++){const distance=Math.hypot(...body[key][side].map((v,i)=>v-previous[id][key][side][i]));if(distance>result.maxJump){result.maxJump=distance;result.jump={id,stage:frame.stage,step,key,side,distance};}}previous[id]=body;
   const add=(key,items)=>{for(const hit of items)if(!result[key].some(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId&&h.actor===id))result[key].push({...hit,actor:id,step,stage:frame.stage});};add('collisions',evaluateExerciseClearance(body,volumes).collisions);add('self',evaluateSelfClearance(local).collisions);
   if(step%5===0){const samples=transformSurface(character.getSurfaceSamples({stride:24}),frame);add('skin',evaluateSurfaceClearance(samples,volumes).collisions);result.skinPairs=(result.skinPairs||0)+samples.length*volumes.length;const anchors=architecture.getSceneAnchors(),anchor=id==='class-instructor'?anchors.classInstructor:anchors.classParticipants[id.endsWith('1')?0:1];for(const sample of samples){const point=new THREE.Vector3(...sample.position).applyAxisAngle(new THREE.Vector3(0,1,0),anchor.rotation||0).add(new THREE.Vector3(...anchor.position));result.minFloor=Math.min(result.minFloor,point.y-floorHeightAt(point.x,point.z));}}
  }
  const states=system.getDiagnostics().npcs;if(readyTime===null&&states.every(a=>a.kind===d.classKind&&a.status==='using'))readyTime=step*.05;if(!started&&readyTime!==null&&step*.05>readyTime+system.getLifecycle(d.id).entryDuration){system.begin(d.id);started=true;mainClock=0;}if(started&&mainClock>4){result.finishSeconds=step*.05;break;}if(step===1599)result.timedOut=true;
 }
 results.push(result);console.log(JSON.stringify(result));
}
writeFileSync('artifacts/class-npc-transition-qualification.json',JSON.stringify({results},null,2));if(results.some(r=>r.maxReach>.015||r.maxContact>.015||r.maxJump>.25||r.collisions.length||r.self.length||r.skin.length||r.timedOut||r.minFloor<-.008))process.exitCode=1;
