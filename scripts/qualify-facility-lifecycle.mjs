import * as THREE from 'three';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {stations} from '../src/data.js';
import {gymLayout,facilityStations} from '../src/gym-layout.js';
import {createGymArchitecture} from '../src/gym-architecture.js';
import {createFacilityLifecycle} from '../src/facility-lifecycle.js';
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
const results=[];
for(const station of facilityStations){
  const profile=createFacilityLifecycle({station,architecture,metrics});
  for(const direction of ['enter','exit']){
    const result={id:station.id,direction,maxReachError:0,collisions:[],self:[],surface:[]};
    for(let i=0;i<=100;i++){
      const frame=profile.sample(direction,i/100);character.pose(frame.pose);
      const body=character.getContactPoints(),baseBody=transformBody(body,frame),volumes=architecture.getCollisionVolumes(station.id);
      if(body.maxReachError>result.maxReachError){result.maxReachError=body.maxReachError;result.worst={phase:i/100,hip:frame.pose.hip,hands:frame.pose.hands,feet:frame.pose.feet,handErrors:body.hands.map((p,j)=>Math.hypot(...p.map((v,k)=>v-frame.pose.hands[j][k]))),footErrors:body.feet.map((p,j)=>Math.hypot(...p.map((v,k)=>v-frame.pose.feet[j][k])))};}
      const add=(list,items)=>{for(const hit of items)if(!list.some(old=>old.bodyPart===hit.bodyPart&&old.volumeId===hit.volumeId))list.push({...hit,phase:i/100});};
      add(result.collisions,evaluateExerciseClearance(baseBody,volumes).collisions);add(result.self,evaluateSelfClearance(body).collisions);
      if(i%10===0)add(result.surface,evaluateSurfaceClearance(transformSurface(character.getSurfaceSamples({stride:24}),frame),volumes).collisions);
    }
    results.push(result);
  }
}
writeFileSync('artifacts/facility-lifecycle-qualification.json',JSON.stringify({results},null,2));
console.log(JSON.stringify(results.map(r=>({id:r.id,direction:r.direction,maxReachError:r.maxReachError,collisions:r.collisions.slice(0,4),self:r.self.slice(0,2),worst:r.maxReachError>.015?r.worst:null,surface:r.surface.slice(0,4)}))));
if(results.some(r=>r.maxReachError>.015||r.collisions.length||r.self.length||r.surface.length))process.exitCode=1;
