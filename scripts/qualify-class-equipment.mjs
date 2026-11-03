import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentProgram} from '../src/classes/equipment-programs.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {createMachineLifecycle} from '../src/machine-lifecycle.js';
import {stations} from '../src/data.js';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';

const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let bytes=Buffer.from(JSON.stringify(json));if(bytes.length%4)bytes=Buffer.concat([bytes,Buffer.alloc(4-bytes.length%4,32)]);
const remainder=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+bytes.length+remainder.length,8);header.writeUInt32LE(bytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,bytes,remainder]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const scene=new THREE.Scene(),character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata}),metrics=character.getAssetInfo().metrics;
globalThis.document={createElement:()=>({width:128,height:64,getContext:()=>({fillStyle:'',font:'',textAlign:'',fillText(){}})})};
const materials={};for(const key of ['graphite','steel','chrome','black','accent'])materials[key]=new THREE.MeshStandardMaterial();

const results=[];
for(const kind of ['cycle','trx','aerial']){
 const group=new THREE.Group();scene.add(group);
 const program=createEquipmentProgram({THREE,kind,metrics,group,materials,geometries:new Set(),extraMaterials:new Set()});
 for(const mode of ['loop','enter','exit']){
  const result={kind,mode,maxTargetError:0,maxReachError:0,maxActualGripError:0,maxGripAxisError:0,collisions:[],selfCollisions:[],surfaceCollisions:[],surfacePairs:0};
  for(let i=0;i<=100;i++){
   const p=i/100,frame=mode==='loop'?{pose:program.sample(p,p),offset:[0,0,0],rotation:0}:program.sampleLifecycle(mode,p);
   character.pose(frame.pose);const body=character.getContactPoints(),base=transformBody(body,frame),volumes=program.getCollisionVolumes();
   result.maxReachError=Math.max(result.maxReachError,body.maxReachError);
   const contacts=program.getActualContacts(),axes=program.getActualGripAxes();for(let j=0;j<2;j++)if(mode==='loop'||frame.contacts?.hands?.[j]){result.maxActualGripError=Math.max(result.maxActualGripError,Math.hypot(...base.hands[j].map((v,k)=>v-contacts.hands[j][k])));const solved=(await import('../src/hand-contact-frame.js')).solveHandContactFrame(metrics,frame.pose,j),expected=new THREE.Vector3(...solved.axis).applyAxisAngle(new THREE.Vector3(0,1,0),frame.rotation||0);result.maxGripAxisError=Math.max(result.maxGripAxisError,1-Math.abs(expected.dot(new THREE.Vector3(...axes[j]))));}
   for(const field of ['hands','feet'])for(let j=0;j<2;j++){const error=Math.hypot(...body[field][j].map((v,k)=>v-frame.pose[field][j][k]));if(error>result.maxTargetError){result.maxTargetError=error;result.worst={p,field,side:j,pose:frame.pose};}}
   const add=(field,hits)=>{for(const hit of hits)if(!result[field].some(old=>old.bodyPart===hit.bodyPart&&old.volumeId===hit.volumeId))result[field].push({...hit,p});};
   add('collisions',evaluateExerciseClearance(base,volumes).collisions);add('selfCollisions',evaluateSelfClearance(body).collisions);
   if(process.env.FORM_FULL_SURFACE==='1'||i%10===0){const report=evaluateSurfaceClearance(transformSurface(character.getSurfaceSamples({stride:20}),frame),volumes);result.surfacePairs+=report.testedPairs;add('surfaceCollisions',report.collisions);}
  }
  results.push(result);console.log(JSON.stringify({...result,worst:result.maxTargetError>.015?result.worst:undefined}));
 }
}
writeFileSync(new URL('../artifacts/class-equipment-qualification.json',import.meta.url),JSON.stringify({phaseCount:101,surfaceMode:process.env.FORM_FULL_SURFACE==='1'?'every-phase':'11-phases',surfaceStride:20,sources:['https://www.trxtraining.com/pages/quickstart-suspension-trainer','https://www.trxtraining.com/blogs/news/7-simple-moves-to-get-you-started-with-trx','https://spinning.com/pages/getting-started','https://airealyoga.com/'],results},null,2));
if(results.some(r=>r.maxTargetError>.015||r.maxReachError>.015||r.maxActualGripError>.015||r.maxGripAxisError>.0001||r.collisions.length||r.selfCollisions.length||r.surfaceCollisions.length))process.exitCode=1;
