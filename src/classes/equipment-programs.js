import * as THREE from 'three';
import {createEquipmentSystem} from '../equipment.js';
import {createMachineLifecycle} from '../machine-lifecycle.js';
import {buildLocomotionPose} from '../locomotion.js';
import {solveHandContactFrame} from '../hand-contact-frame.js';
import {createAerialSuspensionProgram} from './aerial-suspension-v013.js';

const C=p=>structuredClone(p),V=p=>new THREE.Vector3(...p),A=v=>v.toArray(),UP=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0),Z=new THREE.Vector3(0,0,1);
const add=(a,b)=>a.map((v,i)=>v+b[i]),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const direction=(a,b,t)=>{const v=V(a).normalize(),q=new THREE.Quaternion().setFromUnitVectors(v,V(b).normalize());return A(v.applyQuaternion(new THREE.Quaternion().slerp(q,t)));};
const handQuaternion=(advance,axis)=>{const z=V(advance).normalize(),x=V(axis).addScaledVector(z,-V(axis).dot(z)).normalize(),y=new THREE.Vector3().crossVectors(z,x).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};
const COURSE_MOTIONS={cycle:['cycle-easy','cycle-steady','cycle-cadence','cycle-recovery'],trx:['trx-low-row','trx-shallow-squat','trx-alternating-row','trx-row-hold','trx-squat-hold','trx-recovery'],aerial:['aerial-standing-reach','aerial-assisted-hinge','aerial-hinge-hold','aerial-side-left','aerial-side-right','aerial-recovery']};

/** Real per-participant props and fixed-bone demonstrations. The aerial
 * program owns its load-bearing fabric and supported flight transitions. */
export function createEquipmentProgram({kind,metrics,group,materials={},geometries=new Set(),extraMaterials=new Set()}){
  if(kind==='aerial')return createAerialSuspensionProgram({metrics,group,materials,geometries,extraMaterials});
  const fingerNames=['thumb','index','middle','ring','pinky'],heldGrip={normal:.018,advance:-.024,strength:.15},openGrip={normal:.024,advance:-.030,strength:.05};
  const trxFingerProfile={thumb:[.55,.15,.25],index:[.35,1.15,.25],middle:[.95,.40,.25],ring:[.75,.40,.65],pinky:[.55,.15,.45]},trxHeldGrip={normal:.028,advance:-.015,strength:1,profile:trxFingerProfile,opposition:.30},trxOpenGrip={...openGrip,profile:{thumb:[.55,.15,.25],index:[.12,.12,.12],middle:[.12,.12,.12],ring:[.12,.12,.12],pinky:[.12,.12,.12]},opposition:.30};
  const flexAt=(pose,i,name,digit)=>{const explicit=pose.handFingerFlex?.[i]?.[name]?.[digit];if(Number.isFinite(explicit))return explicit;const rest=pose.relaxedHands?(name==='thumb'?[.20,.20,.13][digit]:[.30,.46,.23][digit]+(['ring','pinky'].includes(name)?.055:0)):(name==='thumb'?.13:.12),closed=name==='thumb'?.48:[.68,1.12,.75][digit],g=pose.handGripStrength?.[i]??((pose.handGripping?.[i]??pose.gripping??true)?1:0);return rest+(closed-rest)*clamp(g);};
  const gripFlex=(strength,name,digit)=>{if(name==='thumb')return[.55,.15,.25][digit];return .12+([.68,1.12,.75][digit]-.12)*strength;};
  const gripOffset=(frame,i,spec)=>V(frame.advance).cross(V(frame.axis)).normalize().multiplyScalar((i?1:-1)*-spec.normal).addScaledVector(V(frame.advance),spec.advance);
  function gripPose(raw,preferred,spec=heldGrip){
    const pose=C(raw);delete pose.handNormals;delete pose.handAdvances;pose.handDirections=C(preferred);
    const frames=[0,1].map(i=>solveHandContactFrame(metrics,pose,i));
    pose.hands=frames.map((f,i)=>A(V(raw.hands[i]).add(gripOffset(f,i,spec))));pose.handDirections=frames.map(f=>f.axis);pose.handAdvances=frames.map(f=>f.advance);pose.relaxedHands=false;pose.handFingerFlex=[0,1].map(()=>spec.profile?C(spec.profile):Object.fromEntries(fingerNames.map(name=>[name,[0,1,2].map(d=>gripFlex(spec.strength,name,d))])));if(spec.opposition!==undefined)pose.handThumbOpposition=[-spec.opposition,spec.opposition];return pose;
  }
  const mat={...materials};
  function hardGripCylinders(){group.updateWorldMatrix(true,true);const inverse=group.matrixWorld.clone().invert(),out=[];group.traverse(o=>{const p=o.geometry?.parameters;if(o.geometry?.type!=='CylinderGeometry'||Math.abs((p?.radiusTop||0)-.016)>1e-8)return;const matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),a=V([0,-p.height/2,0]).applyMatrix4(matrix),b=V([0,p.height/2,0]).applyMatrix4(matrix);out.push({center:A(a.clone().add(b).multiplyScalar(.5)),axis:A(b.clone().sub(a).normalize()),advance:A(Z.clone().transformDirection(matrix)),halfLength:a.distanceTo(b)/2,radius:p.radiusTop});});return out.sort((a,b)=>a.center[0]-b.center[0]);}
  for(const [name,color]of Object.entries({graphite:'#293a35',steel:'#899991',chrome:'#c1cdc6',black:'#1e2a26',accent:'#bfdf80'}))if(!mat[name]){mat[name]=new THREE.MeshStandardMaterial({color,roughness:.65});extraMaterials.add(mat[name]);}
  if(kind==='cycle'){
    const holder=new THREE.Group();group.add(holder);
    const {machines}=createEquipmentSystem({THREE,scene:holder,stations:[{id:'class-cycle',name:'團課飛輪',number:'',type:'bike',position:{x:0,z:0},rotation:0,category:'cardio'}],materials:mat,geometries,extraMaterials,textures:new Set(),collider(){},characterMetrics:metrics,bikeGripPreset:{gripRadius:.016,capRadius:.018,handlebarRadius:.015}});
    const machine=machines.get('class-cycle'),lifecycle=createMachineLifecycle({THREE,machine,metrics});
    const gripGroups=[];machine.group.traverse(o=>{if(o.userData.handGripIndices?.length===1)gripGroups[o.userData.handGripIndices[0]]=o;});
    const baseCycle=machine.sampleActivity(0,0),cyclePose=C(baseCycle);delete cyclePose.handNormals;delete cyclePose.handAdvances;cyclePose.handDirections=[[1,0,0],[-1,0,0]];
    const cycleFrames=[0,1].map(i=>{const f=solveHandContactFrame(metrics,cyclePose,i),advance=V(f.advance);advance.x=0;return{axis:i?[-1,0,0]:[1,0,0],advance:A(advance.normalize())};}),freeCycleFrame=lifecycle.sample('exit',1.5/6.7),freeCycleHands=freeCycleFrame.pose.hands.map(p=>V(p).applyAxisAngle(UP,freeCycleFrame.rotation||0).add(V(freeCycleFrame.offset)));let cycleSpecs=[heldGrip,heldGrip];
    const cycleFlex=(closing,name,digit)=>name==='thumb'?[.55,.15,.25][digit]:.12+(gripFlex(heldGrip.strength,name,digit)-.12)*closing;
    function placeCycleGrips(){for(let i=0;i<2;i++)gripGroups[i].quaternion.copy(handQuaternion(cycleFrames[i].advance,cycleFrames[i].axis));machine.group.updateMatrixWorld(true);}
    function cycleContacts(){placeCycleGrips();const inverse=group.matrixWorld.clone().invert();return{hands:gripGroups.map((o,i)=>{const matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),center=new THREE.Vector3().setFromMatrixPosition(matrix),axis=X.clone().transformDirection(matrix),advance=Z.clone().transformDirection(matrix);return A(center.add(gripOffset({axis:A(axis),advance:A(advance)},i,cycleSpecs[i])));}),feet:C(machine.getActualContacts()?.feet||[])};}
    function fitCycleHands(raw,frame=null,u=0,direction='exit'){
      const pose=C(raw),inverse=new THREE.Quaternion().setFromAxisAngle(UP,-(frame?.rotation||0)),offset=V(frame?.offset||[0,0,0]),x=direction==='exit'?clamp(u):1-clamp(u),closing=frame?1-ease(x/(.2/6.7)):1;
      pose.handDirections=[];pose.handAdvances=[];pose.handFingerFlex=[];
      for(let i=0;i<2;i++){
        const center=V(baseCycle.hands[i]).sub(offset).applyQuaternion(inverse),d=V(raw.hands[i]).distanceTo(center),weight=frame?1-ease((d-.020)/.20):1,spec={normal:openGrip.normal+(heldGrip.normal-openGrip.normal)*closing,advance:openGrip.advance+(heldGrip.advance-openGrip.advance)*closing,strength:openGrip.strength+(heldGrip.strength-openGrip.strength)*closing},desired={axis:A(V(cycleFrames[i].axis).applyQuaternion(inverse)),advance:A(V(cycleFrames[i].advance).applyQuaternion(inverse))},old=solveHandContactFrame(metrics,raw,i),q=handQuaternion(old.advance,old.axis).slerp(handQuaternion(desired.advance,desired.axis),weight);
        pose.hands[i]=A(V(raw.hands[i]).addScaledVector(gripOffset(desired,i,spec),weight));pose.handDirections.push(A(X.clone().applyQuaternion(q)));pose.handAdvances.push(A(Z.clone().applyQuaternion(q)));pose.handFingerFlex.push(Object.fromEntries(fingerNames.map(name=>[name,[0,1,2].map(j=>flexAt(raw,i,name,j)*(1-weight)+cycleFlex(closing,name,j)*weight)])));cycleSpecs[i]=spec;
        if(frame&&x>.2/6.7&&x<1.5/6.7){
          // Open, lift off the bar, draw the hands back, then lower them beside
          // the torso. Pulling the old centre marker straight through a tube
          // would drag the thumb through steel even with an open finger pose.
          const s=(x-.2/6.7)/(1.3/6.7),worldFrame=cycleFrames[i],start=V(baseCycle.hands[i]).add(gripOffset(worldFrame,i,openGrip)),normal=V(worldFrame.advance).cross(V(worldFrame.axis)).normalize().multiplyScalar(i?1:-1),lift=start.clone().addScaledVector(normal,-.070),back=lift.clone().addScaledVector(V(worldFrame.advance),-.12),point=s<.25?start.clone().lerp(lift,ease(s/.25)):s<.55?lift.clone().lerp(back,ease((s-.25)/.30)):back.clone().lerp(freeCycleHands[i],ease((s-.55)/.45)),fade=ease((s-.55)/.45),handQ=handQuaternion(desired.advance,desired.axis).slerp(handQuaternion(old.advance,old.axis),fade);
          pose.hands[i]=A(point.sub(offset).applyQuaternion(inverse));pose.handDirections[i]=A(X.clone().applyQuaternion(handQ));pose.handAdvances[i]=A(Z.clone().applyQuaternion(handQ));pose.handFingerFlex[i]=Object.fromEntries(fingerNames.map(name=>[name,[0,1,2].map(j=>cycleFlex(0,name,j)*(1-fade)+flexAt(raw,i,name,j)*fade)]));
        }
      }
      delete pose.handNormals;placeCycleGrips();return pose;
    }
    function cycleLifecycle(direction,u){
      const frame=lifecycle.sample(direction==='exit'?'exit':'enter',u);
      // In this course's step-over, the airborne right shoe must also clear
      // the opposite pedal. A spatial smooth arc works in both directions
      // and leaves every actual pedal-supported frame at its calibrated height.
      if(!frame.contacts.feet[1]){const foot=V(frame.pose.feet[1]).applyAxisAngle(UP,frame.rotation||0).add(V(frame.offset)),lift=.060*ease((-foot.x-.01)/.09)*ease((foot.x+.56)/.12);frame.pose.feet[1][1]+=lift;}
      frame.pose=fitCycleHands(frame.pose,frame,u,direction);
      const x=direction==='exit'?clamp(u):1-clamp(u);if(x>.2/6.7)frame.contacts.hands=[false,false];
      return frame;
    }
    const segments=[{label:'坐姿順踩',description:'坐穩坐墊，手輕扶握把，讓踏板轉動保持順暢。'},{label:'穩定節奏騎乘',description:'跟著節奏踩踏，骨盆留在坐墊上，肩膀保持放鬆。'},{label:'放慢踏頻',description:'慢慢降低踏頻，持續控制踏板，停穩後才下車。'}];
    return{
      getMetadata:()=>({gateOffset:[...lifecycle.gateOffset],gateRotation:lifecycle.gateRotation,exitGateRotation:lifecycle.gateRotation,entryDuration:lifecycle.entryDuration,exitDuration:lifecycle.exitDuration,restPhase:0,persistentProps:true}),
      sample(phase=0,cycle=phase){const p=clamp(phase),turns=p<.25?p*10:p<.75?2.5+(p-.25)*18:11.5+(p-.75)*10;return fitCycleHands(machine.sampleActivity(p,Math.floor(cycle)*14+turns));},
      sampleCourse(frame){if(!COURSE_MOTIONS.cycle.includes(frame.motionId))throw new Error(`Unknown cycling course motion ${frame.motionId}`);return fitCycleHands(machine.sampleActivity(clamp(frame.phase||0),(frame.cycleTurns||0)%1));},
      getCourseMotionIds:()=>[...COURSE_MOTIONS.cycle],
      sampleLifecycle:cycleLifecycle,
      getCollisionVolumes:()=>{placeCycleGrips();return[...machine.getCollisionVolumes(),...hardGripCylinders().flatMap((g,i)=>{const center=V(g.center),axis=V(g.axis),allowedBodyParts=[i?'rightHand':'leftHand'];return[{id:`class-cycle-hard-grip-${i}`,shape:'capsule',start:A(center.clone().addScaledVector(axis,-g.halfLength)),end:A(center.clone().addScaledVector(axis,g.halfLength)),radius:g.radius,allowedBodyParts},...[-1,1].map(sign=>{const p=A(center.clone().addScaledVector(axis,sign*.11));return{id:`class-cycle-hard-cap-${i}-${sign}`,shape:'capsule',start:p,end:p,radius:.018,allowedBodyParts};})];}),{id:'class-cycle-handlebar',shape:'capsule',start:[-.4,1.23,.535],end:[.4,1.23,.535],radius:.015,allowedBodyParts:['leftHand','rightHand']}];},getActualContacts:cycleContacts,
      getActualGripAxes:()=>{placeCycleGrips();return machine.getActualGripAxes();},getPropState:()=>({ownership:'bike',hands:C(machine.getActualContacts()?.hands||[])}),
      getHardGripCylinders:hardGripCylinders,
      getSegment:phase=>segments[phase<.25?0:phase<.75?1:2],
    };
  }
  if(!['trx','aerial'].includes(kind))throw new Error(`Unknown equipment course ${kind}`);
  const aerial=kind==='aerial',neutral=buildLocomotionPose(metrics,0,0),n=metrics.neutral,torso=V(n.shoulder).sub(V(n.hip)),restAxis=torso.clone().normalize(),headSpan=n.head[1]-n.shoulder[1];
  const localGeometries=new Map(),fixedVolumes=[],dynamicVolumes=[];
  const own=material=>(extraMaterials.add(material),material),fabric=own(new THREE.MeshStandardMaterial({color:aerial?'#9a72a3':'#c9db67',side:THREE.DoubleSide,roughness:.93})),rubber=mat.black,metal=mat.chrome;
  const geometry=(key,make)=>{if(!localGeometries.has(key)){const g=make();geometries.add(g);localGeometries.set(key,g);}return localGeometries.get(key);};
  const mesh=(parent,g,m)=>{const o=new THREE.Mesh(g,m);o.castShadow=o.receiveShadow=true;parent.add(o);return o;};
  function setRod(o,a,b){const from=V(a),d=V(b).sub(from);o.position.copy(from).addScaledVector(d,.5);o.scale.y=Math.max(.00001,d.length());o.quaternion.setFromUnitVectors(UP,d.normalize());}
  function rod(a,b,r=.02,m=metal){const o=mesh(group,geometry(`rod:${r}`,()=>new THREE.CylinderGeometry(r,r,1,12)),m);setRod(o,a,b);return o;}
  function fixedRod(id,a,b,r=.02,m=metal,allowedBodyParts=[]){const o=rod(a,b,r,m);fixedVolumes.push({id,shape:'capsule',start:a,end:b,radius:r,allowedBodyParts});return o;}
  const anchors=[[-.25,2.65,1.35],[.25,2.65,1.35]],park=aerial?[[-.34,1.13,.43],[.34,1.13,.43]]:[[-.34,1.17,.52],[.34,1.17,.52]];
  fixedRod(`${kind}-ceiling-rail`,[-.70,2.65,1.35],[.70,2.65,1.35],.035,mat.graphite);
  for(const [i,p]of anchors.entries())fixedRod(`${kind}-ceiling-hanger-${i}`,[p[0],2.65,1.35],[p[0],3.55,1.35],.022,metal);
  const straps=anchors.map((p,i)=>rod(p,park[i],aerial?.018:.015,fabric));
  const gripBars=park.map(p=>rod(add(p,[-.09,0,0]),add(p,[.09,0,0]),aerial?.018:.016,aerial?fabric:rubber));
  const branches=park.map(()=>[rod([0,0,0],[0,1,0],.012,fabric),rod([0,0,0],[0,1,0],.012,fabric)]);
  let cloth=null;const fabricPanels=[];
  if(aerial){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(9*6*3),3));geometries.add(g);cloth=mesh(group,g,fabric);for(let i=0;i<2;i++){const panel=new THREE.BufferGeometry();panel.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3));geometries.add(panel);fabricPanels.push(mesh(group,panel,fabric));}}
  else{
    for(const sign of [-1,1]){
      fixedRod(`trx-park-post-${sign}`,[sign*.62,.02,.73],[sign*.62,1.31,.73],.02,mat.graphite);
      fixedRod(`trx-park-hook-${sign}`,[sign*.62,1.31,.73],[sign*.34,1.30,.60],.012,metal);
    }
  }
  function upright(hip,lean=0){const q=new THREE.Quaternion().setFromAxisAngle(X,lean),shoulder=torso.clone().applyQuaternion(q).add(V(hip));return{hip,shoulder:A(shoulder),head:A(torso.clone().add(new THREE.Vector3(0,headSpan,.015)).applyQuaternion(q).add(V(hip))),feet:[[-.18,.013,.15],[.18,.013,.15]],kneeHints:[[0,0,1],[0,0,1]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],hands:[],handDirections:[[1,0,0],[1,0,0]],elbowHints:[[-1,-.3,-.5],[1,-.3,-.5]],gripping:true,handGripping:[true,true],handGripStrength:[1,1]};}
  function loopPose(phase){const p=clamp(phase),part=p<.25?0:p<.75?1:2,u=part===0?p/.25:part===1?(p-.25)/.5:(p-.75)/.25,e=Math.sin(u*Math.PI*(part===1?4:2))**2;
    if(aerial){const hinge=part===1?e:0,pose=upright([0,n.hip[1]-.025-.04*hinge,-.10*hinge],.35*hinge);pose.hands=[[-.34,1.13-.08*hinge+(part!==1?.035*e:0),.43+.04*hinge],[.34,1.13-.08*hinge+(part!==1?.035*e:0),.43+.04*hinge]];pose.elbowHints=[[-1,-.1,.5],[1,-.1,.5]];return pose;}
    const squat=part===1,row=squat?0:(part===2?.55:1)*e,pose=upright([0,n.hip[1]-.025+(squat?-.16*e:.02*row),-.08+(squat?-.10*e:.10*row)],.10+(squat?.20*e:-.16*row));
    const y=1.17+(squat?-.05*e:.09*row);pose.hands=anchors.map((anchor,i)=>{const x=i?.34:-.34,z=anchor[2]-Math.sqrt(1.82**2-(anchor[1]-y)**2-(anchor[0]-x)**2);return[x,y,z];});return pose;
  }
  // The full course supplies a real repetition clock and a smooth envelope.
  // Every block releases its effort into the same held, two-feet-down ready
  // pose, so an exercise change never resets a limb or a suspended prop.
  function coursePose(frame){
    const id=frame.motionId;if(!COURSE_MOTIONS[kind].includes(id))throw new Error(`Unknown ${kind} course motion ${id}`);
    const phase=clamp(frame.repPhase||0),wave=.5-.5*Math.cos(phase*Math.PI*2),weight=clamp(frame.envelope??1)*clamp(frame.intensity??1);
    if(aerial){
      const hinge=(id==='aerial-assisted-hinge'?wave:id==='aerial-hinge-hold'?.65:0)*weight,reach=id==='aerial-standing-reach'?wave*weight:0,side=(id==='aerial-side-left'?-1:id==='aerial-side-right'?1:0)*weight;
      const pose=upright([.025*side,n.hip[1]-.025-.04*hinge,-.10*hinge],.35*hinge);
      pose.hands=[[-.34,1.13-.08*hinge+.035*reach+.020*Math.max(0,-side),.43+.04*hinge],[.34,1.13-.08*hinge+.035*reach+.020*Math.max(0,side),.43+.04*hinge]];
      pose.elbowHints=[[-1,-.1,.5],[1,-.1,.5]];return pose;
    }
    const squat=(id==='trx-shallow-squat'?wave:id==='trx-squat-hold'?.60:0)*weight,row=(id==='trx-low-row'?wave:id==='trx-row-hold'?.65:id==='trx-alternating-row'?.5:0)*weight;
    const pose=upright([0,n.hip[1]-.025-.16*squat+.02*row,-.08-.10*squat+.10*row],.10+.20*squat-.16*row);
    pose.hands=anchors.map((anchor,i)=>{const alternate=id==='trx-alternating-row'?(i?1-wave:wave)*weight:row,x=i?.34:-.34,y=1.17-.05*squat+.09*alternate,z=anchor[2]-Math.sqrt(1.82**2-(anchor[1]-y)**2-(anchor[0]-x)**2);return[x,y,z];});return pose;
  }
  const qBody=p=>new THREE.Quaternion().setFromUnitVectors(restAxis,V(p.shoulder).sub(V(p.hip)).normalize()),root=(p,i)=>torso.clone().add(V(metrics.arms[i].shoulderOffset)).applyQuaternion(qBody(p)).add(V(p.hip));
  function blend(a,b,t){const qa=qBody(a),qb=qBody(b),q=qa.clone().slerp(qb,t),hip=V(mix(a.hip,b.hip,t)),p={...C(b),hip:A(hip),shoulder:A(torso.clone().applyQuaternion(q).add(hip)),head:mix(a.head,b.head,t),hands:[],elbows:[],handDirections:[],handAdvances:[],feet:a.feet.map((f,i)=>mix(f,b.feet[i],t)),handGripStrength:[],handGripping:[]};
    for(let i=0;i<2;i++){const arm=metrics.arms[i],fa=solveHandContactFrame(metrics,a,i),fb=solveHandContactFrame(metrics,b,i),ri=root(p,i),ua=A(V(fa.elbow).sub(root(a,i)).applyQuaternion(qa.clone().invert())),ub=A(V(fb.elbow).sub(root(b,i)).applyQuaternion(qb.clone().invert())),elbow=V(direction(ua,ub,t)).multiplyScalar(arm.upper).applyQuaternion(q).add(ri),la=A(V(fa.wrist).sub(V(fa.elbow)).applyQuaternion(qa.clone().invert())),lb=A(V(fb.wrist).sub(V(fb.elbow)).applyQuaternion(qb.clone().invert())),wrist=V(direction(la,lb,t)).multiplyScalar(arm.lower).applyQuaternion(q).add(elbow),ha=qa.clone().invert().multiply(handQuaternion(fa.advance,fa.axis)),hb=qb.clone().invert().multiply(handQuaternion(fb.advance,fb.axis)),hf=q.clone().multiply(ha.slerp(hb,t)),handQ=hf.clone().multiply(new THREE.Quaternion(...arm.handFrameLocal).invert());p.elbows.push(A(elbow));p.hands.push(A(V(arm.palmOffset).applyQuaternion(handQ).add(wrist)));p.handDirections.push(A(X.clone().applyQuaternion(hf)));p.handAdvances.push(A(Z.clone().applyQuaternion(hf)));const ga=a.handGripStrength?.[i]??(a.gripping?1:0),gb=b.handGripStrength?.[i]??(b.gripping?1:0),g=ga+(gb-ga)*t;p.handGripStrength.push(g);p.handGripping.push(g>.5);}
    p.gripping=p.handGripping.some(Boolean);if(a.handFingerFlex||b.handFingerFlex)p.handFingerFlex=[0,1].map(i=>Object.fromEntries(fingerNames.map(name=>[name,[0,1,2].map(j=>{const amount=name==='thumb'?!a.handFingerFlex?ease(t/.30):!b.handFingerFlex?ease((t-.70)/.30):t:t;return flexAt(a,i,name,j)+(flexAt(b,i,name,j)-flexAt(a,i,name,j))*amount;})])));if(a.handThumbOpposition||b.handThumbOpposition)p.handThumbOpposition=[0,1].map(i=>{const amount=!a.handThumbOpposition?ease(t/.30):!b.handThumbOpposition?ease((t-.70)/.30):t,from=a.handThumbOpposition?.[i]||0,to=b.handThumbOpposition?.[i]||0;return from+(to-from)*amount;});return p;
  }
  const rawTouch={...C(neutral),hands:C(park),handDirections:[[1,0,0],[1,0,0]],elbowHints:[[-1,-.2,.5],[1,-.2,.5]],gripping:false,handGripping:[false,false],handGripStrength:[0,0]};delete rawTouch.handNormals;
  const ready=aerial?loopPose(0):gripPose(loopPose(0),[[0,1,0],[0,1,0]],trxHeldGrip),touch=aerial?rawTouch:gripPose(rawTouch,[[0,1,0],[0,1,0]],trxOpenGrip),rawHeld={...C(rawTouch),gripping:true,handGripping:[true,true],handGripStrength:[1,1]};
  const held=aerial?rawHeld:gripPose(rawHeld,[[0,1,0],[0,1,0]],trxHeldGrip),lifted=C(held);if(!aerial)lifted.hands=lifted.hands.map(p=>add(p,[0,.09,-.04]));
  let lastContacts=null,lastHeld=false;
  const parkedFrames=park.map((_,i)=>solveHandContactFrame(metrics,touch,i));
  function actualGripContacts(){return gripBars.map((o,i)=>aerial?o.position.toArray():A(o.position.clone().add(gripOffset({axis:A(UP.clone().applyQuaternion(o.quaternion)),advance:A(Z.clone().applyQuaternion(o.quaternion))},i,trxHeldGrip))));}
  function applyGear(pose,isHeld=true){dynamicVolumes.length=0;const frames=isHeld?pose.hands.map((_,i)=>solveHandContactFrame(metrics,pose,i)):parkedFrames,targets=isHeld?(aerial?pose.hands:pose.hands.map((p,i)=>A(V(p).sub(gripOffset(frames[i],i,trxHeldGrip))))):park;
    for(let i=0;i<2;i++){const point=targets[i],axis=frames[i].axis,ends=[add(point,A(V(axis).multiplyScalar(-.09))),add(point,A(V(axis).multiplyScalar(.09)))],connector=add(point,A(V(anchors[i]).sub(V(point)).normalize().multiplyScalar(.14)));
      setRod(gripBars[i],...ends);if(!aerial)gripBars[i].quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(frames[i].axis).cross(V(frames[i].advance)).normalize(),V(frames[i].axis),V(frames[i].advance)));setRod(straps[i],anchors[i],connector);branches[i].forEach((o,j)=>setRod(o,ends[j],connector));
      dynamicVolumes.push({id:`${kind}-grip-${i}`,shape:'capsule',start:ends[0],end:ends[1],radius:aerial?.018:.016,allowedBodyParts:[i?'rightHand':'leftHand']},{id:`${kind}-strap-${i}`,shape:'capsule',start:connector,end:anchors[i],radius:aerial?.018:.015,allowedBodyParts:[i?'rightHand':'leftHand']});
      if(aerial){const bottom=V(point).add(new THREE.Vector3(0,0,.04)),top=V(anchors[i]),y=top.clone().sub(bottom).normalize(),x=X.clone().addScaledVector(y,-y.x).normalize(),z=new THREE.Vector3().crossVectors(x,y).normalize(),corners=[bottom.clone().addScaledVector(x,-.15),bottom.clone().addScaledVector(x,.15),top.clone().addScaledVector(x,-.07),top.clone().addScaledVector(x,.07)],array=fabricPanels[i].geometry.attributes.position.array;let at=0;for(const index of [0,1,2,1,3,2])for(const value of corners[index].toArray())array[at++]=value;fabricPanels[i].geometry.attributes.position.needsUpdate=true;fabricPanels[i].geometry.computeVertexNormals();fabricPanels[i].geometry.computeBoundingSphere();const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));dynamicVolumes.push({id:`aerial-fabric-panel-${i}`,shape:'box',position:bottom.clone().add(top).multiplyScalar(.5).toArray(),rotation:new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3),size:[.30,top.distanceTo(bottom),.018],allowedBodyParts:[i?'rightHand':'leftHand']});}
    }
    if(cloth){const positions=cloth.geometry.attributes.position.array;let index=0;for(let s=0;s<9;s++){const u=s/9,v=(s+1)/9,point=t=>mix(targets[0],targets[1],t).map((a,j)=>a+(j===1?-.25*Math.sin(Math.PI*t):j===2?.13*Math.sin(Math.PI*t):0));const a=point(u),b=point(v),aa=add(a,[0,0,.13]),bb=add(b,[0,0,.13]);for(const p of [a,b,aa,b,bb,aa])for(const value of p)positions[index++]=value;}cloth.geometry.attributes.position.needsUpdate=true;cloth.geometry.computeVertexNormals();cloth.geometry.computeBoundingSphere();
      for(let s=0;s<9;s++){const point=t=>mix(targets[0],targets[1],t).map((a,j)=>a+(j===1?-.25*Math.sin(Math.PI*t):j===2?.13*Math.sin(Math.PI*t):0));dynamicVolumes.push({id:`aerial-fabric-edge-${s}`,shape:'capsule',start:point(s/9),end:point((s+1)/9),radius:.014,allowedBodyParts:['leftHand','rightHand']});}}
    lastHeld=isHeld;lastContacts={hands:actualGripContacts(),feet:C(pose.feet)};
  }
  const gate=[0,0,-1.55],nodes=[{pose:C(neutral),offset:gate,d:0,label:'站在吊帶外',held:false},{pose:C(neutral),offset:[0,0,0],d:2.3,label:'走到吊帶前',walk:true,held:false},{pose:touch,offset:[0,0,0],d:1.0,label:aerial?'雙手靠近吊布':'掌心對準吊帶握把',held:false},{pose:held,offset:[0,0,0],d:.45,label:aerial?'握穩吊布':'握穩吊帶',held:true},{pose:lifted,offset:[0,0,0],d:.65,label:aerial?'站穩並輕拉布面':'把握把抬離掛鉤',held:true},{pose:ready,offset:[0,0,0],d:.9,label:'調整腳步與身體角度',held:true}];let duration=0;for(const node of nodes){duration+=node.d;node.time=duration;}
  function walking(from,to,u,exiting){const t=ease(u),offset=mix(from,to,t),pose=C(neutral),distance=V(to).sub(V(from)).length(),steps=Math.max(2,Math.ceil(distance/.18/2)*2),step=Math.min(steps-1,Math.floor(t*steps)),within=t===1?1:t*steps-step;
    pose.hip[1]-=.04*Math.sin(t*Math.PI);pose.shoulder[1]-=.04*Math.sin(t*Math.PI);pose.head[1]-=.04*Math.sin(t*Math.PI);
    for(let i=0;i<2;i++){const completed=i===0?Math.floor((step+1)/2):Math.floor(step/2),moving=step%2===i,p=(completed+(moving?ease(within):0))/(steps/2);pose.feet[i]=add(mix(from,to,Math.min(1,p)),n.feet[i]).map((v,j)=>v-offset[j]);if(moving)pose.feet[i][1]+=.11*Math.sin(within*Math.PI);}
    applyGear({...pose,hands:pose.hands.map(p=>add(p,offset)),feet:pose.feet.map(p=>add(p,offset))},false);return{pose,offset,rotation:0,stage:exiting?'走回吊帶外':'走到吊帶前',contacts:{hands:[false,false],feet:[0,1].map(i=>step%2!==i)}};
  }
  function sampleLifecycle(direction,u){const exiting=direction==='exit',t=(exiting?1-clamp(u):clamp(u))*duration;let index=1;while(index<nodes.length-1&&nodes[index].time<t)index++;const a=nodes[index-1],b=nodes[index],raw=clamp((t-a.time)/b.d);
    if(b.walk)return walking(a.offset,b.offset,raw,exiting);
    const pose=t<=0?C(neutral):t>=duration?C(ready):blend(a.pose,b.pose,ease(raw)),isHeld=t>=nodes[3].time;
    // A small tangential approach arc keeps the wrist-side skin clear of the
    // parked grip's end while the forearm turns into its neutral grasp.
    if(!aerial&&index===2)pose.hands=pose.hands.map((p,i)=>A(V(p).addScaledVector(V(parkedFrames[i].advance),.002*Math.sin(raw*Math.PI)**2)));
    applyGear(pose,isHeld);const stages={'調整腳步與身體角度':'回到站直位置','把握把抬離掛鉤':'把握把放回掛鉤','握穩吊帶':'鬆開吊帶','握穩吊布':'放開吊布','站穩並輕拉布面':'讓布面慢慢放鬆','掌心對準吊帶握把':'抬手離開握把','雙手靠近吊布':'雙手離開吊布'};
    return{pose,offset:[0,0,0],rotation:0,stage:exiting?stages[b.label]||'離開吊帶':b.label,contacts:{hands:isHeld?[true,true]:[false,false],feet:[true,true]}};
  }
  const segments=aerial?[{label:'握穩布面與站姿伸展',description:'雙腳踩地，雙手抓穩吊布，先熟悉支撐感。'},{label:'吊布輔助屈髖',description:'保持雙腳著地，從髖部慢慢前傾，吊布協助穩定身體。'},{label:'回到站姿與胸肩伸展',description:'先回到站直，再輕輕伸展胸肩，放開吊布前確認雙腳站穩。'}]:[{label:'站穩做低划船',description:'面向固定點，雙腳踩穩，輕微後傾後彎肘拉回。'},{label:'懸吊輔助淺蹲',description:'雙手握好，從髖膝慢慢下蹲，手臂只協助平衡。'},{label:'放慢划船回程',description:'縮小幅度，慢慢伸肘回到起點，吊帶保持張力。'}];
  applyGear(touch,false);
  return{
    getMetadata:()=>({gateOffset:[...gate],gateRotation:0,exitGateRotation:0,entryDuration:duration,exitDuration:duration,restPhase:0,persistentProps:true,stages:nodes.slice(1).map(n=>n.label)}),
    sample(phase=0){const raw=loopPose(phase),pose=aerial?raw:gripPose(raw,[[0,1,0],[0,1,0]],trxHeldGrip);applyGear(pose,true);return pose;},sampleLifecycle,
    sampleCourse(frame){const raw=coursePose(frame),pose=aerial?raw:gripPose(raw,[[0,1,0],[0,1,0]],trxHeldGrip);applyGear(pose,true);return pose;},getCourseMotionIds:()=>[...COURSE_MOTIONS[kind]],
    getCollisionVolumes:()=>[...fixedVolumes,...dynamicVolumes].map(C),getActualContacts:()=>({...C(lastContacts),hands:actualGripContacts()}),getActualGripAxes:()=>gripBars.map(o=>A(UP.clone().applyQuaternion(o.quaternion))),getPropState:()=>({ownership:lastHeld?'held':'park',hands:gripBars.map(o=>o.position.toArray())}),getSegment:phase=>segments[phase<.25?0:phase<.75?1:2],
    getHardGripCylinders:()=>aerial?[]:hardGripCylinders(),
  };
}
