import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {createEquipmentSystem} from '../src/equipment.js';
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
const types=new Set(['chestPress','latPulldown','seatedRow','legPress','legExtension','shoulderPress','cableFly','squat','benchPress','dumbbellCurl','treadmill','bike','plateInclinePress','plateHighRow','plateShoulderPress','hackSquat','hipThrust','calfRaise','smithSquat','legCurl','pecDeck','lateralRaise','elliptical','rower','stairClimber']);
const {machines}=createEquipmentSystem({THREE,scene,stations:stations.filter(station=>types.has(station.type)),materials,characterMetrics:metrics,geometries:new Set(),extraMaterials:new Set(),textures:new Set(),collider(){}});
const selected=[],seen=new Set();for(const machine of machines.values()){if(machine.type==='dumbbellCurl')continue;if(process.env.FORM_MACHINE_TYPE&&!process.env.FORM_MACHINE_TYPE.split(',').includes(machine.type))continue;if(!process.env.FORM_ALL_INSTANCES&&seen.has(machine.type))continue;seen.add(machine.type);selected.push(machine);}
const phaseCount=Number(process.env.FORM_PHASE_COUNT||101),results=[],up=new THREE.Vector3(0,1,0),v=p=>new THREE.Vector3(...p);
const transform=(p,frame)=>v(p).applyAxisAngle(up,frame.rotation||0).add(v(frame.offset||[0,0,0])).toArray();
function recordIssue(array,item,details){const key=old=>old.bodyPart===item.bodyPart&&old.volumeId===item.volumeId&&old.stage===details.stage;const existing=array.find(key);if(!existing)array.push({...item,...details});else if(item.depth>existing.depth)Object.assign(existing,item,details);}
for(const machine of selected){
  const lifecycle=createMachineLifecycle({THREE,machine,metrics}),result={id:machine.station.id,type:machine.type,gate:lifecycle.gateOffset,restPhase:lifecycle.restPhase,maxReachError:0,maxContactError:0,maxBoneDeviation:0,maxFootPlantSlide:0,proxyCollisions:[],surfaceCollisions:[],selfCollisions:[],samples:[]};
  let originalLengths=null;
  for(const direction of ['exit','enter']){
    let previous=null;
    for(let index=0;index<phaseCount;index++){
      const u=index/(phaseCount-1),frame=lifecycle.sample(direction,u);character.pose(frame.pose);
      const local=character.getContactPoints(),body={maxReachError:local.maxReachError};
      for(const key of ['hands','feet','shoulders','elbows','wrists','hips','knees','ankles'])body[key]=local[key].map(p=>transform(p,frame));
      const details={direction,u,stage:frame.stage};
      if(local.maxReachError>result.maxReachError){result.maxReachError=local.maxReachError;result.worstReach={...details,pose:frame.pose,offset:frame.offset,rotation:frame.rotation};}
      for(const key of ['hands','feet'])for(let side=0;side<2;side++)result.maxContactError=Math.max(result.maxContactError,v(local[key][side]).distanceTo(v(frame.pose[key][side])));
      const lengths=[...local.shoulders.map((p,i)=>v(p).distanceTo(v(local.elbows[i]))),...local.elbows.map((p,i)=>v(p).distanceTo(v(local.wrists[i]))),...local.hips.map((p,i)=>v(p).distanceTo(v(local.knees[i]))),...local.knees.map((p,i)=>v(p).distanceTo(v(local.ankles[i])))];if(!originalLengths)originalLengths=lengths;lengths.forEach((value,i)=>result.maxBoneDeviation=Math.max(result.maxBoneDeviation,Math.abs(value-originalLengths[i])));
      for(let side=0;side<2;side++)if(previous&&frame.contacts?.feet[side]&&previous.contacts?.feet[side])result.maxFootPlantSlide=Math.max(result.maxFootPlantSlide,v(body.feet[side]).distanceTo(v(previous.feet[side])));
      previous={contacts:frame.contacts,feet:body.feet};
      const volumes=machine.getCollisionVolumes(),proxy=evaluateExerciseClearance(body,volumes),self=evaluateSelfClearance(body);
      if(process.env.FORM_DEBUG_VOLUMES&&!result.volumeReference)result.volumeReference=volumes;
      for(const issue of proxy.collisions)recordIssue(result.proxyCollisions,issue,details);
      for(const issue of self.collisions)recordIssue(result.selfCollisions,issue,details);
      if(process.env.FORM_SURFACE==='1'&&index%Number(process.env.FORM_SURFACE_EVERY||10)===0){
        const samples=character.getSurfaceSamples({stride:Number(process.env.FORM_SURFACE_STRIDE||32)}).map(sample=>({...sample,position:transform(sample.position,frame)})),surface=evaluateSurfaceClearance(samples,volumes);
        result.surfaceTestedPairs=(result.surfaceTestedPairs||0)+surface.testedPairs;
        for(const issue of surface.collisions)recordIssue(result.surfaceCollisions,issue,details);
      }
      result.samples.push({...details,reachError:local.maxReachError,proxyCount:proxy.collisions.length});
    }
  }
  results.push(result);
}
const filename=new URL(`../artifacts/${process.env.FORM_REPORT_NAME||'machine-lifecycle-qualification.json'}`,import.meta.url);writeFileSync(filename,JSON.stringify({phaseCount,results},null,2));
console.log(JSON.stringify(results.map(result=>({id:result.id,type:result.type,reach:result.maxReachError,plant:result.maxFootPlantSlide,proxy:result.proxyCollisions.length,surface:result.surfaceCollisions.length,self:result.selfCollisions.length,worst:result.worstReach?.stage})),null,2));
if(results.some(result=>result.maxReachError>.015||result.maxContactError>.015||result.maxBoneDeviation>1e-5||result.maxFootPlantSlide>.01||result.proxyCollisions.length||result.surfaceCollisions.length||result.selfCollisions.length))process.exitCode=1;
character.dispose();
