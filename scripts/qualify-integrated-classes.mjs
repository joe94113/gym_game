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

const station=facilityStations.find(s=>s.id==='group-class'),system=createGroupClassSystem({THREE,scene,metrics,materials,geometries,extraMaterials,architecture,station}),results=[];
for(const d of groupClassDefinitions){
 const result={id:d.id,maxReach:0,maxContact:0,minSkinFloor:Infinity,collisions:[],self:[],skin:[]};system.prepare(d.id);if(!system.getVisualRoots(d.id).every(root=>root.visible))throw new Error(`prepare() did not show ${d.id}`);
 for(const mode of ['loop','enter','exit'])for(let i=0;i<=100;i++){
  const u=i/100,frame=mode==='loop'?{pose:system.sample(d.id,u,u),offset:[0,0,0],rotation:0}:system.sampleLifecycle(d.id,mode,u);character.pose(frame.pose);const local=character.getContactPoints(),body=transformBody(local,frame),volumes=system.getCollisionVolumes(d.id);if(local.maxReachError>result.maxReach){result.maxReach=local.maxReachError;result.worst={mode,u,frame};}
  const targets=system.getActualContacts(d.id);if(mode==='loop'||frame.contacts?.hands.some(Boolean))for(let side=0;side<2;side++)if(mode==='loop'&&['barbell','cycle','trx','aerial'].includes(d.classKind)||frame.contacts?.hands[side])result.maxContact=Math.max(result.maxContact,Math.hypot(...body.hands[side].map((v,i)=>v-targets.hands[side][i])));
  const add=(key,items)=>{for(const hit of items)if(!result[key].some(h=>h.bodyPart===hit.bodyPart&&h.volumeId===hit.volumeId&&h.mode===mode))result[key].push({...hit,mode,u});};add('collisions',evaluateExerciseClearance(body,volumes).collisions);add('self',evaluateSelfClearance(local).collisions);
  if(i%1===0){const samples=transformSurface(character.getSurfaceSamples({stride:20}),frame);add('skin',evaluateSurfaceClearance(samples,volumes).collisions);result.skinPairs=(result.skinPairs||0)+samples.length*volumes.length;for(const s of samples){const world=new THREE.Vector3(...s.position).applyAxisAngle(new THREE.Vector3(0,1,0),station.setup.rotation).add(new THREE.Vector3(...station.setup.origin)),floor=floorHeightAt(world.x,world.z);result.minSkinFloor=Math.min(result.minSkinFloor,world.y-floor);}}
 }
 results.push(result);console.log(JSON.stringify({...result,worst:undefined}));system.end();
}
writeFileSync('artifacts/integrated-class-qualification.json',JSON.stringify({results},null,2));if(results.some(r=>r.maxReach>.015||r.maxContact>.015||r.collisions.length||r.self.length||r.skin.length||r.minSkinFloor<-.008))process.exitCode=1;
