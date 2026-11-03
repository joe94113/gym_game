import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Omit image decoding only in this CPU fixture; real positions, skin, bones,
// model bytes on disk and the runtime factory are unchanged.
export async function createMocapFixtureV019({baseline=false}={}){
 const root=resolve(baseline?'.local-tools/v019-before':'.'),source=readFileSync(resolve(root,'public/models/athlete/athlete.glb')),length=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+length));
 for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
 delete json.images;delete json.textures;delete json.samplers;
 let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
 const remainder=source.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
 const load=name=>import(pathToFileURL(resolve(root,'src',name)));
 const [{createSkinnedCharacterFromModel},{createActivityRig},{createEquipmentSystem},{createMachineLifecycle},{stations}]=await Promise.all(['skinned-character.js','extended-rig.js','equipment.js','machine-lifecycle.js','data.js'].map(load));
 const scene=new THREE.Scene(),metadata=JSON.parse(readFileSync(resolve(root,'public/models/athlete/rig.json'))),pool={geometryCache:new WeakMap(),geometries:new Set(),textures:new Set(),instances:0,disposed:false},clones=[];
 const character=createSkinnedCharacterFromModel({THREE,scene,model:cloneSkeleton(gltf.scene),metadata,sharedResources:pool}),metrics=character.getAssetInfo().metrics,rig=createActivityRig({THREE,scene,characterMetrics:metrics});
 character.createClone=options=>{const body=createSkinnedCharacterFromModel({THREE,scene,model:cloneSkeleton(gltf.scene),metadata,sharedResources:pool,...options});clones.push(body);return body;};
 globalThis.document??={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
 const materials=Object.fromEntries(['graphite','steel','chrome','black','accent'].map(key=>[key,new THREE.MeshStandardMaterial()]));
 const types=new Set(['chestPress','latPulldown','seatedRow','legPress','legExtension','shoulderPress','cableFly','squat','benchPress','dumbbellCurl','treadmill','bike','plateInclinePress','plateHighRow','plateShoulderPress','hackSquat','hipThrust','calfRaise','smithSquat','legCurl','pecDeck','lateralRaise','elliptical','rower','stairClimber']);
 const {machines}=createEquipmentSystem({THREE,scene,stations:stations.filter(station=>types.has(station.type)),materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});
 const {createAdditionalEquipment,ADDITIONAL_EQUIPMENT_TYPES}=await load('additional-equipment.js');
 const extra=createAdditionalEquipment({scene,stations:stations.filter(station=>ADDITIONAL_EQUIPMENT_TYPES.has(station.type)),materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});
 for(const [id,machine]of extra.machines)machines.set(id,machine);
 return{THREE,root,scene,character,metrics,rig,machines,createMachineLifecycle,clones,pool};
}

export async function createCpuArchitectureV019(fixture){
 const {THREE,scene,root}=fixture,{createGymArchitecture}=await import(pathToFileURL(resolve(root,'src/gym-architecture.js')));
 const gradient={addColorStop(){}},context=new Proxy({measureText:text=>({width:String(text).length*20}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>key in target?target[key]:()=>{}});
 globalThis.document={createElement:()=>({width:1024,height:1024,getContext:()=>context})};
 const materials=Object.fromEntries(['rubber','rubberAlt','graphite','steel','chrome','pad','accent','cream','wood','black','white','grass','glass','light'].map(key=>[key,new THREE.MeshStandardMaterial()])),geometries=new Set(),extraMaterials=new Set(),textures=new Set(),colliders=[];
 const mesh=(geometry,material,parent,x=0,y=0,z=0)=>{geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);parent.add(object);return object;};
 const box=(parent,x,y,z,w,h,d,material)=>mesh(new THREE.BoxGeometry(w,h,d),material,parent,x,y,z),cylinder=(parent,x,y,z,r,h,material,sides=12)=>mesh(new THREE.CylinderGeometry(r,r,h,sides),material,parent,x,y,z),sphere=(parent,x,y,z,r,material)=>mesh(new THREE.SphereGeometry(r,8,6),material,parent,x,y,z);
 const rod=(parent,a,b,radius,material)=>{const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),direction=q.clone().sub(p),object=cylinder(parent,0,0,0,radius,1,material);object.position.copy(p).add(q).multiplyScalar(.5);object.scale.y=direction.length();object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;};
 const label=(parent,text,x,y,z,{width=1,height=.3}={},rotation=0)=>{const object=mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial(),parent,x,y,z);object.rotation.y=rotation;return object;};
 const collider=(x,z,w,d,padding=0)=>{const record={x,z,hx:w/2+padding,hz:d/2+padding};colliders.push(record);return record;};
 const plant=()=>new THREE.Group(),dumbbell=parent=>{const group=new THREE.Group();parent.add(group);return group;},originalLoad=THREE.TextureLoader.prototype.load;
 let architecture;try{THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};architecture=createGymArchitecture({THREE,scene,materials,geometries,extraMaterials,textures,box,cylinder,sphere,rod,label,collider,plant,dumbbell});}finally{THREE.TextureLoader.prototype.load=originalLoad;}
 for(const machine of fixture.machines.values())collider(machine.station.position.x,machine.station.position.z,machine.footprint.w,machine.footprint.d);
 return{architecture,colliders,materials,geometries,extraMaterials,textures};
}
