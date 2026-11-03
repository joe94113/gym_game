import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createNpcLodFixture,readNpcLodData} from './npc-lod-fixture-v010.mjs';
import {createEquipmentFixture} from './equipment-batching-fixture.mjs';
import {protectedTriangleOffsets,triangleKey} from './generate-npc-lod-v010.mjs';
import {buildLocomotionPose} from '../src/locomotion.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),files=['src/npc-geometry-lod-v010.js','src/skinned-character.js','src/crowd.js','src/social-crowd.js','public/models/athlete/athlete.glb','public/models/athlete/lod-v010/manifest.json','public/models/athlete/lod-v010/indices.bin','scripts/generate-npc-lod-v010.mjs','scripts/qualify-npc-lod-v010.mjs'];
const hashes=()=>Object.fromEntries(files.map(path=>[path,sha(readFileSync(path))])),before=hashes(),data=readNpcLodData(),fixture=await createNpcLodFixture({data}),equipment=await createEquipmentFixture();
const variants=[{}, {bodyProfile:'feminine'}, {age:65}, {bodyProfile:'feminine',age:65}],results=[],failures=[];
let vertexChecks=0,protectedTriangleChecks=0,newTriangleChecks=0,attributeChecks=0,poseChecks=0,maxVertexError=0,maxSampledSurfaceError=0,surfaceSamples=0;

// This nearest-triangle tree measures actual deformed candidate faces, rather
// than getSurfaceSamples (which intentionally enumerates all source vertices).
function surfaceTree(THREE,positions,indices){
  const point=new THREE.Vector3(),closest=new THREE.Vector3(),triangle=new THREE.Triangle();
  const records=[];
  for(let i=0;i<indices.length;i+=3){const ids=[indices[i],indices[i+1],indices[i+2]],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const id of ids)for(let c=0;c<3;c++){const v=positions[id*3+c];min[c]=Math.min(min[c],v);max[c]=Math.max(max[c],v);}records.push({ids,min,max,centre:min.map((v,c)=>(v+max[c])/2)});}
  function node(records){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const record of records)for(let c=0;c<3;c++){min[c]=Math.min(min[c],record.min[c]);max[c]=Math.max(max[c],record.max[c]);}if(records.length<=12)return{min,max,records};const axis=[0,1,2].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]))[0];records.sort((a,b)=>a.centre[axis]-b.centre[axis]);const half=records.length>>1;return{min,max,left:node(records.slice(0,half)),right:node(records.slice(half))};}
  const root=node(records),distance=(node,p)=>node.min.reduce((sum,v,c)=>sum+(p[c]<v?v-p[c]:p[c]>node.max[c]?p[c]-node.max[c]:0)**2,0);
  return p=>{let best=Infinity;point.fromArray(p);const stack=[root];while(stack.length){const n=stack.pop();if(distance(n,p)>=best)continue;if(n.records){for(const record of n.records){triangle.a.fromArray(positions,record.ids[0]*3);triangle.b.fromArray(positions,record.ids[1]*3);triangle.c.fromArray(positions,record.ids[2]*3);triangle.closestPointToPoint(point,closest);best=Math.min(best,closest.distanceToSquared(point));}}else{const a=distance(n.left,p),b=distance(n.right,p);if(a<b){stack.push(n.right,n.left);}else stack.push(n.left,n.right);}}return Math.sqrt(best);};
}

for(const appearance of variants){
  const actor=fixture.instantiate({geometryLodAllowed:true,appearance}),meshes=[];actor.group.traverse(mesh=>{if(mesh.isSkinnedMesh)meshes.push(mesh);});
  const full=meshes.map(mesh=>mesh.geometry),protectedOffsets=protectedTriangleOffsets(actor),fullSets=full.map(g=>{const s=new Set();for(let i=0;i<g.index.count;i+=3)s.add(triangleKey(Array.from(g.index.array.subarray(i,i+3))));return s;}),variant={appearance,topology:[],poseCount:0,maxSampledSurfaceError:0};
  const newTriangles=[[],[]];
  for(const level of [1,2]){
    actor.setGeometryLod(level);
    meshes.forEach((mesh,m)=>{
      const geometry=mesh.geometry,indices=geometry.index.array,set=new Set(),newOffsets=[];
      for(let i=0;i<indices.length;i+=3){const tri=Array.from(indices.subarray(i,i+3)),key=triangleKey(tri);set.add(key);if(new Set(tri).size!==3)failures.push(`degenerate ${mesh.name} ${level}`);if(!fullSets[m].has(key)){newOffsets.push(i);newTriangleChecks++;const labels=tri.map(v=>['formMuscleA','formMuscleB','formMuscleC','formMuscleD'].flatMap(name=>Array.from({length:4},(_,c)=>geometry.attributes[name].getComponent(v,c))).join(',')+':'+Math.sign(geometry.attributes.formMuscleSide.getX(v)));if(labels.some(label=>label!==labels[0]))failures.push(`new muscle/side boundary ${mesh.name} ${level}`);}}
      for(const i of protectedOffsets.get(mesh.name)){protectedTriangleChecks++;if(!set.has(triangleKey(Array.from(full[m].index.array.subarray(i,i+3)))))failures.push(`missing protected triangle ${mesh.name} ${level}`);}
      for(const [name,attribute]of Object.entries(full[m].attributes)){attributeChecks++;if(geometry.attributes[name]!==attribute)failures.push(`attribute replacement ${name}`);}
      newTriangles[level-1][m]=newOffsets;variant.topology.push({mesh:mesh.name,level,fullTriangles:full[m].index.count/3,triangles:indices.length/3,protectedTriangles:protectedOffsets.get(mesh.name).size,newTriangles:newOffsets.length});
    });
  }
  const metrics=actor.getAssetInfo().metrics,poses=[buildLocomotionPose(metrics,0,0),buildLocomotionPose(metrics,.83,.85),buildLocomotionPose(metrics,1.72,1.5)];
  for(const id of ['chest-press','lat-pulldown','squat-rack','bike','treadmill-2','plate-high-row'])for(const phase of [0,.5,1])poses.push(equipment.machines.get(id).sampleActivity(phase,phase));
  for(let poseIndex=0;poseIndex<poses.length;poseIndex++){
    actor.setGeometryLod(0);actor.pose(poses[poseIndex]);actor.group.updateMatrixWorld(true);for(const skeleton of new Set(meshes.map(mesh=>mesh.skeleton)))skeleton.update();
    const contacts=JSON.stringify(actor.getContactPoints()),boneState=[];actor.group.traverse(bone=>{if(bone.isBone)boneState.push([bone,...bone.position,...bone.quaternion,...bone.scale]);});
    const point=new fixture.THREE.Vector3(),positions=meshes.map(mesh=>{const array=new Float64Array(mesh.geometry.attributes.position.count*3);for(let v=0;v<mesh.geometry.attributes.position.count;v++){mesh.getVertexPosition(v,point);array.set(point.toArray(),v*3);}return array;});
    // Every full/LOD vertex is compared at every pose. A deterministic subset
    // of newly formed faces is additionally compared to the original surface
    // at five representative poses, including deep squat and seated cycling.
    const measureSurface=[0,4,10,13,19].includes(poseIndex),trees=measureSurface?meshes.map((mesh,m)=>newTriangles.some(level=>level[m].length)?surfaceTree(fixture.THREE,positions[m],full[m].index.array):null):null;
    for(const level of [1,2]){
      actor.setGeometryLod(level);poseChecks++;
      if(JSON.stringify(actor.getContactPoints())!==contacts)failures.push('contact change');
      for(const [bone,...values]of boneState)if([...bone.position,...bone.quaternion,...bone.scale].some((v,i)=>!Object.is(v,values[i])))failures.push('bone change');
      meshes.forEach((mesh,m)=>{
        for(let v=0;v<mesh.geometry.attributes.position.count;v++){mesh.getVertexPosition(v,point);const error=Math.hypot(point.x-positions[m][v*3],point.y-positions[m][v*3+1],point.z-positions[m][v*3+2]);maxVertexError=Math.max(maxVertexError,error);vertexChecks++;if(error!==0)failures.push('deformed vertex change');}
        if(measureSurface&&trees[m]){
          const newOffsets=newTriangles[level-1][m],indices=mesh.geometry.index.array;
          for(let sample=0;sample<newOffsets.length;sample+=24){const i=newOffsets[sample],a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
            for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){const p=[0,1,2].map(k=>positions[m][a+k]*weights[0]+positions[m][b+k]*weights[1]+positions[m][c+k]*weights[2]),error=trees[m](p);maxSampledSurfaceError=Math.max(maxSampledSurfaceError,error);variant.maxSampledSurfaceError=Math.max(variant.maxSampledSurfaceError,error);surfaceSamples++;}
          }
        }
      });
    }
    variant.poseCount++;
  }
  actor.dispose();results.push(variant);console.log(JSON.stringify({appearance,poseCount:variant.poseCount,maxSampledSurfaceError:variant.maxSampledSurfaceError}));
}
equipment.character.dispose();const after=hashes(),changedSources=files.filter(path=>before[path]!==after[path]);
const report={passed:!failures.length&&!changedSources.length,scope:'CPU topology, shared attributes, actual skinned vertices/bones/contact invariance and deterministic sampled candidate-face distance to original same-mesh deformed surfaces. No GPU/visual/trainer review. Sampled surface distance is not an exhaustive Hausdorff or collision guarantee.',sourceHashes:after,changedSources,sourceGlbUnchanged:after['public/models/athlete/athlete.glb']===data.manifest.sourceSha256,levels:{full:56185,lod1:42369,lod2:35847},appearanceVariants:variants,poseChecks,vertexChecks,protectedTriangleChecks,newTriangleChecks,attributeChecks,maxVertexError,surfaceSamples,maxSampledSurfaceError,failures,results};
mkdirSync('artifacts/npc-lod-v010',{recursive:true});writeFileSync('artifacts/npc-lod-v010/qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined}));if(!report.passed)process.exitCode=1;
