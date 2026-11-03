import {createBenchFixtureV011} from './bench-fixture-v011.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const {THREE,rig,character}=await createBenchFixtureV011(),id='dumbbell-bench-press',results=[],files=['src/incline-bench.js','src/dumbbell-lifecycle-paths.js','src/extended-rig.js','src/rig-lifecycle.js','src/skinned-character.js','public/models/athlete/athlete.glb'],hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),hashes=Object.fromEntries(files.map(p=>[p,hash(p)]));
for(let angle=0;angle<=45;angle++){
 rig.end({keepVisible:false});rig.setEquipmentSettings(id,{benchAngle:angle});rig.prepare(id);const meta=rig.getLifecycle(id);let seconds=0;for(const stage of meta.stages){seconds+=stage.duration;if(stage.label==='啞鈴先穩放大腿上')break;}
 character.pose(rig.sampleLifecycle(id,'enter',seconds/meta.entryDuration).pose);const root=rig.getVisualRoot(id);root.updateMatrixWorld(true);const inv=root.matrixWorld.clone().invert(),skin=character.getSurfaceSamples({stride:1,parts:['leftThigh','rightThigh']}),plates=[];
 root.traverse(mesh=>{const p=mesh.geometry?.parameters;if(!mesh.isMesh||mesh.geometry.type!=='CylinderGeometry'||Math.abs((p.radiusTop??0)-.115)>1e-7)return;const center=mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv),axis=new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld).transformDirection(inv),scale=mesh.getWorldScale(new THREE.Vector3());plates.push({center,axis,radius:p.radiusTop*Math.max(scale.x,scale.z),halfLength:p.height*scale.y/2});});
 const r={angle,maxActualMetalDepth:0,capGaps:[],skinSamples:skin.length};
 for(const side of [0,1]){
  const same=plates.filter(p=>(p.center.x>0)===(side===1)),lower=same.reduce((a,b)=>a.center.y<b.center.y?a:b),samples=skin.filter(s=>s.part===(side?'rightThigh':'leftThigh'));let maxY=-Infinity;
  for(const sample of samples)for(const plate of same){const d=new THREE.Vector3(...sample.position).sub(plate.center),along=d.dot(plate.axis),radial=d.addScaledVector(plate.axis,-along).length(),depth=Math.min(plate.radius-radial,plate.halfLength-Math.abs(along));r.maxActualMetalDepth=Math.max(r.maxActualMetalDepth,depth);if(plate===lower&&radial<=plate.radius)maxY=Math.max(maxY,sample.position[1]);}
  r.capGaps.push(lower.center.y-lower.halfLength-maxY);
 }
 r.pass=r.maxActualMetalDepth<=.004&&r.capGaps.every(g=>g>=-.004&&g<.012);results.push(r);
}
const changedSources=files.filter(p=>hash(p)!==hashes[p]),pass=results.every(r=>r.pass)&&!changedSources.length;
writeFileSync('artifacts/v011-bench-thigh-contact.json',JSON.stringify({pass,hashes,changedSources,scope:'All 46 angles at the supported seated stage, every logical thigh skin vertex against the true lower/upper weight plate cylinders. A negative bottom-cap gap at the outer circular edge is distinct from actual cylinder penetration depth, which is also reported. The unchanged non-hand metal tolerance is 4mm; hand metal remains independently limited to 1mm. No cloth-pressure or clinical load model.',results},null,2));console.log(JSON.stringify({pass,changedSources,maxActualMetalDepth:Math.max(...results.map(r=>r.maxActualMetalDepth)),minCapGap:Math.min(...results.flatMap(r=>r.capGaps)),flat:results[0]}));character.dispose();if(!pass)process.exitCode=1;
