/** Render-only instancing of byte-identical equipment geometry. The original
 * machine graph remains authoritative for poses, contacts, collisions and
 * raycasts. Separate 12 m cells avoid a single gym-wide bounding sphere. */
export function createEquipmentBatcher({THREE,scene,machines,cellSize=12,enabled=true,installRenderHook=true}={}){
 if(!THREE||!scene||!machines)throw new Error('Equipment batching requires THREE, scene and machines');
 const proxies=new THREE.Group();proxies.name='equipment-instance-cells';proxies.userData.equipmentBatchProxy=true;scene.add(proxies);
 const records=[],batches=[],roots=new Map(),cells=new Map(),geometryKeys=new Map(),geometryBuckets=new Map(),geometryStates=new WeakMap(),matrix=new THREE.Matrix4(),inverseScene=new THREE.Matrix4(),projection=new THREE.Matrix4(),frustum=new THREE.Frustum(),sphere=new THREE.Sphere();
 let active=!!enabled,disposed=false,updates=0,lastCpuMs=0,lastVisible=0,lastCulled=0,lastOriginals=0,lastInstanced=0,lastLiveProxies=0,lastMatrixUpdates=0,lastBoundsUpdates=0,matrixUpdateMarks=0,boundsRecomputations=0,fallbacks=0,sourceOrdinal=0,geometryOrdinal=0;
 const now=()=>globalThis.performance?.now?.()||0;
 const bytesEqual=(a,b)=>{if(a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true;};
 function geometrySignature(g){
  let h1=2166136261,h2=5381;const add=value=>{for(const byte of value){h1=Math.imul(h1^byte,16777619);h2=Math.imul(h2,33)^byte;}},text=value=>add(new TextEncoder().encode(value));
  text(JSON.stringify([g.drawRange,g.groups]));for(const name of Object.keys(g.attributes).sort()){const a=g.attributes[name];text(`${name}:${a.array.constructor.name}:${a.itemSize}:${a.normalized}`);add(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
  if(g.index){text(`index:${g.index.array.constructor.name}`);add(new Uint8Array(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));}return`${h1>>>0}:${h2>>>0}`;
 }
 function sameGeometry(a,b){
  if(JSON.stringify(a.drawRange)!==JSON.stringify(b.drawRange)||JSON.stringify(a.groups)!==JSON.stringify(b.groups))return false;
  const names=Object.keys(a.attributes).sort();if(names.join('|')!==Object.keys(b.attributes).sort().join('|')||!!a.index!==!!b.index)return false;
  for(const name of names){const x=a.attributes[name],y=b.attributes[name];if(x.itemSize!==y.itemSize||x.normalized!==y.normalized||x.array.constructor!==y.array.constructor||!bytesEqual(x.array,y.array))return false;}return !a.index||(a.index.array.constructor===b.index.array.constructor&&bytesEqual(a.index.array,b.index.array));
 }
 function geometryKey(g){if(geometryKeys.has(g))return geometryKeys.get(g);const signature=geometrySignature(g),candidates=geometryBuckets.get(signature)||[];let entry=candidates.find(e=>sameGeometry(e.geometry,g));if(!entry){entry={geometry:g,key:++geometryOrdinal};candidates.push(entry);geometryBuckets.set(signature,candidates);}geometryKeys.set(g,entry.key);return entry.key;}
 function geometryState(g){if(!geometryStates.has(g))geometryStates.set(g,{attributes:Object.entries(g.attributes).map(([name,a])=>({name,attribute:a,array:a.array,version:a.version})),index:g.index,indexVersion:g.index?.version,start:g.drawRange.start,count:g.drawRange.count,epoch:-1,valid:true});return geometryStates.get(g);}
 function geometryUnchanged(g){const state=geometryState(g);if(state.epoch===updates)return state.valid;state.epoch=updates;state.valid=g.index===state.index&&g.index?.version===state.indexVersion&&g.drawRange.start===state.start&&g.drawRange.count===state.count;for(const {name,attribute,array,version}of state.attributes)if(g.attributes[name]!==attribute||attribute.array!==array||attribute.version!==version){state.valid=false;break;}return state.valid;}
 function mutable(node,root){for(let p=node;p;p=p.parent){if(p.userData?.loadable||p.userData?.plate||p.userData?.equipmentBatchProxy||p.userData?.noEquipmentBatch)return true;if(p===root)break;}return false;}
 function eligible(o,root){
  if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||!o.geometry?.attributes?.position||Array.isArray(o.material)||!o.material||o.material.transparent||o.geometry.isInstancedBufferGeometry||Object.keys(o.geometry.morphAttributes||{}).length||mutable(o,root)||o.customDepthMaterial||o.customDistanceMaterial)return false;
  for(const key of ['onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'])if(o[key]!==THREE.Object3D.prototype[key])return false;
  return !Object.values(o.geometry.attributes).some(a=>a.isInterleavedBufferAttribute);
 }
 const buckets=new Map();scene.updateMatrixWorld(true);
 for(const machine of machines.values()){
  if(['facility','stretchZone'].includes(machine.type)||!machine.group)continue;
  const visualRoots=machine.getBatchRoots?.()||[machine.group,machine.getVisualGroup?.()].filter(Boolean);
  for(const root of new Set(visualRoots)){
   if(roots.has(root))continue;const info={root,machineId:machine.station?.id||root.uuid,suspended:0,records:[]};roots.set(root,info);
   const position=root.getWorldPosition(new THREE.Vector3()),room=root.userData.roomId||'main',cell=`${room}:${Math.floor(position.x/cellSize)}:${Math.floor(position.z/cellSize)}`;
   root.traverse(o=>{if(!eligible(o,root))return;geometryState(o.geometry);const key=`${cell}:${geometryKey(o.geometry)}:${o.material.uuid}:${o.layers.mask}:${o.castShadow}:${o.receiveShadow}:${o.renderOrder}:${o.frustumCulled}`,entry={object:o,info,cell,geometry:o.geometry,material:o.material,parent:o.parent,mask:o.layers.mask,ordinal:++sourceOrdinal,fallback:false};if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(entry);});
  }
 }
 for(const [key,entries]of buckets){
  if(entries.length<2)continue;const first=entries[0].object,mesh=new THREE.InstancedMesh(first.geometry,first.material,entries.length);mesh.name=`equipment-batch:${key}`;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;mesh.layers.mask=first.layers.mask;mesh.userData.equipmentBatchProxy=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.visible=false;proxies.add(mesh);
  if(!cells.has(entries[0].cell))cells.set(entries[0].cell,{key:entries[0].cell,sphere:new THREE.Sphere(),entries:[],inView:true});const cell=cells.get(entries[0].cell);
  const batch={mesh,entries,activeEntries:[],staging:new Float32Array(entries.length*16),key,cell};batches.push(batch);cell.entries.push(...entries);
  // Return the original machine object for pointer tools. The original graph
  // supplies exactly the old double-precision ray/triangle intersections.
  mesh.raycast=(raycaster,hits)=>{if(!active||disposed)return;for(const record of batch.entries){if(record.fallback||record.info.suspended||(record.mask&raycaster.layers.mask)===0||(record.object.layers.mask&raycaster.layers.mask)!==0)continue;let attached=false;for(let node=record.object;node;node=node.parent)if(node===scene){attached=true;break;}if(attached)record.object.raycast(raycaster,hits);}};
  for(const record of entries){record.batch=batch;records.push(record);record.info.records.push(record);if(active)record.object.layers.mask=0;}
 }
 function underRoot(record){for(let p=record.object;p;p=p.parent){if(!p.visible)return false;if(p===record.info.root){for(let a=p.parent;a;a=a.parent){if(!a.visible)return false;if(a===scene)return true;}return false;}}return false;}
 function fallback(record){if(record.fallback)return;record.fallback=true;record.object.layers.mask=record.mask;fallbacks++;}
 function renderRoutes(batch,singleton=null){for(const record of batch.entries){record.drawOriginal=record===singleton;record.object.layers.mask=!active||record.fallback||record.info.suspended||record.drawOriginal?record.mask:0;}}
 function update({camera=null,shadows=false,matricesReady=false}={}){
  if(disposed)return;if(!active){for(const batch of batches)batch.mesh.visible=false;return;}
  const start=now();if(!matricesReady)scene.updateMatrixWorld(true);inverseScene.copy(scene.matrixWorld).invert();if(camera){camera.updateWorldMatrix(true,false);projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection,camera.coordinateSystem);}
  let visible=0,culled=0,originals=0,instanced=0,liveProxies=0,matrixUpdates=0,boundsUpdates=0;
  // Exact current cell bounds, not a guessed movement radius: moving handles
  // can never escape a stale coarse bound. Only spheres/visibility are checked
  // here; offscreen cells skip all per-instance matrix packing and uploads.
  const coarse=!!camera&&!shadows;
  if(coarse)for(const cell of cells.values()){
   cell.sphere.makeEmpty();for(const record of cell.entries){const o=record.object;record.sceneVisible=false;if(record.fallback)continue;if(o.geometry!==record.geometry||o.material!==record.material||!geometryUnchanged(o.geometry)||o.parent!==record.parent){fallback(record);continue;}
    if(record.info.suspended||!underRoot(record)||!o.material.visible||(record.mask&camera.layers.mask)===0)continue;record.sceneVisible=true;if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);cell.sphere.union(sphere);
   }cell.inView=!cell.sphere.isEmpty()&&frustum.intersectsSphere(cell.sphere);
  }
  for(const batch of batches){let index=0;batch.activeEntries.length=0;
   if(coarse&&!batch.cell.inView){batch.mesh.count=0;batch.mesh.visible=false;for(const record of batch.entries)if(record.sceneVisible)culled++;renderRoutes(batch);continue;}
   for(const record of batch.entries){const o=record.object;if(record.fallback)continue;
    if(o.geometry!==record.geometry||o.material!==record.material||!geometryUnchanged(o.geometry)||o.parent!==record.parent||o.matrixWorld.determinant()<=0){fallback(record);continue;}
    if(coarse?!record.sceneVisible:record.info.suspended||!underRoot(record)||!o.material.visible||camera&&(record.mask&camera.layers.mask)===0)continue;
    if(camera&&!shadows&&o.frustumCulled){if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);if(!frustum.intersectsSphere(sphere)){culled++;continue;}}
    matrix.multiplyMatrices(inverseScene,o.matrixWorld);matrix.toArray(batch.staging,index++*16);batch.activeEntries.push(record);
   }
   // A single visible source saves no draw call. Keep its original shader,
   // avoiding per-vertex instance transform work on large merged frames.
   const singleton=index===1?batch.activeEntries[0]:null;renderRoutes(batch,singleton);
   const previousCount=batch.mesh.count;batch.mesh.count=index>1?index:0;batch.mesh.visible=index>1;batch.mesh.frustumCulled=!!camera;
   if(index>1){
    // Compare the actual Float32 upload values, not unrounded world matrices.
    // Singleton frames only touch staging; otherwise a hidden proxy's CPU
    // buffer could change without a version bump and later miss an upload.
    const uploaded=batch.mesh.instanceMatrix.array;let changed=false;
    for(let element=0;element<index*16;element++)if(!Object.is(uploaded[element],batch.staging[element])){uploaded[element]=batch.staging[element];changed=true;}
    if(changed){batch.mesh.instanceMatrix.needsUpdate=true;matrixUpdates++;matrixUpdateMarks++;}
    if(changed||previousCount!==index||!batch.mesh.boundingSphere){batch.mesh.computeBoundingSphere();boundsUpdates++;boundsRecomputations++;}
    instanced+=index;liveProxies++;
   }else if(singleton)originals++;visible+=index;
  }
  updates++;lastVisible=visible;lastCulled=culled;lastOriginals=originals;lastInstanced=instanced;lastLiveProxies=liveProxies;lastMatrixUpdates=matrixUpdates;lastBoundsUpdates=boundsUpdates;lastCpuMs=now()-start;
 }
 function setEnabled(value){active=!!value;for(const record of records)record.object.layers.mask=active&&!record.fallback&&!record.info.suspended?0:record.mask;for(const batch of batches)batch.mesh.visible=false;if(active)update();return active;}
 function suspendRoots(values){const selected=[...new Set(values)].map(root=>roots.get(root)).filter(Boolean);for(const info of selected){info.suspended++;for(const record of info.records)record.object.layers.mask=record.mask;}let released=false;return()=>{if(released)return;released=true;for(const info of selected){info.suspended=Math.max(0,info.suspended-1);for(const record of info.records)record.object.layers.mask=active&&!record.fallback&&!info.suspended&&!record.drawOriginal?0:record.mask;}};}
 const beforeRender=scene.onBeforeRender;
 const renderHook=function(renderer,currentScene,camera,...args){beforeRender.call(this,renderer,currentScene,camera,...args);update({camera,shadows:!!renderer.shadowMap?.enabled,matricesReady:true});};
 if(installRenderHook)scene.onBeforeRender=renderHook;
 update();
 return{
  update,setEnabled,suspendRoots,
  getDiagnostics(){return{enabled:active,cellSize,cellCount:cells.size,sourceCount:records.length,proxyCount:batches.length,potentialSavedCalls:records.length-batches.length,visibleInstances:lastVisible,visibleOriginals:lastOriginals,instancedVisibleCount:lastInstanced,liveProxyCount:lastLiveProxies,visibleSavedCalls:lastInstanced-lastLiveProxies,frustumCulledInstances:lastCulled,matrixUpdatesLastFrame:lastMatrixUpdates,boundsUpdatesLastFrame:lastBoundsUpdates,matrixUpdateMarks,boundsRecomputations,fallbacks,updates,updateCpuMs:lastCpuMs,geometryGroups:geometryOrdinal,rootCount:roots.size};},
  // Debug-only immutable descriptions for CPU equivalence qualification.
  getInspectionRecords(){return records.map(record=>{const instanceIndex=record.batch.mesh.visible?record.batch.activeEntries.indexOf(record):-1;return{source:record.object,root:record.info.root,proxy:record.batch.mesh,instanceIndex,renderMode:!active||record.fallback||record.info.suspended||record.drawOriginal?'original':instanceIndex>=0?'instance':'culled',visibleInScene:underRoot(record)&&record.object.material.visible,originalLayerMask:record.mask,fallback:record.fallback};});},
  dispose(){if(disposed)return;setEnabled(false);disposed=true;if(scene.onBeforeRender===renderHook)scene.onBeforeRender=beforeRender;for(const batch of batches)batch.mesh.dispose();proxies.removeFromParent();},
 };
}
