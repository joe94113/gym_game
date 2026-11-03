import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {solveHandContactFrame} from '../src/hand-contact-frame.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
import {cylinderHandMeasure} from './equipment-grip-test-helpers.mjs';

// Load the production human rig and skin without requesting a GPU or textures.
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
const remainder=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url))),scene=new THREE.Scene();
const character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics;
globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
const materials={};for(const key of ['graphite','steel','chrome','black','accent'])materials[key]=new THREE.MeshStandardMaterial();

const V=p=>new THREE.Vector3(...p),results=[],shapes=[];
for(const kind of ['cycle','trx']){
 const group=new THREE.Group(),program=createEquipmentProgram({kind,metrics,group,materials,geometries:new Set(),extraMaterials:new Set()}),raw=program.sampleCourse({motionId:program.getCourseMotionIds()[0],repPhase:.5,cycleTurns:0,phase:.5,envelope:1,intensity:1}),centers=structuredClone(raw.hands),radius=Number(process.env.FORM_GRIP_RADIUS)||(kind==='cycle'?.033:.025),halfLength=kind==='cycle'?.105:.09,base=structuredClone(raw);delete base.handNormals;delete base.handAdvances;base.handDirections=kind==='cycle'?[[1,0,0],[-1,0,0]]:[[0,1,0],[0,1,0]];
 const frames=[0,1].map(i=>{const f=solveHandContactFrame(metrics,base,i);if(kind==='cycle'){f.axis=base.handDirections[i];const a=V(f.advance);a.x=0;f.advance=a.normalize().toArray();}return f;}),normals=frames.map((f,i)=>V(f.advance).cross(V(f.axis)).normalize().multiplyScalar(i?1:-1)),candidates=[],verified=[];let bestDepth=Infinity,best=null;
 for(const relaxed of [true,false])for(const grip of [0,.05,.10,.15,.20,.25,.30,.4,.6,1]){
  const p=structuredClone(base);p.relaxedHands=relaxed;p.handGripStrength=[grip,grip];p.handDirections=frames.map(f=>f.axis);p.handAdvances=frames.map(f=>f.advance);character.pose(p);
  const clouds=frames.map((f,i)=>character.getSurfaceSamples({stride:2,parts:[i?'rightHand':'leftHand']}).map(s=>{const v=V(s.position).sub(V(centers[i]));return{axial:v.dot(V(f.axis)),normal:v.dot(normals[i]),advance:v.dot(V(f.advance))};}).filter(v=>Math.abs(v.axial)<=halfLength));
  if((!relaxed&&(grip===0||grip===.3))||(relaxed&&grip===0))shapes.push({kind,relaxed,grip,radius,clouds,diagnostics:character.getHandDiagnostics(),metrics:metrics.arms.map(a=>({side:a.anatomicalSide,palmOffset:a.palmOffset,palmLength:a.palmLength}))});
  if(process.env.FORM_SHAPES==='1')continue;
  for(let ni=-15;ni<=15;ni++)for(let di=-15;di<=15;di++){
   const normal=ni*.006,advance=di*.006;if(Math.hypot(normal,advance)>radius+.030)continue;const checks=clouds.map(cloud=>{let count=0,maxDepth=0,minGap=Infinity;for(const v of cloud){const radial=Math.hypot(v.normal-normal,v.advance+advance),depth=Math.min(radius-radial,halfLength-Math.abs(v.axial));minGap=Math.min(minGap,radial-radius);if(depth>.001){count++;maxDepth=Math.max(maxDepth,depth);}}return{count,maxDepth,minGap};}),depth=Math.max(...checks.map(c=>c.maxDepth));
   if(depth<bestDepth){bestDepth=depth;best={relaxed,grip,normal,advance,checks};}if(checks.every(c=>c.count===0&&c.minGap<=.006))candidates.push({relaxed,grip,normal,advance,checks,score:Math.hypot(normal,advance)+Math.max(...checks.map(c=>Math.abs(c.minGap)))*2});
  }
 }
 candidates.sort((a,b)=>a.score-b.score);
 for(const c of candidates.slice(0,30)){
  const p=structuredClone(base);p.relaxedHands=c.relaxed;p.handGripStrength=[c.grip,c.grip];p.handDirections=frames.map(f=>f.axis);p.handAdvances=frames.map(f=>f.advance);p.hands=frames.map((f,i)=>V(centers[i]).addScaledVector(normals[i],-c.normal).addScaledVector(V(f.advance),c.advance).toArray());character.pose(p);const checks=frames.map((f,i)=>cylinderHandMeasure(character.getSurfaceSamples({stride:1,parts:[i?'rightHand':'leftHand']}),{center:centers[i],axis:f.axis,halfLength,radius}));verified.push({...c,checks,wrist:Math.max(...[0,1].map(i=>solveHandContactFrame(metrics,p,i).wristBendRadians))});
 }
 const result={kind,radius,bestDepth,best,candidateCount:candidates.length,verified};results.push(result);console.log(JSON.stringify(result));
}
writeFileSync('artifacts/equipment-grip-analytic-search.json',JSON.stringify({results},null,2));
writeFileSync('artifacts/equipment-grip-shapes.json',JSON.stringify({shapes},null,2));


