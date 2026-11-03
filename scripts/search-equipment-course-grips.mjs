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

const V=p=>new THREE.Vector3(...p),results=[];
for(const kind of ['cycle','trx']){
  const group=new THREE.Group(),program=createEquipmentProgram({kind,metrics,group,materials,geometries:new Set(),extraMaterials:new Set()}),raw=program.sampleCourse({motionId:program.getCourseMotionIds()[0],repPhase:.5,cycleTurns:0,phase:.5,envelope:1,intensity:1}),centers=structuredClone(raw.hands),radius=kind==='cycle'?.033:.025,base=structuredClone(raw);delete base.handNormals;delete base.handAdvances;base.handDirections=kind==='cycle'?[[1,0,0],[-1,0,0]]:[[0,1,0],[0,1,0]];const frames=[0,1].map(i=>{const f=solveHandContactFrame(metrics,base,i);if(kind==='cycle'){f.axis=base.handDirections[i];const a=V(f.advance);a.x=0;f.advance=a.normalize().toArray();}return f;}),candidates=[],nearest=[],perSide=[[],[]];
  for(const relaxed of [true,false])for(const grip of [0,.05,.10,.15,.20,.25,.30])for(const normal of [radius,radius+.002,radius+.004,radius+.006,radius+.008,radius+.010,radius+.012,radius+.016,radius+.020])for(const advance of [-.030,-.025,-.020,-.015,-.010,-.005,0,.005,.010]){
    const p=structuredClone(base);p.relaxedHands=relaxed;p.handGripStrength=[grip,grip];p.handDirections=frames.map(f=>f.axis);p.handAdvances=frames.map(f=>f.advance);p.hands=frames.map((f,i)=>{const n=V(f.advance).cross(V(f.axis)).normalize().multiplyScalar(i?1:-1);return V(centers[i]).addScaledVector(n,-normal).addScaledVector(V(f.advance),advance).toArray();});character.pose(p);const checks=frames.map((f,i)=>cylinderHandMeasure(character.getSurfaceSamples({stride:2,parts:[i?'rightHand':'leftHand']}),{center:centers[i],axis:f.axis,halfLength:kind==='cycle'?.105:.09,radius}));
    const entry={relaxed,grip,normal,advance,checks,score:Math.max(...checks.map(c=>c.maxDepth))*100+Math.max(...checks.map(c=>Math.abs(c.minGap)))};nearest.push(entry);for(let i=0;i<2;i++)if(checks[i].count===0)perSide[i].push(entry);
    if(checks.every(m=>m.count===0&&m.minGap<=.010&&m.minGap>=-.001)){const wrist=Math.max(...[0,1].map(i=>solveHandContactFrame(metrics,p,i).wristBendRadians));candidates.push({relaxed,grip,normal,advance,checks,wrist,score:Math.abs(normal-radius)+Math.abs(advance)*.3+wrist*.002+(relaxed?0:.002)});}
  }
  candidates.sort((a,b)=>a.score-b.score);nearest.sort((a,b)=>a.score-b.score);const result={kind,radius,candidateCount:candidates.length,best:candidates.slice(0,12),nearest:nearest.slice(0,5),perSideCounts:perSide.map(s=>s.length)};results.push(result);console.log(JSON.stringify(result));
}
writeFileSync('artifacts/equipment-grip-search.json',JSON.stringify({results},null,2));


