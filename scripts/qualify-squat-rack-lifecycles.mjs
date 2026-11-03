import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
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

const count=Number(process.env.FORM_PHASE_COUNT||101),results=[],v=p=>new THREE.Vector3(...p);
const sourceFiles=['src/equipment.js','src/machine-lifecycle.js','src/barbell-lifecycle-paths.js','src/hand-contact-frame.js','src/skinned-character.js','src/npc-world-matrices-v019.js'],hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),sourceHashes=hashes();
function segmentDistance(a,b,c,d){const p=v(a),q=v(c),u=v(b).sub(p),w=v(d).sub(q),r=p.clone().sub(q),A=u.dot(u),B=u.dot(w),C=w.dot(w),D=u.dot(r),E=w.dot(r),den=A*C-B*B;let s=den>1e-12?Math.max(0,Math.min(1,(B*E-C*D)/den)):0,t=C>1e-12?(B*s+E)/C:0;if(t<0){t=0;s=Math.max(0,Math.min(1,-D/A));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(B-D)/A));}return p.addScaledVector(u,s).distanceTo(q.addScaledVector(w,t));}
const hits=(items,issue,frame)=>{const found=items.find(h=>h.bodyPart===issue.bodyPart&&h.volumeId===issue.volumeId);if(!found)items.push({...issue,...frame});else if(issue.depth>found.depth)Object.assign(found,issue,frame);};
for(const machine of machines.values())if(['squat','smithSquat'].includes(machine.type)&&(!process.env.FORM_MACHINE_TYPE||process.env.FORM_MACHINE_TYPE.split(',').includes(machine.type))){
 const lifecycle=createMachineLifecycle({THREE,machine,metrics});
 for(const mode of ['loop','enter','exit']){
  const r={type:machine.type,mode,phases:count,skinPairs:0,strictShoePairs:0,handVertices:0,headVertices:0,maxReach:0,maxTarget:0,maxGripTarget:0,maxBoneDeviation:0,maxJointStep:0,maxHandDepth:0,maxHeldHandGap:0,maxHeadDepth:0,minHeadClearance:Infinity,maxTorsoDepth:0,maxBackGap:0,minSoleFloor:Infinity,maxPlantedSoleGap:0,minHookPegGap:Infinity,maxEngagedHookGap:0,maxRackSeatGap:0,minRackSeatGap:Infinity,proxy:[],skin:[],self:[],strictShoe:[],stageSamples:[]};
  let previous=null,originalLengths=null,lastStage=null;
  for(let i=0;i<count;i++){
   const u=i/(count-1),frame=mode==='loop'?{pose:machine.sampleActivity(u,u),offset:[0,0,0],rotation:0,stage:'深蹲完整行程',contacts:{hands:[true,true],feet:[true,true]},barSupport:'upper-back'}:lifecycle.sample(mode,u);
   character.pose(frame.pose);const body=character.getContactPoints(),volumes=machine.getCollisionVolumes(),rack=machine.getRackSetup(),bar=rack.barPosition,targets=machine.getActualContacts();
   const details={u,stage:frame.stage};
   if(machine.type==='squat'&&Math.abs(bar[1]-rack.rackBarPosition[1])<1e-8&&Math.abs(bar[2]-rack.rackBarPosition[2])<1e-8)for(const y of rack.freeSeatY){const gap=bar[1]-rack.barRadius-y;r.maxRackSeatGap=Math.max(r.maxRackSeatGap,gap);r.minRackSeatGap=Math.min(r.minRackSeatGap,gap);}
   if(machine.type==='smithSquat'){
    let gap=Infinity;for(const hook of rack.movingHooks)for(const peg of rack.fixedPegs)gap=Math.min(gap,segmentDistance(hook.start,hook.end,peg.start,peg.end)-hook.radius-peg.radius);
    if(gap<r.minHookPegGap){r.minHookPegGap=gap;r.worstHookPeg={...details,angle:rack.hookAngle,bar:[...bar]};}
    if(Math.abs(rack.hookAngle)<1e-8&&Math.abs(bar[1]-rack.rackBarPosition[1])<1e-8)r.maxEngagedHookGap=Math.max(r.maxEngagedHookGap,gap);
   }
   if(body.maxReachError>r.maxReach){r.maxReach=body.maxReachError;r.worstReach={...details,pose:frame.pose};}
   for(const key of ['hands','feet'])for(const side of [0,1])r.maxTarget=Math.max(r.maxTarget,v(body[key][side]).distanceTo(v(frame.pose[key][side])));
   for(const side of [0,1])if(frame.contacts.hands[side])r.maxGripTarget=Math.max(r.maxGripTarget,v(body.hands[side]).distanceTo(v(targets.hands[side])));
   const lengths=[...body.shoulders.map((p,i)=>v(p).distanceTo(v(body.elbows[i]))),...body.elbows.map((p,i)=>v(p).distanceTo(v(body.wrists[i]))),...body.hips.map((p,i)=>v(p).distanceTo(v(body.knees[i]))),...body.knees.map((p,i)=>v(p).distanceTo(v(body.ankles[i])))];if(!originalLengths)originalLengths=lengths;lengths.forEach((length,i)=>r.maxBoneDeviation=Math.max(r.maxBoneDeviation,Math.abs(length-originalLengths[i])));
   if(previous)for(const key of ['hands','feet','elbows','knees'])for(const side of [0,1])r.maxJointStep=Math.max(r.maxJointStep,v(body[key][side]).distanceTo(v(previous[key][side])));previous=structuredClone(body);
   for(const issue of evaluateExerciseClearance(body,volumes).collisions)hits(r.proxy,issue,details);
   for(const issue of evaluateSelfClearance(body).collisions)hits(r.self,issue,details);
   const surface=evaluateSurfaceClearance(character.getSurfaceSamples({stride:20}),volumes);r.skinPairs+=surface.testedPairs;for(const issue of surface.collisions)hits(r.skin,issue,details);
   const shoes=character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),strict=evaluateSurfaceClearance(shoes,volumes.map(p=>({...p,allowedBodyParts:[]})));r.strictShoePairs+=strict.testedPairs;for(const issue of strict.collisions)hits(r.strictShoe,issue,details);
   for(const side of [0,1]){const sole=Math.min(...shoes.filter(p=>p.part===(side?'rightFoot':'leftFoot')).map(p=>p.position[1]));r.minSoleFloor=Math.min(r.minSoleFloor,sole);if(frame.contacts.feet[side])r.maxPlantedSoleGap=Math.max(r.maxPlantedSoleGap,sole);}
   const hands=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']});r.handVertices+=hands.length;
   for(const side of [0,1]){
    const skin=hands.filter(p=>p.part===(side?'rightHand':'leftHand')&&Math.abs(p.position[0])<1.25),nearest=skin.reduce((best,p)=>{const d=Math.hypot(p.position[1]-bar[1],p.position[2]-bar[2]);return !best||d<best.distance?{distance:d,sample:p}:best;},null);
    const depth=Math.max(0,rack.barRadius-nearest.distance);if(depth>r.maxHandDepth){r.maxHandDepth=depth;r.worstHand={...details,side,...nearest,pose:frame.pose};}
    if(frame.contacts.hands[side])r.maxHeldHandGap=Math.max(r.maxHeldHandGap,nearest.distance-rack.barRadius);
   }
   const head=character.getSurfaceSamples({stride:1,parts:['head']});r.headVertices+=head.length;
   for(const p of head){if(Math.abs(p.position[0])>1.25)continue;const clearance=Math.hypot(p.position[1]-bar[1],p.position[2]-bar[2])-rack.barRadius;r.minHeadClearance=Math.min(r.minHeadClearance,clearance);if(-clearance>r.maxHeadDepth){r.maxHeadDepth=-clearance;r.worstHead={...details,sample:p};}}
   const back=character.getSurfaceSamples({stride:1,parts:['torso']}).filter(p=>Math.abs(p.position[0])<.25),nearestBack=Math.min(...back.map(p=>Math.hypot(p.position[1]-bar[1],p.position[2]-bar[2]))),depth=Math.max(0,rack.barRadius-nearestBack);if(depth>r.maxTorsoDepth){r.maxTorsoDepth=depth;r.worstTorso={...details,bar};}if(frame.barSupport==='upper-back')r.maxBackGap=Math.max(r.maxBackGap,nearestBack-rack.barRadius);
   if(lastStage!==frame.stage){r.stageSamples.push({u,label:frame.stage,barSupport:frame.barSupport,bar:[...bar],hip:[...frame.pose.hip],grip:frame.contacts.hands,feet:frame.contacts.feet});lastStage=frame.stage;}
  }
  r.pass=r.maxReach<.001&&r.maxTarget<.001&&r.maxGripTarget<.001&&r.maxBoneDeviation<1e-5&&r.maxHandDepth<=.001&&r.maxHeldHandGap<.003&&r.maxHeadDepth<=.001&&r.maxTorsoDepth<=.002&&r.maxBackGap<.003&&r.minSoleFloor>-.004&&r.maxPlantedSoleGap<.004&&r.minHookPegGap>-.001&&r.maxEngagedHookGap<.002&&r.maxRackSeatGap<.001&&r.minRackSeatGap>-.001&&![r.proxy,r.skin,r.self,r.strictShoe].some(a=>a.length);
  results.push(r);console.log(JSON.stringify({...r,worstHand:undefined,worstReach:undefined,stageSamples:undefined}));
 }
}
const finalHashes=hashes(),changedSources=sourceFiles.filter(p=>sourceHashes[p]!==finalHashes[p]);
const report={pass:results.every(r=>r.pass)&&!changedSources.length,phaseCount:count,sourceHashes,changedSources,modelSHA256:createHash('sha256').update(source).digest('hex'),scope:'Actual athlete GLB, rigid bone lengths, every hand/head/torso/shoe vertex and true physical shaft cylinder. Full-body skin stride20 at every sampled phase; no head/hand cylinder contact exemption. Smith moving-hook versus fixed-peg/brace actual capsules. Ordinary rack squat and Smith only; classroom sources unchanged.',references:['https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/','https://cscca.org/content.aspx?club_id=408309&module_id=731826&page_id=22'],results};
writeFileSync('artifacts/'+(process.env.FORM_REPORT_NAME||'squat-rack-lifecycle-qualification.json'),JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
