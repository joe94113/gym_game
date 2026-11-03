// Evict only provably room-exclusive WebGL resources. CPU objects, arrays and
// image Sources stay intact: this is partial GPU eviction, not model unloading.
const GLOBAL='global';
const iterable=value=>value&&typeof value[Symbol.iterator]==='function'&&typeof value!=='string';
const storage=attribute=>attribute?.isInterleavedBufferAttribute?attribute.data:attribute;
const attributesOf=geometry=>[geometry.index,...Object.values(geometry.attributes||{}),...Object.values(geometry.morphAttributes||{}).flat()].filter(Boolean);

export function createRoomResourceManager({scene,rooms,getInventoryRoots=()=>[],getProtectedResources=()=>({}),cooldownSeconds=12,enabled=true}={}){
  if(!scene||!rooms)throw new Error('Room GPU manager requires the scene and room roots.');
  const roots=rooms instanceof Map?new Map(rooms):new Map(Object.entries(rooms)),rootOwners=new Map([...roots].map(([id,root])=>[root,id]));
  const states=new Map([...roots].map(([id])=>[id,{released:false,dirty:false,resources:{geometries:new Set(),materials:new Set(),textures:new Set()},releaseCount:0,wakeCount:0,sourceBufferBytesEstimate:0,lastRelease:null}]));
  let enabledValue=!!enabled,disposed=false,scans=0,lastInventory=null,lastError=null;
  const totals={geometries:0,materials:0,textures:0};
  function protectedObject(object){for(let p=object;p;p=p.parent)if(p.isBone||p.isSkinnedMesh||p.isInstancedMesh||p.userData?.roomGpuPinned)return true;return false;}
  function inventory(){
    scans++;
    const extraRoots=[...getInventoryRoots()],detachedOwners=new Map(extraRoots.filter(root=>root&&!root.parent&&roots.has(root.userData?.roomGpuOwner)).map(root=>[root,root.userData.roomGpuOwner]));
    // Architecture merging leaves its original CPU descriptors detached. Only
    // explicitly registered cached roots retain a room hint while parentless;
    // a root temporarily inside a review/global scene remains global/pinned.
    const ownerOf=object=>{for(let p=object;p;p=p.parent){if(rootOwners.has(p))return rootOwners.get(p);if(!p.parent&&detachedOwners.has(p))return detachedOwners.get(p);}return GLOBAL;};
    const geometries=new Map(),materials=new Map(),textures=new Map(),attributeRefs=new Map(),bufferRefs=new Map(),textureSources=new Map(),visited=new Set(),protectedSet=new Set();
    function reference(map,resource,owner,object){if(!resource)return null;let record=map.get(resource);if(!record){record={resource,owners:new Set(),objects:new Set()};map.set(resource,record);}record.owners.add(owner);if(object)record.objects.add(object);return record;}
    function texturesIn(value,owner,seen=new Set(),depth=0){
      if(!value||typeof value!=='object'||seen.has(value)||depth>8)return;seen.add(value);
      if(value.isTexture){reference(textures,value,owner);return;}
      if(Array.isArray(value)){for(const v of value)texturesIn(v,owner,seen,depth+1);return;}
      // Shader uniforms may contain nested structures. Traverse plain records
      // only, rather than walking unrelated renderer or DOM object graphs.
      if(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)for(const v of Object.values(value))texturesIn(v,owner,seen,depth+1);
    }
    function addMaterial(material,owner,pinned=false){
      if(!material)return;reference(materials,material,owner);if(pinned||material.isNodeMaterial)protectedSet.add(material);
      for(const value of Object.values(material))if(value?.isTexture){reference(textures,value,owner);if(pinned)protectedSet.add(value);}
      texturesIn(material.uniforms,owner);
      if(pinned&&material.uniforms){const previous=new Set(textures.keys());texturesIn(material.uniforms,GLOBAL);for(const texture of textures.keys())if(!previous.has(texture))protectedSet.add(texture);}
    }
    function protect(value,seen=new Set()){
      if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
      if(value.isBufferGeometry){protectedSet.add(value);reference(geometries,value,GLOBAL);return;}
      if(value.isMaterial){protectedSet.add(value);addMaterial(value,GLOBAL,true);return;}
      if(value.isTexture){protectedSet.add(value);reference(textures,value,GLOBAL);return;}
      if(value.isBufferAttribute||value.isInterleavedBufferAttribute||value.isInterleavedBuffer){const data=storage(value);protectedSet.add(data);if(data?.array?.buffer)protectedSet.add(data.array.buffer);return;}
      if(value instanceof ArrayBuffer){protectedSet.add(value);return;}
      if(value.isObject3D){value.traverse(object=>{protect(object.geometry,seen);for(const material of Array.isArray(object.material)?object.material:[object.material])protect(material,seen);protect(object.customDepthMaterial,seen);protect(object.customDistanceMaterial,seen);protect(object.skeleton?.boneTexture,seen);protect(object.instanceMatrix,seen);protect(object.instanceColor,seen);protect(object.morphTexture,seen);});return;}
      if(value.isWebGLRenderTarget||value.isRenderTarget){protect(value.texture,seen);protect(value.textures,seen);protect(value.depthTexture,seen);return;}
      if(iterable(value)){for(const item of value)protect(item,seen);return;}
      if(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)for(const item of Object.values(value))protect(item,seen);
    }
    function visit(object){
      if(!object||visited.has(object))return;visited.add(object);
      const owner=ownerOf(object),pinned=protectedObject(object);
      if(object.geometry){reference(geometries,object.geometry,owner,object);if(pinned)protectedSet.add(object.geometry);}
      for(const material of Array.isArray(object.material)?object.material:[object.material])addMaterial(material,owner,pinned);
      addMaterial(object.customDepthMaterial,owner,pinned);addMaterial(object.customDistanceMaterial,owner,pinned);
      if(object.isSkinnedMesh)protect(object.skeleton?.boneTexture);
      if(object.isInstancedMesh){protect(object.instanceMatrix);protect(object.instanceColor);protect(object.morphTexture);}
      if(object.isScene){protect(object.environment);protect(object.background);protect(object.overrideMaterial);}
      if(object.isLight){protect(object.shadow?.map);protect(object.shadow?.mapPass);}
      for(const child of object.children||[])visit(child);
    }
    for(const root of [scene,...roots.values(),...extraRoots])visit(root);
    protect(getProtectedResources());
    for(const [geometry,record]of geometries){
      for(const attribute of attributesOf(geometry)){
        const data=storage(attribute),array=data?.array;
        let refs=attributeRefs.get(data);if(!refs){refs={geometries:new Set(),owners:new Set()};attributeRefs.set(data,refs);}refs.geometries.add(geometry);for(const owner of record.owners)refs.owners.add(owner);
        if(array?.buffer){let buffers=bufferRefs.get(array.buffer);if(!buffers){buffers={geometries:new Set(),owners:new Set(),attributes:new Set()};bufferRefs.set(array.buffer,buffers);}buffers.geometries.add(geometry);buffers.attributes.add(data);for(const owner of record.owners)buffers.owners.add(owner);}
        if(protectedSet.has(geometry)){protectedSet.add(data);if(array?.buffer)protectedSet.add(array.buffer);}
      }
    }
    for(const [texture,record]of textures)for(const source of [texture.source,texture.source?.data].filter(value=>value&&typeof value==='object')){
      let refs=textureSources.get(source);if(!refs){refs={textures:new Set(),owners:new Set()};textureSources.set(source,refs);}refs.textures.add(texture);for(const owner of record.owners)refs.owners.add(owner);
    }
    const candidates=new Map(),rejections=new Map(),roomExclusive=(owners,id)=>owners.size===1&&owners.has(id);
    for(const id of roots.keys()){
      const sets={geometries:new Set(),materials:new Set(),textures:new Set()},rejected={protectedGeometry:0,sharedGeometry:0,attributeAlias:0,unsupportedAttribute:0,protectedMaterial:0,sharedMaterial:0,protectedTexture:0,sharedTexture:0,textureSourceAlias:0};
      for(const [geometry,record]of geometries){
        if(!record.owners.has(id))continue;
        if(protectedSet.has(geometry)||geometry.isInstancedBufferGeometry){rejected.protectedGeometry++;continue;}
        if(!roomExclusive(record.owners,id)){rejected.sharedGeometry++;continue;}
        let reason=null;
        for(const attribute of attributesOf(geometry)){
          const data=storage(attribute),array=data?.array,refs=attributeRefs.get(data),buffers=bufferRefs.get(array?.buffer);
          if(!array||attribute.isGLBufferAttribute){reason='unsupportedAttribute';break;}
          if(protectedSet.has(data)||protectedSet.has(array.buffer)||refs.geometries.size>1||!roomExclusive(refs.owners,id)||buffers?.geometries.size>1||buffers&&!roomExclusive(buffers.owners,id)){reason='attributeAlias';break;}
        }
        if(reason)rejected[reason]++;else sets.geometries.add(geometry);
      }
      for(const [material,record]of materials){if(!record.owners.has(id))continue;if(protectedSet.has(material))rejected.protectedMaterial++;else if(!roomExclusive(record.owners,id))rejected.sharedMaterial++;else sets.materials.add(material);}
      for(const [texture,record]of textures){
        if(!record.owners.has(id))continue;
        if(protectedSet.has(texture)||texture.isRenderTargetTexture||texture.isVideoTexture||!texture.source?.data){rejected.protectedTexture++;continue;}
        if(!roomExclusive(record.owners,id)){rejected.sharedTexture++;continue;}
        const aliases=[texture.source,texture.source.data].map(source=>textureSources.get(source)).filter(Boolean);
        if(aliases.some(refs=>refs.textures.size>1||!roomExclusive(refs.owners,id))){rejected.textureSourceAlias++;continue;}
        sets.textures.add(texture);
      }
      candidates.set(id,sets);rejections.set(id,rejected);
    }
    lastInventory={objects:visited.size,geometries:geometries.size,materials:materials.size,textures:textures.size,rooms:Object.fromEntries([...candidates].map(([id,sets])=>[id,{eligible:Object.fromEntries(Object.entries(sets).map(([kind,set])=>[kind,set.size])),rejected:rejections.get(id)}]))};
    return {candidates,summary:lastInventory};
  }
  function wakeRoom(id){
    const state=states.get(id);if(!state||disposed||!state.released)return false;
    const data=new Set();
    for(const geometry of state.resources.geometries)for(const attribute of attributesOf(geometry))data.add(storage(attribute));
    for(const attribute of data)attribute.needsUpdate=true;
    for(const material of state.resources.materials)material.needsUpdate=true;
    for(const texture of state.resources.textures)texture.needsUpdate=true;
    state.resources={geometries:new Set(),materials:new Set(),textures:new Set()};state.sourceBufferBytesEstimate=0;state.released=false;state.dirty=false;state.wakeCount++;return true;
  }
  function sleepRoom(id,{dormantSeconds=0,force=false}={}){
    const state=states.get(id);if(!state||disposed||!enabledValue||roots.get(id)?.visible!==false||(!force&&dormantSeconds<cooldownSeconds)||(state.released&&!state.dirty))return false;
    // A fresh whole-graph scan immediately precedes every release, including
    // hidden/parked people, global proxies and late generated class equipment.
    let candidates;try{({candidates}=inventory());lastError=null;}catch(error){lastError=String(error.message||error);return false;}
    const sets=candidates.get(id),issued={geometries:0,materials:0,textures:0},arrays=new Set();
    for(const [kind,resources]of Object.entries(sets))for(const resource of resources){
      if(state.resources[kind].has(resource))continue;
      resource.dispose();state.resources[kind].add(resource);issued[kind]++;totals[kind]++;
      if(kind==='geometries')for(const attribute of attributesOf(resource)){const data=storage(attribute);if(data?.array)arrays.add(data.array);}
    }
    const retainedArrays=new Set();for(const geometry of state.resources.geometries)for(const attribute of attributesOf(geometry)){const array=storage(attribute)?.array;if(array)retainedArrays.add(array);}
    state.sourceBufferBytesEstimate=[...retainedArrays].reduce((sum,array)=>sum+array.byteLength,0);state.released=true;state.dirty=false;state.releaseCount++;state.lastRelease={disposeIssued:issued,sourceBufferBytesEstimate:[...arrays].reduce((sum,array)=>sum+array.byteLength,0)};return true;
  }
  return {
    sleepRoom,wakeRoom,
    notifyRoomChanged(id){const state=states.get(id);if(state)state.dirty=true;},
    inspect(){return inventory().summary;},
    setEnabled(value=true){enabledValue=!!value;if(!enabledValue)for(const id of states.keys())wakeRoom(id);return enabledValue;},
    getDiagnostics(){return{enabled:enabledValue,cooldownSeconds,scans,cpuModelsResident:true,fullModelUnloading:false,disposalEvidence:'dispose issued; actual GL deletions require renderer instrumentation',disposeIssued:{...totals},lastInventory,lastError,rooms:Object.fromEntries([...states].map(([id,state])=>[id,{gpuEvictionRequested:state.released,retainedCpuArrays:true,releaseCount:state.releaseCount,wakeCount:state.wakeCount,retainedReleasedResources:Object.fromEntries(Object.entries(state.resources).map(([kind,set])=>[kind,set.size])),sourceBufferBytesEstimate:state.sourceBufferBytesEstimate,lastRelease:state.lastRelease}]))};},
    dispose(){disposed=true;states.clear();},
  };
}
