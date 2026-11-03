import {createPerformanceFixtureV015} from './performance-fixture-v015.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const before=await createPerformanceFixtureV015({baseline:true}),after=await createPerformanceFixtureV015(),{THREE}=before;
let active=false,counts={};const restorers=[];
for(const [owner,methods]of [[THREE.Object3D,['updateMatrix','updateMatrixWorld','updateWorldMatrix','getWorldPosition','getWorldQuaternion','localToWorld','worldToLocal']],[THREE.Matrix4,['multiplyMatrices','invert','decompose']]])for(const name of methods){
 const original=owner.prototype[name],key=`${owner.name}.${name}`;owner.prototype[name]=function(...args){if(active)counts[key]=(counts[key]||0)+1;return original.apply(this,args);};restorers.push(()=>owner.prototype[name]=original);
}
const results=[];
try{for(const id of ['dumbbell-curl','dumbbell-bench-press','dumbbell-single-arm-row']){
 const pose=before.rig.sample(id,.37,.37),row={id};for(const [name,fixture]of [['before',before],['after',after]]){counts={};active=true;fixture.character.pose(pose);active=false;row[name]={calls:counts,maxReachError:fixture.character.getContactPoints().maxReachError};}results.push(row);
}}finally{active=false;for(const restore of restorers)restore();before.character.dispose();after.character.dispose();}
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),paths=['src/skinned-character.js','scripts/compare-pose-work-v015.mjs','scripts/performance-fixture-v015.mjs'];
const report={pass:true,sourceHashes:Object.fromEntries(paths.map(path=>[path,sha(path)])),baselineSourceHashes:{'src/skinned-character.js':sha('.local-tools/v015-before/src/skinned-character.js')},results,scope:'Actual same-pose GLB before/after method-call counts. Instrumentation is disabled during construction and getters. Counts describe CPU work only, not game RAF, GPU work, FPS or biomechanical validity.'};
mkdirSync('artifacts/performance-v015/profile',{recursive:true});writeFileSync('artifacts/performance-v015/profile/pose-call-comparison.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
