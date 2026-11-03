import * as THREE from 'three';
import {createGymArchitecture as currentArchitecture} from '../src/gym-architecture.js';
import {createGymArchitecture as previousArchitecture} from '../.local-tools/v012-before/src/gym-architecture.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const paths=['src/canvas-updates-v012.js','src/gym-architecture.js','src/reception-scenes.js'],sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),sourceHashes=Object.fromEntries(paths.map(path=>[path,sha(path)]));
function fixture(factory){
 const canvases=[],noop=()=>{};
 globalThis.document={createElement(){const operations=[],context=new Proxy({}, {get:(target,key)=>target[key]??((...args)=>operations.push([key,...args])),set:(target,key,value)=>(operations.push([key,value]),target[key]=value,true)}),canvas={width:1,height:1,getContext:()=>context,operations};canvases.push(canvas);return canvas;}};
 const scene=new THREE.Scene(),geometries=new Set(),extraMaterials=new Set(),textures=new Set(),colliders=[];
 const materials=Object.fromEntries(['rubber','rubberAlt','graphite','steel','chrome','pad','accent','cream','wood','black','white','grass','glass','light'].map(key=>[key,new THREE.MeshStandardMaterial()]));
 const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);parent.add(object);return object;};
 const box=(parent,x,y,z,w,h,d,material)=>mesh(parent,new THREE.BoxGeometry(w,h,d),material,x,y,z),cylinder=(parent,x,y,z,r,h,material,sides=12)=>mesh(parent,new THREE.CylinderGeometry(r,r,h,sides),material,x,y,z),sphere=(parent,x,y,z,r,material)=>mesh(parent,new THREE.SphereGeometry(r,10,8),material,x,y,z);
 const rod=(parent,a,b,r=.05,material=materials.graphite)=>{const object=cylinder(parent,0,0,0,r,1,material),av=new THREE.Vector3(...a),direction=new THREE.Vector3(...b).sub(av);object.position.copy(av).addScaledVector(direction,.5);object.scale.y=direction.length();object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;};
 const label=(parent,text,x,y,z)=>{const object=new THREE.Group();object.position.set(x,y,z);parent.add(object);return object;};
 const collider=(x,z,w,d,padding=0)=>{const record={x,z,hx:w/2+padding,hz:d/2+padding};colliders.push(record);return record;};
 const architecture=factory({THREE,scene,materials,geometries,extraMaterials,textures,box,cylinder,sphere,rod,label,collider,plant:noop,dumbbell:parent=>{const group=new THREE.Group();parent.add(group);return group;}});
 return{scene,geometries,textures,architecture,colliders,canvases,dispose(){architecture.dispose();for(const geometry of geometries)geometry.dispose();for(const material of [...extraMaterials,...Object.values(materials)])material.dispose();for(const texture of textures)texture.dispose();}};
}
const before=fixture(previousArchitecture),after=fixture(currentArchitecture),failures=[];
const sports=h=>h.canvases.filter(canvas=>canvas.width===768&&canvas.height===432),inbody=h=>h.canvases.find(canvas=>canvas.width===640&&canvas.height===400);
const equal=(label,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))failures.push(label);};
equal('sports initial draw commands changed',sports(before).map(canvas=>canvas.operations),sports(after).map(canvas=>canvas.operations));
equal('InBody initial draw commands changed',inbody(before).operations,inbody(after).operations);
equal('world colliders changed',before.colliders,after.colliders);equal('facility collision volumes changed',before.architecture.getWorldCollisionVolumes(),after.architecture.getWorldCollisionVolumes());
equal('geometry attributes changed',[...before.geometries].map(geometry=>[geometry.type,JSON.stringify(geometry.parameters)]),[...after.geometries].map(geometry=>[geometry.type,JSON.stringify(geometry.parameters)]));
function clear(h){for(const canvas of h.canvases)canvas.operations.length=0;}
function measurementSnapshot(time){clear(before);clear(after);before.architecture.update(time,.2);after.architecture.update(time,.2);equal(`InBody draw commands changed at ${time}s`,inbody(before).operations,inbody(after).operations);}
before.architecture.beginFacility('inbody');after.architecture.beginFacility('inbody');
for(const time of [.2,4,8,8.2]){
 if(time===8.2){clear(before);clear(after);before.architecture.update(time,.2);after.architecture.update(time,.2);if(inbody(after).operations.length)failures.push('completed InBody unnecessarily repainted');}
 else measurementSnapshot(time);
}
before.architecture.endFacility('inbody');after.architecture.endFacility('inbody');
clear(before);clear(after);before.architecture.update(20,1);after.architecture.update(20,1);
const camera=new THREE.PerspectiveCamera(55,1.6,.1,150);camera.position.set(-18,3.6,-22);camera.lookAt(-18,3.6,-28.7);after.architecture.prepareRender(camera);
equal('visible sports current-time draw commands changed',sports(before)[0].operations,sports(after)[0].operations);
if(inbody(after).operations.length)failures.push('inactive InBody unnecessarily repainted');
const visible=after.architecture.getDiagnostics().canvasUpdates.sports;
if(!visible.screens.some(screen=>screen.visible&&screen.lastDrawTime===20))failures.push('visible TV did not catch up immediately');
clear(before);clear(after);camera.position.set(0,2,-20);camera.lookAt(0,2,30);
const beforeVersions=[...before.textures].filter(texture=>texture.image?.width===768&&texture.image?.height===432).map(texture=>texture.version),afterVersions=[...after.textures].filter(texture=>texture.image?.width===768&&texture.image?.height===432).map(texture=>texture.version);
for(let i=1;i<=600;i++){const time=20+i/60;before.architecture.update(time,1/60);after.architecture.update(time,1/60);after.architecture.prepareRender(camera);}
const textureDeltas=(h,start)=>[...h.textures].filter(texture=>texture.image?.width===768&&texture.image?.height===432).map((texture,index)=>texture.version-start[index]);
const oldDeltas=textureDeltas(before,beforeVersions),newDeltas=textureDeltas(after,afterVersions);
if(newDeltas.some(Boolean))failures.push('offscreen TVs requested texture upload');
const finalHashes=Object.fromEntries(paths.map(path=>[path,sha(path)])),changedSources=paths.filter(path=>sourceHashes[path]!==finalHashes[path]);
const report={pass:!failures.length&&!changedSources.length,sourceHashes,baselineSourceHashes:Object.fromEntries(['src/gym-architecture.js','src/reception-scenes.js'].map(path=>[path,sha(`.local-tools/v012-before/${path}`)])),changedSources,scope:'CPU fixture of real architecture. Exact original canvas drawing command comparison for initial content, visible current-time TV and InBody scan/complete states. Colliders, volume arrays and geometry constructors match. Hidden TV texture version counts show fewer upload requests, not actual GL transfer measurements. Full-resolution actual canvas pixels and browser frame timings are checked by root.',beforeHiddenTenSecondTextureRequests:oldDeltas,afterHiddenTenSecondTextureRequests:newDeltas,visibleDiagnostics:visible,measurement:after.architecture.getDiagnostics().inbody.canvas,failures};
mkdirSync('artifacts/canvas-updates-v012',{recursive:true});writeFileSync('artifacts/canvas-updates-v012/cpu-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));before.dispose();after.dispose();if(!report.pass)process.exitCode=1;
