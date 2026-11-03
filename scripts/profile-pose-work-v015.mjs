// CPU call-count diagnosis only. This is not a game-frame benchmark or FPS.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPreparationFixture} from './preparation-fixture-v013.mjs';
const fixture=await createPreparationFixture(),{THREE,character,rig}=fixture;
let active=false,counts={};const restorers=[];
for(const [owner,methods]of [[THREE.Object3D,['updateMatrix','updateMatrixWorld','updateWorldMatrix','getWorldPosition','getWorldQuaternion','localToWorld','worldToLocal']],[THREE.Matrix4,['multiplyMatrices','invert','decompose']]])for(const name of methods){
 const original=owner.prototype[name],key=`${owner.name}.${name}`;
 owner.prototype[name]=function(...args){if(active)counts[key]=(counts[key]||0)+1;return original.apply(this,args);};
 restorers.push(()=>owner.prototype[name]=original);
}
const results=[];
try{
 for(const id of ['dumbbell-curl','dumbbell-bench-press','dumbbell-single-arm-row']){
  const pose=rig.sample(id,.37,.37);counts={};active=true;character.pose(pose);active=false;
  let boneCount=0,totalObjects=0;character.group.traverse(object=>{totalObjects++;if(object.isBone)boneCount++;});
  results.push({id,boneCount,totalObjects,onePoseCalls:counts,contactMaxError:character.getContactPoints().maxReachError});
 }
}finally{active=false;for(const restore of restorers)restore();character.dispose();}
const sourceHashes=Object.fromEntries(['src/skinned-character.js','scripts/profile-pose-work-v015.mjs'].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
mkdirSync('artifacts/performance-v015/profile',{recursive:true});const report={scope:'Instrumented Object3D/Matrix4 call counts during one actual GLB pose. Not RAF timing, displayed FPS, GPU work or motion validity certification.',sourceHashes,results};
writeFileSync('artifacts/performance-v015/profile/pose-call-counts.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
