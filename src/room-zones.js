/** Spatial ownership controls rendering and expensive background work only.
 * Navigation, floor height, fixture contacts and lifecycle clocks remain owned
 * by their existing systems. CPU interiors stay resident; an optional manager
 * can evict provably exclusive GPU resources after a longer cold interval. */
export const ROOM_ZONES=Object.freeze({
  classroom:Object.freeze({id:'classroom',minX:-35,maxX:-13,minZ:21,maxZ:31,maxY:4.2}),
  bathroom:Object.freeze({id:'bathroom',minX:11,maxX:28,minZ:8,maxZ:24,maxY:3.4}),
});
const BATH_STATIONS=new Set(['sauna','steam-room','cold-plunge','shower-1','shower-2','toilet-1','toilet-2']);
const point=value=>Array.isArray(value)?{x:value[0],y:value[1]||0,z:value[2]}:value;
const finitePoint=value=>{const p=point(value);return p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?p:null;};
export function roomForStation(id){return id==='group-class'||/^class-/.test(id||'')?'classroom':BATH_STATIONS.has(id)?'bathroom':null;}
export function distanceToRoom(value,room){const p=finitePoint(value);if(!p)return Infinity;return Math.hypot(Math.max(room.minX-p.x,0,p.x-room.maxX),Math.max(room.minZ-p.z,0,p.z-room.maxZ));}
export function roomContains(value,room,padding=0){const p=finitePoint(value);return !!p&&p.x>=room.minX-padding&&p.x<=room.maxX+padding&&p.z>=room.minZ-padding&&p.z<=room.maxZ+padding;}

export function createRoomZones({THREE,scene,enabled=true,prewarmDistance=5,showDistance=2.5,releaseSeconds=.8}={}){
  const states=new Map(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum(),ray=new THREE.Ray(),target=new THREE.Vector3();
  // A hidden Object3D is still visited by Scene.updateMatrixWorld. Park entire
  // sleeping interiors outside the render graph while retaining every object,
  // attribute and reference. The cache uses the scene's world coordinate frame
  // so moving a root never changes its local or world-space contact transforms.
  const residentCache=new THREE.Group();residentCache.name='room-interior-resident-cache';residentCache.userData.roomResidentCache=true;residentCache.matrixAutoUpdate=false;
  function syncResidentFrame(){scene.updateWorldMatrix(true,false);residentCache.matrix.copy(scene.matrixWorld);residentCache.matrixWorld.copy(scene.matrixWorld);residentCache.matrixWorldNeedsUpdate=false;}
  syncResidentFrame();
  let clock=0,lastContext=null,evaluations=0,enabledValue=!!enabled,resourceManager=null;
  for(const definition of Object.values(ROOM_ZONES)){
    const root=new THREE.Group();root.name=`room-interior:${definition.id}`;root.userData.roomId=definition.id;root.userData.roomInteriorRoot=true;scene.add(root);
    states.set(definition.id,{definition,root,state:'visible',visible:true,updating:true,holdUntil:0,lastReason:'initial',ownedRoots:0,adoptedMeshes:0,activationCount:0,dormantSeconds:0,registeredRoots:new Set()});
  }
  function registerRoot(id,root){const state=states.get(id);if(!state||!root||root===state.root)return root;syncResidentFrame();root.userData.roomId=id;root.userData.roomGpuOwner=id;state.registeredRoots.add(root);resourceManager?.notifyRoomChanged(id);if(root.parent!==state.root){if(root.parent===scene||root.parent?.userData.roomInteriorRoot)state.root.add(root);else state.root.attach(root);state.ownedRoots++;}return root;}
  function classifyBounds(bounds){
    if(bounds.isEmpty())return null;
    for(const room of Object.values(ROOM_ZONES)){
      const epsilon=.025;
      if(bounds.min.x<room.minX-epsilon||bounds.max.x>room.maxX+epsilon||bounds.min.z<room.minZ-epsilon||bounds.max.z>room.maxZ+epsilon)continue;
      const w=bounds.max.x-bounds.min.x,h=bounds.max.y-bounds.min.y,d=bounds.max.z-bounds.min.z;
      // The enclosing floor, boundary walls and large mirror surfaces stay in
      // the permanent shell. Small mats at the same boundary are interiors.
      if(w*d>(room.maxX-room.minX)*(room.maxZ-room.minZ)*.5)continue;
      if(h>1.8&&(Math.abs(bounds.min.x-room.minX)<.22||Math.abs(bounds.max.x-room.maxX)<.22||Math.abs(bounds.min.z-room.minZ)<.22||Math.abs(bounds.max.z-room.maxZ)<.22))continue;
      return room.id;
    }return null;
  }
  function adoptArchitecture(){
    scene.updateMatrixWorld(true);const candidates=[...scene.children].filter(root=>!root.userData.roomInteriorRoot);
    for(const root of candidates){
      if(root.userData.roomShell||root.isLight||root.isCamera)continue;
      const bounds=new THREE.Box3().setFromObject(root),id=classifyBounds(bounds);if(!id)continue;
      // Enclosing and partition walls are retained even when the room sleeps.
      if(root.userData.roomShell)continue;
      registerRoot(id,root);let meshes=0;root.traverse(object=>{if(object.isMesh)meshes++;});states.get(id).adoptedMeshes+=meshes;
    }
    scene.updateMatrixWorld(true);return diagnostics();
  }
  function visibleInCamera(room,context){
    const camera=context.camera;
    if(camera?.projectionMatrix&&camera?.matrixWorldInverse){
      camera.updateMatrixWorld(true);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
      // Padding prewarms before a view edge actually crosses the interior.
      return frustum.intersectsBox(new THREE.Box3(new THREE.Vector3(room.minX-1.5,-.1,room.minZ-1.5),new THREE.Vector3(room.maxX+1.5,room.maxY,room.maxZ+1.5)));
    }
    const from=finitePoint(context.cameraPosition),to=finitePoint(context.cameraTarget||context.focus||context.target||context.playerPosition);
    if(!from||!to)return false;
    const origin=new THREE.Vector3(from.x,from.y||0,from.z),end=new THREE.Vector3(to.x,to.y||0,to.z),length=origin.distanceTo(end);if(length<.001)return roomContains(from,room,1);
    ray.set(origin,end.sub(origin).normalize());const hit=ray.intersectBox(new THREE.Box3(new THREE.Vector3(room.minX-1,-.1,room.minZ-1),new THREE.Vector3(room.maxX+1,room.maxY,room.maxZ+1)),target);
    return !!hit&&origin.distanceTo(hit)<=length+1;
  }
  function evaluate(context={}){
    lastContext=context;const dt=Math.max(0,Math.min(.25,Number(context.dt)||0));clock+=dt;evaluations++;syncResidentFrame();
    const activeId=context.activeStationId||context.activeFacilityId||context.stationId,forcedRoom=roomForStation(activeId);
    for(const state of states.values()){
      const room=state.definition,distance=distanceToRoom(context.playerPosition,room),inside=roomContains(context.playerPosition,room),cameraInside=roomContains(context.cameraPosition||context.camera?.position,room,.4),forced=forcedRoom===room.id;
      const cameraVisible=visibleInCamera(room,context),near=distance<=showDistance,unmanaged=!enabledValue||!!context.forceAllRooms;
      const wanted=unmanaged||forced||inside||cameraInside||cameraVisible||near;
      if(wanted)state.holdUntil=clock+releaseSeconds;
      const visible=wanted||clock<state.holdUntil,previous=state.visible;
      // Restore upload state synchronously before the room becomes renderable.
      if(visible)resourceManager?.wakeRoom(room.id);
      state.visible=visible;state.updating=visible;state.root.visible=visible;const parent=visible?scene:residentCache;if(state.root.parent!==parent)parent.add(state.root);state.state=unmanaged?'unmanaged':forced||inside?'active':visible?'visible':distance<=prewarmDistance?'prewarm':'dormant';
      state.lastReason=unmanaged?'forced-all':forced?'activity':inside?'player-inside':cameraInside?'camera-inside':cameraVisible?'camera-view':near?'doorway-near':visible?'visibility-hysteresis':state.state;
      state.dormantSeconds=visible?0:state.dormantSeconds+dt;if(!visible)resourceManager?.sleepRoom(room.id,{dormantSeconds:state.dormantSeconds});if(visible&&!previous)state.activationCount++;
    }return activity();
  }
  function activity(){return Object.fromEntries([...states].map(([id,s])=>[id,{state:s.state,visible:s.visible,updating:s.updating,reason:s.lastReason,resident:true,attachedToRenderScene:s.root.parent===scene,parked:s.root.parent===residentCache}]));}
  function diagnostics(){return{enabled:enabledValue,residency:'resident',resourcesUnloaded:false,residentParking:true,gpuResources:resourceManager?.getDiagnostics()||null,clock,evaluations,rooms:Object.fromEntries([...states].map(([id,s])=>[id,{...activity()[id],ownedRoots:s.ownedRoots,adoptedMeshes:s.adoptedMeshes,activationCount:s.activationCount,dormantSeconds:s.dormantSeconds}]))};}
  return{registerRoot,adoptArchitecture,evaluate,getActivity:activity,getDiagnostics:diagnostics,getRoot:id=>states.get(id)?.root||null,
    getInventoryRoots(){return[residentCache,...[...states.values()].flatMap(state=>[state.root,...state.registeredRoots])];},
    setResourceManager(manager){if(resourceManager&&resourceManager!==manager)resourceManager.setEnabled(false);resourceManager=manager;return resourceManager;},
    setEnabled(value){enabledValue=!!value;if(lastContext)evaluate({...lastContext,dt:0});return enabledValue;},dispose(){resourceManager?.dispose();for(const {root}of states.values())root.removeFromParent();states.clear();}};
}
