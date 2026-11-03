import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createActivityRig} from '../src/extended-rig.js';
import {cylinderHandMeasure} from './equipment-grip-test-helpers.mjs';
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength));
for(const m of json.materials||[]){m.pbrMetallicRoughness={baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;delete m.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let j=Buffer.from(JSON.stringify(json));if(j.length%4)j=Buffer.concat([j,Buffer.alloc(4-j.length%4,32)]);
const rest=source.subarray(20+jsonLength),h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(20+j.length+rest.length,8);h.writeUInt32LE(j.length,12);h.writeUInt32LE(0x4e4f534a,16);
const b=Buffer.concat([h,j,rest]),gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata:JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)))}),metrics=character.getAssetInfo().metrics,rig=createActivityRig({THREE,scene,characterMetrics:metrics});
const ids=['dumbbell-curl','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-goblet-squat','dumbbell-romanian-deadlift','dumbbell-bench-press'];
const results=[];
if(process.env.DB_PROBE){const [id,u]=process.env.DB_PROBE.split(','),f=rig.sampleLifecycle(id,'enter',Number(u));character.pose(f.pose);console.log(JSON.stringify({probe:true,frame:f,joints:character.getContactPoints()}));character.dispose();process.exit(0);}
for(const id of ids){const meta=rig.getLifecycle(id);rig.prepare(id);let time=0;const samples=[];
 for(const s of meta.stages){time+=s.duration;const frame=rig.sampleLifecycle(id,'enter',Math.min(1,time/meta.entryDuration));character.pose(frame.pose);const p=character.getContactPoints(),q=rig.getLifecycleState(id);
 samples.push({stage:s.label,time,pose:frame.pose,offset:frame.offset,held:frame.held,joints:p,propPositions:q.propPositions,propQuaternions:q.propQuaternions});}
 rig.sampleLifecycle(id,'enter',1);const v=rig.getVisualRoot(id);v.updateMatrixWorld(true);const meshes=[];v.traverse(o=>{if(o.isMesh&&o.geometry.type==='CylinderGeometry'&&Math.abs(o.geometry.parameters.radiusTop-.016)<.0001)meshes.push(o);});const skin=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']});const strict=meshes.map(o=>{const center=o.position.clone();o.parent.localToWorld(center);v.worldToLocal(center);const axis=new THREE.Vector3(0,1,0).transformDirection(o.matrixWorld).transformDirection(v.matrixWorld.clone().invert());return cylinderHandMeasure(skin,{center:center.toArray(),axis:axis.toArray(),halfLength:.19,radius:.016});});
 results.push({id,duration:meta.entryDuration,samples,strict});console.log(JSON.stringify({id,strict}));}
const output=process.argv[2]||'artifacts/dumbbell-lifecycle-before.json';writeFileSync(output,JSON.stringify({metrics,results},null,2));console.log(JSON.stringify({output}));character.dispose();
