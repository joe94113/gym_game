import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeArchitecture} from './room-test-helpers.mjs';
import {createNpcLodFixture,readNpcLodData} from './npc-lod-fixture-v010.mjs';
import {createEquipmentFixture} from './equipment-batching-fixture.mjs';
import {createEquipmentBatcher} from '../src/equipment-batching.js';
import {createGroupClassSystem} from '../src/classes/group-class-system.js';
import {createSocialCrowd} from '../src/social-crowd.js';
import {createRoomResourceManager} from '../src/room-gpu-resources-v011.js';
import {stations} from '../src/data.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),paths=['src/room-gpu-resources-v011.js','src/room-zones.js','src/classes/group-class-system.js','src/skinned-character.js','src/crowd.js','src/social-crowd.js','src/equipment-batching.js','public/models/athlete/athlete.glb','public/models/athlete/lod-v010/indices.bin','scripts/qualify-room-gpu-resources-v011.mjs'],hashes=()=>Object.fromEntries(paths.map(path=>[path,hash(readFileSync(path))])),beforeHashes=hashes();
const h=makeArchitecture(),zones=h.architecture.roomZones;
// Reproduce the existing production room/material merge. The architecture
// fixture intentionally omits world.js text-label meshes and image decoding.
h.scene.updateMatrixWorld(true);const buckets=new Map();h.scene.traverse(object=>{
  if(!object.isMesh||object.userData.noStaticBatch||object.material.transparent||Array.isArray(object.material))return;
  for(let parent=object.parent;parent;parent=parent.parent)if(parent.userData.noStaticBatch)return;
  let room='global';for(let parent=object;parent;parent=parent.parent)if(parent.userData.roomId){room=parent.userData.roomId;break;}
  const key=room+':'+object.material.uuid;if(!buckets.has(key))buckets.set(key,{room,material:object.material,objects:[]});buckets.get(key).objects.push(object);
});
for(const{room,material,objects}of buckets.values()){
  if(objects.length<2)continue;const pieces=objects.map(object=>object.geometry.clone().applyMatrix4(object.matrixWorld)),geometry=mergeGeometries(pieces,false);pieces.forEach(piece=>piece.dispose());if(!geometry)continue;
  h.geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);(zones.getRoot(room)||h.scene).add(mesh);objects.forEach(object=>object.removeFromParent());
}
const actors=await createNpcLodFixture({data:readNpcLodData()}),character=actors.instantiate();h.scene.add(character.group);
const variants=[{}, {bodyProfile:'feminine'}, {age:65}, {bodyProfile:'feminine',age:65}],clones=variants.map(appearance=>character.createClone({scene:h.scene,appearance}));for(const actor of clones){actor.setGeometryLod(1);actor.setGeometryLod(2);}
const equipment=await createEquipmentFixture();h.scene.add(equipment.scene);const batcher=createEquipmentBatcher({THREE,scene:h.scene,machines:equipment.machines});
const classes=createGroupClassSystem({THREE,scene:h.scene,metrics:character.getAssetInfo().metrics,materials:h.materials,geometries:h.geometries,extraMaterials:h.extraMaterials,architecture:h.architecture,station:stations.find(s=>s.id==='group-class')}),social=createSocialCrowd({THREE,scene:h.scene,character,anchors:h.architecture.getSceneAnchors(),groupClasses:classes});
const courseIds=['group-class','class-dance','class-cycle','class-trx','class-barbell','class-aerial','class-pilates'];
for(const id of courseIds){classes.prepare(id);classes.begin(id);for(let i=0;i<2000;i++){classes.update(.05,{active:true,phase:.5});const d=classes.getDiagnostics();if(d.npcs.every(actor=>actor.kind===d.selectedKind&&actor.status==='using'))break;}social.update(.05,{classPhase:.5});}classes.end();
const manager=createRoomResourceManager({scene:h.scene,rooms:{classroom:zones.getRoot('classroom'),bathroom:zones.getRoot('bathroom')},getInventoryRoots:()=>[...zones.getInventoryRoots(),...classes.getInventoryRoots()],getProtectedResources:()=>({characters:character.getGpuResourceProtection(),globalMaterials:Object.values(h.materials)}),cooldownSeconds:.2});zones.setResourceManager(manager);
const allRoots=()=>[h.scene,...zones.getInventoryRoots(),...classes.getInventoryRoots()],objects=new Set(),geometries=new Set(),materials=new Set(),textures=new Set(),protectedResources=character.getGpuResourceProtection(),protectedEvents=[];
for(const root of allRoots())root.traverse(object=>{objects.add(object);if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){materials.add(material);for(const texture of Object.values(material))if(texture?.isTexture)textures.add(texture);}});
for(const resource of [...protectedResources.geometries,...protectedResources.materials,...protectedResources.textures])resource.addEventListener('dispose',()=>protectedEvents.push(resource.uuid));
function snapshot(){
  for(const root of allRoots())root.updateWorldMatrix(true,true);
  const objectData=[...objects].map(object=>[object.uuid,object.matrixWorld.toArray(),object.isBone?object.quaternion.toArray():null,object.geometry?.uuid||null,Array.isArray(object.material)?object.material.map(m=>m.uuid):object.material?.uuid||null]);
  const geometryData=[...geometries].map(geometry=>[geometry.uuid,...[geometry.index,...Object.values(geometry.attributes)].filter(Boolean).map(attribute=>[attribute.uuid||'',attribute.array,hash(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength))])]);
  const textureData=[...textures].map(texture=>[texture.uuid,texture.source,texture.source?.data]);
  return{objects:JSON.stringify(objectData),geometryData,textureData,colliders:JSON.stringify(h.colliders),volumes:JSON.stringify(h.architecture.getWorldCollisionVolumes()),contacts:JSON.stringify([character.getContactPoints(),...clones.map(actor=>actor.getContactPoints())]),muscles:JSON.stringify([character.getMuscleHighlights(),...clones.map(actor=>actor.getMuscleHighlights())])};
}
const before=snapshot(),inventory=manager.inspect();for(let i=0;i<30;i++)zones.evaluate({dt:.05,playerPosition:[0,0,-20]});const sleeping=manager.getDiagnostics(),asleep=snapshot();zones.evaluate({dt:0,forceAllRooms:true,playerPosition:[0,0,-20]});const restored=snapshot(),awake=manager.getDiagnostics(),failures=[];
for(const[phase,s]of [['sleep',asleep],['wake',restored]]){
  for(const key of ['objects','colliders','volumes','contacts','muscles'])if(s[key]!==before[key])failures.push(`${phase}: ${key} changed`);
  s.geometryData.forEach((record,i)=>record.slice(1).forEach((attribute,j)=>{const previous=before.geometryData[i][j+1];if(attribute[1]!==previous[1]||attribute[2]!==previous[2])failures.push(`${phase}: geometry arrays changed`);}));
  s.textureData.forEach((record,i)=>{if(record[1]!==before.textureData[i][1]||record[2]!==before.textureData[i][2])failures.push(`${phase}: texture Source/image changed`);});
}
if(protectedEvents.length)failures.push('protected character resource disposed');if(classes.getInventoryRoots().length!==28)failures.push('not all four actors have all seven cached class programs');for(const id of ['classroom','bathroom'])if(sleeping.rooms[id].releaseCount!==1||awake.rooms[id].wakeCount!==1)failures.push(`missing room lifecycle ${id}`);
const afterHashes=hashes(),changedSources=paths.filter(path=>beforeHashes[path]!==afterHashes[path]),report={passed:!failures.length&&!changedSources.length,scope:'CPU source-array/reference, world transform, collision/contact/muscle and protected-resource invariance. Real architecture fixture with production static merge, all seven generated class programs, all four full/LOD appearance caches and equipment proxies. No GPU calls or memory release measured; text-label textures/image decoding omitted by fixture.',sourceHashes:afterHashes,changedSources,counts:{objects:objects.size,geometries:geometries.size,materials:materials.size,textures:textures.size,protectedGeometries:protectedResources.geometries.length,protectedMaterials:protectedResources.materials.length,protectedTextures:protectedResources.textures.length,cachedClassPrograms:classes.getInventoryRoots().length,proxyCount:batcher.getDiagnostics().proxyCount},courseIds,appearanceVariants:variants,inventory,sleeping,awake,protectedDisposeEvents:protectedEvents,failures};
mkdirSync('artifacts/room-gpu-resources-v011',{recursive:true});writeFileSync('artifacts/room-gpu-resources-v011/cpu-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,inventory:undefined,sleeping:undefined,awake:undefined}));
batcher.dispose();social.dispose();clones.forEach(actor=>actor.dispose());character.dispose();equipment.character.dispose();h.dispose();if(!report.passed)process.exitCode=1;
