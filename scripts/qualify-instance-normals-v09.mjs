import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEquipmentFixture} from './equipment-batching-fixture.mjs';
import {createEquipmentBatcher} from '../src/equipment-batching.js';
import {createMachineLifecycle} from '../src/machine-lifecycle.js';
const f=await createEquipmentFixture(),{THREE,scene,machines,metrics,character}=f,b=createEquipmentBatcher({...f,installRenderHook:false}),phaseCount=101;
const paths=['src/equipment-batching.js','src/equipment.js','src/additional-equipment.js','src/machine-lifecycle.js','src/barbell-lifecycle-paths.js','node_modules/three/src/renderers/shaders/ShaderChunk/defaultnormal_vertex.glsl.js'],sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),sourceHashes=Object.fromEntries(paths.map(p=>[p,sha(p)]));
const im=new THREE.Matrix4(),im3=new THREE.Matrix3(),sourceNormalMatrix=new THREE.Matrix3(),proxyNormalMatrix=new THREE.Matrix3(),a=new THREE.Vector3(),z=new THREE.Vector3(),x=new THREE.Vector3(),y=new THREE.Vector3(),q=new THREE.Vector3(),normal=new THREE.Vector3(),basis=[[1,0,0],[0,1,0],[0,0,1]];
let frames=0,matricesChecked=0,originalRenderMatrices=0,basisNormalsChecked=0,vertexNormalsChecked=0,maxSourceShear=0,maxInstanceShear=0,maxShaderNormalError=0,maxBasisNormalError=0;const flags=[],results=[];
function shear(m){const e=m.elements;x.set(e[0],e[1],e[2]).normalize();y.set(e[4],e[5],e[6]).normalize();q.set(e[8],e[9],e[10]).normalize();return Math.max(Math.abs(x.dot(y)),Math.abs(x.dot(q)),Math.abs(y.dot(q)));}
function actualShaderNormal(n,instanceMatrix,proxyNormalMatrix){
 // Exact CPU transcription of defaultnormal_vertex.glsl.js USE_INSTANCING:
 // transformedNormal /= vec3(dot(im[0],im[0]), ...); im*transformedNormal;
 // then normalMatrix*transformedNormal. No generic inverse-transpose shortcut.
 const e=instanceMatrix.elements,l0=e[0]**2+e[1]**2+e[2]**2,l1=e[4]**2+e[5]**2+e[6]**2,l2=e[8]**2+e[9]**2+e[10]**2;
 return z.set(n.x/l0,n.y/l1,n.z/l2).applyMatrix3(im3).applyMatrix3(proxyNormalMatrix).normalize();
}
for(const machine of machines.values()){
 const ids=machine.station.id==='pec-deck'?['machine-pec-deck','machine-reverse-fly']:[`machine-${machine.station.id}`];
 for(const id of ids){const profile=machine.type==='dumbbellCurl'?null:createMachineLifecycle({THREE,machine,metrics,activityId:id}),r={id,frames:0,maxSourceShear:0,maxInstanceShear:0,maxShaderNormalError:0};
  for(const mode of profile?['loop','enter','exit']:['loop'])for(let i=0;i<phaseCount;i++){
   const p=i/(phaseCount-1);if(mode==='loop')machine.sampleActivity(p,p,id);else profile.sample(mode,p);b.update();
   for(const record of b.getInspectionRecords()){
    if(record.renderMode==='original'&&record.visibleInScene)originalRenderMatrices++;
    if(record.instanceIndex<0)continue;record.proxy.getMatrixAt(record.instanceIndex,im);im3.setFromMatrix4(im);sourceNormalMatrix.getNormalMatrix(record.source.matrixWorld);proxyNormalMatrix.getNormalMatrix(record.proxy.matrixWorld);
    const ss=shear(record.source.matrixWorld),si=shear(im);maxSourceShear=Math.max(maxSourceShear,ss);maxInstanceShear=Math.max(maxInstanceShear,si);r.maxSourceShear=Math.max(r.maxSourceShear,ss);r.maxInstanceShear=Math.max(r.maxInstanceShear,si);matricesChecked++;
    if(ss>1e-6&&flags.length<20)flags.push({id,mode,p,kind:'actual source shear',value:ss});
    for(const n of basis){normal.fromArray(n);a.copy(normal).applyNormalMatrix(sourceNormalMatrix);const error=a.distanceTo(actualShaderNormal(normal,im,proxyNormalMatrix));maxBasisNormalError=Math.max(maxBasisNormalError,error);basisNormalsChecked++;}
    if((i===0||i===50||i===100)&&record.root===(machine.getVisualGroup?.()||machine.group)){
     const normals=record.source.geometry.attributes.normal;if(!normals)continue;for(let v=0;v<normals.count;v++){normal.fromBufferAttribute(normals,v);a.copy(normal).applyNormalMatrix(sourceNormalMatrix);const error=a.distanceTo(actualShaderNormal(normal,im,proxyNormalMatrix));maxShaderNormalError=Math.max(maxShaderNormalError,error);r.maxShaderNormalError=Math.max(r.maxShaderNormalError,error);vertexNormalsChecked++;}
    }
   }r.frames++;frames++;
  }results.push(r);console.log(JSON.stringify(r));
 }
}
const changedSources=paths.filter(p=>sha(p)!==sourceHashes[p]),pass=!flags.length&&!changedSources.length&&maxShaderNormalError<1e-6&&maxBasisNormalError<1e-6&&b.getDiagnostics().fallbacks===0;
const report={pass,scope:'Actual Three.js defaultnormal_vertex USE_INSTANCING formula, independently transcribed; every currently rendered instance matrix at every 101 loop/enter/exit step across all47 ordinary visual variants. Original singleton routes use the original normal shader and are counted separately. Vertex normals at start/middle/end, three normal basis directions and column orthogonality at all frames. No GPU render or generic inverse-transpose substitute for the instancing formula.',sourceHashes,changedSources,frames,matricesChecked,originalRenderMatrices,basisNormalsChecked,vertexNormalsChecked,maxSourceShear,maxInstanceShear,maxShaderNormalError,maxBasisNormalError,flags,results};writeFileSync('artifacts/performance-v09/equipment-instance-normals-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined,sourceHashes:undefined}));b.dispose();character.dispose();if(!pass)process.exitCode=1;
