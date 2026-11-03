import * as THREE from 'three';
import {createGymArchitecture} from '../src/gym-architecture.js';
export {THREE};
export function makeArchitecture(){
 const noop=()=>{};globalThis.document={createElement(){return{width:1,height:1,getContext(){return new Proxy({}, {get:(target,key)=>target[key]||noop,set:(target,key,value)=>(target[key]=value,true)});}};}};
 const scene=new THREE.Scene(),geometries=new Set(),extraMaterials=new Set(),textures=new Set(),colliders=[];
 const materials=Object.fromEntries(['rubber','rubberAlt','graphite','steel','chrome','pad','accent','cream','wood','black','white','grass','glass','light'].map(key=>[key,new THREE.MeshStandardMaterial()]));
 const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);parent.add(object);return object;};
 const box=(parent,x,y,z,w,h,d,material)=>mesh(parent,new THREE.BoxGeometry(w,h,d),material,x,y,z);
 const cylinder=(parent,x,y,z,r,h,material,sides=12)=>mesh(parent,new THREE.CylinderGeometry(r,r,h,sides),material,x,y,z);
 const sphere=(parent,x,y,z,r,material)=>mesh(parent,new THREE.SphereGeometry(r,10,8),material,x,y,z);
 const rod=(parent,a,b,r=.05,material=materials.graphite)=>{const object=cylinder(parent,0,0,0,r,1,material),av=new THREE.Vector3(...a),direction=new THREE.Vector3(...b).sub(av);object.position.copy(av).addScaledVector(direction,.5);object.scale.y=direction.length();object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;};
 const label=(parent,text,x,y,z)=>{const object=new THREE.Group();object.position.set(x,y,z);parent.add(object);return object;};
 const collider=(x,z,w,d,padding=0)=>{const record={x,z,hx:w/2+padding,hz:d/2+padding};colliders.push(record);return record;};
 const architecture=createGymArchitecture({THREE,scene,materials,geometries,extraMaterials,textures,box,cylinder,sphere,rod,label,collider,plant:noop,dumbbell:parent=>{const group=new THREE.Group();parent.add(group);return group;}});
 return{scene,materials,geometries,extraMaterials,textures,colliders,architecture,dispose(){architecture.dispose();for(const g of geometries)g.dispose();for(const m of [...extraMaterials,...Object.values(materials)])m.dispose();for(const t of textures)t.dispose();}};
}
