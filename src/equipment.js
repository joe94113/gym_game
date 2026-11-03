import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {buildLocomotionPose} from './locomotion.js';
import {buildRackSquatExercisePose,rackGripTargets,SQUAT_RACK_SUPPORT} from './barbell-lifecycle-paths.js';
import {machineAdjustmentsFor,defaultCalibration,validateCalibrationPatch,seatOffsetMeters,decomposePlateLoad} from './equipment-calibration-v013.js';
import {lowerBodyCapturedEffort} from './lower-body-capture-v018.js';

/** Machine-local motion and contact targets are evaluated together. A grip or
 * pedal never has a second, independently tuned animation in the character. */
export function createEquipmentSystem({ THREE, scene, stations, materials, geometries, extraMaterials, textures, label, collider, characterMetrics={}, bikeGripPreset=null }) {
  const UP = new THREE.Vector3(0, 1, 0);
  const signs = [-1, 1];
  const neutral=characterMetrics.neutral||{},torso=characterMetrics.torsoLength||.455317;
  const headLength=neutral.head&&neutral.shoulder?neutral.head[1]-neutral.shoulder[1]:.2086;
  const hipHeight=neutral.hip?.[1]||.93434,footForward=characterMetrics.footForwardOffset||.1303,footHeight=characterMetrics.footHeightOffset||.0796;
  const upperLeg=characterMetrics.legs?.[0]?.upper||.41987,lowerLeg=characterMetrics.legs?.[0]?.lower||.42887;
  const own = material => (extraMaterials.add(material), material);
  const mat = {
    frame: materials.graphite,
    metal: materials.steel,
    chrome: materials.chrome,
    rubber: materials.black,
    pad: own(new THREE.MeshStandardMaterial({ color: '#263d35', roughness: .8 })),
    seam: own(new THREE.MeshStandardMaterial({ color: '#688574', roughness: .92 })),
    rim: own(new THREE.MeshStandardMaterial({ color: '#a0aea5', roughness: .3, metalness: .8 })),
    plate: own(new THREE.MeshStandardMaterial({ color: '#1d2823', roughness: .7, metalness: .15 })),
    cable: own(new THREE.MeshStandardMaterial({ color: '#242925', roughness: .5, metalness: .5 })),
    accent: materials.accent,
  };
  const geometryCache = new Map();
  function cached(key, make) { if (!geometryCache.has(key)) {const geometry=make();geometryCache.set(key,geometry);geometries.add(geometry);} return geometryCache.get(key); }
  function mesh(parent, geometry, material, x=0,y=0,z=0) { const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m; }
  function box(parent,x,y,z,w,h,d,material=mat.frame,r=.035) {const object=mesh(parent,cached(`box:${w}:${h}:${d}:${r}`,()=>new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/3,h/3,d/3))),material,x,y,z);if([mat.frame,mat.metal,mat.rubber].includes(material))object.userData.collisionShape={shape:'box',size:[w,h,d],allowedBodyParts:h<.24&&y<.4?['leftFoot','rightFoot']:[]};return object;}
  function cyl(parent,x,y,z,r,h,material=mat.chrome) {return mesh(parent,cached(`cyl:${r}:${h}`,()=>new THREE.CylinderGeometry(r,r,h,16)),material,x,y,z);}
  function sphere(parent,x,y,z,r,material) {return mesh(parent,cached(`s:${r}`,()=>new THREE.SphereGeometry(r,14,10)),material,x,y,z);}
  function rod(parent,a,b,r=.045,material=mat.frame) {const m=cyl(parent,0,0,0,r,1,material);setRod(m,a,b);if([mat.frame,mat.metal].includes(material))m.userData.collisionShape={shape:'capsule',radius:r,allowedBodyParts:[]};return m;}
  function setRod(object,a,b) {const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.sub(av);object.position.copy(av).addScaledVector(v,.5);object.scale.y=v.length();object.quaternion.setFromUnitVectors(UP,v.normalize());}
  function batchRigid(parent) {
    const batches=new Map();for(const object of [...parent.children]){if(!object.isMesh||object.material.transparent||Array.isArray(object.material))continue;if(!batches.has(object.material))batches.set(object.material,[]);batches.get(object.material).push(object);}
    for(const [material,objects]of batches){if(objects.length<2)continue;const pieces=objects.map(object=>{object.updateMatrix();const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();return geometry.applyMatrix4(object.matrix);});const combined=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());if(combined){geometries.add(combined);mesh(parent,combined,material);objects.forEach(object=>object.removeFromParent());}}
  }
  function beam(parent,a,b,w=.085,d=.085,material=mat.frame) {const m=box(parent,0,0,0,w,1,d,material,.02);setRod(m,a,b);return m;}
  function bolt(parent,x,y,z,axis='x') {const b=cyl(parent,x,y,z,.025,.035,mat.rim);b.rotation[axis==='x'?'z':'x']=Math.PI/2;return b;}
  function pad(parent,x,y,z,w,h,d) {const m=box(parent,x,y,z,w,h,d,mat.pad,.07);m.userData.collisionShape={shape:'box',size:[w,h,d],allowedBodyParts:h<.25?(d>=.9?['torso','pelvis','head']:['pelvis','leftThigh','rightThigh']):['torso','pelvis','head']};const seam=box(m,0,h/2+.002,0,w*.91,.008,d*.9,mat.seam,.035);return m;}
  function base(parent,w=1.6,d=1.8,crossZ=null) {
    signs.forEach(s=>{beam(parent,[s*(w/2-.10),.11,-d/2+.1],[s*(w/2-.10),.11,d/2-.1],.12,.12);for(const z of [-d/2+.1,d/2-.1]){box(parent,s*(w/2-.1),.045,z,.25,.08,.25,mat.rubber,.04);bolt(parent,s*(w/2-.1),.18,z,'z');}});
    beam(parent,[-w/2+.1,.13,crossZ??-d/2+.15],[w/2-.1,.13,crossZ??-d/2+.15],.10,.10);
  }
  function seat(parent,{y=.58,z=0,back=true,incline=0,width=.52,adjustable=false}={}) {
    const root=adjustable?new THREE.Group():null;if(root){parent.add(root);root.userData.lifecycleDynamic=true;root.name='可調座墊';parent=root;}
    beam(parent,[0,.15,z],[0,y-.05,z],.11,.11,mat.metal);
    const post=beam(parent,[.13,.2,z],[.13,y-.1,z],.035,.035,mat.chrome);
    for(let yy=.25;yy<y-.1;yy+=.07) bolt(parent,.18,yy,z,'x');
    cyl(parent,.23,y-.15,z,.05,.10,mat.accent).rotation.z=Math.PI/2;
    pad(parent,0,y,z,width,.115,.53);
    if(back){const b=pad(parent,0,y+.39,z-.24,width,.66,.11);b.rotation.x=incline;beam(parent,[0,.15,z-.34],[0,y+.55,z-.34],.09,.09);}
    return root;
  }
  function pulley(parent,x,y,z,r=.11) {const w=cyl(parent,x,y,z,r,.06,mat.rubber);w.rotation.z=Math.PI/2;cyl(parent,x,y,z,.035,.085,mat.chrome).rotation.z=Math.PI/2;bolt(parent,x+.055,y,z);return w;}
  const stackRegistry=new WeakMap();
  function weightStack(parent,x=.85,z=-.6,height=2.15) {
    const frame=new THREE.Group();frame.position.set(x,0,z);parent.add(frame);
    signs.forEach(s=>{beam(frame,[s*.27,.15,0],[s*.27,height,0],.06,.07);rod(frame,[s*.14,.2,.12],[s*.14,height-.1,.12],.016,mat.chrome);});
    box(frame,0,height/2,-.16,.62,height,.06,mat.frame,.04);box(frame,0,height-.05,0,.63,.10,.42);
    const plates=new THREE.InstancedMesh(cached('stack-plate',()=>new RoundedBoxGeometry(.43,.058,.31,1,.012)),mat.metal,11);plates.name='插銷配重片';plates.userData.lifecycleDynamic=true;plates.castShadow=plates.receiveShadow=true;plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);plates.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.70,.11),.8);frame.add(plates);
    const pin=cyl(frame,.24,.60,.30,.025,.11,mat.accent);pin.rotation.x=Math.PI/2;pin.userData.lifecycleDynamic=true;pin.name='配重插銷';
    const panel=box(frame,0,height-.40,.055,.40,.39,.06,mat.rubber,.03);label?.(frame,'肌動',0,height-.36,.09,{width:.3,height:.10,color:'#c5df9d',size:54});
    pulley(frame,0,height-.12,.12,.10);
    const matrix=new THREE.Matrix4();let weight=30,lastT=null,lastWeight=null;
    const update=t=>{if(lastT===t&&lastWeight===weight)return;const start=11-weight/5;for(let i=0;i<11;i++){matrix.makeTranslation(0,.24+i*.072+(i>=start?t*.22:0),.11);plates.setMatrixAt(i,matrix);}plates.instanceMatrix.needsUpdate=true;pin.position.y=.24+start*.072+t*.22;lastT=t;lastWeight=weight;};
    update.setWeight=kg=>{weight=kg;update(lastT??0);};update.getState=()=>({weightKg:weight,selectedPlates:weight/5,selectorPin:pin.position.toArray(),lift:(lastT||0)*.22,instances:plates.count});
    if(!stackRegistry.has(parent))stackRegistry.set(parent,[]);stackRegistry.get(parent).push(update);update(0);return update;
  }
  const plateShapes = new Map(),plateStamp=new Map();
  function plateGeometry(kg) {
    if(plateShapes.has(kg))return plateShapes.get(kg);
    const radius=kg<2.5?.12:kg<5?.15:kg===5?.22:.29;
    const shape=new THREE.Shape();shape.absarc(0,0,radius,0,Math.PI*2,false);
    const hole=new THREE.Path();hole.absarc(0,0,.028,0,Math.PI*2,true);shape.holes.push(hole);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,h=new THREE.Path();h.absellipse(Math.sin(a)*radius*.62,Math.cos(a)*radius*.62,radius*.17,radius*.075,0,Math.PI*2,true,-a);shape.holes.push(h);}
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:true,bevelThickness:.006,bevelSize:.008,bevelSegments:1,curveSegments:24});geometry.translate(0,0,-.0275);geometries.add(geometry);plateShapes.set(kg,geometry);return geometry;
  }
  function stampMaterial(kg) {
    if(plateStamp.has(kg))return plateStamp.get(kg);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#b3c49d';ctx.font='bold 27px Arial';ctx.textAlign='center';ctx.fillText(`${kg} KG`,64,42);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);const material=own(new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));plateStamp.set(kg,material);return material;
  }
  function plate(parent,x,y,z,kg=10) {
    const g=new THREE.Group();parent.add(g);g.position.set(x,y,z);g.rotation.y=Math.PI/2;
    mesh(g,plateGeometry(kg),mat.plate);const r=kg<2.5?.12:kg<5?.15:kg===5?.22:.29;g.userData.plateCollision={shape:'box',size:[r*2,r*2,.075],allowedBodyParts:[]};
    const ring=mesh(g,cached(`ring:${r}`,()=>new THREE.TorusGeometry(r-.025,.008,6,36)),mat.rim,0,0,.034);
    mesh(g,cached('hub',()=>new THREE.TorusGeometry(.035,.006,5,20)),mat.rim,0,0,.036);
    mesh(g,cached('stamp',()=>new THREE.PlaneGeometry(.19,.095)),stampMaterial(kg),0,-r*.57,.038);
    batchRigid(g);
    return g;
  }
  function loadingHorn(parent,x,y,z,side,initial=10) {
    rod(parent,[x,y,z],[x+side*.48,y,z],.026,mat.chrome);const loadGroup=new THREE.Group();loadGroup.userData.loadable=true;parent.add(loadGroup);
    function set(kg){const pieces=decomposePlateLoad(kg);if(!pieces)return false;while(loadGroup.children.length)loadGroup.remove(loadGroup.children[0]);const gap=.078;for(let i=0;i<pieces.length;i++){const p=plate(loadGroup,x+side*(.06+i*gap),y,z,pieces[i]);p.userData.plateSide=side<0?'left':'right';p.userData.plateKg=pieces[i];}const clamp=cyl(loadGroup,x+side*(.06+pieces.length*gap),y,z,.045,.045,mat.rim);clamp.rotation.z=Math.PI/2;return true;}
    set(initial);return set;
  }
  function grips(parent,axis=[0,1,0],preset=null) {
    return signs.map((sign,index)=>{const g=new THREE.Group();parent.add(g);const body=rod(g,axis.map(v=>-v*.105),axis.map(v=>v*.105),preset?.gripRadius??.033,mat.rubber);g.userData.handGripIndices=[index];g.userData.gripRestAxis=[...axis];const cap1=sphere(g,...axis.map(v=>v*.11),preset?.capRadius??.035,mat.rim),cap2=sphere(g,...axis.map(v=>-v*.11),preset?.capRadius??.035,mat.rim);return g;});
  }
  function placeGrips(objects,points) {objects.forEach((g,i)=>g.position.set(...points[i]));}
  function seated(extra={}) {return {hip:[0,.70,0],shoulder:[0,.70+torso,-.03],head:[0,.70+torso+headLength,-.045],feet:[[-.20,.013,.54],[.20,.013,.54]],elbowHints:[[-1,-.3,.45],[1,-.3,.45]],kneeHints:[[0,0,1],[0,0,1]],...extra};}
  function standing(extra={}) {return {hip:[0,hipHeight,0],shoulder:[0,hipHeight+torso,0],head:[0,hipHeight+torso+headLength,0],feet:[[-.19,.013,.10],[.19,.013,.10]],...extra};}
  const arr = v=>[v.x,v.y,v.z];
  function arc(pivot,offset,angle,axis='x') {const v=new THREE.Vector3(...offset);v.applyAxisAngle(axis==='x'?new THREE.Vector3(1,0,0):axis==='z'?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0),angle);return [pivot[0]+v.x,pivot[1]+v.y,pivot[2]+v.z];}
  function kneeFor(hip,shoulder,foot,direction,normal,side) {
    const hipV=new THREE.Vector3(...hip),body=new THREE.Vector3(...shoulder).sub(hipV).normalize();
    const rotation=new THREE.Quaternion().setFromUnitVectors(UP,body);
    const root=new THREE.Vector3(side*.105,-.055,0).applyQuaternion(rotation).add(hipV);
    const target=new THREE.Vector3(...foot).addScaledVector(new THREE.Vector3(...direction),-.10).addScaledVector(new THREE.Vector3(...normal),.09);
    const delta=target.sub(root),distance=delta.length(),axis=delta.normalize();
    const bend=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize();
    return arr(root.addScaledVector(axis,distance/2).addScaledVector(bend,Math.sqrt(Math.max(0,.43*.43-distance*distance/4))));
  }
  const machines=new Map();

  for(const station of stations) {
    const group=new THREE.Group();scene.add(group);group.position.set(station.position.x,0,station.position.z);group.rotation.y=station.rotation||0;
    const type=station.type||station.motion;
    const adjustmentSpecs=machineAdjustmentsFor(type,{plateLoaded:station.plateLoaded}),calibrationDefaults=defaultCalibration(adjustmentSpecs);let calibration={...calibrationDefaults},seatRoot=null;
    const calibrationParts=[];const seatShift=()=>seatOffsetMeters(type,calibration);
    let footprint={w:2.05,d:2.05},offset=2.2,lastPose=null,entryReadyPose=null,sampler=null,kgPerSide=10,inspectMechanism=null,alignConnectors=null;
    let lifecycleMechanism=null,lifecycleBar=null,lifecycleBarWidth=.41,rackSetupGetter=null,smithHookPivot=null;
    const plateSetters=[];
    const addLoads=(parent,x,y,z)=>signs.forEach(s=>plateSetters.push(loadingHorn(parent,s*x,y,z,s)));
    const storage=(x=.93,z=-.65)=>signs.forEach(s=>{rod(group,[s*x,.52,z],[s*(x+.3),.52,z],.026,mat.chrome);plate(group,s*(x+.13),.52,z,10);});
    const liftStack=()=>{};

    if(['chestPress','shoulderPress','plateInclinePress','plateShoulderPress'].includes(type)) {
      const overhead=['shoulderPress','plateShoulderPress'].includes(type),isPlate=type.startsWith('plate');
      base(group,1.7,1.65);seatRoot=seat(group,{incline:type==='plateInclinePress'?-.18:0,adjustable:!isPlate});
      let stack=isPlate?()=>{}:weightStack(group,.93,-.58,2.08);
      signs.forEach(s=>{beam(group,[s*.57,.15,-.38],[s*.57,overhead?1.12:1.94,overhead?-.55:.10],.09,.10);bolt(group,s*.64,overhead?1.12:1.94,overhead?-.55:.10);});
      const pivots=signs.map(s=>{const g=new THREE.Group();group.add(g);g.position.set(s*.34,overhead?1.08:1.93,overhead?-.52:.10);const end=overhead?[0,.22,.64]:[0,-.75,.10];beam(g,[0,0,0],[end[0],end[1]+.13,end[2]],.06,.07,mat.metal);const grip=rod(g,[end[0],end[1]-.1,end[2]],[end[0],end[1]+.1,end[2]],.033,mat.rubber);grip.userData.handGripIndices=[s<0?0:1];if(isPlate)plateSetters.push(loadingHorn(g,s*.30,overhead?.08:-.34,.04,s));return g;});
      if(isPlate)storage(1.03,-.54);
      sampler=(t)=>{const angle=overhead?-.68*t:-(type==='plateInclinePress'?.32:.38)*t;pivots.forEach(p=>p.rotation.x=angle);const hands=signs.map(s=>arc([s*.34,overhead?1.08:1.93,overhead?-.52:.10],overhead?[0,.22,.64]:[0,-.75,.10],angle));stack(t);return seated({shoulder:[0,.70+torso,type==='plateInclinePress'?-.08:0],head:[0,.70+torso+headLength,type==='plateInclinePress'?-.13:0],hands,handDirections:[[0,1,0],[0,1,0]]});};
      footprint={w:isPlate?2.65:2.3,d:2.0};
    } else if(type==='latPulldown'||type==='plateHighRow') {
      const isPlate=type==='plateHighRow';base(group,1.8,1.9);seatRoot=seat(group,{back:false,adjustable:!isPlate});
      const stack=isPlate?()=>{}:weightStack(group,.92,-.65,2.40);
      beam(group,[0,.15,-.6],[0,2.45,-.6],.11,.11);beam(group,[0,2.45,-.6],[0,2.45,.27],.09,.09);pulley(group,0,2.37,.23);
      const cable=rod(group,[0,2.38,.23],[0,1.7,.23],.009,mat.cable);
      const bar=rod(group,[-.64,1.7,.23],[.64,1.7,.23],.025,mat.chrome);
      const gripObjects=grips(group,[1,0,0]);
      const lapRollers=signs.map(s=>{const roller=cyl(group,s*.20,.79,.35,.09,.30,mat.pad);roller.rotation.z=Math.PI/2;roller.userData.lifecycleDynamic=true;roller.userData.collisionShape={shape:'box',size:[.18,.30,.18],allowedBodyParts:['leftThigh','rightThigh','leftShin','rightShin']};return roller;});
      lifecycleMechanism=state=>lapRollers.forEach((roller,index)=>{const open=state.open||0,a=THREE.MathUtils.smoothstep(open,0,.45),b=THREE.MathUtils.smoothstep(open,.45,1);roller.position.x=signs[index]*(.20+.65*b);roller.position.y=.79+seatShift()+.30*b;roller.position.z=.35+.50*a;});
      const levers=isPlate?signs.map(s=>{const g=new THREE.Group();g.position.set(s*.40,1.45,-.45);group.add(g);beam(g,[0,0,0],[0,.32,.7],.07,.08,mat.metal);plateSetters.push(loadingHorn(g,s*.43,-.04,.12,s));return g;}):null;
      if(isPlate)storage(1,-.65);
      sampler=t=>{let hands;if(isPlate){levers.forEach(g=>g.rotation.x=.18+t*.50);hands=signs.map(s=>arc([s*.40,1.45,-.45],[0,.2,.7],.18+t*.50));bar.visible=false;}else{hands=signs.map(s=>[s*(calibration.gripWidthCm||80)/200,1.58-.31*t,.23]);setRod(bar,[-.64,hands[0][1],.23],[.64,hands[0][1],.23]);setRod(cable,[0,2.38,.23],[0,hands[0][1],.23]);}placeGrips(gripObjects,hands);stack(t);return seated({hands,handDirections:[[1,0,0],[1,0,0]],elbowHints:[[-.8,-.8,0],[.8,-.8,0]]});};
      footprint={w:isPlate?2.75:2.3,d:2.1};
    } else if(type==='seatedRow') {
      base(group,1.7,2.2);seat(group,{y:.55,z:-.05,back:false});const stack=weightStack(group,.89,.53,1.85);
      const footplate=box(group,0,.27,.70,.85,.50,.08,mat.metal);footplate.userData.collisionShape.allowedBodyParts=['leftFoot','rightFoot'];footplate.rotation.x=.347;
      for(const s of signs) {rod(group,[s*.35,.13,.62],[s*.35,.57,.78],.035,mat.metal);for(let i=0;i<4;i++)box(footplate,s*.21,-.18+i*.10,-.047,.29,.012,.015,mat.rubber,.004);}
      beam(group,[0,.1,1.0],[0,1.04,1.0],.09,.09);pulley(group,0,1.0,.98);
      const handles=grips(group,[0,1,0]),cables=signs.map(s=>rod(group,[0,1,1.0],[s*.26,1.05,.5],.008,mat.cable));
      sampler=t=>{const hands=signs.map(s=>[s*.26,1.06,.515-.335*t]);placeGrips(handles,hands);cables.forEach((c,i)=>setRod(c,[0,1,1.0],hands[i]));stack(t);return seated({hip:[0,.67,-.05],shoulder:[0,1.15,-.035],head:[0,1.39,-.02],hands,feet:[[-.21,.35,.686],[.21,.35,.686]],footDirections:[[0,.94,.34],[0,.94,.34]],footNormals:[[0,.34,-.94],[0,.34,-.94]],handDirections:[[0,1,0],[0,1,0]]});};
      footprint={w:2.3,d:2.5};offset=2.4;
    } else if(type==='legPress') {
      base(group,2,2.5);seat(group,{y:.49,z:-.60,back:false});const back=pad(group,0,1.0,-.89,.43,.60,.13);back.rotation.x=-.48;
      signs.forEach(s=>{rod(group,[s*.78,.35,-.4],[s*.78,1.30,.95],.045,mat.chrome);beam(group,[s*.78,.15,-.8],[s*.78,.35,-.4],.11,.11);});
      const sled=new THREE.Group();group.add(sled);const plateFace=new THREE.Group();sled.add(plateFace);plateFace.rotation.x=-.9273;const plateBody=box(plateFace,0,0,0,1.12,.09,.62,mat.frame,.03);
      for(let i=-4;i<=4;i++)box(plateFace,i*.10,.055,0,.025,.012,.51,mat.rubber,.003);
      addLoads(sled,1.0,-.03,-.1);storage(1.03,-.9);
      const handles=grips(group,[0,0,1]);const hands=[[-.34,.66,-.45],[.34,.66,-.45]];placeGrips(handles,hands);
      // The shoe-contact landmark is above its sole. This offset was measured
      // against the tilted plate's actual raised anti-slip ribs.
      sampler=t=>{sled.position.set(0,.71+.19*t,.12+.30*t);const soleLift=.024,feet=signs.map(s=>[s*.22,.737+.19*t+.60*soleLift,.084+.30*t-.80*soleLift]);return seated({hip:[0,.62,-.52],shoulder:[0,1.06,-.78],head:[0,1.27,-.91],hands,feet,footDirections:[[0,.80,.60],[0,.80,.60]],footNormals:[[0,.60,-.80],[0,.60,-.80]],handDirections:[[0,0,1],[0,0,1]]});};
      footprint={w:2.7,d:2.75};offset=2.5;
    } else if(type==='legExtension'||type==='legCurl') {
      const curl=type==='legCurl';base(group,1.65,1.8);seatRoot=seat(group,{y:.65,z:-.13,adjustable:!curl});const stack=weightStack(group,.91,-.52,1.85);
      const lever=new THREE.Group();group.add(lever);lever.position.set(0,.70,.26);beam(lever,[.48,0,0],[.48,-.43,0],.06,.06,mat.metal);const roller=cyl(lever,0,-.43,.07,.105,.88,mat.pad);roller.rotation.z=Math.PI/2;const pivotBolt=bolt(group,.52,.70,.26);
      roller.userData.collisionShape={shape:'box',size:[.21,.88,.21],allowedBodyParts:['leftShin','rightShin','leftFoot','rightFoot']};
      const hands=[[-.36,.72,-.12],[.36,.72,-.12]],handles=grips(group,[0,0,1]);placeGrips(handles,hands);
      if(!curl)for(const object of [lever,pivotBolt,...handles]){object.userData.lifecycleDynamic=true;calibrationParts.push({object,y:object.position.y});}
      if(curl){const thigh=cyl(group,0,.84,.22,.095,.85,mat.pad);thigh.rotation.z=Math.PI/2;thigh.userData.lifecycleDynamic=true;thigh.userData.collisionShape={shape:'box',size:[.19,.85,.19],allowedBodyParts:['leftThigh','rightThigh','leftShin','rightShin']};lifecycleMechanism=state=>{const open=state.open||0,a=THREE.MathUtils.smoothstep(open,0,.45),b=THREE.MathUtils.smoothstep(open,.45,1);thigh.position.set(.75*b,.84+.33*a,.22+.45*a);thigh.rotation.z=Math.PI/2*(1-b);};}
      sampler=t=>{const angle=curl?(1.06*(1-t)):1.12*t;lever.rotation.x=-angle;const feet=signs.map(s=>{const ankle=[s*.15,.70-lowerLeg*Math.cos(angle),.26+lowerLeg*Math.sin(angle)];return [ankle[0],ankle[1]+footForward*Math.sin(angle)-footHeight*Math.cos(angle),ankle[2]+footForward*Math.cos(angle)+footHeight*Math.sin(angle)];});stack(t);return seated({hip:[0,.77,.26-Math.sqrt(upperLeg*upperLeg-.07*.07-.041*.041)],shoulder:[0,.77+torso,-.18],head:[0,.77+torso+headLength,-.20],hands,feet,knees:[[-.15,.70,.26],[.15,.70,.26]],handDirections:[[0,0,1],[0,0,1]],footDirections:signs.map(()=>[0,Math.sin(angle),Math.cos(angle)]),footNormals:signs.map(()=>[0,Math.cos(angle),-Math.sin(angle)])});};
      footprint={w:2.25,d:2.05};
    } else if(type==='cableFly'||type==='pecDeck') {
      const pec=type==='pecDeck';base(group,2.25,1.5);const stacks=signs.map(s=>weightStack(group,s*1.02,-.54,2.30));
      if(pec)seat(group);else beam(group,[-1.02,2.3,-.54],[1.02,2.3,-.54],.08,.08);
      const handles=grips(group,[0,1,0]),cables=signs.map(s=>rod(group,[s*1.02,1.66,-.45],[s*.68,1.31,.10],.009,mat.cable));
      const pulleyCarriages=pec?[]:signs.map(sign=>{const carriage=new THREE.Group();group.add(carriage);carriage.position.set(sign*1.02,1.66,-.45);carriage.userData.lifecycleDynamic=true;pulley(carriage,0,0,0,.085);return carriage;});
      if(!pec){handles.forEach((handle,i)=>{rod(handle,[0,-.11,0],[signs[i]*.16,0,0],.014,mat.chrome);rod(handle,[0,.11,0],[signs[i]*.16,0,0],.014,mat.chrome);});alignConnectors=()=>cables.forEach((c,i)=>{const height=calibration.pulleyHeightCm/100;pulleyCarriages[i].position.y=height;const hook=new THREE.Vector3(signs[i]*.16,0,0).applyQuaternion(handles[i].quaternion).add(handles[i].position);setRod(c,[signs[i]*1.02,height,-.45],hook.toArray());});}
      const pivots=pec?signs.map(s=>{const g=new THREE.Group();group.add(g);g.position.set(s*.17,1.80,-.04);beam(g,[0,0,0],[s*.49,-.34,.12],.065,.065,mat.metal);return g;}):null;
      sampler=t=>{const shoulder=pec?[0,.70+torso,-.03]:[0,hipHeight+torso-.04,0],height=pec?1.66:calibration.pulleyHeightCm/100;const hands=pec?signs.map(s=>arc([s*.17,1.80,-.04],[s*.49,-.48,.12],-s*t*1.25,'y')):signs.map(s=>[s*(.62-.45*t),hipHeight+torso-.13+(height-1.66)*.15,.14+.30*t]);placeGrips(handles,hands);cables.forEach((c,i)=>setRod(c,[signs[i]*1.02,height,-.45],pec?hands[i]:[hands[i][0]+signs[i]*.16,hands[i][1],hands[i][2]]));pulleyCarriages.forEach(carriage=>carriage.position.y=height);if(pivots)pivots.forEach((g,i)=>{g.rotation.y=-signs[i]*t*1.25;});stacks.forEach(s=>s(t));return (pec?seated:standing)({shoulder,hands,handDirections:[[0,1,0],[0,1,0]],elbowHints:[[-1,0,0],[1,0,0]],...(pec?{}:{hip:[0,hipHeight-.04,0],head:[0,hipHeight+torso+headLength-.04,0],feet:[[-.22,.008,.15],[.22,.008,-.10]]})});};
      footprint={w:2.65,d:1.9};offset=2.1;
    } else if(type==='squat'||type==='smithSquat'||type==='benchPress') {
      const bench=type==='benchPress',smith=type==='smithSquat';base(group,2.2,2.0,bench?null:.85);
      signs.forEach(s=>{for(const z of [-.62,.62]){beam(group,[s*.89,.12,z],[s*.89,2.25,z],.085,.085);for(let y=.45;y<1.9;y+=.12)bolt(group,s*.94,y,z);}beam(group,[s*.89,.60,-.62],[s*.89,.60,.62],.075,.075,mat.metal);});
      beam(group,[-.89,2.25,-.62],[.89,2.25,-.62],.085,.085);
      if(smith)signs.forEach(s=>rod(group,[s*.73,.20,-.16],[s*.73,2.16,-.16],.025,mat.chrome));
      if(bench){pad(group,0,.53,-.20,.48,.13,1.08);const seatPad=pad(group,0,.53,.44,.48,.13,.26);seatPad.userData.collisionShape.allowedBodyParts=['torso','pelvis','leftThigh','rightThigh'];for(const z of [-.25,.95])beam(group,[0,.11,z],[0,.49,z],.10,.10);}
      const bar=new THREE.Group();group.add(bar);const barRadius=bench?.025:SQUAT_RACK_SUPPORT.radius,shaft=rod(bar,[-1.25,0,0],[1.25,0,0],barRadius,mat.chrome);shaft.userData.handGripIndices=[0,1];shaft.userData.collisionShape={shape:'capsule',radius:barRadius,gripZones:true,gripCenter:bench?.43:.41,backSupport:!bench,allowedBodyParts:['leftHand','rightHand']};addLoads(bar,.98,0,0);storage(1.06,-.77);
      lifecycleBar=bar;lifecycleBarWidth=bench?.43:.41;
      const rackReady=bench?null:buildRackSquatExercisePose({THREE,metrics:characterMetrics,smith,t:0}),rackY=bench?1.11:rackReady.barPosition[1]-.080;
      const rackZ=bench?-.20:smith?-.16:.55;
      const rackHooks=bench?group:new THREE.Group();if(!bench){group.add(rackHooks);rackHooks.userData.lifecycleDynamic=true;}
      const hookSegments=[],pegSegments=[],freeHookSeats=[];
      if(smith){smithHookPivot=new THREE.Group();bar.add(smithHookPivot);smithHookPivot.userData.lifecycleDynamic=true;signs.forEach(sign=>{const x=sign*.79;pegSegments.push(rod(rackHooks,[sign*.73,rackY-.145,rackZ-.11],[sign*.89,rackY-.145,rackZ-.11],.012,mat.metal));pegSegments.push(rod(rackHooks,[sign*.89,rackY-.145,-.62],[sign*.89,rackY-.145,rackZ-.11],.018,mat.metal));for(const [a,b]of [[[x,0,0],[x,-.12,-.11]],[[x,-.12,-.11],[x,-.12,-.15]],[[x,-.12,-.15],[x,-.17,-.15]]])hookSegments.push(rod(smithHookPivot,a,b,.012,mat.metal));cyl(bar,sign*.73,0,0,.045,.15,mat.chrome);});}
      else signs.forEach(sign=>{const lip=bench?rackZ+.08:rackZ-.08,post=bench?-.62:.62,seatY=bench?rackY-.0425:rackY-barRadius-.0175;freeHookSeats.push(beam(rackHooks,[sign*.79,seatY,post],[sign*.79,seatY,lip],.035,.035,mat.metal));beam(rackHooks,[sign*.79,seatY,lip],[sign*.79,rackY+.035,lip],.035,.035,mat.metal);});
      if(!bench){const target=new THREE.Object3D();target.position.set(0,rackY,rackZ);rackHooks.add(target);const segments=objects=>objects.map(o=>{const m=new THREE.Matrix4().multiplyMatrices(group.matrixWorld.clone().invert(),o.matrixWorld);return{start:new THREE.Vector3(0,-.5,0).applyMatrix4(m).toArray(),end:new THREE.Vector3(0,.5,0).applyMatrix4(m).toArray(),radius:o.geometry.parameters.radiusTop};});rackSetupGetter=()=>{group.updateMatrixWorld(true);return{readyPose:structuredClone(rackReady.pose),barPosition:bar.position.toArray(),rackBarPosition:group.worldToLocal(target.getWorldPosition(new THREE.Vector3())).toArray(),readyBarPosition:[...rackReady.barPosition],barRadius:shaft.geometry.parameters.radiusTop,gripHalfWidth:lifecycleBarWidth,supportOffset:[0,SQUAT_RACK_SUPPORT.y,SQUAT_RACK_SUPPORT.z],hookTop:rackY+.035,hookAngle:smithHookPivot?.rotation.x||0,movingHooks:segments(hookSegments),fixedPegs:segments(pegSegments),freeSeatY:freeHookSeats.map(o=>new THREE.Box3().setFromObject(o).max.y-group.getWorldPosition(new THREE.Vector3()).y)};};}
      sampler=t=>{if(bench){bar.position.set(0,.92+.22*t,-.04);return {hip:[0,.64,.44],shoulder:[0,.67,-.03],head:[0,.69,-.32],hands:[[-.43,bar.position.y,-.04],[.43,bar.position.y,-.04]],feet:[[-.25,.008,.96],[.25,.008,.96]],lying:true,handDirections:[[1,0,0],[1,0,0]],elbowHints:[[-1,-1,0],[1,-1,0]],kneeHints:[[0,0,1],[0,0,1]]};}
        const frame=buildRackSquatExercisePose({THREE,metrics:characterMetrics,smith,t});bar.position.fromArray(frame.barPosition);if(smithHookPivot)smithHookPivot.rotation.x=-.45;return frame.pose;};
      footprint={w:2.95,d:2.25};offset=2.50;
    } else if(type==='hackSquat') {
      base(group,2.05,2.4);signs.forEach(s=>{rod(group,[s*.65,.30,-.65],[s*.65,2.1,.08],.042,mat.chrome);beam(group,[s*.82,.15,-.9],[s*.65,2.1,.08],.1,.1);});
      const footplate=box(group,0,.08,.15,1.0,.10,.65,mat.frame);footplate.rotation.x=-.20;
      const carriage=new THREE.Group();group.add(carriage);const back=pad(carriage,0,.22,-.12,.55,.80,.11);back.rotation.x=-.34;signs.forEach(s=>{const shoulderPad=pad(carriage,s*.17,.52,-.04,.16,.13,.25);shoulderPad.userData.collisionShape.allowedBodyParts=['torso','leftUpperArm','rightUpperArm'];const grip=rod(carriage,[s*.28,.52,.15],[s*.37,.44,.35],.027,mat.rubber);grip.userData.handGripIndices=[s<0?0:1];grip.userData.gripAtEnd=true;});addLoads(carriage,.84,.13,-.06);storage(.96,-.85);
      carriage.userData.lifecycleDynamic=true;lifecycleMechanism=state=>{carriage.position.y=.92+(state.open||0)*.20;carriage.position.z=-.37-(state.open||0)*.10;};
      sampler=t=>{carriage.position.set(0,.92-.34*t,-.37-.14*t);const soleLift=.0136;return {hip:[0,.99-.34*t,-.23-.14*t],shoulder:[0,1.45-.34*t,-.41-.14*t],head:[0,1.68-.34*t,-.47-.14*t],hands:[[-.37,1.36-.34*t,-.02-.14*t],[.37,1.36-.34*t,-.02-.14*t]],feet:[[-.23,.129+.98*soleLift,.14-.20*soleLift],[.23,.129+.98*soleLift,.14-.20*soleLift]],handDirections:[[0,1,0],[0,1,0]],footDirections:[[0,.20,.98],[0,.20,.98]],footNormals:[[0,.98,-.20],[0,.98,-.20]],kneeHints:[[0,0,1],[0,0,1]]};};
      footprint={w:2.75,d:2.65};offset=2.65;
    } else if(type==='hipThrust') {
      base(group,2.0,2.15);const backSupport=pad(group,0,.57,-.60,.94,.20,.20);backSupport.userData.collisionShape.allowedBodyParts=['torso','head'];beam(group,[0,.13,-.60],[0,.48,-.60],.12,.12);
      const floorplate=box(group,0,.09,.81,1.2,.09,.90,mat.frame);for(let i=-4;i<=4;i++)box(group,i*.11,.14,.81,.024,.009,.72,mat.rubber,.003);
      const arm=new THREE.Group();group.add(arm);arm.position.set(0,.67,-.37);beam(arm,[-.63,0,0],[-.63,-.265,.412],.08,.08);beam(arm,[.63,0,0],[.63,-.265,.412],.08,.08);pad(arm,0,-.15,.53,.72,.08,.13);addLoads(arm,.78,-.265,.36);const handles=grips(group,[0,0,1]);
      arm.userData.lifecycleDynamic=true;lifecycleMechanism=state=>{arm.rotation.x=-2.0*(state.open||0);};
      sampler=t=>{const angle=-.571*t;arm.rotation.x=angle;const hip=arc([0,.67,-.37],[0,-.265,.412],angle);const shoulder=[0,.67,-.37];const hands=signs.map(s=>[s*.43,hip[1]+.19,hip[2]-.02]);placeGrips(handles,hands);return {hip,shoulder,head:[0,.82,-.57],hands,feet:[[-.24,.15,.72],[.24,.15,.72]],kneeHints:[[-.4,0,1],[.4,0,1]],handDirections:[[0,0,1],[0,0,1]]};};
      footprint={w:2.65,d:2.5};offset=2.35;
    } else if(type==='calfRaise') {
      base(group,1.6,1.65);seat(group,{y:.58,z:-.2,back:false});const step=box(group,0,.15,.55,.75,.22,.24,mat.frame);box(group,0,.27,.55,.75,.04,.19,mat.rubber);
      const lever=new THREE.Group();group.add(lever);lever.position.set(0,.54,-.35);beam(lever,[.52,0,0],[.52,.356,.689],.085,.085);pad(lever,0,.39,.689,.65,.13,.14);addLoads(lever,.65,.16,.57);const handles=grips(group,[0,0,1]);
      rod(group,[.52,.13,-.65],[.52,.40,-.65],.055,mat.chrome);const calfSupport=rod(group,[.52,.20,-.65],[.52,.54,-.35],.045,mat.metal);calfSupport.userData.lifecycleDynamic=true;
      let calfRestAngle=0;lever.userData.lifecycleDynamic=true;lifecycleMechanism=state=>{lever.rotation.x=calfRestAngle;lever.rotation.y=0;lever.position.y=.54+(state.open||0)*.25;lever.position.z=-.35+(state.open||0)*.65;setRod(calfSupport,[.52,.20,-.65],[.52,lever.position.y,lever.position.z]);};
      function calfKnee(hip,shoulder,foot,direction,normal,index){
        const leg=characterMetrics.legs?.[index];if(!leg)return kneeFor(hip,shoulder,foot,direction,normal,signs[index]);
        const restAxis=new THREE.Vector3(...neutral.shoulder).sub(new THREE.Vector3(...neutral.hip)).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(restAxis,new THREE.Vector3(...shoulder).sub(new THREE.Vector3(...hip)).normalize());
        const root=new THREE.Vector3(...leg.hipOffset).applyQuaternion(rotation).add(new THREE.Vector3(...hip)),ankle=new THREE.Vector3(...foot).addScaledVector(new THREE.Vector3(...direction),-footForward).addScaledVector(new THREE.Vector3(...normal),footHeight),delta=ankle.clone().sub(root),distance=delta.length(),axis=delta.normalize(),along=(leg.upper*leg.upper-leg.lower*leg.lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,leg.upper*leg.upper-along*along)),center=root.clone().addScaledVector(axis,along);
        // Choose the two-bone bend plane so the knee tracks above this foot,
        // rather than projecting a generic forward pole toward the midline.
        const across=new THREE.Vector3(1,0,0).addScaledVector(axis,-axis.x).normalize(),forward=new THREE.Vector3().crossVectors(axis,across).normalize();if(forward.z<0)forward.negate();
        const lateral=THREE.MathUtils.clamp((foot[0]-center.x)/(height*across.x),-.99,.99),bend=across.multiplyScalar(lateral).addScaledVector(forward,Math.sqrt(1-lateral*lateral));
        return center.addScaledVector(bend,height).toArray();
      }
      sampler=t=>{const hip=[0,.70,-.06],shoulder=[0,1.18,-.03],feet=[[-.19,.303,.55],[.19,.303,.55]],footDirections=signs.map(()=>[0,-Math.sin(t*.28),Math.cos(t*.28)]),footNormals=signs.map(()=>[0,Math.cos(t*.28),Math.sin(t*.28)]),knees=signs.map((s,i)=>calfKnee(hip,shoulder,feet[i],footDirections[i],footNormals[i],i));const angle=Math.atan2(knees[0][2]+.35,knees[0][1]+.10-.54)-Math.atan2(.689,.356);calfRestAngle=angle;lever.rotation.x=angle;lever.rotation.y=0;const hands=signs.map(s=>arc([0,.54,-.35],[s*.40,.54,.64],angle));placeGrips(handles,hands);return seated({hip,shoulder,head:[0,1.42,-.01],hands,feet,knees,handDirections:[[0,0,1],[0,0,1]],footDirections,footNormals});};
      footprint={w:2.3,d:1.95};offset=2.10;
    } else if(type==='lateralRaise') {
      base(group,1.7,1.6);seat(group);const stack=weightStack(group,.90,-.55,1.8),handles=grips(group,[0,1,0]);
      const armRootX=characterMetrics.arms?.[0]?.shoulderOffset?.[0]?Math.abs(characterMetrics.arms[0].shoulderOffset[0]):.18572;
      const upperArm=characterMetrics.arms?.[0]?.upper||.24676,lowerArm=characterMetrics.arms?.[0]?.lower||.25253;
      const elbowSide=.115,elbowDrop=Math.sqrt(upperArm*upperArm-elbowSide*elbowSide-.04*.04),palmForward=lowerArm+.055;
      const levers=signs.map(s=>{const g=new THREE.Group();group.add(g);g.position.set(s*armRootX,.70+torso,-.03);beam(g,[s*.24,0,-.08],[s*.24,-elbowDrop,.04],.045,.045,mat.metal);const cushion=pad(g,s*(elbowSide+.085),-elbowDrop,.04,.12,.13,.19);cushion.userData.collisionShape.allowedBodyParts=[s<0?'leftUpperArm':'rightUpperArm',s<0?'leftForearm':'rightForearm'];rod(g,[s*.24,-elbowDrop,.04],[s*.24,-elbowDrop,palmForward+.04],.023,mat.metal);beam(g,[s*.24,-elbowDrop+.13,palmForward+.04],[s*elbowSide,-elbowDrop+.13,palmForward+.04],.035,.035,mat.metal);return g;});
      levers.forEach(object=>object.userData.lifecycleDynamic=true);lifecycleMechanism=state=>levers.forEach((g,i)=>{g.rotation.z=0;g.position.x=signs[i]*(armRootX+(state.open||0)*.50);});
      sampler=t=>{levers.forEach((g,i)=>g.rotation.z=signs[i]*t*.95);const hands=signs.map(s=>arc([s*armRootX,.70+torso,-.03],[s*elbowSide,-elbowDrop,palmForward+.04],s*t*.95,'z')),elbows=signs.map(s=>arc([s*armRootX,.70+torso,-.03],[s*elbowSide,-elbowDrop,.04],s*t*.95,'z'));placeGrips(handles,hands);stack(t);return seated({hands,elbows,handDirections:[[0,1,0],[0,1,0]]});};
      footprint={w:2.3,d:1.95};
    } else if(type==='dumbbellCurl') {
      base(group,1.10,.80);beam(group,[-.45,.13,-.20],[-.45,.68,-.20],.07,.07);beam(group,[.45,.13,-.20],[.45,.68,-.20],.07,.07);box(group,0,.72,-.20,1.1,.06,.52,mat.frame);
      signs.forEach(s=>{const d=new THREE.Group();group.add(d);rod(d,[-.14,0,0],[.14,0,0],.024,mat.chrome);for(const end of [-1,1]){const w=cyl(d,end*.16,0,0,.10,.10,mat.rubber);w.rotation.z=Math.PI/2;}d.position.set(s*.27,.84,-.20);});
      sampler=t=>standing({hands:signs.map(s=>[s*.30,1.175-.33*Math.cos(1.95*t),.03+.33*Math.sin(1.95*t)]),elbows:[[-.30,1.175,.03],[.30,1.175,.03]],dumbbells:true,handDirections:[[1,0,0],[1,0,0]]});footprint={w:1.4,d:.95};offset=1.85;
    } else if(type==='treadmill') {
      base(group,1.20,2.50);box(group,0,.19,0,1.10,.15,2.28,mat.frame,.07);box(group,0,.28,0,.86,.045,2.02,mat.rubber,.025);
      for(let i=-8;i<=8;i++)box(group,0,.305,i*.115,.85,.008,.008,mat.metal,.002);
      signs.forEach(s=>{beam(group,[s*.52,.19,.88],[s*.52,1.34,.76],.065,.07);rod(group,[s*.52,1.1,.75],[s*.52,1.1,.15],.035,mat.rubber);});
      const panel=box(group,0,1.36,.77,1.03,.13,.44,mat.frame,.055);panel.rotation.x=.30;const screen=box(group,0,1.435,.76,.46,.01,.24,mat.accent,.01);screen.rotation.x=.30;
      const safety=box(group,.32,1.44,.73,.10,.02,.08,own(new THREE.MeshStandardMaterial({color:'#a94c3b',roughness:.7})),.015);
      const walkingMetrics=neutral.hip&&neutral.hands?characterMetrics:{neutral:{hip:[0,hipHeight,0],shoulder:[0,hipHeight+torso,0],head:[0,hipHeight+torso+headLength,0],hands:[[-.27,hipHeight-.07,.02],[.27,hipHeight-.07,.02]],feet:[[-.143,0,.145],[.143,0,.145]]}};
      sampler=(t,cycle)=>{
        const a=cycle*Math.PI*2,stride=Math.sin(a),bounce=Math.max(0,Math.sin(a*2))*.018,hip=[0,hipHeight+.23+bounce,-.15],arms=buildLocomotionPose(walkingMetrics,-a/6.6,1),shift=hip.map((value,index)=>value-arms.hip[index]);
        return standing({hip,shoulder:[0,hipHeight+torso+.23+bounce,-.13],head:[0,hipHeight+torso+headLength+.23+bounce,-.10],hands:arms.hands.map(point=>point.map((value,index)=>value+shift[index])),handNormals:arms.handNormals,elbowHints:arms.elbowHints,relaxedHands:true,handGripping:[false,false],feet:[[-.17,.33+Math.max(0,stride)*.12,-.15+.25*stride],[.17,.33+Math.max(0,-stride)*.12,-.15-.25*stride]],gripping:false});
      };footprint={w:1.5,d:2.65};offset=2.55;
    } else if(type==='bike') {
      base(group,.95,1.7);const flywheel=cyl(group,0,.44,.40,.31,.13,mat.frame);flywheel.rotation.z=Math.PI/2;
      beam(group,[0,.34,-.48],[0,.35,.63],.09,.09);beam(group,[0,.35,.25],[0,.99,-.25],.075,.075,mat.metal);beam(group,[0,.35,.58],[0,1.20,.60],.07,.07,mat.metal);pad(group,0,1.01,-.25,.31,.08,.43);
      const handles=grips(group,[1,0,0],bikeGripPreset);placeGrips(handles,[[-.30,1.23,.535],[.30,1.23,.535]]);rod(group,[-.4,1.23,.535],[.4,1.23,.535],bikeGripPreset?.handlebarRadius??.027,mat.rubber);box(group,0,1.40,.63,.32,.06,.24,mat.frame);
      const pedals=signs.map(s=>{const pedal=box(group,s*.18,.53,.20,.21,.035,.15,mat.rubber,.015);pedal.userData.collisionShape.allowedBodyParts=['leftFoot','rightFoot'];return pedal;}),cranks=signs.map(s=>rod(group,[s*.16,.55,.14],[s*.16,.55,.33],.018,mat.chrome));
      sampler=(t,cycle)=>{const a=cycle*Math.PI*2,pedalTargets=signs.map((s,i)=>{const angle=a+i*Math.PI;return[s*.18,.55+Math.sin(angle)*.17,.14+Math.cos(angle)*.17];}),feet=pedalTargets.map(p=>[p[0],p[1]+.013,p[2]]);pedals.forEach((p,i)=>p.position.set(pedalTargets[i][0],pedalTargets[i][1]-.0175,pedalTargets[i][2]));cranks.forEach((c,i)=>setRod(c,[signs[i]*.16,.55,.14],[signs[i]*.16,pedalTargets[i][1]-.0175,pedalTargets[i][2]]));flywheel.rotation.y=0;flywheel.rotation.x=a;return {hip:[0,1.123,-.25],shoulder:[0,1.533,.09],head:[0,1.743,.26],hands:[[-.30,1.23,.535],[.30,1.23,.535]],feet,footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],handDirections:[[1,0,0],[1,0,0]],kneeHints:[[0,0,1],[0,0,1]]};};footprint={w:1.25,d:1.95};offset=2.0;
    } else if(type==='elliptical') {
      base(group,1.2,2.25);const drive=cyl(group,0,.48,-.62,.36,.19,mat.frame);drive.rotation.z=Math.PI/2;beam(group,[0,.18,.6],[0,1.35,.48],.1,.1);box(group,0,1.47,.48,.46,.08,.32,mat.frame);
      const pedals=signs.map(s=>box(group,s*.22,.30,0,.23,.055,.57,mat.rubber,.035));const arms=signs.map(s=>beam(group,[s*.43,.34,.40],[s*.38,1.52,.25],.045,.045,mat.metal));const handles=grips(group,[0,1,0]);
      sampler=(t,cycle)=>{const a=cycle*Math.PI*2,pedalTargets=signs.map((s,i)=>{const b=a+i*Math.PI;return[s*.22,.35+.09*Math.sin(b),.02+.25*Math.cos(b)];}),feet=pedalTargets.map(p=>[p[0],p[1]+.0155,p[2]]);const hands=signs.map((s,i)=>[s*.36,1.45,.20-.10*Math.cos(a+i*Math.PI)]);pedals.forEach((p,i)=>p.position.set(pedalTargets[i][0],pedalTargets[i][1]-.025,pedalTargets[i][2]));arms.forEach((m,i)=>setRod(m,[signs[i]*.43,.34,.40],[hands[i][0],hands[i][1]-.12,hands[i][2]]));placeGrips(handles,hands);return standing({hip:[0,hipHeight+.22,-.15],shoulder:[0,hipHeight+torso+.22,-.13],head:[0,hipHeight+torso+headLength+.22,-.12],hands,feet,footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],handDirections:[[0,1,0],[0,1,0]],elbowHints:[[-1,-.5,.5],[1,-.5,.5]]});};footprint={w:1.5,d:2.5};offset=2.4;
    } else if(type==='rower') {
      base(group,1.05,2.6);beam(group,[0,.29,-1.0],[0,.29,1.1],.12,.13,mat.metal);const wheel=cyl(group,0,.53,.88,.37,.30,mat.frame);wheel.rotation.z=Math.PI/2;
      const seatCarriage=new THREE.Group();group.add(seatCarriage);pad(seatCarriage,0,0,0,.43,.10,.38);const handles=grips(group,[1,0,0]),cables=signs.map(s=>rod(group,[0,.73,.77],[s*.26,.95,.4],.009,mat.cable));
      const footplates=signs.map(s=>{const p=box(group,s*.20,.27,.40,.23,.45,.06,mat.rubber);p.rotation.x=.5586;p.userData.collisionShape.allowedBodyParts=['leftFoot','rightFoot'];return p;});
      sampler=t=>{
        const ease=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);},drive=ease(t/.70),swing=ease((t-.48)/.32),pull=ease((t-.68)/.32),hip=[0,.55,-.02-.48*drive],lean=.16-.34*swing,shoulder=[0,hip[1]+torso*Math.cos(lean),hip[2]+torso*Math.sin(lean)];
        seatCarriage.position.set(0,.43,hip[2]);const hands=signs.map(s=>[s*.24,shoulder[1]-.065-.115*pull,shoulder[2]+.51-.28*pull]);placeGrips(handles,hands);cables.forEach((c,i)=>setRod(c,[0,.73,.77],hands[i]));
        const soleLift=.013/Math.hypot(.53,.85);
        return{hip,shoulder,head:[0,shoulder[1]+headLength*Math.cos(lean),shoulder[2]+headLength*Math.sin(lean)],hands,feet:[[-.20,.37+.53*soleLift,.427-.85*soleLift],[.20,.37+.53*soleLift,.427-.85*soleLift]],handDirections:[[1,0,0],[1,0,0]],handAdvances:[[0,0,1],[0,0,1]],elbowHints:[[-1,-.25,-.65],[1,-.25,-.65]],footDirections:[[0,.85,.53],[0,.85,.53]],footNormals:[[0,.53,-.85],[0,.53,-.85]],kneeHints:[[0,1,1],[0,1,1]],gripping:true};
      };footprint={w:1.4,d:2.9};offset=2.6;
    } else if(type==='stairClimber') {
      base(group,1.42,2.65);
      box(group,0,.78,1.13,1.05,1.48,.34,mat.frame,.06);
      const stairs=[];
      for(let index=0;index<8;index++){
        const tread=new THREE.Group();group.add(tread);
        const step=box(tread,0,-.05,0,.91,.10,.32,mat.rubber,.015);
        step.userData.collisionShape.allowedBodyParts=['leftFoot','rightFoot'];
        for(let line=-3;line<=3;line++)box(tread,line*.11,.003,0,.016,.006,.26,mat.metal,.002).userData.collisionShape=null;
        batchRigid(tread);
        stairs.push(tread);
      }
      inspectMechanism=()=>({type:'revolving-staircase',steps:stairs.map(step=>({surfaceHeight:step.position.y,centerZ:step.position.z,width:.91,depth:.32})),footContactHeight:.013});
      const railGrips=[],railMounts=[];
      for(const sign of signs){
        beam(group,[sign*.48,.18,-.69],[sign*.48,1.78,.55],.07,.07,mat.metal);
        const grip=rod(group,[sign*.34,1.62,.31],[sign*.34,1.62,.53],.032,mat.rubber);grip.userData.handGripIndices=[sign<0?0:1];railGrips.push(grip);
        railMounts.push(rod(group,[sign*.48,1.78,.55],[sign*.34,1.62,.53],.03,mat.chrome));
      }
      alignConnectors=()=>railGrips.forEach((grip,index)=>{grip.updateMatrix();const ends=[-.5,.5].map(value=>new THREE.Vector3(0,value,0).applyMatrix4(grip.matrix)),upper=ends[0].y>ends[1].y?ends[0]:ends[1];setRod(railMounts[index],[signs[index]*.48,1.78,.55],upper.toArray());});
      const screen=box(group,0,1.94,.95,.83,.15,.35,mat.frame,.05);screen.rotation.x=.25;
      const display=box(group,0,2.025,.94,.45,.012,.23,mat.accent,.01);display.rotation.x=.25;
      sampler=(t,cycle)=>{
        const belt=((cycle*2)%1+1)%1;
        stairs.forEach((step,index)=>{step.position.set(0,.127+.20*(index-belt),-.58+.32*(index-belt));});
        const feet=signs.map((sign,index)=>{
          const phase=((cycle+index*.5)%1+1)%1;
          if(phase<=.62)return[sign*.18,.74-.40*phase,.38-.64*phase];
          const progress=(phase-.62)/.38,u=progress*progress*(3-2*progress),lift=Math.sin(progress*Math.PI)*.16;
          return[sign*.18,.492+(.74-.492)*u+lift,-.0168+(.38+.0168)*u];
        });
        const sway=Math.sin(cycle*Math.PI*4)*.008,hip=[0,1.29+sway,-.08],lean=.13,shoulder=[0,hip[1]+torso*Math.cos(lean),hip[2]+torso*Math.sin(lean)];
        return {hip,shoulder,head:[0,shoulder[1]+headLength*Math.cos(lean),shoulder[2]+headLength*Math.sin(lean)],hands:[[-.34,1.62,.42],[.34,1.62,.42]],feet,handDirections:[[0,0,1],[0,0,1]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],elbowHints:[[-.8,-.4,.4],[.8,-.4,.4]],kneeHints:[[0,.3,1],[0,.3,1]],gripping:true};
      };
      footprint={w:1.65,d:3.60};offset=-2.65;
    }
    if(!sampler)throw new Error(`Unsupported gym equipment: ${type}`);
    const originalSampler=sampler;
    sampler=(t,cycle)=>{const raw=originalSampler(t,cycle),dy=seatShift();if(seatRoot)seatRoot.position.y=dy;for(const part of calibrationParts)part.object.position.y=part.y+dy;if(!dy)return raw;const pose=structuredClone(raw);for(const key of ['hip','shoulder','head'])pose[key][1]+=dy;if(type==='legExtension')for(const key of ['hands','feet','knees'])if(pose[key])pose[key].forEach(point=>point[1]+=dy);return pose;};
    // A small identification label and accessible point belong to the machine,
    // while the world owns navigation and proximity selection.
    label?.(group,station.number||'',-.55,2.52,-.10,{width:.6,height:.30,color:'#e3efcf',size:76});
    const markerMaterial=own(new THREE.MeshBasicMaterial({color:'#bedb94',transparent:true,opacity:.65,side:THREE.DoubleSide}));
    const marker=mesh(group,cached('interactionRing',()=>new THREE.RingGeometry(.18,.225,28)),markerMaterial,0,.055,offset);marker.rotation.x=-Math.PI/2;marker.castShadow=false;
    const rotation=station.rotation||0,interaction=new THREE.Vector3(station.position.x+Math.sin(rotation)*offset,0,station.position.z+Math.cos(rotation)*offset);
    collider(station.position.x,station.position.z,footprint.w,footprint.d);
    const collisionObjects=[],gripObjects=[];
    function alignGrips(pose){
      if(!gripObjects.length||!characterMetrics.arms?.[0]?.handFrameLocal)return pose;
      group.updateMatrixWorld(true);
      if(type==='elliptical'){pose.handDirections=[[1,0,0],[1,0,0]];pose.handAdvances=[[0,0,1],[0,0,1]];pose.elbowHints=[[-.6,-.5,-.8],[.6,-.5,-.8]];}
      const barbell=['squat','smithSquat','benchPress'].includes(type);
      if(barbell){if(!pose.handFingerFlex)pose.handAdvances=[0,1].map(index=>{const frame=solveHandContactFrame(characterMetrics,pose,index),direction=new THREE.Vector3(...frame.advance);direction.x=0;return direction.normalize().toArray();});return pose;}
      for(const {object}of gripObjects){
        if(object.userData.handGripIndices.length!==1)continue;
        const index=object.userData.handGripIndices[0];if((pose.handGripping?.[index]??pose.gripping)===false)continue;
        const frame=solveHandContactFrame(characterMetrics,pose,index);
        if(!pose.handDirections)pose.handDirections=[null,null];pose.handDirections[index]=frame.axis;
        const axis=new THREE.Vector3(...frame.axis),localAxis=new THREE.Vector3(...(object.userData.gripRestAxis||[0,1,0]));
        const worldRotation=group.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromUnitVectors(localAxis,axis)),inverseParent=object.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        object.quaternion.copy(inverseParent).multiply(worldRotation);
        if(object.userData.gripAtEnd){const point=group.localToWorld(new THREE.Vector3(...pose.hands[index]));object.parent.worldToLocal(point);object.position.copy(point);object.scale.y=.22;}
        object.updateMatrixWorld(true);
      }
      alignConnectors?.();
      return pose;
    }
    const machine={station,group,type,footprint,interaction,contacts:null,
      getEquipmentSettings(){return{...calibration};},
      getEquipmentOptions(){return{adjustments:adjustmentSpecs.map(option=>({...option})),benchAngles:[],handleOptions:[]};},
      setEquipmentSettings(patch={}){const next=validateCalibrationPatch(adjustmentSpecs,calibration,patch);if(!next)return{ok:false,reason:'unsupported-setting',settings:{...calibration}};const changed=Object.keys(next).some(key=>next[key]!==calibration[key]);if(!changed)return{ok:true,changed:false,settings:{...calibration}};calibration=next;for(const stack of stackRegistry.get(group)||[])stack.setWeight(calibration.weightKg||30);if(calibration.plateLoadKg!==undefined)this.setPlateLoad?.(calibration.plateLoadKg);this.update(0,0);entryReadyPose=structuredClone(lastPose);return{ok:true,changed:true,settings:{...calibration}};},
      getCalibrationState(){return{settings:{...calibration},seatOffsetMeters:seatShift(),seatObjectPosition:seatRoot?.position.toArray()||null,stacks:(stackRegistry.get(group)||[]).map(stack=>stack.getState())};},
      beginExercise(){lifecycleMechanism?.({open:0});group.updateMatrixWorld(true);},
      beginActivity(){this.beginExercise();if(rackSetupGetter){lifecycleBar.position.fromArray(rackSetupGetter().rackBarPosition);if(smithHookPivot)smithHookPivot.rotation.x=0;group.updateMatrixWorld(true);}},
      setLifecycleState(state={}){lifecycleMechanism?.(state);if(lifecycleBar&&state.barPosition){lifecycleBar.position.set(...state.barPosition);this.contacts={...(this.contacts||{}),hands:signs.map(sign=>[sign*lifecycleBarWidth,state.barPosition[1],state.barPosition[2]])};}group.updateMatrixWorld(true);return this.contacts;},
      update(t=0,cycle=0){lastPose=alignGrips(sampler(THREE.MathUtils.clamp(t,0,1),cycle));this.contacts={hands:lastPose.hands?.map(p=>[...p])||[],feet:lastPose.feet?.map(p=>[...p])||[]};return lastPose;},
      sample(t=0,cycle=0){return this.update(t,cycle);},
      sampleActivity(phase=0,cycle=phase){const p=THREE.MathUtils.clamp(phase,0,1),measured=lowerBodyCapturedEffort(`machine-${station.id}`,p,cycle),u=p<=.44?p/.44:1-(p-.44)/.56;return this.update(measured??u*u*(3-2*u),cycle);},
      getSetup(){return {exerciseId:`machine-${station.id}`,stationId:station.id,origin:[group.position.x,group.position.y,group.position.z],rotation:group.rotation.y,duration:station.category==='cardio'?4:6,attachmentId:type==='cableFly'?'dual-d-handles':station.plateLoaded?'plate-loaded-mechanism':'machine-handles',setupLabel:station.name,cameraYaw:1.1,cameraPitch:.28,cameraDistance:type==='stairClimber'?5.5:5.2,cameraTargetHeight:type==='stairClimber'?1.28:.95,entryReadyPose,approachOffset:[0,0,offset]};},
      getRackSetup(){return rackSetupGetter?.()||null;},
      setRackLifecyclePose(pose,barPosition,hookAngle=0){if(!rackSetupGetter)return;lastPose=pose;lifecycleBar.position.fromArray(barPosition);if(smithHookPivot)smithHookPivot.rotation.x=hookAngle;group.updateMatrixWorld(true);this.contacts={hands:pose.handAdvances?rackGripTargets({THREE,pose,barPosition:lifecycleBar.position.toArray()}):[],feet:pose.feet.map(p=>[...p])};},
      getActualContacts(){if(rackSetupGetter&&lastPose?.handAdvances)return{hands:rackGripTargets({THREE,pose:lastPose,barPosition:lifecycleBar.position.toArray()}),feet:this.contacts?.feet||[]};return this.contacts;},
      getActualGripAxes(){group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),axes=[null,null];for(const {object,matrixLocal}of gripObjects){const matrix=!object.parent?matrixLocal:new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld),axis=new THREE.Vector3(...(object.userData.gripRestAxis||[0,1,0])).transformDirection(matrix).toArray();for(const index of object.userData.handGripIndices)axes[index]=axis;}return axes;},
      inspectMechanism(){return inspectMechanism?.()||null;},
      getCollisionVolumes(){
        group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();
        const all=collisionObjects.slice();group.traverse(object=>{if(object.userData.plateCollision)all.push({object,shape:object.userData.plateCollision,id:`${station.id}-plate-${all.length}`});});
        return all.flatMap(({object,shape,id,matrixLocal})=>{
          // Static meshes become part of a batch and lose their parent. Keep
          // their machine-local transform so moving the complete machine onto
          // a raised floor does not shift its collision solids downward.
          const matrix=matrixLocal&&!object.parent?matrixLocal:new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(position,rotation,scale);
          // A grasp includes the narrow wrist beside the palm. Only these
          // short grip sections permit that contact; the rest of the shaft
          // still checks forearms. Squats also permit upper-back support.
          if(shape.gripZones){const inner=shape.gripCenter-.13,outer=shape.gripCenter+.13,sections=[[-1.25,-outer,[]],[-outer,-inner,['leftHand','leftForearm']],[-inner,inner,shape.backSupport?['torso']:[]],[inner,outer,['rightHand','rightForearm']],[outer,1.25,[]]];return sections.map(([a,b,allowedBodyParts],index)=>({id:`${id}-${index}`,shape:'capsule',start:new THREE.Vector3(0,a/2.5,0).applyMatrix4(matrix).toArray(),end:new THREE.Vector3(0,b/2.5,0).applyMatrix4(matrix).toArray(),radius:shape.radius,allowedBodyParts}));}
          if(shape.shape==='capsule')return {id,shape:'capsule',start:new THREE.Vector3(0,-.5,0).applyMatrix4(matrix).toArray(),end:new THREE.Vector3(0,.5,0).applyMatrix4(matrix).toArray(),radius:shape.radius*Math.max(Math.abs(scale.x),Math.abs(scale.z)),allowedBodyParts:shape.allowedBodyParts};
          return {id,shape:'box',position:position.toArray(),rotation:new THREE.Euler().setFromQuaternion(rotation).toArray().slice(0,3),size:shape.size.map((v,i)=>v*Math.abs(scale.getComponent(i))),allowedBodyParts:shape.allowedBodyParts};
        });
      },
    };
    if(plateSetters.length){machine.setPlateLoad=kg=>{const value=Number(kg);if(!decomposePlateLoad(value))return false;kgPerSide=value;if('plateLoadKg'in calibration)calibration.plateLoadKg=value;plateSetters.forEach(set=>set(kgPerSide));return true;};machine.getPlateLoad=()=>kgPerSide;machine.getPlateState=()=>{const visiblePlates={left:0,right:0},plateKg={left:0,right:0};group.traverse(object=>{if(object.visible&&object.userData.plateSide){visiblePlates[object.userData.plateSide]++;plateKg[object.userData.plateSide]+=object.userData.plateKg||0;}});return{kgPerSide,visiblePlates,plateKg};};machine.getPlateCount=()=>machine.getPlateState().visiblePlates;}
    // Find genuinely stationary geometry by sampling the mechanism, then batch
    // only that geometry. Hinges, slides, grips, cables and replaceable plates
    // keep their own transforms and remain animated / loadable.
    machine.update(0,0);group.updateMatrixWorld(true);
    const localCollisionFrame=group.matrixWorld.clone().invert();group.traverse(object=>{if(object.userData.handGripIndices)gripObjects.push({object,matrixLocal:new THREE.Matrix4().multiplyMatrices(localCollisionFrame,object.matrixWorld)});});
    group.traverse(object=>{if(object.userData.collisionShape)collisionObjects.push({object,shape:object.userData.collisionShape,id:`${station.id}-solid-${collisionObjects.length}`,matrixLocal:new THREE.Matrix4().multiplyMatrices(localCollisionFrame,object.matrixWorld)});});
    const initialMatrices=new Map();group.traverse(o=>{if(o.isMesh)initialMatrices.set(o,o.matrixWorld.clone());});
    machine.update(.73,.31);group.updateMatrixWorld(true);
    const batches=new Map(),inverse=group.matrixWorld.clone().invert();
    group.traverse(o=>{
      if(!o.isMesh||o.material.transparent||Array.isArray(o.material)||!initialMatrices.has(o))return;
      let ancestor=o;while(ancestor&&ancestor!==group){if(ancestor.userData.loadable||ancestor.userData.lifecycleDynamic)return;ancestor=ancestor.parent;}
      if(!o.matrixWorld.equals(initialMatrices.get(o)))return;
      if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(o);
    });
    for(const [material,objects]of batches){
      if(objects.length<3)continue;
      const pieces=objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));});
      const merged=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());
      if(!merged)continue;geometries.add(merged);const fixed=mesh(group,merged,material);fixed.userData.batchedStatic=true;objects.forEach(o=>o.removeFromParent());
    }
    machine.update(0,0);entryReadyPose=JSON.parse(JSON.stringify(lastPose));if(rackSetupGetter){lifecycleBar.position.fromArray(rackSetupGetter().rackBarPosition);if(smithHookPivot)smithHookPivot.rotation.x=0;group.updateMatrixWorld(true);}machines.set(station.id,machine);
  }
  return {machines};
}
