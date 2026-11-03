import {publicAssetUrl} from './asset-url.js';

// Distant background people keep the original weighted vertices, skeleton,
// materials and muscle masks. Only the triangle index list changes.
export const NPC_LOD_URL=publicAssetUrl('models/athlete/lod-v010/manifest.json');

export function attributeFingerprint(geometry){
  let hash=2166136261;
  for(const key of ['index','position','normal','uv','skinIndex','skinWeight']){
    const attribute=key==='index'?geometry.index:geometry.getAttribute(key);
    if(!attribute||attribute.isInterleavedBufferAttribute)return null;
    const bytes=new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength);
    for(const value of bytes){hash^=value;hash=Math.imul(hash,16777619);}
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}

export function decodeNpcLodData(manifest,binary){
  if(manifest?.format!=='form-npc-index-lod-v010'||manifest.componentType!=='uint16'||!(binary instanceof ArrayBuffer)||binary.byteLength!==manifest.binaryBytes)throw new Error('NPC LOD 資料格式不符。');
  const meshes=new Map();
  for(const entry of manifest.meshes){
    if(meshes.has(entry.name)||!entry.levels?.length||entry.levels.length!==2)throw new Error('NPC LOD 網格資料重複或缺漏。');
    const levels=entry.levels.map(level=>{
      if(!Number.isInteger(level.offset)||level.offset<0||level.offset%2||!Number.isInteger(level.count)||level.count<3||level.count%3||level.offset+level.count*2>binary.byteLength)throw new Error('NPC LOD 索引範圍無效。');
      const indices=new Uint16Array(binary,level.offset,level.count);
      if(indices.some(index=>index>=entry.vertices))throw new Error('NPC LOD 頂點索引無效。');
      return indices;
    });
    meshes.set(entry.name,{...entry,levels});
  }
  return {manifest,meshes};
}

/** Failure never blocks or replaces the full human asset. The caller starts
 * this promise alongside the GLB request and shares its state with clones. */
export async function loadNpcLodData({url=NPC_LOD_URL,fetcher=globalThis.fetch}={}){
  const response=await fetcher(url);
  if(!response.ok)throw new Error(`NPC LOD manifest: ${response.status}`);
  const manifest=await response.json();
  // The manifest only names its sibling binary; it cannot redirect asset loads.
  if(manifest.binary!=='indices.bin')throw new Error('NPC LOD 檔名不符。');
  const binaryResponse=await fetcher(url.slice(0,url.lastIndexOf('/')+1)+manifest.binary);
  if(!binaryResponse.ok)throw new Error(`NPC LOD indices: ${binaryResponse.status}`);
  const binary=await binaryResponse.arrayBuffer();
  if(!globalThis.crypto?.subtle)throw new Error('無法驗證 NPC LOD 檔案。');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',binary),sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(sha!==manifest.binarySha256)throw new Error('NPC LOD 檔案驗證失敗。');
  return decodeNpcLodData(manifest,binary);
}

export function createNpcLodState(data=null){return {status:data?'ready':'unavailable',data,error:null,validationCache:new WeakMap(),wrapperCache:new WeakMap()};}

export function createNpcGeometryLodController({THREE,meshList,sourceGeometries,lodState,sharedResources,ownedGeometries,allowed=false}){
  const full=meshList.map(mesh=>mesh.geometry),fullTriangles=full.reduce((sum,g)=>sum+(g.index?.count||0)/3,0);
  let level=0,requestedLevel=0,prepared=null,reason=allowed?'full':'player-full',switches=0;
  function prepare(){
    if(prepared)return true;
    if(lodState?.status!=='ready'||!lodState.data)return false;
    const entries=[];
    for(let i=0;i<meshList.length;i++){
      const source=sourceGeometries[i],entry=lodState.data.meshes.get(meshList[i].name);
      if(!entry||entry.vertices!==source.attributes.position.count||entry.originalIndices!==source.index?.count){reason='source-mismatch';return false;}
      let valid=lodState.validationCache.get(source);
      if(valid===undefined){valid=attributeFingerprint(source)===entry.fingerprint;lodState.validationCache.set(source,valid);}
      if(!valid){reason='source-mismatch';return false;}
      entries.push(entry);
    }
    // All eight meshes validate before any visible geometry can change.
    prepared=entries.map((entry,i)=>{
      const geometry=full[i];let wrappers=lodState.wrapperCache.get(geometry);
      if(!wrappers){
        wrappers=entry.levels.map((indices,index)=>{
          if(indices.length===geometry.index.count&&indices.every((value,j)=>value===geometry.index.array[j]))return geometry;
          const wrapper=new THREE.BufferGeometry();wrapper.name=`${geometry.name||meshList[i].name}-lod-${index+1}`;
          for(const [key,attribute]of Object.entries(geometry.attributes))wrapper.setAttribute(key,attribute);
          wrapper.setIndex(new THREE.BufferAttribute(indices,1));
          wrapper.morphAttributes=geometry.morphAttributes;wrapper.morphTargetsRelative=geometry.morphTargetsRelative;
          wrapper.groups=geometry.groups.map(group=>({...group}));wrapper.setDrawRange(geometry.drawRange.start,geometry.drawRange.count);
          wrapper.boundingBox=geometry.boundingBox?.clone()||null;wrapper.boundingSphere=geometry.boundingSphere?.clone()||null;
          wrapper.userData={...geometry.userData,npcGeometryLod:index+1};
          // Disposing any wrapper also releases shared attribute GPU buffers.
          // Therefore all wrappers live until the last shared actor is gone.
          (sharedResources?.geometries||ownedGeometries).add(wrapper);
          return wrapper;
        });
        lodState.wrapperCache.set(geometry,wrappers);
      }
      return wrappers;
    });
    return true;
  }
  function setLevel(next=0){
    requestedLevel=Math.min(2,Math.max(0,Math.floor(Number(next)||0)));
    let wanted=allowed?requestedLevel:0;
    if(wanted&&!prepare())wanted=0;
    if(wanted!==level){meshList.forEach((mesh,i)=>{mesh.geometry=wanted?prepared[i][wanted-1]:full[i];});level=wanted;switches++;}
    if(!allowed)reason='player-full';else if(!wanted&&requestedLevel&&reason!=='source-mismatch')reason=lodState?.status||'unavailable';else if(reason!=='source-mismatch')reason=wanted?'distant-index-lod':'full';
    return level;
  }
  return {setLevel,getDiagnostics(){return{allowed,level,requestedLevel,status:lodState?.status||'unavailable',available:allowed&&lodState?.status==='ready'&&reason!=='source-mismatch',sourceValidated:!!prepared,reason,switches,fullTriangles,triangles:meshList.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count||0)/3,0),sharedAttributes:true,protection:{headHandsFeet:'original triangles',muscleBoundaries:'original triangles',skinWeights:'original shared attributes'}};}};
}

function distanceTo(position,viewer){
  const x=Array.isArray(viewer)?viewer[0]:viewer?.x,y=Array.isArray(viewer)?viewer[1]:viewer?.y,z=Array.isArray(viewer)?viewer[2]:viewer?.z;
  return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)?Math.hypot(position.x-x,position.y-y,position.z-z):null;
}

/** Both the camera and player protect near people. A closer camera while
 * zooming in cannot leave a person simplified merely because the player is far. */
export function selectNpcGeometryLod({position,cameraPosition,playerPosition,previousLevel=0,forceFull=false}){
  if(forceFull)return 0;
  const cameraDistance=distanceTo(position,cameraPosition),playerDistance=distanceTo(position,playerPosition);
  if(cameraDistance===null||playerDistance===null)return 0;
  const distance=Math.min(cameraDistance,playerDistance);
  if(distance<(previousLevel?13:16))return 0;
  if(distance>(previousLevel===2?22:26))return 2;
  return 1;
}

export function summarizeNpcGeometryLod(actors,enabled){
  const entries=actors.map(actor=>({id:actor.id,visible:actor.body.group.visible,...actor.body.getGeometryLodDiagnostics?.()}));
  return {enabled,count:entries.length,levels:[0,1,2].map(level=>entries.filter(actor=>actor.level===level).length),fullTriangles:entries.reduce((sum,actor)=>sum+(actor.fullTriangles||0),0),selectedTriangles:entries.reduce((sum,actor)=>sum+(actor.triangles||0),0),visibleSelectedTriangles:entries.filter(actor=>actor.visible).reduce((sum,actor)=>sum+(actor.triangles||0),0),actors:entries};
}
