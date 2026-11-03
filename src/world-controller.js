import * as THREE from 'three';
import {activities,activityById,catalogActivities} from './activity-catalog.js';
import {buildLocomotionPose,buildMovementPose} from './locomotion.js';
import {createGymCrowd} from './crowd.js';
import {createSocialCrowd} from './social-crowd.js';
import {createPlayerActivity} from './player-activity.js';
import {createPoseReview} from './pose-review.js';
import {transformBody,transformSurface,inversePoint} from './lifecycle-frame.js';
import {GYM_LAYOUT,floorHeightAt,zoneAt} from './gym-layout.js';
import {evaluateExerciseClearance,evaluateSurfaceClearance,evaluateSelfClearance} from './collision-validation.js';
import {createRenderQuality} from './render-quality.js';
import {ROOM_ZONES,roomContains} from './room-zones.js';
import {createRoomResourceManager} from './room-gpu-resources-v011.js';
import {createNavigationSearch} from './navigation-search-v012.js';
import {createPerformanceCapture} from './performance-capture-v015.js';
import {motionSourceInfo,motionCoverage} from './motion-sources-v018.js';
const clamp=THREE.MathUtils.clamp;
export async function createWorldController({scene,renderer,camera,canvas,character,machineMap,exerciseRig,architecture,groupClasses,batcher,flatTransparency,colliders,geometries,extraMaterials,textures,materials,environmentTarget,mesh,onNearbyChange,onZoneChange,onPoseProgress,onReady,onTransition,onAssetProgress=()=>{},onActivityChange=()=>{}}) {
  const floorHeight=floorHeightAt;
  const bounds=GYM_LAYOUT.bounds,spawn=GYM_LAYOUT.spawn;
  const neutral=character.getAssetInfo().metrics.neutral;
  character.group.position.set(spawn.x,floorHeight(spawn.x,spawn.z),spawn.z);
  character.group.rotation.y = Math.PI;

  let enabled = true, viewEnabled = true, yaw = 0.3, pitch = 0.38, distance = 7.8;
  let dragging = false, downX = 0, downY = 0;
  let nearId = null, zone = '', targetId = null, activeId = null;
  let activeTime = 0, animationSpeed = 1, animationPaused = false;
  let lastContactPose = null,lastActivityFrame=null;
  let transitionRemaining=0,forcedPhase=null,pendingStart=null,lifecycle='idle',lifecycleTime=0;
  let previousPlayer = null, previousCamera = null, walkTime = 0, elapsed = 0, frameTime = 0, cameraOffset = 0;
  let inspectionView=null;
  const captureReview=createPoseReview({renderer,scene,character,runtime:exerciseRig,batcher});
  const renderQuality=createRenderQuality({renderer});
  const performanceCapture=createPerformanceCapture({getContext:()=>({quality:renderQuality.diagnostics(),framebuffer:[canvas.width,canvas.height],viewport:[window.innerWidth,window.innerHeight],browser:navigator.userAgent,position:character.group.position.toArray(),activity:playerActivity.getState().exerciseId||null}),onComplete:status=>window.dispatchEvent(new CustomEvent('form-performance-complete',{detail:status}))});
  let runBlend=0,movementBlend=0,currentMoveSpeed=0,cameraOffsetY=0;
  const touchMovement={x:0,y:0,running:false},viewPointers=new Map();let pinchDistance=null;
  function resetTouch(){touchMovement.x=0;touchMovement.y=0;touchMovement.running=false;}
  function resetViewGesture(){dragging=false;viewPointers.clear();pinchDistance=null;}
  let batchOverride=null,sparseRoom=false;
  function applyBatchPolicy(){
    const position=character.group.position,padding=sparseRoom?1.2:-.4;
    sparseRoom=Object.values(ROOM_ZONES).some(room=>roomContains(position,room,padding));
    const wanted=batchOverride??!(renderQuality.active==='flow'&&sparseRoom);
    if(batcher&&batcher.getDiagnostics().enabled!==wanted)batcher.setEnabled(wanted);
  }
  const keys = new Set();
  const targetFocus = new THREE.Vector3(spawn.x,1.2,spawn.z);
  const cameraFocus = targetFocus.clone();
  const desiredCamera = new THREE.Vector3();
  const targetMarker = new THREE.Group(); scene.add(targetMarker); targetMarker.visible = false;
  const ringMat = new THREE.MeshBasicMaterial({ color: '#c3f28f', transparent: true, opacity: 0.85, side: THREE.DoubleSide }); extraMaterials.add(ringMat);
  const targetRing = mesh(new THREE.RingGeometry(0.66, 0.73, 48), ringMat, targetMarker, 0, 0.085, 0); targetRing.rotation.x = -Math.PI / 2; targetRing.castShadow = false;
  const arrow = mesh(new THREE.ConeGeometry(0.2, 0.4, 4), ringMat, targetMarker, 0, 2.7, 0); arrow.rotation.z = Math.PI; arrow.castShadow = false;
  const lineMaterial = new THREE.LineDashedMaterial({ color: '#caee9f', dashSize: 0.32, gapSize: 0.2, transparent: true, opacity: 0.65 }); extraMaterials.add(lineMaterial);
  let pathLine = new THREE.Line(new THREE.BufferGeometry(), lineMaterial); scene.add(pathLine); geometries.add(pathLine.geometry);
  let lastRoutePosition = new THREE.Vector3(999, 0, 999), routeAge = 99;

  const ignoresKeys = target => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');
  function keyDown(event) {
    if (!enabled || ignoresKeys(event.target)) return;
    const physical={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',ShiftLeft:'shift',ShiftRight:'shift'};
    const key = physical[event.code]||event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift', ' '].includes(key)) {
      keys.add(key);if(event.shiftKey)keys.add('shift');event.preventDefault();
    }
  }
  function keyUp(event) {const physical={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',ShiftLeft:'shift',ShiftRight:'shift'};keys.delete(physical[event.code]||event.key.toLowerCase());if(!event.shiftKey)keys.delete('shift');}
  function blur() { keys.clear(); resetTouch();resetViewGesture(); }
  function visibilityChange(){if(document.hidden)blur();}
  function pointerDown(event) {
    if (!viewEnabled || (!enabled && !activeId) || event.pointerType==='mouse'&&event.button!==0 || viewPointers.size>=2) return;
    viewPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});dragging=true;
    if(viewPointers.size===2){const [a,b]=viewPointers.values();pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);}else{downX=event.clientX;downY=event.clientY;}
    try{canvas.setPointerCapture?.(event.pointerId);}catch{}event.preventDefault();
  }
  function pointerMove(event) {
    if (!viewEnabled || !dragging || (!enabled && !activeId)||!viewPointers.has(event.pointerId)) return;
    viewPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(viewPointers.size===2){const [a,b]=viewPointers.values(),next=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>2&&next>2)distance=clamp(distance*pinchDistance/next,3.6,18);pinchDistance=next;}
    else{yaw-=(event.clientX-downX)*.005;pitch=clamp(pitch+(event.clientY-downY)*.004,.15,1.12);downX=event.clientX;downY=event.clientY;}
    event.preventDefault();
  }
  function pointerUp(event) {if(!viewPointers.delete(event.pointerId))return;pinchDistance=null;dragging=viewPointers.size>0;const remaining=viewPointers.values().next().value;if(remaining){downX=remaining.x;downY=remaining.y;}}
  function wheel(event) { if (!viewEnabled || (!enabled && !activeId)) return; event.preventDefault(); distance = clamp(distance + event.deltaY * 0.008, 3.6, 18); }
  window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange',visibilityChange);canvas.style.touchAction='none';
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp);canvas.addEventListener('lostpointercapture',pointerUp); canvas.addEventListener('wheel', wheel, { passive: false });

  const navigation=createNavigationSearch({THREE,bounds,colliders,getDynamicObstacles:()=>exerciseRig.getNavigationObstacles?.()||[]});
  const blocked=navigation.blocked;
  function getZone(x, z) {
    const mapped=zoneAt(x,z);
    if(x>10&&z>7)return mapped;
    let closestStation = null, stationDistance = 3.1;
    for (const machine of machineMap.values()) {
      const distance = Math.hypot(x-machine.group.position.x,z-machine.group.position.z);
      if(distance<stationDistance){closestStation=machine.station;stationDistance=distance;}
    }
    if(closestStation)return closestStation.zone;
    return mapped;
  }
  const findPath=navigation.findPath;
  const crowd=createGymCrowd({THREE,scene,character,machines:machineMap,activities,floorHeight,findPath,blocked});
  const socialCrowd=createSocialCrowd({THREE,scene,character,anchors:architecture.getSceneAnchors?.()||{},floorHeight,groupClasses});
  const roomResources=createRoomResourceManager({
    scene,
    rooms:{classroom:architecture.roomZones.getRoot('classroom'),bathroom:architecture.roomZones.getRoot('bathroom')},
    getInventoryRoots:()=>[...architecture.roomZones.getInventoryRoots(),...(groupClasses?.getInventoryRoots?.()||[]),...(exerciseRig.getInventoryRoots?.()||[]),...[...machineMap.values()].flatMap(machine=>[machine.group,...(machine.getBatchRoots?.()||[])].filter(Boolean))],
    getProtectedResources:()=>({character:character.getGpuResourceProtection(),globalMaterials:Object.values(materials),environment:environmentTarget.texture}),
    cooldownSeconds:12,
  });
  architecture.roomZones.setResourceManager(roomResources);
  let npcLodEnabled=true;
  function updateNpcView(){
    const context={cameraPosition:camera.position,playerPosition:character.group.position,quality:renderQuality.active};
    crowd.setViewContext?.(context);socialCrowd.setViewContext?.(context);
  }
  function updateRoute() {
    if (!targetId || activeId) { pathLine.visible = false; return; }
    const target = machineMap.get(targetId); if (!target) return;
    targetMarker.position.copy(target.interaction);
    const points = findPath(character.group.position, target.interaction);
    geometries.delete(pathLine.geometry); pathLine.geometry.dispose();
    pathLine.geometry = new THREE.BufferGeometry().setFromPoints(points); geometries.add(pathLine.geometry);
    pathLine.computeLineDistances(); pathLine.visible = points.length > 1;
    lastRoutePosition.copy(character.group.position); routeAge = 0;
  }
  function setTarget(id) {
    targetId = machineMap.has(id) ? id : null;
    targetMarker.visible = !!targetId;
    if (targetId) targetMarker.position.copy(machineMap.get(targetId).interaction);
    updateRoute();
  }
  const playerActivity=createPlayerActivity({THREE,character,runtime:exerciseRig,crowd,findPath,floorHeight,
    onFrame(frame){lastActivityFrame=frame;lastContactPose=frame?.pose||null;},
    onChange(event){if(event.status==='approaching'||event.status==='finished'){runBlend=0;movementBlend=0;currentMoveSpeed=0;}
      activeId=event.status==='finished'?null:event.id;keys.clear();
      if(event.status==='approaching'){previousCamera={yaw,pitch,distance};}
      if(event.status==='entering'){
        const setup=exerciseRig.getSetup(event.id),definition=activityById(event.id);
        zone=machineMap.get(definition.stationId)?.station.zone||getZone(setup.origin[0],setup.origin[2]);onZoneChange(zone);
        yaw=(setup.cameraYaw??.9)+(setup.rotation||0);pitch=setup.cameraPitch??.32;distance=setup.cameraDistance??4.5;
      }
      if(event.status==='finished'){if(previousCamera)({yaw,pitch,distance}=previousCamera);updateRoute();}
      if(nearId!==null){nearId=null;onNearbyChange(null);}
      onActivityChange(event);
    },onProgress:onPoseProgress});
  function syncActivity(){const state=playerActivity.getState();activeId=state.exerciseId;activeTime=state.phase*(exerciseRig.getSetup(activeId)?.duration||6);lifecycle=state.stage;animationPaused=state.paused;pendingStart=state.waitingForOccupant?state.exerciseId:null;}
  function startExercise(id){const started=playerActivity.start(id);syncActivity();return started;}
  function stopExercise(){playerActivity.stop();syncActivity();}
  function contactDiagnostics(){
    const body=character.getContactPoints(),compare=(expected,actual)=>(expected||[]).map((point,index)=>({expected:[...point],actual:[...(actual?.[index]||[NaN,NaN,NaN])],error:Math.hypot(...point.map((value,axis)=>value-(actual?.[index]?.[axis]??NaN)))}));
    const hands=compare(lastContactPose?.hands,body.hands),feet=compare(lastContactPose?.feet,body.feet);
    const rendered=activeId&&!lastActivityFrame?.walking?exerciseRig.getActualContacts(activeId):null;
    const compareGear=kind=>(rendered?.[kind]||[]).flatMap((point,index)=>lastActivityFrame?.contacts?.[kind]?.[index]?[{index,expected:point,actual:(transformBody(body,lastActivityFrame)[kind]||[])[index],error:Math.hypot(...point.map((v,axis)=>v-transformBody(body,lastActivityFrame)[kind][index][axis]))}]:[]);
    return {exerciseId:activeId,stationId:activityById(activeId)?.stationId,hands,feet,maxContactError:Math.max(0,...hands.map(p=>p.error),...feet.map(p=>p.error)),maxReachError:body.maxReachError,body,gearHands:compareGear('hands'),gearFeet:compareGear('feet'),stage:playerActivity.getState().stage,frame:lastActivityFrame?{offset:lastActivityFrame.offset,rotation:lastActivityFrame.rotation,contacts:lastActivityFrame.contacts,stage:lastActivityFrame.stage}:null};
  }
  function plateState(id) {
    const machine=machineMap.get(id);
    if(machine?.getPlateState)return machine.getPlateState();
    const visiblePlates={left:0,right:0};
    machine?.group.traverse(object=>{if(object.userData.plateSide && object.visible){let visible=true;for(let parent=object.parent;parent&&parent!==machine.group;parent=parent.parent)if(!parent.visible)visible=false;if(visible)visiblePlates[object.userData.plateSide]++;}});
    return {kgPerSide:machine?.getPlateLoad?.()??null,visiblePlates};
  }
  function update(delta,renderFrame=true) {
    const cpuStart=performance.now();
    const dt = clamp(delta || 0, 0, 0.05); elapsed += dt; routeAge += dt;
    const roomActivity=architecture.updateRoomState?.({dt,playerPosition:character.group.position,camera,cameraPosition:camera.position,cameraTarget:inspectionView?.target||cameraFocus,activeStationId:playerActivity.getState().stationId});
    if(roomActivity){groupClasses?.setRoomActivity?.(roomActivity.classroom);socialCrowd.setClassRoomActivity?.(roomActivity.classroom);}
    architecture.update(elapsed,dt);
    crowd.update(dt,pendingStart?null:activityById(activeId)?.stationId,{viewerPosition:character.group.position,quality:renderQuality.active});

    if(transitionRemaining>0){transitionRemaining=Math.max(0,transitionRemaining-dt);onTransition(Math.min(1,transitionRemaining/.28));}
    if(playerActivity.isActive()){playerActivity.update(dt);syncActivity();}
    const followingCourse=activityById(activeId)?.facilityKind==='groupClass'&&['exercising','completed'].includes(lifecycle),classPhase=followingCourse?playerActivity.getState().phase:null;
    groupClasses?.update(dt,{phase:classPhase,active:followingCourse});
    socialCrowd.update(dt,{classPhase});
    if(!playerActivity.isActive()){
      let forward = 0, sideways = 0;
      if (enabled) { forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0); sideways = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0); }
      const keyboardMoving=!!(forward||sideways);if(enabled&&!keyboardMoving){forward=touchMovement.y;sideways=touchMovement.x;}
      const magnitude=keyboardMoving?1:enabled?Math.min(1,Math.hypot(forward,sideways)):0,moving=magnitude>.001;
      runBlend+=(Number(moving&&(keys.has('shift')||touchMovement.running))-runBlend)*(1-Math.exp(-dt*10));movementBlend+=(magnitude-movementBlend)*(1-Math.exp(-dt*18));
      if (moving) {
        const direction = new THREE.Vector3(Math.cos(yaw) * sideways - Math.sin(yaw) * forward, 0, -Math.sin(yaw) * sideways - Math.cos(yaw) * forward).normalize();
        const speed = (1.8+2.4*runBlend)*magnitude;currentMoveSpeed=speed;
        const p = character.group.position;
        const stepX = direction.x * speed * dt, stepZ = direction.z * speed * dt;
        if (!blocked(p.x + stepX, p.z)) p.x += stepX;
        if (!blocked(p.x, p.z + stepZ)) p.z += stepZ;
        p.y=floorHeight(p.x,p.z);
        const heading = Math.atan2(direction.x, direction.z), current = character.group.rotation.y;
        character.group.rotation.y += Math.atan2(Math.sin(heading - current), Math.cos(heading - current)) * Math.min(1, dt * 13);
        walkTime+=dt*magnitude;
        character.pose(buildMovementPose(character.getAssetInfo().metrics,walkTime,runBlend,movementBlend));
      } else {currentMoveSpeed=0;if(movementBlend>.002){walkTime+=dt;character.pose(buildMovementPose(character.getAssetInfo().metrics,walkTime,runBlend,movementBlend));}else character.pose(buildLocomotionPose(character.getAssetInfo().metrics,elapsed,0));}
      const p = character.group.position;
      let nearest = null, nearestDistance = 2.0;
      for (const machine of machineMap.values()) {
        const d = machine.interaction.distanceTo(p);
        if (d < nearestDistance) { nearest = machine; nearestDistance = d; }
      }
      const nextNear = nearest?.station.id || null;
      if (nextNear !== nearId) { nearId = nextNear; onNearbyChange(nearest?.station || null); }
      const nextZone = getZone(p.x, p.z);
      if (nextZone !== zone) { zone = nextZone; onZoneChange(zone); }
      if (targetId && (routeAge > 2 || (routeAge > 0.45 && lastRoutePosition.distanceTo(p) > 1.2))) updateRoute();
    }
    if (targetId) { arrow.position.y = 2.65 + Math.sin(elapsed * 2.8) * 0.12; targetRing.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.04); }
    const mobileLayout=document.body.classList.contains('has-mobile-controls'),panel=activeId&&(window.innerWidth>650||mobileLayout)?document.querySelector('.station-panel'):null,rect=panel?.getBoundingClientRect();
    const sidePanel=rect&&(!mobileLayout||rect.top<window.innerHeight*.25&&rect.width<window.innerWidth*.6);
    const nextOffset=sidePanel?(window.innerWidth-rect.left)/2:0,headerBottom=mobileLayout?document.querySelector('.topbar')?.getBoundingClientRect().bottom||0:0;
    const nextOffsetY=rect&&mobileLayout&&!sidePanel?Math.max(0,window.innerHeight/2-(headerBottom+rect.top)/2):0;
    if (Math.abs(cameraOffset-nextOffset)>.5||Math.abs(cameraOffsetY-nextOffsetY)>.5) {
      cameraOffset = nextOffset;cameraOffsetY=nextOffsetY;
      if (cameraOffset||cameraOffsetY) camera.setViewOffset(window.innerWidth, window.innerHeight, cameraOffset, cameraOffsetY, window.innerWidth, window.innerHeight);
      else camera.clearViewOffset();
    }
    if(activeId&&lastContactPose?.hip&&lastContactPose?.shoulder){targetFocus.fromArray(lastContactPose.hip.map((v,i)=>(v+lastContactPose.shoulder[i])/2));character.group.localToWorld(targetFocus);}
    else targetFocus.copy(character.group.position).y+=1.1;
    cameraFocus.lerp(targetFocus, 1 - Math.exp(-dt * 7));
    const horizontal = Math.cos(pitch) * distance;
    desiredCamera.set(cameraFocus.x + Math.sin(yaw) * horizontal, cameraFocus.y + Math.sin(pitch) * distance, cameraFocus.z + Math.cos(yaw) * horizontal);
    // Keep side and rear walls in front of the follow camera without snapping it.
    desiredCamera.x=clamp(desiredCamera.x,bounds.minX+.4,bounds.maxX-.4);desiredCamera.z=Math.max(bounds.minZ+.4,desiredCamera.z);
    if(inspectionView){camera.clearViewOffset();camera.position.copy(inspectionView.position);camera.lookAt(inspectionView.target);}
    else {camera.position.lerp(desiredCamera,1-Math.exp(-dt*9));camera.lookAt(cameraFocus);}
    updateNpcView();
    architecture.updateView?.(camera.position,inspectionView?.target||cameraFocus);
    if(renderFrame){
      const visibleRooms=architecture.updateRoomState?.({dt:0,playerPosition:character.group.position,camera,cameraPosition:camera.position,cameraTarget:inspectionView?.target||cameraFocus,activeStationId:playerActivity.getState().stationId});
      if(visibleRooms){groupClasses?.setRoomActivity?.(visibleRooms.classroom);socialCrowd.setClassRoomActivity?.(visibleRooms.classroom);if(visibleRooms.classroom.visible!==roomActivity?.classroom.visible){groupClasses?.update(0,{phase:classPhase,active:followingCourse});socialCrowd.update(0,{classPhase});}}
    }
    if(renderFrame)architecture.prepareRender?.(camera);
    const renderStart=performance.now();if(renderFrame){applyBatchPolicy();renderQuality.beforeRender(elapsed,runBlend>.2);renderer.render(scene,camera);}renderQuality.observe(renderStart-cpuStart,renderFrame?performance.now()-renderStart:null);
  }
  const horizontal = Math.cos(pitch) * distance;
  camera.position.set(spawn.x+Math.sin(yaw)*horizontal,1.1+Math.sin(pitch)*distance,spawn.z+Math.cos(yaw)*horizontal);
  camera.lookAt(cameraFocus);
  onAssetProgress('正在準備場館畫面…');
  await renderer.compileAsync(scene,camera);
  renderer.render(scene, camera); onReady();
  return {
    update,
    setEnabled(value) { enabled = !!value; if (!enabled) { keys.clear();resetTouch();resetViewGesture(); } },
    setTouchMovement(value={}){const x=Number.isFinite(value.x)?value.x:0,y=Number.isFinite(value.y)?value.y:0,length=Math.hypot(x,y),scale=length>1?1/length:1;touchMovement.x=enabled?x*scale:0;touchMovement.y=enabled?y*scale:0;touchMovement.running=enabled&&!!value.running;},
    setViewEnabled(value){viewEnabled=!!value;if(!viewEnabled)resetViewGesture();},
    getTouchDiagnostics(){return{...touchMovement,pointers:viewPointers.size};},
    getMotionSource(id=activeId){return motionSourceInfo(id);},
    getMotionCoverage(){return motionCoverage(catalogActivities).map(row=>({...row,transitions:exerciseRig.getCapturedTransitionCoverage?.(row.id)||row.transitions}));},
    getTransitionMotionSource(id=activeId){return id?exerciseRig.getCapturedTransitionCoverage?.(id)||null:null;},
    getViewDiagnostics(){return{yaw,pitch,distance,offsetX:cameraOffset,offsetY:cameraOffsetY,pointers:viewPointers.size};},
    setTarget, startExercise, stopExercise,
    setAnimationSpeed(value) { animationSpeed=clamp(Number(value)||1,.25,2);playerActivity.setSpeed(animationSpeed); },
    setAnimationPaused(value) { playerActivity.setPaused(value);syncActivity(); },
    seekExercise(phase){const changed=playerActivity.seek(phase);syncActivity();return changed;},
    restartCourse(){const changed=playerActivity.restartCourse();syncActivity();return changed;},
    getPlayerPosition(){const p=activeId&&lastContactPose?.hip?character.group.localToWorld(new THREE.Vector3(lastContactPose.hip[0],0,lastContactPose.hip[2])):character.group.position;return{x:p.x,z:p.z};},
    getHeading() { return character.group.rotation.y; },
    getMuscleHighlights() { return character.getMuscleHighlights(); },
    setMuscleHighlights(primary=[],secondary=[]){character.setMuscleHighlights(primary,secondary);},
    setMuscleOverlayEnabled(value){character.setMuscleOverlayEnabled(value);},
    getModelInfo(){return character.getAssetInfo();},
    getHandDiagnostics(){return character.getHandDiagnostics();},
    getCrowdDiagnostics(){return crowd.getDiagnostics();},
    getSocialDiagnostics(options={}){return socialCrowd.getDiagnostics(options);},
    getNpcLodDiagnostics(){return{enabled:npcLodEnabled,player:character.getGeometryLodDiagnostics?.()||null,crowd:crowd.getGeometryLodDiagnostics?.()||null,social:socialCrowd.getGeometryLodDiagnostics?.()||null};},
    setNpcLodEnabled(value){npcLodEnabled=!!value;crowd.setGeometryLodEnabled?.(npcLodEnabled);socialCrowd.setGeometryLodEnabled?.(npcLodEnabled);updateNpcView();return npcLodEnabled;},
    getOccupancy(id){return crowd.getOccupancy(id);},
    getFacilityDiagnostics(){return architecture.getDiagnostics();},
    getClassDiagnostics(){return groupClasses?.getDiagnostics()||null;},
    getCoachRoster(){return architecture.getCoachRoster?.()||[];},
    getLayout(){return GYM_LAYOUT;},
    getActivityState:playerActivity.getState,
    getActivityHistory:playerActivity.getHistory,
    getLastCompletedActivity:playerActivity.getLastCompleted,
    getBodyWorldPoints(){const body=character.getContactPoints();body.hip=body.hips[0].map((v,i)=>(v+body.hips[1][i])/2);body.shoulder=body.shoulders[0].map((v,i)=>(v+body.shoulders[1][i])/2);return transformBody(body,{offset:character.group.position.toArray(),rotation:character.group.rotation.y});},
    getLifecycleMetadata:playerActivity.getMetadata,
    getContactDiagnostics:contactDiagnostics,
    inspectExercise(phase,cycle=phase){if(!playerActivity.inspect(phase,cycle))return null;return contactDiagnostics();},
    inspectLifecycle(direction,u){const frame=playerActivity.inspectLifecycle(direction,u);return frame?{frame,contact:contactDiagnostics(),clearance:evaluateExerciseClearance(transformBody(character.getContactPoints(),frame),exerciseRig.getCollisionVolumes(activeId))}:null;},
    getClearanceDiagnostics(){if(!activeId||lastActivityFrame?.walking)return null;return evaluateExerciseClearance(transformBody(character.getContactPoints(),lastActivityFrame||{}),exerciseRig.getCollisionVolumes(activeId));},
    getSelfClearanceDiagnostics(){if(!activeId)return null;return evaluateSelfClearance(character.getContactPoints());},
    getSurfaceDiagnostics(options={}){if(!activeId||lastActivityFrame?.walking)return null;return evaluateSurfaceClearance(transformSurface(character.getSurfaceSamples(options),lastActivityFrame||{}),exerciseRig.getCollisionVolumes(activeId));},
    getRigContacts(){return activeId?exerciseRig.getActualContacts(activeId):null;},
    getLifecyclePropState(id){return exerciseRig.getLifecycleState?.(id);},
    advanceUntilReady(maxSeconds=150,renderFrame=true){if(!import.meta.env.DEV)return false;for(let t=0;t<maxSeconds&&playerActivity.isActive()&&playerActivity.getState().stage!=='exercising';t+=.05)update(.05,false);if(renderFrame)update(0);return playerActivity.getState().stage==='exercising';},
    advanceUntilIdle(maxSeconds=150,renderFrame=true){if(!import.meta.env.DEV)return false;for(let t=0;t<maxSeconds&&playerActivity.isActive();t+=.05)update(.05,false);if(renderFrame)update(0);return !playerActivity.isActive();},
    capturePoseReview(view='front',size=420){if(!activeId)return null;return captureReview(activeId,view,size,lastContactPose||{});},
    getRenderStats(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
    getFlatTransparentDiagnostics(){return{materials:flatTransparency?.materialCount||0,planes:flatTransparency?.planeCount||0,singlePass:flatTransparency?.materials.every(entry=>entry.material.forceSinglePass)??false};},
    setFlatTransparentSinglePass(value){if(!import.meta.env.DEV)return false;for(const entry of flatTransparency?.materials||[]){entry.material.forceSinglePass=!!value;entry.material.needsUpdate=true;}return true;},
    getRoomDiagnostics(){return architecture.roomZones?.getDiagnostics()||null;},
    getRoomResourceDiagnostics(){return{...roomResources.getDiagnostics(),rendererMemory:{...renderer.info.memory},programCount:renderer.info.programs?.length||0};},
    getRoomResourceInventory(){return roomResources.inspect();},
    setRoomResourceManagementEnabled(value){return roomResources.setEnabled(value);},
    evictDormantRoomGpuResources(id){return import.meta.env.DEV?roomResources.sleepRoom(id,{force:true}):false;},
    getBatchDiagnostics(){if(!batcher)return null;const d=batcher.getDiagnostics();return{...d,...(!d.enabled?{visibleInstances:0,visibleOriginals:0,instancedVisibleCount:0,liveProxyCount:0,visibleSavedCalls:0,frustumCulledInstances:0,matrixUpdatesLastFrame:0,boundsUpdatesLastFrame:0,updateCpuMs:0}:{}),countersTracked:d.enabled,preference:batchOverride===null?'auto':batchOverride?'on':'off',sparseRoom,policy:batchOverride!==null?'manual':renderQuality.active==='flow'&&sparseRoom?'original-in-sparse-room':'instance-main-floor'};},
    setBatchingEnabled(value){batchOverride=typeof value==='boolean'?value:null;applyBatchPolicy();return batcher?.getDiagnostics().enabled;},
    setRoomManagementEnabled(value){return architecture.roomZones?.setEnabled(value);},
    getEquipmentOptions(id){return exerciseRig.getEquipmentOptions(id);},
    getEquipmentSettings(id){return exerciseRig.getEquipmentSettings(id);},
    setEquipmentSettings(id,settings){if(playerActivity.isActive())return{ok:false,reason:'請先放回器材並離開，再更換設定。'};return exerciseRig.setEquipmentSettings(id,settings);},
    captureMovementReview(time=0,runAmount=1,movementAmount=1,view='front',size=420){if(!import.meta.env.DEV||playerActivity.isActive())return null;const pose=buildMovementPose(character.getAssetInfo().metrics,time,runAmount,movementAmount);character.pose(pose);return captureReview(null,view,size,pose);},
    getPerformanceDiagnostics(){return{...renderQuality.diagnostics(),running:runBlend>.5&&currentMoveSpeed>0,runBlend,movingSpeed:currentMoveSpeed};},
    getFrameWorkDiagnostics(){return{canvas:architecture.getDiagnostics().canvasUpdates,skeleton:character.getSkeletonDiagnostics?.()||null,navigation:navigation.getDiagnostics()};},
    recordFrameTiming(milliseconds){renderQuality.recordFrame(milliseconds);performanceCapture.record(milliseconds);},
    startPerformanceCheck(seconds=20){return performanceCapture.start(seconds);},
    stopPerformanceCheck(reason){performanceCapture.cancel(reason);},
    getPerformanceCheckStatus(){return performanceCapture.getStatus();},
    getPerformanceCheckReport(){return performanceCapture.getReport();},
    setGraphicsQuality(value){const changed=renderQuality.setPreference(value);this.resize();return changed;},
    getNavigationDiagnostics(){const start=new THREE.Vector3(spawn.x,0,spawn.z);return [...machineMap.values()].map(machine=>({id:machine.station.id,interaction:{x:machine.interaction.x,z:machine.interaction.z},blocked:blocked(machine.interaction.x,machine.interaction.z),reachable:findPath(start,machine.interaction).length>1}));},
    inspectLocomotion(time,speed=1){if(activeId){playerActivity.stop();for(let t=0;t<150&&playerActivity.isActive();t+=.05)update(.05,false);}character.pose(buildLocomotionPose(character.getAssetInfo().metrics,time,speed));return {hands:character.getHandDiagnostics(),body:character.getContactPoints()};},
    inspectView(view=null){if(!import.meta.env.DEV)return false;inspectionView=view?{position:new THREE.Vector3(...view.position),target:new THREE.Vector3(...view.target)}:null;cameraOffset=-1;update(0);return true;},
    placePlayerAtStation(id){if(!import.meta.env.DEV)return false;const machine=machineMap.get(id);if(!machine)return false;if(activeId){playerActivity.stop();for(let t=0;t<150&&playerActivity.isActive();t+=.05)update(.05,false);}character.group.position.copy(machine.interaction);character.group.position.y=floorHeight(machine.interaction.x,machine.interaction.z);return true;},
    setPlateLoad(id,kg){const machine=machineMap.get(id);if(!machine?.setPlateLoad||![5,10,20].includes(Number(kg)))return false;machine.setPlateLoad(Number(kg));return true;},
    getPlateLoad(id){return machineMap.get(id)?.getPlateLoad?.();},
    getPlateState:plateState,
    resize() {resetTouch();resetViewGesture();camera.aspect = window.innerWidth / window.innerHeight; camera.clearViewOffset(); cameraOffset = -1;cameraOffsetY=0; camera.updateProjectionMatrix(); renderQuality.resize(); },
    dispose() {
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange',visibilityChange);canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp);canvas.removeEventListener('lostpointercapture',pointerUp); canvas.removeEventListener('wheel', wheel);
      roomResources.dispose();environmentTarget.dispose();
      batcher?.dispose();exerciseRig.end();socialCrowd.dispose();crowd.dispose();architecture.dispose?.();character.dispose();
      geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); extraMaterials.forEach(m => m.dispose()); Object.values(materials).forEach(m => m.dispose()); renderer.dispose();
    },
  };
}
