import {THREE,character,rig} from './dumbbell-test-helpers.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const results=[];
for(const angle of [0,30]){
 rig.end({keepVisible:false});rig.setEquipmentSettings('dumbbell-bench-press',{benchAngle:angle});rig.prepare('dumbbell-bench-press');let minimum=Infinity,maximum=-Infinity,vertices=0;
 for(let i=0;i<=100;i++){
  character.pose(rig.sample('dumbbell-bench-press',i/100));const volume=rig.getCollisionVolumes('dumbbell-bench-press').find(v=>v.id==='bench-pad'),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(volume.rotation||[0,0,0]))).invert();let closest=Infinity;
  for(const sample of character.getSurfaceSamples({stride:1,parts:['torso','head']})){const p=new THREE.Vector3(...sample.position).sub(new THREE.Vector3(...volume.position)).applyQuaternion(q);if(Math.abs(p.x)<volume.size[0]/2-.015&&Math.abs(p.z)<volume.size[2]/2-.015){closest=Math.min(closest,p.y-volume.size[1]/2);vertices++;}}
  minimum=Math.min(minimum,closest);maximum=Math.max(maximum,closest);
 }
 results.push({angle,phases:101,taggedVerticesTested:vertices,minimumBackSurfaceGap:minimum,maximumBackSurfaceGap:maximum});
}
const maxDifference=Math.max(Math.abs(results[1].minimumBackSurfaceGap-results[0].minimumBackSurfaceGap),Math.abs(results[1].maximumBackSurfaceGap-results[0].maximumBackSurfaceGap)),pass=results.every(r=>r.minimumBackSurfaceGap>=-.001&&r.maximumBackSurfaceGap<.006)&&maxDifference<.000001;
const files=['src/incline-bench.js','src/rig-lifecycle.js','src/dumbbell-lifecycle-paths.js','src/extended-rig.js','src/dumbbell-grip.js','public/models/athlete/athlete.glb'],sourceHashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
writeFileSync('artifacts/v09-bench-back-support-qualification.json',JSON.stringify({pass,maxDifference,sourceHashes,scope:'True torso/head skin vertices against the actual back-pad oriented top plane, 101 loop phases for flat and incline. Existing contact exemptions do not replace this measurement. This tests support distance, not real-world load safety or continuous coaching suitability.',results},null,2));console.log(JSON.stringify({pass,maxDifference,results}));character.dispose();if(!pass)process.exitCode=1;
