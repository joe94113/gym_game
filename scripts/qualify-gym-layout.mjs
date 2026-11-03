import * as THREE from 'three';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {stations} from '../src/data.js';
import {gymLayout,facilityStations} from '../src/gym-layout.js';
import {createGymArchitecture} from '../src/gym-architecture.js';
import {createEquipmentSystem} from '../src/equipment.js';
import {createAdditionalEquipment,ADDITIONAL_EQUIPMENT_TYPES} from '../src/additional-equipment.js';
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
const equipment=createEquipmentSystem({THREE,scene,stations:stations.filter(station=>station.type!=='facility'&&station.type!=='stretchZone'&&!ADDITIONAL_EQUIPMENT_TYPES.has(station.type)),materials,geometries,extraMaterials,textures,label,collider});
const machines=new Map([...equipment.machines,...architecture.facilities]);
const stretch=stations.find(station=>station.id==='stretch-zone');machines.set(stretch.id,{station:stretch,interaction:new THREE.Vector3(stretch.position.x,0,stretch.position.z+2.2)});
const bounds=gymLayout.bounds;
const blocked=(x,z,radius=.34)=>x<bounds.minX+.65||x>bounds.maxX-.65||z<bounds.minZ+.65||z>bounds.maxZ-.65||colliders.some(record=>!record.disabled&&x>record.x-record.hx-radius&&x<record.x+record.hx+radius&&z>record.z-record.hz-radius&&z<record.z+record.hz+radius);
function route(end){
  if(blocked(end.x,end.z))return 0;
  const size=.65,minX=bounds.minX+.7,minZ=bounds.minZ+.7,cols=Math.floor((bounds.maxX-minX-.7)/size)+1,rows=Math.floor((bounds.maxZ-minZ-.7)/size)+1;
  const point=(x,z)=>({x:Math.min(cols-1,Math.max(0,Math.round((x-minX)/size))),z:Math.min(rows-1,Math.max(0,Math.round((z-minZ)/size)))});
  const start=point(gymLayout.spawn.x,gymLayout.spawn.z),target=point(end.x,end.z),key=point=>point.z*cols+point.x,targetKey=key(target),visited=new Set([key(start)]),queue=[{...start,distance:0}];
  for(let index=0;index<queue.length;index++){
    const current=queue[index];if(key(current)===targetKey)return current.distance;
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const next={x:current.x+dx,z:current.z+dz,distance:current.distance+1},nodeKey=key(next);
      if(next.x<0||next.x>=cols||next.z<0||next.z>=rows||visited.has(nodeKey))continue;
      if(nodeKey!==targetKey&&blocked(next.x*size+minX,next.z*size+minZ,.43))continue;
      visited.add(nodeKey);queue.push(next);
    }
  }
  return 0;
}

const cameraCases=[
  {id:'player-behind-roster-wall',camera:[-4.5,3,22],focus:[-4.5,1.1,14.8],expected:true},
  {id:'portrait-inspection-keeps-wall',camera:[-4.5,3,22],focus:[-4.5,2.8,16.37],expected:false},
  {id:'player-in-front-camera-behind',camera:[-4.5,3,12],focus:[-4.5,1.1,16.8],expected:true},
  {id:'clear-central-aisle',camera:[1,3,22],focus:[1,1.1,14.8],expected:false},
].map(test=>({...test,actual:architecture.updateView(test.camera,test.focus)}));

const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata,geometries,extraMaterials,textures}),metrics=character.getAssetInfo().metrics;
const additional=createAdditionalEquipment({scene,stations,materials,geometries,extraMaterials,textures,label,collider,characterMetrics:metrics});
for(const [id,machine]of additional.machines)machines.set(id,machine);
const navigation=[...machines.values()].map(machine=>({id:machine.station.id,blocked:blocked(machine.interaction.x,machine.interaction.z),steps:route(machine.interaction),interaction:machine.interaction.toArray()}));
const reverseFixture={...stations.find(station=>station.id==='pec-deck'),id:'reverse-fly',type:'reverseFly',rotation:Math.PI};
const reverse=createAdditionalEquipment({scene,stations:[reverseFixture],materials,geometries,extraMaterials,textures,label,characterMetrics:metrics}).machines.get('reverse-fly');
const lifecycleGates=[...additional.machines.values(),reverse].map(machine=>{
  const setup=machine.getSetup(),meta=machine.getLifecycle(),point=new THREE.Vector3(...meta.gateOffset).applyAxisAngle(new THREE.Vector3(0,1,0),setup.rotation).add(new THREE.Vector3(...setup.origin));
  return{id:machine.station.id,blocked:blocked(point.x,point.z),steps:route(point),position:point.toArray()};
});
const facilityResults=[];
for(const station of facilityStations){
  architecture.beginFacility(station.id);architecture.update(3,.05);
  const result={id:station.id,maxContactError:0,maxReachError:0,collisions:[],selfCollisions:[],surfaceCollisions:[]};
  for(let index=0;index<9;index++){
    const phase=index/8,pose=architecture.sampleFacility(station.id,phase,metrics);character.pose(pose);
    const actual=character.getContactPoints(),expected=architecture.getActualContacts(station.id),volumes=architecture.getCollisionVolumes(station.id);
    for(const kind of ['hands','feet'])for(let side=0;side<2;side++)result.maxContactError=Math.max(result.maxContactError,Math.hypot(...expected[kind][side].map((value,axis)=>value-actual[kind][side][axis])));
    result.maxReachError=Math.max(result.maxReachError,actual.maxReachError);
    for(const collision of evaluateExerciseClearance(actual,volumes).collisions)if(!result.collisions.some(old=>old.bodyPart===collision.bodyPart&&old.volumeId===collision.volumeId))result.collisions.push(collision);
    for(const collision of evaluateSelfClearance(actual).collisions)if(!result.selfCollisions.some(old=>old.bodyPart===collision.bodyPart&&old.volumeId===collision.volumeId))result.selfCollisions.push(collision);
    if(index===0||index===4||index===8)for(const collision of evaluateSurfaceClearance(character.getSurfaceSamples({stride:32}),volumes).collisions)if(!result.surfaceCollisions.some(old=>old.bodyPart===collision.bodyPart&&old.volumeId===collision.volumeId))result.surfaceCollisions.push(collision);
  }
  facilityResults.push(result);architecture.endFacility(station.id);
}
const report={navigation,lifecycleGates,cameraCases,facilities:facilityResults,architecture:architecture.getDiagnostics()};
mkdirSync(new URL('../artifacts',import.meta.url),{recursive:true});writeFileSync(new URL('../artifacts/gym-layout-qualification.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(navigation.some(item=>item.blocked||!item.steps)||lifecycleGates.some(item=>item.blocked||!item.steps)||cameraCases.some(item=>item.actual!==item.expected)||facilityResults.some(item=>item.maxContactError>.015||item.maxReachError>.015||item.collisions.length||item.selfCollisions.length||item.surfaceCollisions.length))process.exitCode=1;
