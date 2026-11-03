import * as THREE from 'three';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {facilityStations} from '../src/gym-layout.js';
import {createGymArchitecture} from '../src/gym-architecture.js';
import {createGroupClassSystem} from '../src/classes/group-class-system.js';
import {groupClassDefinitions} from '../src/classes/class-data.js';
import {createSkinnedCharacterFromModel} from '../src/skinned-character.js';
import {coursePlanFor,courseTimelineAt} from '../src/classes/class-timeline.js';
import {createHash} from 'node:crypto';

// Canvas drawing is irrelevant to CPU navigation/skin tests. Production geometry,
// collider dimensions, facility state and the real human skeleton are retained.
const noop=()=>{};
globalThis.document={createElement(){return {width:1,height:1,getContext(){return new Proxy({}, {get:(target,key)=>target[key]||noop,set:(target,key,value)=>(target[key]=value,true)});}};}};
const scene=new THREE.Scene(),geometries=new Set(),extraMaterials=new Set(),textures=new Set(),colliders=[];
const materials=Object.fromEntries(['rubber','rubberAlt','graphite','steel','chrome','pad','accent','cream','wood','black','white','grass','glass','light'].map(key=>[key,new THREE.MeshStandardMaterial()]));
const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{geometries.add(geometry);const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);parent.add(object);return object;};
const box=(parent,x,y,z,w,h,d,material)=>mesh(parent,new THREE.BoxGeometry(w,h,d),material,x,y,z);
const cylinder=(parent,x,y,z,r,h,material,sides=12)=>mesh(parent,new THREE.CylinderGeometry(r,r,h,sides),material,x,y,z);
const sphere=(parent,x,y,z,r,material)=>mesh(parent,new THREE.SphereGeometry(r,10,8),material,x,y,z);
const rod=(parent,a,b,r=.05,material=materials.graphite)=>{const object=cylinder(parent,0,0,0,r,1,material),av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),direction=bv.sub(av);object.position.copy(av).addScaledVector(direction,.5);object.scale.y=direction.length();object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;};
const label=(parent,text,x,y,z)=>{const object=new THREE.Group();object.position.set(x,y,z);parent.add(object);return object;};
const collider=(x,z,w,d,padding=0)=>{const record={x,z,hx:w/2+padding,hz:d/2+padding};colliders.push(record);return record;};
const architecture=createGymArchitecture({THREE,scene,materials,geometries,extraMaterials,textures,box,cylinder,sphere,rod,label,collider,plant:noop,dumbbell:parent=>{const group=new THREE.Group();parent.add(group);return group;}});
const source=readFileSync(new URL('../public/models/athlete/athlete.glb',import.meta.url));
const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
for(const material of json.materials||[]){material.pbrMetallicRoughness={baseColorFactor:material.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1]};delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;delete material.extensions;}
delete json.images;delete json.textures;delete json.samplers;
let jsonBytes=Buffer.from(JSON.stringify(json));if(jsonBytes.length%4)jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc(4-jsonBytes.length%4,32)]);
const remaining=source.subarray(20+jsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+jsonBytes.length+remaining.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binary=Buffer.concat([header,jsonBytes,remaining]),gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const metadata=JSON.parse(readFileSync(new URL('../public/models/athlete/rig.json',import.meta.url)));
const character=createSkinnedCharacterFromModel({THREE,scene,model:gltf.scene,metadata,geometries,extraMaterials,textures}),metrics=character.getAssetInfo().metrics;

const station=facilityStations.find(s=>s.id==='group-class'),system=createGroupClassSystem({THREE,scene,metrics,materials,geometries,extraMaterials,architecture,station});

// Boundary continuity is separate from finite-speed movement. The first window
// approaches the C0 limit; the second describes ordinary movement over 100 ms.
const diagnostic=process.argv.includes('--diagnostic');
const selectedKind=process.argv.find(arg=>arg.startsWith('--kind='))?.slice(7);
if(selectedKind&&!diagnostic)throw new Error('A filtered run is diagnostic only; use --diagnostic --kind=barbell');
const epsilonSeconds=.0001,normalHalfWindowSeconds=.05,c0ToleranceMetres=.0005;
const checkedSources=[
  'scripts/qualify-course-boundaries.mjs',
  'src/classes/course-plans.js','src/classes/class-timeline.js','src/classes/class-data.js',
  'src/classes/group-class-system.js','src/classes/floor-programs.js','src/classes/equipment-programs.js','src/classes/warmup-program.js',
  'src/skinned-character.js','src/hand-contact-frame.js','src/locomotion.js',
  'src/equipment.js',
  'src/gym-architecture.js','src/gym-layout.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json',
];
const hashes=()=>Object.fromEntries(checkedSources.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const sourceHashes=hashes(),distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
const torsoBones=Object.fromEntries(['hips','spine','chest','neck','head'].map(key=>{
  const name=metadata.semanticBones[key],bone=character.group.getObjectByName(name);
  if(!bone?.isBone)throw new Error(`Missing actual torso bone ${key}: ${name}`);
  return[key,bone];
}));
const sampleKey=sample=>`${sample.mesh}:${sample.vertex}`;
function snapshot(definition,seconds){
  const frame=courseTimelineAt(definition.classKind,seconds),pose=system.sample(definition.id,frame.phase);
  character.pose(pose);const contacts=character.getContactPoints(),joints={};
  for(const key of ['hands','feet','shoulders','elbows','wrists','hips','knees','ankles'])for(let side=0;side<2;side++)joints[`${key}.${side}`]=[...contacts[key][side]];
  for(const [key,bone]of Object.entries(torsoBones))joints[`torso.${key}`]=character.group.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).toArray();
  const hands=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']});
  if(!hands.length)throw new Error(`No actual hand skin vertices: ${definition.id}`);
  const handMap=new Map(hands.map(sample=>[sampleKey(sample),sample]));if(handMap.size!==hands.length)throw new Error('Hand vertex identities are not unique');
  return{
    seconds,joints,hands:handMap,maxReachError:contacts.maxReachError,
    input:{blockId:frame.block.id,motionId:frame.motionId,previousMotionId:frame.previousBlock?.motionId||null,nextMotionId:frame.nextBlock?.motionId||null,
      handGripStrength:pose.handGripStrength,handGripping:pose.handGripping,relaxedHands:pose.relaxedHands,
      handDirections:pose.handDirections,handAdvances:pose.handAdvances,hip:pose.hip,contacts:system.getPoseContacts(definition.id)},
  };
}
function compare(before,after){
  let worstJoint=null,worstHandVertex=null;const jointDeltas={};
  for(const [key,point]of Object.entries(before.joints)){
    const delta=distance(point,after.joints[key]);jointDeltas[key]=delta;
    if(!worstJoint||delta>worstJoint.delta)worstJoint={joint:key,delta,before:point,after:after.joints[key]};
  }
  if(before.hands.size!==after.hands.size)throw new Error('Hand vertex coverage changed across a boundary');
  for(const [key,sample]of before.hands){
    const next=after.hands.get(key);if(!next)throw new Error(`Missing matching hand vertex ${key}`);
    const delta=distance(sample.position,next.position);
    if(!worstHandVertex||delta>worstHandVertex.delta)worstHandVertex={mesh:sample.mesh,vertex:sample.vertex,part:sample.part,delta,before:sample.position,after:next.position};
  }
  const seconds=after.seconds-before.seconds;
  return{seconds,jointDeltas,maxJointDelta:worstJoint?.delta||0,maxHandSkinDelta:worstHandVertex?.delta||0,worstJoint,worstHandVertex,
    handVertices:before.hands.size,meanJointChordSpeedMps:(worstJoint?.delta||0)/seconds,meanHandSkinChordSpeedMps:(worstHandVertex?.delta||0)/seconds,
    beforeInput:before.input,afterInput:after.input,maxReachError:Math.max(before.maxReachError,after.maxReachError)};
}

const results=[],flags=[];
let expectedBoundaries=0,worstJoint=null,worstHandSkin=null,worstNormalJoint=null,worstNormalSkin=null,poses=0,handVertexComparisons=0;
for(const definition of groupClassDefinitions){
  if(selectedKind&&definition.classKind!==selectedKind)continue;
  const plan=coursePlanFor(definition.classKind);expectedBoundaries+=plan.blocks.length-1;
  system.prepare(definition.id);system.begin(definition.id);
  const course={id:definition.id,kind:definition.classKind,duration:plan.duration,blocks:plan.blocks.length,boundaries:[]};
  for(let index=1;index<plan.blocks.length;index++){
    const previous=plan.blocks[index-1],next=plan.blocks[index],seconds=next.startSeconds;
    const boundary={index,seconds,from:{id:previous.id,label:previous.label,motionId:previous.motionId},to:{id:next.id,label:next.label,motionId:next.motionId}};
    boundary.c0=compare(snapshot(definition,seconds-epsilonSeconds),snapshot(definition,seconds+epsilonSeconds));
    boundary.normal100ms=compare(snapshot(definition,seconds-normalHalfWindowSeconds),snapshot(definition,seconds+normalHalfWindowSeconds));
    poses+=4;handVertexComparisons+=boundary.c0.handVertices+boundary.normal100ms.handVertices;
    const context={courseId:definition.id,index,seconds,from:boundary.from,to:boundary.to};
    for(const [current,kind]of [[boundary.c0,'c0'],[boundary.normal100ms,'normal100ms']]){
      const joint={...context,...current.worstJoint,windowSeconds:current.seconds,meanChordSpeedMps:current.meanJointChordSpeedMps},skin={...context,...current.worstHandVertex,windowSeconds:current.seconds,meanChordSpeedMps:current.meanHandSkinChordSpeedMps};
      if(kind==='c0'){
        if(!worstJoint||joint.delta>worstJoint.delta)worstJoint=joint;
        if(!worstHandSkin||skin.delta>worstHandSkin.delta)worstHandSkin=skin;
      }else{
        if(!worstNormalJoint||joint.delta>worstNormalJoint.delta)worstNormalJoint=joint;
        if(!worstNormalSkin||skin.delta>worstNormalSkin.delta)worstNormalSkin=skin;
      }
    }
    boundary.pass=boundary.c0.maxJointDelta<=c0ToleranceMetres&&boundary.c0.maxHandSkinDelta<=c0ToleranceMetres;
    if(!boundary.pass)flags.push({...context,jointDelta:boundary.c0.maxJointDelta,handSkinDelta:boundary.c0.maxHandSkinDelta});
    course.boundaries.push(boundary);
  }
  results.push(course);console.log(JSON.stringify({id:course.id,boundaries:course.boundaries.length,c0Joint:Math.max(...course.boundaries.map(b=>b.c0.maxJointDelta)),c0HandSkin:Math.max(...course.boundaries.map(b=>b.c0.maxHandSkinDelta)),failures:course.boundaries.filter(b=>!b.pass).length}));
}
if(!results.length)throw new Error(`No courses selected: ${selectedKind}`);
const afterHashes=hashes(),changedSources=checkedSources.filter(path=>sourceHashes[path]!==afterHashes[path]);
const actualBoundaries=results.reduce((sum,course)=>sum+course.boundaries.length,0);
const pass=!flags.length&&!changedSources.length&&actualBoundaries===expectedBoundaries;
const report={pass,diagnostic,createdAt:new Date().toISOString(),node:process.version,
  scope:'Main actor through the production full-course facade; all internal block boundaries. Actual bone positions and every hand skin vertex. No GPU, collision requalification or coaching sign-off.',
  coordinates:'Player-local metres; the fixed classroom placement does not affect displacement magnitudes.',
  epsilonSeconds,normalHalfWindowSeconds,c0ToleranceMetres,handSkinStride:1,normalWindowIsDescriptiveOnly:true,
  sourceHashes,afterHashes,changedSources,totals:{courses:results.length,expectedBoundaries,actualBoundaries,poses,handVertexComparisons},
  worst:{c0Joint:worstJoint,c0HandSkin:worstHandSkin,normal100msJoint:worstNormalJoint,normal100msHandSkin:worstNormalSkin},flags,results};
mkdirSync(new URL('../artifacts',import.meta.url),{recursive:true});
const filename=`full-course-boundary-${diagnostic?'diagnostic':'qualification'}.json`;
writeFileSync(new URL(`../artifacts/${filename}`,import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({file:filename,pass,diagnostic,totals:report.totals,worst:report.worst,flags,changedSources}));
system.dispose?.();character.dispose();if(!pass)process.exitCode=1;
