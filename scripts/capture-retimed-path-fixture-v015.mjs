import {createPerformanceFixtureV015} from './performance-fixture-v015.mjs';
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const before=await createPerformanceFixtureV015({baseline:true}),{THREE,rig}=before,phases=JSON.parse(readFileSync('tests/fixtures/legacy-rig-v011.json','utf8')).phases;
const source='.local-tools/v015-before/src/extended-rig.js',sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
if(!readFileSync(source,'utf8').includes('const effort=p=>p<=.44?ease(p/.44):1-ease((p-.44)/.56);'))throw Error('Archive effort changed');
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);},effort=p=>p<=.44?smooth(p/.44):1-smooth((p-.44)/.56);
function props(id){const root=rig.getVisualRoot(id);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),out=[];root.traverse(object=>{if(object.isMesh){matrix.multiplyMatrices(inverse,object.matrixWorld);out.push({geometry:object.geometry.type,parameters:object.geometry.parameters,matrix:matrix.toArray()});}});return out;}
const motions=Object.fromEntries(['dumbbell-shoulder-press','dumbbell-goblet-squat'].map(id=>[id,phases.map(phase=>{const pose=rig.sample(id,phase,phase);return{phase,effort:effort(phase),pose:JSON.parse(JSON.stringify(pose)),props:props(id)};})]));
const report={version:1,sourceVersion:'0.14.0',source:{path:'src/extended-rig.js',sha256:sha(source)},description:'Actual archived authored poses and physical gear. Timing may change, this path must remain within 1e-9.',motions};
writeFileSync('tests/fixtures/retimed-path-v015.json',JSON.stringify(report,null,2)+'\n');before.character.dispose();console.log(JSON.stringify({pass:true,motions:Object.keys(motions),samples:phases.length*2,sourceSHA256:report.source.sha256}));
