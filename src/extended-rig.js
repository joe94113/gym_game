import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {inertialCurlEffort} from './inertial-curl-v018.js';
import {lateralReferenceEffort,lateralReferencePlane} from './lateral-reference-v018.js';
import {createExerciseRig} from './exercise-rig.js';
import {extendedExercises} from './extended-exercises.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {createRigLifecycle} from './rig-lifecycle.js';
import {exercises as baseExercises} from './exercises.js';
import {adaptDumbbellGrip,DUMBBELL_IDS} from './dumbbell-grip.js';
import {BENCH_ANGLES,equipmentOptionsFor} from './equipment-options.js';
import {createInclineBenchStage} from './incline-bench.js';
import {createStraightBarPushdownStage} from './straight-bar-pushdown.js';
import {cableExercisesV011,CABLE_IDS_V011} from './cable-exercises-v011.js';
import {configureCableStageV011} from './cable-stages-v011.js';
import {equipmentAdjustmentsFor,defaultCalibration,validateCalibrationPatch,installCableCalibration} from './equipment-calibration-v013.js';
import {capturedExerciseEffort} from './captured-exercise-v015.js';
import {applyCapturedPose} from './captured-pose-v017.js';
import {lowerBodyCapturedEffort,applyLowerBodyReference} from './lower-body-capture-v018.js';

/** Visible attachments and real-skeleton IK share each contact target. */
export function createActivityRig(options){
  const {THREE,scene,machines=new Map(),characterMetrics:metrics={},geometries=new Set(),extraMaterials=new Set()}=options;
  const additionalExercises=[...extendedExercises,...cableExercisesV011];
  const original=createExerciseRig(options),definitions=new Map(additionalExercises.map(exercise=>[exercise.id,exercise]));
  const material=(color,metalness=0,roughness=.7)=>{const value=new THREE.MeshStandardMaterial({color,metalness,roughness});extraMaterials.add(value);return value;};
  const mat={frame:options.materials?.graphite||material('#293830',.5,.4),chrome:options.materials?.chrome||material('#b9c4be',.85,.25),rubber:options.materials?.black||material('#1f2924'),pad:material('#5c7258'),rope:material('#514d43')};
  const cache=new Map(),up=new THREE.Vector3(0,1,0),xAxis=new THREE.Vector3(1,0,0);
  const geometry=(key,make)=>{if(!cache.has(key)){const value=make();cache.set(key,value);geometries.add(value);}return cache.get(key);};
  const mesh=(parent,g,m)=>{const object=new THREE.Mesh(g,m);parent.add(object);object.castShadow=object.receiveShadow=true;return object;};
  function box(parent,point,size,m=mat.frame){const object=mesh(parent,geometry(`b:${size}`,()=>new RoundedBoxGeometry(...size,1,Math.min(.025,...size.map(v=>v/3)))),m);object.position.fromArray(point);return object;}
  function rod(parent,a,b,r=.025,m=mat.chrome){const object=mesh(parent,geometry(`c:${r}`,()=>new THREE.CylinderGeometry(r,r,1,14)),m);setRod(object,a,b);return object;}
  function setRod(object,a,b){const start=new THREE.Vector3(...a),delta=new THREE.Vector3(...b).sub(start);object.position.copy(start).addScaledVector(delta,.5);object.scale.y=Math.max(.00001,delta.length());object.quaternion.setFromUnitVectors(up,delta.normalize());}
  const add=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,k)=>a.map(v=>v*k),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
  const ease=t=>{const value=THREE.MathUtils.clamp(t,0,1);return value*value*(3-2*value);};
  const effort=p=>p<=.44?ease(p/.44):1-ease((p-.44)/.56);
  const stretchEffort=p=>p<.22?ease(p/.22):p>.78?1-ease((p-.78)/.22):1;
  const neutral=metrics.neutral||{hip:[0,.93434,.0037],shoulder:[0,1.38948,.0163],head:[0,1.5981,.0534]},torso=metrics.torsoLength||.455317;
  const headSpan=neutral.head[1]-neutral.shoulder[1],arms=metrics.arms||[-1,1].map(s=>({upper:.24676,lower:.25253,palmLength:.07351,shoulderOffset:[s*.18572,0,0]}));
  const footForward=metrics.footForwardOffset||.1303,footHeight=metrics.footHeightOffset||.0796;
  const signs=[-1,1],stages=new Map();let active=null,hidden=null;
  function standing(extra={}){return{hip:[...neutral.hip],shoulder:[...neutral.shoulder],head:[...neutral.head],feet:[[-.18,.013,.145],[.18,.013,.145]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],gripping:true,...extra};}
  function roots(pose){const rotation=new THREE.Quaternion().setFromUnitVectors(up,new THREE.Vector3(...pose.shoulder).sub(new THREE.Vector3(...pose.hip)).normalize());return arms.map(arm=>new THREE.Vector3(...arm.shoulderOffset).applyQuaternion(rotation).add(new THREE.Vector3(...pose.shoulder)).toArray());}
  function setTorso(pose,hip,lean=0){pose.hip=hip;pose.shoulder=add(hip,[0,torso*Math.cos(lean),torso*Math.sin(lean)]);pose.head=add(pose.shoulder,[0,headSpan*Math.cos(lean),headSpan*Math.sin(lean)]);return pose;}
  function armPose(pose,elbowVectors,forearmVectors){const shoulderRoots=roots(pose);pose.elbows=shoulderRoots.map((root,i)=>add(root,scale(norm(elbowVectors[i]),arms[i].upper)));pose.hands=pose.elbows.map((elbow,i)=>add(elbow,scale(norm(forearmVectors[i]),arms[i].lower+arms[i].palmLength-.008)));return pose;}
  function dumbbell(parent){const group=new THREE.Group();parent.add(group);rod(group,[-.19,0,0],[.19,0,0],.016);for(const sign of signs){const weight=mesh(group,geometry('db-weight',()=>new THREE.CylinderGeometry(.108,.108,.075,12)),mat.rubber);weight.position.x=sign*.165;weight.rotation.z=Math.PI/2;}return group;}
  function placeWeights(objects,pose,indices=[0,1]){objects.forEach((object,i)=>{const side=indices[i];object.position.fromArray(pose.hands[side]);object.quaternion.setFromUnitVectors(xAxis,new THREE.Vector3(...pose.handDirections[side]).normalize());});}
  function weightVolumes(pose,indices=[0,1]){return indices.flatMap(index=>{const axis=norm(pose.handDirections[index]),q=new THREE.Quaternion().setFromUnitVectors(xAxis,new THREE.Vector3(...axis));return signs.map(sign=>({id:`dumbbell-${index}-${sign}`,shape:'box',position:add(pose.hands[index],scale(axis,sign*.165)),size:[.075,.216,.216],rotation:new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3),allowedBodyParts:[index?'rightHand':'leftHand']}));});}
  function cableFrame(stage){for(const sign of signs){rod(stage.group,[sign*1.08,.08,1.12],[sign*1.08,2.32,1.12],.055,mat.frame);box(stage.group,[sign*.94,1.1,1.22],[.34,2.08,.25]);stage.staticVolumes.push({id:`cable-upright-${sign}`,shape:'capsule',start:[sign*1.08,.08,1.12],end:[sign*1.08,2.32,1.12],radius:.055,allowedBodyParts:[]},{id:`cable-stack-${sign}`,shape:'box',position:[sign*.94,1.1,1.22],size:[.34,2.08,.25],allowedBodyParts:[]});}rod(stage.group,[-1.08,2.32,1.12],[1.08,2.32,1.12],.055,mat.frame);stage.staticVolumes.push({id:'cable-top',shape:'capsule',start:[-1.08,2.32,1.12],end:[1.08,2.32,1.12],radius:.055,allowedBodyParts:[]});}
  function dHandle(parent){const group=new THREE.Group();parent.add(group);rod(group,[0,-.105,0],[0,.105,0],.022,mat.rubber);rod(group,[0,-.105,0],[0,0,.16],.014);rod(group,[0,.105,0],[0,0,.16],.014);return group;}
  function support(stage,z=.68,y=1.15){rod(stage.group,[-.62,y,z],[.62,y,z],.025,mat.rubber);for(const sign of signs){rod(stage.group,[sign*.62,.03,z],[sign*.62,y,z],.034,mat.frame);stage.staticVolumes.push({id:`support-post-${sign}`,shape:'capsule',start:[sign*.62,.03,z],end:[sign*.62,y,z],radius:.034,allowedBodyParts:[]});}stage.staticVolumes.push({id:'support-bar',shape:'capsule',start:[-.62,y,z],end:[.62,y,z],radius:.025,allowedBodyParts:['leftHand','rightHand']});}
  function build(id){
    if(stages.has(id))return stages.get(id);const definition=definitions.get(id);if(!definition)throw new Error(`Unknown extra movement: ${id}`);
    const machine=machines.get(definition.stationId),origin=machine?[machine.group.position.x,machine.group.position.y??.02,machine.group.position.z]:definition.stationId==='stretch-zone'?[-17,.06,10]:definition.stationId==='cable-fly'?[-1,.02,-1]:[-11,.02,1];
    const group=new THREE.Group();group.name=`activity:${id}`;group.position.fromArray(origin);group.rotation.y=machine?.group.rotation.y||0;group.visible=false;scene.add(group);
    const stage={definition,group,origin,rotation:group.rotation.y,staticVolumes:[],dynamicVolumes:[],pose:null,cameraYaw:1.15,cameraDistance:5.0};
    if(CABLE_IDS_V011.includes(id)){configureCableStageV011({stage,THREE,metrics,box,rod,setRod,mat,capturedPose:options.capturedPose!==false});stages.set(id,stage);return stage;}
    if(definition.stationId==='dumbbell-curl'){
      const one=id==='dumbbell-single-arm-row',goblet=id==='dumbbell-goblet-squat',weights=goblet?[dumbbell(group)]:one?[dumbbell(group)]:[dumbbell(group),dumbbell(group)];
      stage.weights=weights;stage.weightIndices=one?[1]:[0,1];stage.weightKind=goblet?'goblet':one?'single':'pair';stage.dumbbellRadius=.108;stage.setWeights=pose=>{if(goblet){const center=[(pose.hands[0][0]+pose.hands[1][0])/2,(pose.hands[0][1]+pose.hands[1][1])/2-.165,(pose.hands[0][2]+pose.hands[1][2])/2];weights[0].position.fromArray(center);weights[0].quaternion.setFromUnitVectors(xAxis,up);stage.dynamicVolumes=signs.map(sign=>({id:`goblet-weight-${sign}`,shape:'box',position:add(center,[0,sign*.165,0]),size:[.216,.075,.216],allowedBodyParts:['leftHand','rightHand']}));}else{placeWeights(weights,pose,stage.weightIndices);stage.dynamicVolumes=weightVolumes(pose,stage.weightIndices);}};
      if(one){
        box(group,[-.56,.568,.29],[.36,.12,.48],mat.pad);
        for(const z of [.08,.52]){rod(group,[-.56,.04,z],[-.56,.51,z],.035,mat.frame);box(group,[-.56,.025,z],[.30,.05,.18],mat.rubber);}
        stage.staticVolumes.push({id:'row-support-pad',shape:'box',position:[-.56,.568,.29],size:[.36,.12,.48],allowedBodyParts:['leftHand']},...([.08,.52].map((z,index)=>({id:`row-support-leg-${index}`,shape:'capsule',start:[-.56,.04,z],end:[-.56,.51,z],radius:.035,allowedBodyParts:[]}))));
      }
      stage.sample=(phase,cycle=0)=>{const e=(options.capturedPose!==false?lowerBodyCapturedEffort(id,phase,cycle)??inertialCurlEffort(id,phase,cycle)??lateralReferenceEffort(id,phase,cycle):null)??capturedExerciseEffort(id,phase,cycle)??effort(phase);let pose=standing();
        if(id==='dumbbell-hammer-curl'){armPose(pose,signs.map(s=>[s*.13,-.21,.015]),signs.map(s=>[s*.14,-Math.cos(.1+1.91*e),Math.sin(.1+1.91*e)]));pose.handDirections=pose.hands.map((hand,i)=>{const v=hand.map((value,j)=>value-pose.elbows[i][j]);return norm([0,v[2],-v[1]]);});}
        else if(id==='dumbbell-shoulder-press'){armPose(pose,signs.map(s=>mix([s*.23,.01,.08],[s*.09,.23,.015],e)),signs.map(()=>mix([0,1,.04],[0,1,0],e)));pose.handDirections=[[1,0,0],[1,0,0]];}
        else if(id==='dumbbell-lateral-raise'){const angle=.29+1.10*e,plane=options.capturedPose!==false?lateralReferencePlane(id,phase,cycle):0;armPose(pose,signs.map(s=>[s*Math.sin(angle),-Math.cos(angle),.025+plane]),signs.map(s=>[s*Math.sin(angle),-Math.cos(angle),.18+plane]));pose.handDirections=[[0,0,1],[0,0,1]];}
        else if(one){setTorso(pose,[0,.77,0],.85);pose.feet=[[-.22,.013,-.03],[.22,.013,.35]];armPose(pose,[[-.06,-.24,.02],mix([.20,-.16,.02],[.20,.10,-.10],e)],[[0,-.8,.6],[0,-1,0]]);pose.hands[0]=[-.42,.65,.50];pose.elbows[0]=[-.30,.88,.28];pose.handDirections=[[0,0,1],[0,0,1]];pose.handAdvances=[[0,0,1],null];pose.handGripping=[false,true];pose.handNormals=[[0,-1,0],null];}
        else if(goblet){setTorso(pose,[0,neutral.hip[1]-.31*e,-.13*e],.24*e);const center=[0,pose.shoulder[1]-.24,pose.shoulder[2]+.29];pose.hands=[[-.10,center[1]+.165,center[2]],[.10,center[1]+.165,center[2]]];pose.handDirections=[[0,0,1],[0,0,1]];pose.elbowHints=[[-1,-.7,.3],[1,-.7,.3]];weights[0].position.fromArray(center);weights[0].quaternion.setFromUnitVectors(xAxis,up);stage.dynamicVolumes=signs.map(sign=>({id:`goblet-weight-${sign}`,shape:'box',position:add(center,[0,sign*.165,0]),size:[.216,.075,.216],allowedBodyParts:['leftHand','rightHand']}));}
        else if(id==='dumbbell-romanian-deadlift'){setTorso(pose,[0,neutral.hip[1]-.05*e,-.20*e],.99*e);armPose(pose,signs.map(s=>[s*.30,-1,0]),signs.map(s=>[s*.34,-1,0]));pose.handDirections=[[0,0,1],[0,0,1]];}
        if(options.capturedPose!==false){pose=applyCapturedPose({id,phase,cycle,pose,metrics});pose=applyLowerBodyReference({id,phase,cycle,pose,metrics});}
        if(goblet)stage.setWeights(pose);
        else{const indices=one?[1]:[0,1];placeWeights(weights,pose,indices);stage.dynamicVolumes=weightVolumes(pose,indices);}return pose;
      };
    }else if(definition.stationId==='stretch-zone'){
      box(group,[0,.035,.08],[1.8,.07,2.25],mat.pad);stage.staticVolumes.push({id:'stretch-mat',shape:'box',position:[0,.035,.08],size:[1.8,.07,2.25],allowedBodyParts:['leftFoot','rightFoot','leftShin','rightShin','leftThigh','rightThigh','pelvis']});
      if(id==='standing-calf-stretch')support(stage,.60,1.16);
      if(id==='seated-glute-stretch'){
        box(group,[0,.137,-.03],[.50,.13,.40],mat.frame);
        box(group,[0,.216,-.03],[.54,.026,.44],mat.pad);
        stage.staticVolumes.push({id:'stretch-seat-base',shape:'box',position:[0,.137,-.03],size:[.50,.13,.40],allowedBodyParts:[]},{id:'stretch-seat-pad',shape:'box',position:[0,.216,-.03],size:[.54,.026,.44],allowedBodyParts:['pelvis','leftThigh','rightThigh']});
      }
      stage.sample=phase=>{const e=stretchEffort(phase),pose=standing();pose.feet=pose.feet.map(p=>add(p,[0,.07,0]));pose.hip[1]+=.07;pose.shoulder[1]+=.07;pose.head[1]+=.07;pose.gripping=false;
        if(id==='standing-hamstring-stretch'){setTorso(pose,[0,.93-.01*e,.16-.035*e],.15+.43*e);pose.feet=[[-.18,.083,.12],[.18,.083,.60]];pose.hands=[[-.23,pose.hip[1]-.02,.24],[.23,pose.hip[1]-.08,.35]];pose.handNormals=[[0,1,0],[0,1,0]];pose.elbowHints=[[-.5,-.5,.6],[.5,-.5,.6]];}
        else if(id==='seated-glute-stretch'){setTorso(pose,[0,.32,.0],.10+.16*e);pose.feet=[[-.18,.083,.62],[-.10,.43,.36]];pose.hands=[[-.20,.49,.29],[.22,.50,.30]];pose.handNormals=[[0,1,0],[0,1,0]];pose.kneeHints=[[-.6,.2,1],[1,.5,.2]];pose.elbowHints=[[-.8,-.4,.5],[.8,-.4,.5]];}
        else if(id==='standing-chest-shoulder-stretch'){armPose(pose,signs.map(s=>[s*.20,-.10,-.02-.04*e]),signs.map(s=>[s*.7,.1,-.3-.2*e]));pose.handDirections=[[0,1,0],[0,1,0]];}
        else if(id==='standing-calf-stretch'){setTorso(pose,[0,.89,.07+.04*e],.12);pose.feet=[[-.18,.083,.46],[.18,.083,-.18]];pose.hands=[[-.30,1.16,.60],[.30,1.16,.60]];pose.handDirections=[[1,0,0],[1,0,0]];pose.gripping=true;pose.elbowHints=[[-.8,-.2,.6],[.8,-.2,.6]];}
        else if(id==='standing-thoracic-rotation'){const twist=Math.sin(phase*Math.PI*2)*.55;pose.spineTwist=twist;pose.hands=signs.map(s=>{const p=new THREE.Vector3(s*.16,-.17,.25).applyAxisAngle(up,twist);return add(p.toArray(),pose.shoulder);});pose.elbowHints=[[-1,-.5,.25],[1,-.5,.25]];pose.handDirections=[[1,0,0],[1,0,0]];}
        return pose;
      };
    }else{
      cableFrame(stage);const isCurl=id.includes('-curl'),isEz=id==='cable-ez-bar-curl',isV=id==='cable-v-bar-row',isFace=id==='cable-rope-face-pull',isLateral=id==='cable-single-arm-lateral-raise',isAnkle=id==='cable-ankle-kickback';
      const anchor=isCurl?[0,.16,1.04]:isV?[0,1.12,1.04]:isFace?[0,1.87,1.04]:isLateral?[-.92,.18,1.04]:[.70,.16,1.04];
      installCableCalibration({THREE,stage,anchor,rod,mat});
      const cable=rod(group,anchor,[0,1,.5],.009,mat.chrome),attachment=new THREE.Group();group.add(attachment);let ropeBranches=null,ropeGrips=null,ropeStops=null,vGrips=null;
      cable.name='calibrated-cable';
      if(isCurl){const points=isEz?[[-.40,0,0],[-.30,0,0],[-.15,0,.06],[.15,0,.06],[.30,0,0],[.40,0,0]]:[[-.40,0,0],[.40,0,0]];for(let i=0;i<points.length-1;i++)rod(attachment,points[i],points[i+1],.023,mat.rubber);}
      else if(isV){rod(attachment,[-.14,0,0],[0,0,.16],.02);rod(attachment,[.14,0,0],[0,0,.16],.02);vGrips=signs.map(sign=>rod(attachment,[sign*.14,-.10,0],[sign*.14,.10,0],.027,mat.rubber));rod(attachment,[0,0,.16],[0,.22,.16],.013,mat.chrome);}
      else if(isFace){ropeBranches=signs.map(()=>[rod(group,[0,0,0],[0,1,0],.018,mat.rope),rod(group,[0,0,0],[0,1,0],.018,mat.rope)]);ropeGrips=signs.map(()=>rod(group,[0,0,0],[0,1,0],.026,mat.rubber));ropeStops=signs.map(()=>mesh(group,geometry('rope-stop',()=>new THREE.SphereGeometry(.039,14,10)),mat.rubber));}
      else if(isLateral){const handle=dHandle(attachment);handle.rotation.x=Math.PI/2;}
      else if(isAnkle){const band=mesh(attachment,geometry('ankle-band',()=>new THREE.TorusGeometry(.064,.017,8,22)),mat.rubber);band.rotation.x=Math.PI/2;support(stage,.48,1.18);}
      stage.gearObjects=isV?vGrips:isFace?ropeGrips:[attachment];
      stage.setGearPose=(pose,bandPosition=null)=>{
        let connector;
        if(isCurl){const center=[0,pose.hands[0][1],pose.hands[0][2]-(isEz?.024:0)];attachment.position.fromArray(center);connector=add(center,[0,0,isEz?.06:0]);stage.gearContacts=signs.map(sign=>add(center,[sign*.24,0,isEz?.024:0]));const points=isEz?[[-.40,0,0],[-.30,0,0],[-.15,0,.06],[.15,0,.06],[.30,0,0],[.40,0,0]]:[[-.40,0,0],[.40,0,0]];stage.dynamicVolumes=points.slice(1).map((p,i)=>({id:`curl-attachment-${i}`,shape:'capsule',start:add(center,points[i]),end:add(center,p),radius:.023,allowedBodyParts:['leftHand','rightHand']}));}
        else if(isV){const center=[0,pose.hands[0][1],pose.hands[0][2]];attachment.position.fromArray(center);connector=add(center,[0,.22,.16]);stage.gearContacts=signs.map(sign=>add(center,[sign*.14,0,0]));stage.dynamicVolumes=[{id:'v-carabiner-link',shape:'capsule',start:add(center,[0,0,.16]),end:connector,radius:.013,allowedBodyParts:['leftHand','rightHand']}];vGrips.forEach((grip,i)=>{const axis=pose.handDirections?.[i]||[0,1,0],local=[signs[i]*.14,0,0],a=add(local,scale(axis,-.10)),b=add(local,scale(axis,.10));setRod(grip,a,b);stage.dynamicVolumes.push({id:`v-handle-${i}`,shape:'capsule',start:add(center,a),end:add(center,b),radius:.027,allowedBodyParts:[i?'rightHand':'leftHand']},{id:`v-frame-${i}`,shape:'capsule',start:add(center,local),end:add(center,[0,0,.16]),radius:.02,allowedBodyParts:['leftHand','rightHand']});});}
        else if(isFace){const gripFrames=pose.hands.map((hand,index)=>({axis:pose.handDirections?.[index]||[0,1,0]}));connector=pose.gearConnector||[0,pose.hands[0][1]+.12,pose.hands[0][2]+Math.sqrt(Math.max(.01,.48*.48-pose.hands[0][0]**2-.12*.12))];stage.dynamicVolumes=[];ropeBranches.forEach((branches,i)=>{const hand=pose.hands[i],axis=gripFrames[i].axis,entry=add(hand,scale(axis,.08)),end=add(hand,scale(axis,-.09)),bend=add(hand,scale(axis,.17));setRod(branches[0],connector,bend);setRod(branches[1],bend,entry);setRod(ropeGrips[i],entry,end);const stop=add(hand,scale(axis,-.12));ropeStops[i].position.fromArray(stop);stage.dynamicVolumes.push({id:`rope-grip-${i}`,shape:'capsule',start:entry,end,radius:.026,allowedBodyParts:[i?'rightHand':'leftHand']},{id:`rope-stop-${i}`,shape:'box',position:stop,size:[.078,.078,.078],allowedBodyParts:[i?'rightHand':'leftHand']});});}
        else if(isLateral){const axis=pose.handDirections?.[1]||[0,0,1],q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...axis).normalize());attachment.position.fromArray(pose.hands[1]);attachment.quaternion.copy(q);connector=add(pose.hands[1],new THREE.Vector3(0,-.16,0).applyQuaternion(q).toArray());stage.gearContacts=[null,[...pose.hands[1]]];stage.dynamicVolumes=[{id:'lateral-d-grip',shape:'capsule',start:add(pose.hands[1],scale(axis,-.10)),end:add(pose.hands[1],scale(axis,.10)),radius:.023,allowedBodyParts:['leftHand','rightHand']}];}
        else if(isAnkle){const ankle=bandPosition||add(pose.feet[1],[0,footHeight,-footForward]);attachment.position.fromArray(ankle);connector=add(ankle,[.064,0,0]);}
        setRod(cable,anchor,connector);return connector;
      };
      stage.sample=(phase,cycle=0)=>{const e=(options.capturedPose!==false?inertialCurlEffort(id,phase,cycle):null)??effort(phase),pose=standing();let connector;
        if(isCurl){armPose(pose,signs.map(s=>[s*.085,-.23,.015]),signs.map(()=>[0,-Math.cos((isEz?.18:.50)+(isEz?1.8:1.48)*e),Math.sin((isEz?.18:.50)+(isEz?1.8:1.48)*e)]));pose.hands=pose.hands.map((p,i)=>[signs[i]*.24,p[1],p[2]+(isEz?.024:0)]);pose.handDirections=isEz?[[1,0,.4],[1,0,-.4]]:[[1,0,0],[1,0,0]];const center=[0,pose.hands[0][1],pose.hands[0][2]-(isEz?.024:0)];attachment.position.fromArray(center);connector=add(center,[0,0,isEz?.06:0]);}
        else if(isV){setTorso(pose,[0,.90,0],.05);pose.hands=signs.map(s=>[s*.14,1.08,.51-.25*e]);pose.handDirections=[[0,1,0],[0,1,0]];pose.elbowHints=[[-1,-.3,-.2],[1,-.3,-.2]];attachment.position.set(0,1.08,pose.hands[0][2]);connector=[0,1.08,pose.hands[0][2]+.16];}
        else if(isFace){pose.hands=signs.map(s=>[s*(.20+.20*e),1.40+.09*e,.52-.34*e]);pose.handDirections=[[0,1,0],[0,1,0]];pose.elbowHints=[[-1,.15,-.1],[1,.15,-.1]];const gripFrames=pose.hands.map((hand,index)=>solveHandContactFrame(metrics,pose,index));pose.handDirections=gripFrames.map(frame=>frame.axis);connector=[0,pose.hands[0][1]+.12,pose.hands[0][2]+Math.sqrt(.48*.48-pose.hands[0][0]**2-.12*.12)];stage.dynamicVolumes=[];ropeBranches.forEach((branches,i)=>{const hand=pose.hands[i],axis=gripFrames[i].axis,entry=add(hand,scale(axis,.08)),end=add(hand,scale(axis,-.09)),bend=add(hand,scale(axis,.17));setRod(branches[0],connector,bend);setRod(branches[1],bend,entry);setRod(ropeGrips[i],entry,end);const stop=add(hand,scale(axis,-.12));ropeStops[i].position.fromArray(stop);stage.dynamicVolumes.push({id:`rope-grip-${i}`,shape:'capsule',start:entry,end,radius:.026,allowedBodyParts:[i?'rightHand':'leftHand']},{id:`rope-stop-${i}`,shape:'box',position:stop,size:[.078,.078,.078],allowedBodyParts:[i?'rightHand':'leftHand']});});}
        else if(isLateral){const angle=.15+1.2*e;armPose(pose,[[-.07,-1,.02],[Math.sin(angle),-Math.cos(angle),.025]],[[-.06,-1,.03],[Math.sin(angle),-Math.cos(angle),.15]]);pose.hands[0]=[-.30,.88,.05];pose.elbows[0]=[-.29,1.17,.03];pose.handGripping=[false,true];pose.handDirections=[[0,0,1],[0,0,1]];attachment.position.fromArray(pose.hands[1]);connector=add(pose.hands[1],[0,-.16,0]);}
        else if(isAnkle){setTorso(pose,[0,.87,0],.12);pose.feet=[[-.18,.013,.16],[.18,.013+.13*e,.13-.37*e]];pose.hands=[[-.30,1.18,.48],[.30,1.18,.48]];pose.handDirections=[[1,0,0],[1,0,0]];pose.elbowHints=[[-1,-.3,.5],[1,-.3,.5]];const ankle=add(pose.feet[1],[0,footHeight,-footForward]);attachment.position.fromArray(ankle);connector=add(ankle,[.064,0,0]);}
        if(isV||isLateral){const frames=pose.hands.map((_,i)=>solveHandContactFrame(metrics,pose,i));pose.handDirections=frames.map(f=>f.axis);pose.handAdvances=frames.map(f=>f.advance);}stage.setGearPose(pose);return pose;
      };
      stage.cameraYaw=isAnkle?1.6:1.25;
    }
    stage.pose=stage.sample(0);stage.entryReadyPose=structuredClone(stage.pose);stages.set(id,stage);return stage;
  }
  const selectedSettings=new Map(),configuredBenches=new Map();let configuredPushdown=null;
  const settingsFor=id=>({...defaultCalibration(equipmentAdjustmentsFor(id)),...(id==='dumbbell-bench-press'?{benchAngle:0}:id==='rope-pushdown'?{handle:'triceps-rope'}:{}),...(selectedSettings.get(id)||{})});
  function configuredBench(id){
    const angle=settingsFor(id).benchAngle;if(id!=='dumbbell-bench-press'||!angle)return null;
    if(!configuredBenches.has(angle))configuredBenches.set(angle,createInclineBenchStage({THREE,scene,flat:original.getStage(id),angle,geometries}));
    return configuredBenches.get(angle);
  }
  function configuredStage(id){if(id==='rope-pushdown'&&settingsFor(id).handle==='straight-bar'){if(!configuredPushdown)configuredPushdown=createStraightBarPushdownStage({THREE,scene,source:original.getStage(id),metrics,geometries});return configuredPushdown;}return configuredBench(id);}
  function currentStage(id){const stage=configuredStage(id)||(definitions.has(id)?build(id):original.getStage(id));stage.setCalibration?.(settingsFor(id));return stage;}
  function configuredSetup(id){const stage=configuredStage(id);return stage?{...original.getSetup(id),entryReadyPose:stage.entryReadyPose,...(stage.benchAngle?{benchAngle:stage.benchAngle,setupLabel:`${stage.benchAngle} degree incline bench`}:{attachmentId:stage.attachmentId,setupLabel:stage.configurationLabel})}:null;}
  const end=()=>{if(active){build(active).group.visible=false;if(hidden)hidden.group.visible=hidden.wasVisible;active=null;hidden=null;}original.end();};
  function setup(id){const stage=build(id);return{exerciseId:id,stationId:stage.definition.stationId,origin:[...stage.origin],rotation:stage.rotation,duration:stage.definition.duration,attachmentId:stage.definition.attachmentId,setupLabel:stage.definition.setupLabel,cameraYaw:stage.cameraYaw,cameraPitch:.30,cameraDistance:stage.cameraDistance,cameraTargetHeight:.95,entryReadyPose:stage.entryReadyPose};}
  const baseApi={
    begin(id){end();if(!definitions.has(id))return original.begin(id);const stage=build(id),machine=machines.get(stage.definition.stationId);if(machine){hidden={group:machine.group,wasVisible:machine.group.visible};machine.group.visible=false;}stage.group.visible=true;active=id;return setup(id);},
    end,
    getSetup:id=>configuredSetup(id)||(definitions.has(id)?setup(id):original.getSetup(id)),
    sample(id,phase=0,cycle=phase){const configured=configuredStage(id);if(configured)return configured.sample(THREE.MathUtils.clamp(phase,0,1),cycle);if(!definitions.has(id))return original.sample(id,phase,cycle);const stage=build(id);stage.pose=stage.sample(THREE.MathUtils.clamp(phase,0,1),cycle);return stage.pose;},
    getCollisionVolumes(id){const configured=configuredStage(id);if(configured)return[...configured.staticVolumes,...configured.dynamicVolumes];if(!definitions.has(id))return original.getCollisionVolumes(id);const stage=build(id);return[...stage.staticVolumes,...stage.dynamicVolumes];},
    getActualContacts(id){const configured=configuredStage(id);if(configured)return{hands:copyFeet(configured.gearContacts?.length?configured.gearContacts:configured.pose.hands),feet:copyFeet(configured.pose.feet)};if(!definitions.has(id))return original.getActualContacts(id);const stage=build(id),pose=stage.pose;return{hands:(CABLE_IDS_V011.includes(id)?stage.gearContacts:pose.hands)?.map(p=>[...p])||[],feet:pose.feet?.map(p=>[...p])||[]};},
    getAttachments(){const result=new Map((original.getAttachments?.()||[]).map(attachment=>[attachment.id,attachment]));for(const exercise of additionalExercises)if(!result.has(exercise.attachmentId))result.set(exercise.attachmentId,{id:exercise.attachmentId,name:exercise.setupLabel,stationId:exercise.stationId});return [...result.values()];},
    getMetrics:()=>original.getMetrics?.()||metrics,
  };
  const lifecycle=createRigLifecycle({...options,metrics,getStage:currentStage,rig:baseApi,definitions:[...baseExercises,...additionalExercises]}),dbContacts=new Map();
  return{...baseApi,
    begin(id){lifecycle.prepare(id);return baseApi.getSetup(id);},
    getLifecycle:lifecycle.getLifecycle,
    prepare:lifecycle.prepare,
    sampleLifecycle:lifecycle.sampleLifecycle,
    getNavigationVolumes:lifecycle.getNavigationVolumes,
    getLifecycleState:lifecycle.getLifecycleState,
    getVisualRoot:id=>currentStage(id).group,
    getInventoryRoots:()=>[...new Set([...(original.getInventoryRoots?.()||[]),...[...stages.values()].map(stage=>stage.group),...[...configuredBenches.values()].map(stage=>stage.group),configuredPushdown?.group].filter(Boolean))],
    getEquipmentOptions:equipmentOptionsFor,
    getEquipmentSettings:id=>settingsFor(id),
    getEquipmentCalibrationState(id){return currentStage(id).getCalibrationState?.()||null;},
    setEquipmentSettings(id,next={}){
      const previous=settingsFor(id),rules=equipmentAdjustmentsFor(id),special=id==='dumbbell-bench-press'?'benchAngle':id==='rope-pushdown'?'handle':null;
      if(!next||typeof next!=='object'||Array.isArray(next)||!Object.keys(next).length)return{ok:false,reason:'unsupported-setting',settings:previous};
      const numeric=Object.fromEntries(Object.entries(next).filter(([name])=>name!==special)),validNumeric=!Object.keys(numeric).length||validateCalibrationPatch(rules,previous,numeric);
      const validSpecial=!special||!Object.hasOwn(next,special)||(special==='benchAngle'?BENCH_ANGLES.includes(next.benchAngle):['triceps-rope','straight-bar'].includes(next.handle));
      if(!validNumeric||!validSpecial)return{ok:false,reason:'unsupported-setting',settings:previous};
      const merged={...previous,...next};if(Object.keys(merged).every(key=>merged[key]===previous[key]))return{ok:true,changed:false,settings:previous};
      if(lifecycle.hasPreparedActivity())return{ok:false,reason:'busy',settings:previous};
      lifecycle.hideStation(id==='dumbbell-bench-press'?'dumbbell-curl':'cable-fly');if(Object.keys(numeric).some(key=>next[key]!==previous[key]))lifecycle.invalidateConfiguration(id);selectedSettings.set(id,merged);dbContacts.delete(id);if(rules.length){const stage=currentStage(id);stage.pose=stage.sample(0,0);stage.entryReadyPose=structuredClone(stage.pose);}return{ok:true,changed:true,settings:settingsFor(id)};
    },
    getCapturedTransitionCoverage:lifecycle.getCapturedTransitionCoverage,
    hideStation:lifecycle.hideStation,
    sample(id,phase=0,cycle=phase){lifecycle.markExercise(id);const raw=baseApi.sample(id,phase,cycle),stage=currentStage(id);if(stage.adaptHandPose)return stage.adaptHandPose(raw);if(!DUMBBELL_IDS.includes(id))return raw;const result=adaptDumbbellGrip({id,metrics,raw});currentStage(id).setWeights(result.gearPose);dbContacts.set(id,{hands:result.contactTargets,feet:copyFeet(raw.feet)});return result.pose;},
    getActualContacts(id){return lifecycle.getActualContacts(id)||dbContacts.get(id)||baseApi.getActualContacts(id);},
    end:options=>lifecycle.end(options),
  };
}
const copyFeet=feet=>feet.map(p=>[...p]);
