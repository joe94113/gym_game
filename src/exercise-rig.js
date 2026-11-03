import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {inertialCurlEffort} from './inertial-curl-v018.js';
import { exercises, exerciseById } from './exercises.js';
import {installCableCalibration} from './equipment-calibration-v013.js';

/** All points below are stage-local metres. The visible attachments and the
 * character's contact targets come from the same sampled pose. */
export function createExerciseRig({THREE,scene,materials={},geometries=new Set(),extraMaterials=new Set(),textures=new Set(),machines=new Map(),characterMetrics={},capturedPose=true}) {
  const own = material => (extraMaterials.add(material),material);
  const mat={
    frame:materials.graphite||own(new THREE.MeshStandardMaterial({color:'#27342d',metalness:.6,roughness:.38})),
    chrome:materials.chrome||own(new THREE.MeshStandardMaterial({color:'#b1bcb6',metalness:.85,roughness:.24})),
    rubber:materials.black||own(new THREE.MeshStandardMaterial({color:'#1b2520',roughness:.85})),
    pad:own(new THREE.MeshStandardMaterial({color:'#344c3e',roughness:.85})),
    stitch:own(new THREE.MeshStandardMaterial({color:'#758c76',roughness:.9})),
    rope:own(new THREE.MeshStandardMaterial({color:'#4d4940',roughness:.92})),
    floor:own(new THREE.MeshStandardMaterial({color:'#899a72',roughness:1})),
    accent:materials.accent||own(new THREE.MeshStandardMaterial({color:'#c4dc9c',roughness:.7})),
  };
  const cache=new Map();
  const geometry=(key,make)=>{if(!cache.has(key)){const value=make();cache.set(key,value);geometries.add(value);}return cache.get(key);};
  function mesh(parent,g,m,x=0,y=0,z=0){const object=new THREE.Mesh(g,m);object.position.set(x,y,z);object.castShadow=object.receiveShadow=true;parent.add(object);return object;}
  function box(parent,x,y,z,w,h,d,m=mat.frame,r=.025){return mesh(parent,geometry(`b:${w}:${h}:${d}:${r}`,()=>new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/3,h/3,d/3))),m,x,y,z);}
  function rod(parent,a,b,r=.025,m=mat.chrome){const object=mesh(parent,geometry(`c:${r}`,()=>new THREE.CylinderGeometry(r,r,1,16)),m);setRod(object,a,b);return object;}
  const up=new THREE.Vector3(0,1,0),vA=new THREE.Vector3(),vB=new THREE.Vector3();
  function setRod(object,a,b){vA.fromArray(a);vB.fromArray(b).sub(vA);object.position.copy(vA).addScaledVector(vB,.5);object.scale.y=Math.max(.0001,vB.length());object.quaternion.setFromUnitVectors(up,vB.normalize());}
  function ball(parent,p,r,m=mat.rubber){return mesh(parent,geometry(`s:${r}`,()=>new THREE.SphereGeometry(r,14,10)),m,...p);}
  const copyPoint=p=>[...p];
  const plus=(a,b)=>a.map((v,i)=>v+b[i]);
  const scaled=(a,s)=>a.map(v=>v*s);
  const normalized=a=>{const length=Math.hypot(...a)||1;return a.map(v=>v/length);};
  const perpendicular=(axis,direction)=>{const d=normalized(direction),dot=axis.reduce((sum,value,index)=>sum+value*d[index],0),projected=axis.map((value,index)=>value-dot*d[index]);return Math.hypot(...projected)>.00001?normalized(projected):[1,0,0];};
  const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const smooth=t=>{const u=THREE.MathUtils.clamp(t,0,1);return u*u*(3-2*u);};
  const repetition=phase=>phase<=.44?smooth(phase/.44):1-smooth((phase-.44)/.56);
  const avg=(values,fallback)=>values.length?values.reduce((a,b)=>a+b,0)/values.length:fallback;
  function metricDimensions(input={}){
    const arms=input.arms||[],legs=input.legs||[],neutral=input.neutral||{};
    return {
      hip:neutral.hip||[0,1,0],shoulder:neutral.shoulder||[0,1.48,0],head:neutral.head||[0,1.70,0],hands:neutral.hands||null,
      torso:input.torsoLength||.48,
      arm:arms.map((arm,index)=>({upper:arm.upper||.29,lower:arm.lower||.27,palm:arm.palmLength||.06,offset:arm.shoulderOffset||[(index?1:-1)*.23,0,0]})),
      leg:legs.map((leg,index)=>({upper:leg.upper||.43,lower:leg.lower||.43,offset:leg.hipOffset||[(index?1:-1)*.105,-.055,0]})),
      footForward:input.footForwardOffset||.10,footHeight:input.footHeightOffset||.09,
    };
  }
  const dimensions=metricDimensions(characterMetrics);
  if(!dimensions.arm.length)dimensions.arm=[-1,1].map(s=>({upper:.29,lower:.27,palm:.06,offset:[s*.23,0,0]}));
  if(!dimensions.leg.length)dimensions.leg=[-1,1].map(s=>({upper:.43,lower:.43,offset:[s*.105,-.055,0]}));
  const headSpan=Math.max(.16,dimensions.head[1]-dimensions.shoulder[1]);
  const legsLength=avg(dimensions.leg.map(leg=>leg.upper+leg.lower),.86);
  const shWidth=avg(dimensions.arm.map(arm=>Math.abs(arm.offset[0])),.23);
  const bodyFrame=(hip,shoulder)=>new THREE.Quaternion().setFromUnitVectors(up,new THREE.Vector3(...shoulder).sub(new THREE.Vector3(...hip)).normalize());
  const rotate=(point,q)=>new THREE.Vector3(...point).applyQuaternion(q).toArray();
  function armRoots(hip,shoulder){const q=bodyFrame(hip,shoulder);return dimensions.arm.map(arm=>plus(shoulder,rotate(arm.offset,q)));}
  function standing(extra={}){return {hip:copyPoint(dimensions.hip),shoulder:copyPoint(dimensions.shoulder),head:copyPoint(dimensions.head),feet:[[-.17,.012,.10],[.17,.012,.10]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],gripping:true,...extra};}
  const stages=new Map(),hiddenMachines=new Map();let active=null;

  function makeDumbbell(parent){
    const group=new THREE.Group();parent.add(group);
    rod(group,[-.19,0,0],[.19,0,0],.016,mat.chrome);
    for(const sign of [-1,1]){
      const weight=mesh(group,geometry('db:weight',()=>new THREE.CylinderGeometry(.115,.115,.075,12)),mat.rubber,sign*.165,0,0);weight.rotation.z=Math.PI/2;
      const collar=mesh(group,geometry('db:collar',()=>new THREE.CylinderGeometry(.036,.036,.035,16)),mat.chrome,sign*.113,0,0);collar.rotation.z=Math.PI/2;
      for(let i=0;i<4;i++)rod(group,[sign*.01+i*.012-.025,-.018,0],[sign*.01+i*.012-.025,.018,0],.0025,mat.frame);
    }
    return group;
  }
  function placeDumbbells(objects,points,directions){objects.forEach((object,index)=>{object.position.fromArray(points[index]);object.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(...directions[index]).normalize());});}
  function dumbbellVolumes(pose){return pose.hands.flatMap((point,index)=>{const axis=normalized(pose.handDirections?.[index]||[1,0,0]),side=index?'right':'left';const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(...axis)),rotation=new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3);return [-1,1].map(sign=>({id:`${side}-dumbbell-${sign}`,shape:'box',position:plus(point,scaled(axis,sign*.165)),size:[.075,.23,.23],rotation,allowedBodyParts:[`${side}Hand`]}));});}
  function frameVolumes(prefix='cable'){
    return [-1,1].map((sign,index)=>({id:`${prefix}-upright-${index}`,shape:'capsule',start:[sign*1.08,.09,1.12],end:[sign*1.08,2.32,1.12],radius:.055,allowedBodyParts:[]}));
  }
  function cableFrame(group){
    for(const sign of [-1,1]){
      rod(group,[sign*1.08,.09,1.12],[sign*1.08,2.32,1.12],.055,mat.frame);
      box(group,sign*.92,1.10,1.19,.38,2.12,.33,mat.frame,.055);
      rod(group,[sign*.93,.16,1.00],[sign*.93,2.10,1.00],.013,mat.chrome);
      for(let i=0;i<9;i++)box(group,sign*.92,.23+i*.07,.99,.31,.055,.20,mat.chrome,.008);
      box(group,sign*1.08,.06,1.09,.40,.10,.65,mat.rubber,.035);
    }
    rod(group,[-1.08,2.32,1.12],[1.08,2.32,1.12],.055,mat.frame);
  }
  function pulley(group,position){const wheel=mesh(group,geometry('pulley',()=>new THREE.CylinderGeometry(.09,.09,.045,18)),mat.rubber,...position);wheel.rotation.z=Math.PI/2;const axle=rod(group,[position[0]-.07,position[1],position[2]],[position[0]+.07,position[1],position[2]],.018,mat.chrome);return[wheel,axle];}
  function stageBase(exercise){
    const station=machines.get(exercise.stationId)?.station;
    const source=machines.get(exercise.stationId)?.group;
    const base=source?[source.position.x,source.position.y??.02,source.position.z]:exercise.stationId==='stretch-zone'?[-17,.06,10]:exercise.stationId==='cable-fly'?[-1,.02,-1]:[-11,.02,1];
    const group=new THREE.Group();group.name=`exercise:${exercise.id}`;group.position.fromArray(base);group.rotation.y=station?.rotation||0;group.visible=false;scene.add(group);
    return {exercise,group,origin:base,rotation:group.rotation.y,staticVolumes:[],dynamicVolumes:[],pose:null,contacts:null,sample:null,cameraYaw:exercise.stationId==='cable-fly'?1.05:1.0};
  }
  function build(exerciseId){
    if(stages.has(exerciseId))return stages.get(exerciseId);
    const exercise=exerciseById(exerciseId);if(!exercise)throw new Error(`Unknown exercise: ${exerciseId}`);
    const stage=stageBase(exercise),group=stage.group;
    if(exerciseId==='dumbbell-curl'){
      box(group,0,.31,-.68,.94,.10,.38,mat.frame);
      for(const x of [-.34,.34])rod(group,[x,.03,-.68],[x,.30,-.68],.035,mat.chrome);
      const weights=[makeDumbbell(group),makeDumbbell(group)];stage.weights=weights;stage.weightIndices=[0,1];stage.weightKind='pair';stage.dumbbellRadius=.115;stage.setWeights=(pose)=>{placeDumbbells(weights,pose.hands,pose.handDirections);stage.dynamicVolumes=dumbbellVolumes(pose);};
      stage.staticVolumes.push({id:'dumbbell-storage',shape:'box',position:[0,.20,-.68],size:[.94,.40,.38],allowedBodyParts:[]});
      stage.sample=(phase,cycle=0)=>{
        const effort=(capturedPose?inertialCurlEffort(exerciseId,phase,cycle):null)??repetition(phase),pose=standing({feet:[[-.13,.012,.10],[.13,.012,.10]]}),roots=armRoots(pose.hip,pose.shoulder);
        const elbows=roots.map((root,index)=>{const upper=dimensions.arm[index].upper,outward=Math.min(.09,upper*.40),forward=.015;return plus(root,[(index?1:-1)*outward,-Math.sqrt(upper*upper-outward*outward-forward*forward),forward]);});
        const angle=.10+1.91*effort;
        pose.hands=elbows.map((elbow,index)=>{const r=dimensions.arm[index].lower+dimensions.arm[index].palm-.006,outward=.08-.055*effort,yz=Math.sqrt(r*r-outward*outward);return plus(elbow,[(index?1:-1)*outward,-yz*Math.cos(angle),yz*Math.sin(angle)]);});
        const turn=smooth((effort-.35)/.55),axis=[Math.sin(turn*Math.PI/2),0,Math.cos(turn*Math.PI/2)];
        pose.elbows=elbows;pose.handDirections=pose.hands.map((hand,index)=>perpendicular(axis,hand.map((value,component)=>value-elbows[index][component])));
        placeDumbbells(weights,pose.hands,pose.handDirections);stage.dynamicVolumes=dumbbellVolumes(pose);return pose;
      };
    } else if(exerciseId==='dumbbell-bench-press'){
      const benchTop=.55,hipZ=.20;
      box(group,0,benchTop-.065,-.37,.52,.13,1.14,mat.pad,.065);
      box(group,0,benchTop+.002,-.37,.47,.006,1.08,mat.stitch,.035);
      rod(group,[0,.16,-.78],[0,.16,.27],.045,mat.frame);
      for(const z of [-.76,.25]){rod(group,[0,.06,z],[0,benchTop-.11,z],.045,mat.chrome);rod(group,[-.32,.055,z],[.32,.055,z],.038,mat.frame);}
      const weights=[makeDumbbell(group),makeDumbbell(group)];stage.weights=weights;stage.weightIndices=[0,1];stage.weightKind='pair';stage.dumbbellRadius=.115;stage.setWeights=(pose)=>{placeDumbbells(weights,pose.hands,pose.handDirections);stage.dynamicVolumes=dumbbellVolumes(pose);};
      stage.staticVolumes.push(
        {id:'bench-pad',shape:'box',position:[0,benchTop-.065,-.37],size:[.52,.13,1.14],allowedBodyParts:['torso','pelvis','head']},
        {id:'bench-rail',shape:'capsule',start:[0,.16,-.78],end:[0,.16,.27],radius:.045,allowedBodyParts:[]},
        ...[-.76,.25].map((z,index)=>({id:`bench-support-${index}`,shape:'capsule',start:[0,.06,z],end:[0,benchTop-.11,z],radius:.045,allowedBodyParts:[]})),
      );
      stage.sample=phase=>{
        const effort=repetition(phase),hip=[0,.675,hipZ],shoulder=[0,.675,hipZ-dimensions.torso],roots=armRoots(hip,shoulder);
        const elbows=roots.map((root,index)=>{const sign=index?1:-1;return plus(root,scaled(normalized(lerp([sign*.81,-.29,.51],[sign*.13,.99,.04],effort)),dimensions.arm[index].upper));});
        const hands=elbows.map((elbow,index)=>{const sign=index?1:-1;return plus(elbow,scaled(normalized(lerp([0,1,0],[-sign*.07,.997,0],effort)),dimensions.arm[index].lower+dimensions.arm[index].palm-.004));});
        const pose={hip,shoulder,head:[0,.69,shoulder[2]-headSpan],hands,elbows,feet:[[-.23,.012,hipZ+legsLength*.58+.10],[.23,.012,hipZ+legsLength*.58+.10]],footNormals:[[0,1,0],[0,1,0]],footDirections:[[0,0,1],[0,0,1]],handDirections:[[1,0,0],[1,0,0]],kneeHints:[[0,1,1],[0,1,1]],lying:true,gripping:true};
        placeDumbbells(weights,hands,pose.handDirections);stage.dynamicVolumes=dumbbellVolumes(pose);return pose;
      };
      stage.cameraYaw=1.1;
    } else if(exerciseId==='rope-pushdown'){
      cableFrame(group);const anchor=[0,2.24,1.04],pulleyParts=pulley(group,anchor);installCableCalibration({THREE,stage,anchor,pulleyParts,rod,mat});
      const cable=rod(group,anchor,[0,1.3,.35],.010,mat.chrome);
      cable.name='calibrated-cable';
      const branchSegments=[[],[]],grips=[];
      for(let i=0;i<2;i++){
        for(let segment=0;segment<5;segment++)branchSegments[i].push(rod(group,[0,0,0],[0,.1,0],.018,mat.rope));
        grips.push(rod(group,[0,0,0],[0,.12,0],.029,mat.rubber));
      }
      stage.staticVolumes.push(...frameVolumes(),{id:'cable-top-beam',shape:'capsule',start:[-1.08,2.32,1.12],end:[1.08,2.32,1.12],radius:.055,allowedBodyParts:[]});
      stage.gearObjects=grips;stage.setGearPose=pose=>{const middle=scaled(plus(pose.hands[0],pose.hands[1]),.5),junction=plus(middle,[0,.19,.09]);setRod(cable,anchor,junction);branchSegments.forEach((segments,index)=>{const hand=pose.hands[index],direction=pose.handDirections?.[index]||[0,1,0],end=plus(hand,scaled(direction,.055)),points=[];for(let step=0;step<=5;step++){const u=step/5,p=lerp(junction,end,u);p[2]-=Math.sin(u*Math.PI)*.025;points.push(p);}segments.forEach((object,segment)=>setRod(object,points[segment],points[segment+1]));setRod(grips[index],plus(hand,scaled(direction,-.055)),plus(hand,scaled(direction,.055)));});stage.dynamicVolumes=pose.hands.map((hand,index)=>({id:`rope-grip-${index}`,shape:'capsule',start:plus(hand,scaled(pose.handDirections?.[index]||[0,1,0],-.052)),end:plus(hand,scaled(pose.handDirections?.[index]||[0,1,0],.052)),radius:.019,allowedBodyParts:[index?'rightHand':'leftHand']}));return junction;};
      stage.sample=phase=>{
        const effort=repetition(phase),pose=standing(),roots=armRoots(pose.hip,pose.shoulder),elbows=roots.map((root,index)=>plus(root,scaled(normalized([(index?1:-1)*.15,-1,.11]),dimensions.arm[index].upper)));
        const angle=1.18-1.02*effort;
        pose.hands=elbows.map((elbow,index)=>{const sign=index?1:-1,r=dimensions.arm[index].lower+dimensions.arm[index].palm-.005,spread=sign*(-.025+.055*effort),yz=Math.sqrt(r*r-spread*spread);return plus(elbow,[spread,-yz*Math.cos(angle),yz*Math.sin(angle)]);});
        pose.elbows=elbows;pose.handGripping=[true,true];
        const middle=scaled(plus(pose.hands[0],pose.hands[1]),.5),junction=plus(middle,[0,.19,.09]);
        pose.handDirections=pose.hands.map((hand,index)=>perpendicular(normalized(junction.map((value,component)=>value-hand[component])),hand.map((value,component)=>value-elbows[index][component])));
        setRod(cable,anchor,junction);
        branchSegments.forEach((segments,index)=>{const hand=pose.hands[index],direction=pose.handDirections[index],end=plus(hand,scaled(direction,.055)),points=[];for(let step=0;step<=5;step++){const u=step/5,p=lerp(junction,end,u);p[2]-=Math.sin(u*Math.PI)*.025;points.push(p);}segments.forEach((object,segment)=>setRod(object,points[segment],points[segment+1]));setRod(grips[index],plus(hand,scaled(direction,-.055)),plus(hand,scaled(direction,.055)));});
        stage.dynamicVolumes=pose.hands.map((hand,index)=>({id:`rope-grip-${index}`,shape:'capsule',start:plus(hand,scaled(pose.handDirections[index],-.052)),end:plus(hand,scaled(pose.handDirections[index],.052)),radius:.019,allowedBodyParts:[index?'rightHand':'leftHand']}));
        return pose;
      };
      stage.cameraYaw=1.30;
    } else if(exerciseId==='single-arm-cable-row'){
      cableFrame(group);const anchor=[.95,1.03,1.06],pulleyParts=pulley(group,anchor);installCableCalibration({THREE,stage,anchor,pulleyParts,rod,mat});
      const cable=rod(group,anchor,[.3,1.2,.5],.010,mat.chrome);
      cable.name='calibrated-cable';
      const handle=new THREE.Group();group.add(handle);
      rod(handle,[0,-.10,0],[0,.10,0],.024,mat.rubber);
      rod(handle,[0,-.10,0],[0,0,.14],.013,mat.chrome);rod(handle,[0,.10,0],[0,0,.14],.013,mat.chrome);
      stage.staticVolumes.push(...frameVolumes(),{id:'row-weight-stack',shape:'box',position:[.92,1.10,1.19],size:[.38,2.12,.33],allowedBodyParts:[]});
      stage.gearObjects=[handle];stage.setGearPose=pose=>{const hand=pose.hands[1],axis=new THREE.Vector3(...(pose.handDirections?.[1]||[0,1,0])).normalize(),toward=new THREE.Vector3(...anchor).sub(new THREE.Vector3(...hand)),forward=toward.addScaledVector(axis,-toward.dot(axis)).normalize(),across=new THREE.Vector3().crossVectors(axis,forward).normalize();handle.position.fromArray(hand);handle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,axis,forward));const connector=plus(hand,scaled(forward.toArray(),.14));setRod(cable,anchor,connector);stage.gearContacts=[null,handle.position.toArray()];stage.dynamicVolumes=[{id:'d-handle-grip',shape:'capsule',start:plus(hand,scaled(axis.toArray(),-.10)),end:plus(hand,scaled(axis.toArray(),.10)),radius:.018,allowedBodyParts:['rightHand']}];return connector;};
      stage.sample=phase=>{
        const effort=repetition(phase),pose=standing(),roots=armRoots(pose.hip,pose.shoulder);
        const elbow=plus(roots[1],scaled(normalized(lerp([.2,-.40,.90],[.30,-.72,-.62],effort)),dimensions.arm[1].upper));
        const hand=plus(elbow,scaled(normalized(lerp([0,-.20,.98],[-.12,-.10,.99],effort)),dimensions.arm[1].lower+dimensions.arm[1].palm-.015));
        const relaxedHand=[-shWidth-.10,(dimensions.hands?.[0]?.[1]??dimensions.hip[1]-.10)+.01,.06];
        pose.hands=[relaxedHand,hand];pose.elbows=[plus(roots[0],scaled(normalized([-.22,-1,-.02]),dimensions.arm[0].upper)),elbow];pose.handGripping=[false,true];pose.handDirections=[[1,0,0],[0,1,0]];
        const toward=normalized(anchor.map((value,index)=>value-hand[index]));
        handle.position.fromArray(hand);handle.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(toward[0],0,toward[2]).normalize());
        setRod(cable,anchor,plus(hand,scaled(normalized([toward[0],0,toward[2]]),.14)));
        stage.dynamicVolumes=[{id:'d-handle-grip',shape:'capsule',start:plus(hand,[0,-.10,0]),end:plus(hand,[0,.10,0]),radius:.018,allowedBodyParts:['rightHand']}];return pose;
      };
      stage.cameraYaw=1.60;
    } else if(exerciseId==='kneeling-hip-flexor-stretch'){
      const top=.045;box(group,0,top/2,-.12,1.6,top,2.1,mat.floor,.035);
      for(const x of [-.73,.73])box(group,x,top+.001,-.12,.009,.003,1.95,mat.stitch,.001);
      stage.staticVolumes.push({id:'stretch-mat',shape:'box',position:[0,top/2,-.12],size:[1.6,top,2.1],allowedBodyParts:['leftFoot','rightFoot','rightThigh','rightShin']});
      stage.sample=phase=>{
        const extension=phase<.23?smooth(phase/.23):phase>.78?1-smooth((phase-.78)/.22):1;
        const back=dimensions.leg[1],hipOffset=back.offset,backKnee=[hipOffset[0],top+.055,-.12],hipZ=.018+.045*extension;
        const forward=hipZ+hipOffset[2]-backKnee[2],rootY=backKnee[1]+Math.sqrt(Math.max(.001,back.upper*back.upper-forward*forward));
        const hip=[0,rootY-hipOffset[1],hipZ],shoulder=plus(hip,[0,dimensions.torso,0]),head=plus(shoulder,[0,headSpan,0]);
        const backAnkle=[hipOffset[0],backKnee[1],backKnee[2]-back.lower];
        const rearContact=[backAnkle[0],backAnkle[1]+dimensions.footHeight,backAnkle[2]-dimensions.footForward];
        const footZ=.42+dimensions.footForward,frontFoot=[-.16,top+.013,footZ];
        const pose={hip,shoulder,head,feet:[frontFoot,rearContact],footDirections:[[0,0,1],[0,0,-1]],footNormals:[[0,1,0],[0,-1,0]],hands:[[-.20,hip[1]+.06,.34],[-.055,hip[1]+.06,.34]],handDirections:[[1,0,0],[1,0,0]],handNormals:[[0,-1,0],[0,-1,0]],handGripping:[false,false],gripping:false,elbowHints:[[-.4,-.6,.8],[.4,-.6,.8]],knees:[[-.16,top+dimensions.footHeight+dimensions.leg[0].lower,footZ-dimensions.footForward],backKnee],kneeHints:[[0,1,1],[0,-1,-1]]};
        stage.dynamicVolumes=[];return pose;
      };
      stage.cameraYaw=1.2;
    }
    if(!stage.sample)throw new Error(`No rig for ${exerciseId}`);
    stage.pose=stage.sample(0,0);stage.entryReadyPose=JSON.parse(JSON.stringify(stage.pose));stage.contacts={hands:stage.pose.hands.map(copyPoint),feet:stage.pose.feet.map(copyPoint)};
    stages.set(exerciseId,stage);return stage;
  }

  function end(){if(active)active.group.visible=false;for(const [group,visible]of hiddenMachines)group.visible=visible;hiddenMachines.clear();active=null;}
  function getSetup(exerciseId){const stage=build(exerciseId);return {exerciseId,stationId:stage.exercise.stationId,origin:[...stage.origin],rotation:stage.rotation,duration:stage.exercise.duration,attachmentId:stage.exercise.attachmentId,setupLabel:stage.exercise.setupLabel,cameraYaw:stage.cameraYaw,cameraPitch:stage.exercise.category==='stretch'?.28:.32,cameraDistance:stage.exercise.category==='stretch'?3.5:4.1,entryReadyPose:JSON.parse(JSON.stringify(stage.entryReadyPose))};}
  return {
    begin(exerciseId){end();active=build(exerciseId);const machine=machines.get(active.exercise.stationId);if(machine?.group){hiddenMachines.set(machine.group,machine.group.visible);machine.group.visible=false;}active.group.visible=true;return getSetup(exerciseId);},
    sample(exerciseId,phase=0,cycle=0){const stage=build(exerciseId);stage.pose=stage.sample(THREE.MathUtils.clamp(phase,0,1),cycle);stage.contacts={hands:stage.pose.hands.map(copyPoint),feet:stage.pose.feet.map(copyPoint)};return stage.pose;},
    end,getSetup,getStage:build,
    getInventoryRoots(){return [...stages.values()].map(stage=>stage.group);},
    getCollisionVolumes(exerciseId){const stage=build(exerciseId);return [...stage.staticVolumes,...stage.dynamicVolumes].map(volume=>({...volume,position:volume.position?.slice(),size:volume.size?.slice(),start:volume.start?.slice(),end:volume.end?.slice(),allowedBodyParts:[...volume.allowedBodyParts]}));},
    getActualContacts(exerciseId){const stage=build(exerciseId);return {hands:stage.contacts.hands.map(copyPoint),feet:stage.contacts.feet.map(copyPoint)};},
    getAttachments(){return [{id:'dumbbells-pair',name:'雙手啞鈴',stationId:'dumbbell-curl'},{id:'triceps-rope',name:'雙頭繩索',stationId:'cable-fly'},{id:'single-d-handle',name:'D 形單手把',stationId:'cable-fly'},{id:'stretch-mat',name:'伸展軟墊',stationId:'stretch-zone'}];},
    getMetrics(){return dimensions;},
  };
}
