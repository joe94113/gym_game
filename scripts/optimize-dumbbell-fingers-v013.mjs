// Offline candidate search against the real deformed GLB hand. This script
// proposes profiles; it does not edit production code or certify a motion.
import {THREE,character as legacyCharacter,metrics,rig} from './dumbbell-test-helpers.mjs';
import {createPreciseFingerActor} from './precise-finger-actor-v013.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const character=process.env.DB_PRECISE_AXES==='1'?await createPreciseFingerActor():legacyCharacter;
const id='dumbbell-bench-press',base=rig.sample(id,.5,.5),fingers=['index','middle','ring','pinky'],side=0,suffix=metrics.arms[side].anatomicalSide;
const center=rig.getVisualRoot(id).children.filter(object=>object.isGroup&&object.children.some(child=>child.geometry?.parameters?.radiusTop===.016))[side].position.clone(),axis=new THREE.Vector3(...base.handDirections[side]).normalize(),advance=new THREE.Vector3(...base.handAdvances[side]).normalize(),normal=new THREE.Vector3().crossVectors(advance,axis).multiplyScalar(side?1:-1).normalize();
const meshes=new Map(),bones=new Map();character.group.traverse(object=>{if(object.isSkinnedMesh)meshes.set(object.name,object);if(object.isBone)bones.set(object.name,object);});
const advanceShift=Number(process.env.DB_ADVANCE_SHIFT||0),normalShift=Number(process.env.DB_NORMAL_SHIFT||0);base.hands[side]=new THREE.Vector3(...base.hands[side]).addScaledVector(advance,advanceShift).addScaledVector(normal,normalShift).toArray();
const zero=structuredClone(base);zero.handFingerFlex=[Object.fromEntries(['thumb',...fingers].map(finger=>[finger,[0,0,0]])),{}];character.pose(zero);
const openSamples=character.getSurfaceSamples({stride:1,parts:['leftHand']}),tags=new Map(),tips=new Map();
for(const sample of openSamples){const mesh=meshes.get(sample.mesh),ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');let best=null,w=-1;for(let k=0;k<4;k++){const weight=weights.array[sample.vertex*4+k],name=mesh.skeleton.bones[ids.array[sample.vertex*4+k]]?.name;if(weight>.001&&weight>w&&/^(thumb|index|middle|ring|pinky)_/.test(name)){w=weight;best=name;}}const match=best?.match(/^(thumb|index|middle|ring|pinky)_0([123])_[lr]$/);if(match)tags.set(`${sample.mesh}:${sample.vertex}`,{finger:match[1],digit:Number(match[2])});}
for(const finger of fingers){const b2=bones.get(`${finger}_02_${suffix}`).getWorldPosition(new THREE.Vector3()),b3=bones.get(`${finger}_03_${suffix}`).getWorldPosition(new THREE.Vector3()),direction=b3.clone().sub(b2).normalize(),selected=openSamples.filter(sample=>{const tag=tags.get(`${sample.mesh}:${sample.vertex}`);return tag?.finger===finger&&tag.digit===3;}).map(sample=>({key:`${sample.mesh}:${sample.vertex}`,along:new THREE.Vector3(...sample.position).sub(b3).dot(direction)})).sort((a,b)=>b.along-a.along);tips.set(finger,new Set(selected.slice(0,Math.max(5,Math.ceil(selected.length*.2))).map(sample=>sample.key)));}
function measure(pose,finger){character.pose(pose);const samples=character.getSurfaceSamples({stride:1,parts:['leftHand']}),tip=new THREE.Vector3();let tipCount=0,maxDepth=0,minGap=Infinity;for(const sample of samples){const key=`${sample.mesh}:${sample.vertex}`,tag=tags.get(key);if(tag&&tag.finger!==finger)continue;const delta=new THREE.Vector3(...sample.position).sub(center),l=delta.dot(axis),a=delta.dot(advance),n=delta.dot(normal),radial=Math.hypot(a,n),depth=Math.min(.016-radial,.19-Math.abs(l));maxDepth=Math.max(maxDepth,depth);minGap=Math.min(minGap,radial-.016);if(tips.get(finger).has(key)){tip.add(new THREE.Vector3(l,a,n));tipCount++;}}tip.multiplyScalar(1/tipCount);return{maxDepth,minGap,tip:tip.toArray(),tipRadius:Math.hypot(tip.y,tip.z)};}
const results=[];
for(const finger of fingers){
 const baseline=measure(base,finger),candidates=[];
 for(const a of [.50,.65,.80,.95,1.10,1.25])for(const b of [.80,1.0,1.2,1.4,1.6])for(const c of [.75,.95,1.15,1.35]){
  if(a+b+c<2.3)continue;
  const pose=structuredClone(base);pose.handFingerFlex[side][finger]=[a,b,c];const result=measure(pose,finger);if(result.maxDepth>.0009)continue;
  const total=a+b+c,angle=Math.atan2(result.tip[2],result.tip[1]);if(result.tip[2]<.006||angle<1.5)continue;
  const cost=Math.abs(result.tipRadius-.023)+Math.abs(angle-1.85)*.006+Math.abs(total-2.8)*.004;
  candidates.push({flex:[a,b,c],...result,total,angle,cost});
 }
 candidates.sort((a,b)=>a.cost-b.cost);results.push({finger,baseline,candidates:candidates.slice(0,8)});console.log(JSON.stringify({finger,baseline,best:candidates[0]}));
}
mkdirSync('artifacts/dumbbell-fingers-v013',{recursive:true});writeFileSync(`artifacts/dumbbell-fingers-v013/candidates-${process.env.DB_PRECISE_AXES==='1'?'precise':'legacy'}-a${advanceShift}-n${normalShift}.json`,JSON.stringify({advanceShift,normalShift,scope:'Offline one-pose candidate search, held-hand skin/shaft safety only. Needs full rigid-metal and lifecycle qualification plus native visual review before acceptance.',results},null,2));character.dispose();if(character!==legacyCharacter)legacyCharacter.dispose();
