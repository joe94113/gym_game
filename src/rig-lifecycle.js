import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {buildLocomotionPose} from './locomotion.js';
import {adaptDumbbellGrip,prepareDumbbellRawPose,dumbbellContactOffsets} from './dumbbell-grip.js';
import {buildDumbbellLifecycleNodes} from './dumbbell-lifecycle-paths.js';
import {planCapturedTransition,capturedTransitionProgress} from './captured-transition-v018.js';
import {preparationFootLift} from './preparation-motion-v019.js';

const V=p=>new THREE.Vector3(...p),A=v=>v.toArray(),copy=p=>structuredClone(p);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),add=(a,b)=>a.map((v,i)=>v+b[i]);
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const UP=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0),Z=new THREE.Vector3(0,0,1);
const EXIT_STAGES=Object.freeze({
  '走到軟墊前':'離開軟墊前方',
  '站穩準備抬腳':'回到走道並站穩',
  '先把左腳踏上軟墊':'左腳踏回走道',
  '右腳跟上並站穩':'右腳先踏回走道',
  '左手先退開握把':'左手繞開握把再靠近扣環',
  '走到直桿前':'放手後退離直桿',
  '抬手準備正握':'雙手收回身側',
  '掌心對準直桿':'張手離開直桿',
  '握穩直桿':'把直桿放回掛位後鬆手',
  '提離掛位':'慢慢把直桿放回掛位',
  '退半步並穩住握把':'跨半步靠近掛位',
  '手肘靠近身體':'控制直桿回到準備位置',
  '站穩':'離開器材',
  '沿啞鈴架外側走近':'沿啞鈴架外側離開',
  '走到架前':'離開啞鈴架前方',
  '走近啞鈴架':'放好啞鈴後退開',
  '屈髖伸手':'放手後站直',
  '掌心對準握把':'鬆手並抬離握把',
  '握穩啞鈴':'放開啞鈴',
  '提鈴前調整手腕':'放穩啞鈴再鬆手',
  '抬離啞鈴架':'把啞鈴放回架上',
  '持鈴站起':'屈髖把啞鈴移向架上',
  '先把啞鈴移離架面':'把啞鈴移回架面上方',
  '先在身側轉成自然垂握':'在身側轉好握法準備歸位',
  '放低啞鈴穩定身側':'先拿穩身側啞鈴',
  '持鈴走到訓練位置':'持鈴走回啞鈴架',
  '調整站位':'持鈴移到椅前',
  '持鈴坐上椅墊':'持鈴站起',
  '先提鈴離開大腿外側':'慢慢把啞鈴放回身側',
  '先把啞鈴轉直靠近大腿':'把啞鈴帶離大腿',
  '啞鈴先穩放大腿上':'先把啞鈴收回大腿',
  '收緊身體帶鈴慢慢後躺':'雙腳踩穩帶鈴坐起',
  '背部靠穩再把啞鈴移到胸旁':'收鈴靠近身體準備坐起',
  '先彎肘把啞鈴帶到身前':'把啞鈴慢慢放回身側',
  '把啞鈴穩穩帶到肩旁':'把啞鈴從肩旁帶回身前',
  '靠穩椅墊再抬鈴':'收鈴並坐起',
  '轉正握法並穩住啞鈴':'拿穩啞鈴準備歸位',
  '屈髖並伸出支撐手':'拿穩啞鈴並站直',
  '扶穩椅墊':'抬起支撐手離開椅墊',
  '調整訓練姿勢':'收鈴並準備離開',
  '站在軟墊外':'離開軟墊',
  '走到軟墊上':'走出軟墊',
  '站穩雙腳':'調整雙腳準備離開',
  '把腳放到低凳前':'站穩後移開雙腳',
  '慢慢坐到低凳':'從低凳慢慢站起',
  '扶腿並調整坐姿':'放下抬起的腳',
  '前後站好再降低重心':'收回前後腳並站直',
  '後膝靠近軟墊':'抬起後膝準備站起',
  '放下腳背並扶穩大腿':'抬起後腳準備起身',
  '調整伸展站姿':'結束伸展並站直',
  '走近龍門架':'離開龍門架',
  '走到附件掛鉤前':'離開附件掛鉤前方',
  '抬手靠近扣環':'放下雙手準備離開',
  '從上方伸向掛鉤':'雙手抬離掛鉤',
  '雙手靠近掛鉤':'雙手離開掛鉤',
  '扣緊附件掛鉤':'鬆開附件掛鉤',
  '放開掛鉤':'伸手扶住附件掛鉤',
  '先從握把上方伸手':'雙手移開握把',
  '先從握把前方伸手':'雙手移開握把',
  '調整站位並伸手':'移開雙手並調整站位',
  '握住附件':'把附件放回掛鉤',
  '拿穩腳踝帶並站起':'拿穩腳踝帶並蹲下',
  '帶到訓練位置':'把腳踝帶帶回掛鉤旁',
  '蹲下把腳踝帶靠到腳踝':'拿起腳踝帶並站起',
  '扣好腳踝帶':'解開腳踝帶',
  '放手並準備站起':'伸手扶住腳踝帶',
  '先站穩再伸手扶桿':'放開扶桿並蹲下',
  '站穩並扶好橫桿':'放開扶桿',
  '後退並調整訓練姿勢':'把附件送回掛鉤',
});
const axisQuat=(axis,across)=>{const z=V(axis).normalize(),x=V(across).addScaledVector(z,-V(across).dot(z)).normalize(),y=new THREE.Vector3().crossVectors(z,x).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};
const footQuat=(direction=[0,0,1],normal=[0,1,0])=>{const y=V(normal).normalize(),z=V(direction).addScaledVector(y,-V(direction).dot(y)).normalize(),x=new THREE.Vector3().crossVectors(y,z).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};
const directionMix=(a,b,t)=>{const q=new THREE.Quaternion().setFromUnitVectors(V(a).normalize(),V(b).normalize());return A(V(a).normalize().applyQuaternion(new THREE.Quaternion().slerp(q,t)));};

/** Authored, reversible movement into and out of the 22 custom exercises.
 * Poses rotate the same fixed-length human bones used by the exercise loops.
 * Equipment has explicit parked / held ownership; release never removes it. */
export function createRigLifecycle({metrics,getStage,rig,definitions,machines=new Map(),geometries=new Set(),extraMaterials=new Set(),capturedTransitionTiming=true,naturalPreparation=true}){
  const records=new Map(),defs=new Map(definitions.map(d=>[d.id,d]));
  const n=metrics.neutral,torso=metrics.torsoLength,restTorso=V(n.shoulder).sub(V(n.hip)),restAxis=restTorso.clone().normalize(),headSpan=n.head[1]-n.shoulder[1];
  const mats={frame:new THREE.MeshStandardMaterial({color:'#293a31',metalness:.55,roughness:.42}),pad:new THREE.MeshStandardMaterial({color:'#48604c',roughness:.88}),chrome:new THREE.MeshStandardMaterial({color:'#acb9b0',metalness:.86,roughness:.25})};Object.values(mats).forEach(m=>extraMaterials.add(m));
  const cache=new Map(),visibleStations=new Map(),sourceVisibility=new Map();let preparedId=null;
  function geometry(key,make){if(!cache.has(key)){const g=make();cache.set(key,g);geometries.add(g);}return cache.get(key);}
  function box(parent,position,size,material=mats.frame){const object=new THREE.Mesh(geometry(`b:${size}`,()=>new RoundedBoxGeometry(...size,1,Math.min(.025,...size.map(v=>v/3)))),material);object.position.fromArray(position);object.castShadow=object.receiveShadow=true;parent.add(object);return object;}
  function rod(parent,a,b,r=.025,material=mats.chrome){const object=new THREE.Mesh(geometry(`r:${r}`,()=>new THREE.CylinderGeometry(r,r,1,14)),material);parent.add(object);setRod(object,a,b);object.castShadow=object.receiveShadow=true;return object;}
  function setRod(object,a,b){const p=V(a),d=V(b).sub(p);object.position.copy(p).addScaledVector(d,.5);object.scale.y=Math.max(.0001,d.length());object.quaternion.setFromUnitVectors(UP,d.normalize());}
  function bodyQ(pose){return new THREE.Quaternion().setFromUnitVectors(restAxis,V(pose.shoulder).sub(V(pose.hip)).normalize());}
  function root(pose,index){return restTorso.clone().add(V(metrics.arms[index].shoulderOffset)).applyQuaternion(bodyQ(pose)).add(V(pose.hip));}
  function neutral(extra={}){return{...buildLocomotionPose(metrics,0,0),hip:[...n.hip],shoulder:[...n.shoulder],head:[...n.head],feet:n.feet.map(p=>[...p]),...extra};}
  function torsoPose(hip,lean=0,extra={}){return neutral({hip,shoulder:add(hip,[0,torso*Math.cos(lean),torso*Math.sin(lean)]),head:add(hip,[0,(torso+headSpan)*Math.cos(lean),(torso+headSpan)*Math.sin(lean)]),...extra});}
  function move(pose,delta){const result=copy(pose);for(const key of ['hip','shoulder','head'])result[key]=add(result[key],delta);for(const key of ['hands','feet','elbows','knees'])if(result[key])result[key]=result[key].map(p=>add(p,delta));return result;}
  function toBase(frame){return move(frame.pose,frame.offset||[0,0,0]);}
  function blend(a,b,t){
    const qa=bodyQ(a),qb=bodyQ(b),q=qa.clone().slerp(qb,t),hip=V(mix(a.hip,b.hip,t)),pose={hip:A(hip),shoulder:A(restTorso.clone().applyQuaternion(q).add(hip)),head:A(restTorso.clone().add(new THREE.Vector3(0,headSpan,.025)).applyQuaternion(q).add(hip)),hands:[],elbows:[],feet:[],handDirections:[],handAdvances:[],handGripStrength:[],handGripping:[],kneeHints:[],footDirections:[],footNormals:[],gripping:false,relaxedHands:true};
    for(let side=0;side<2;side++){
      const fa=solveHandContactFrame(metrics,a,side),fb=solveHandContactFrame(metrics,b,side),ra=root(a,side),rb=root(b,side),ri=restTorso.clone().add(V(metrics.arms[side].shoulderOffset)).applyQuaternion(q).add(hip),arm=metrics.arms[side];
      const upperA=V(fa.elbow).sub(ra).applyQuaternion(qa.clone().invert()),upperB=V(fb.elbow).sub(rb).applyQuaternion(qb.clone().invert()),upper=V(directionMix(A(upperA),A(upperB),t)).multiplyScalar(arm.upper).applyQuaternion(q),elbow=ri.clone().add(upper);
      const lowerA=V(fa.wrist).sub(V(fa.elbow)).applyQuaternion(qa.clone().invert()),lowerB=V(fb.wrist).sub(V(fb.elbow)).applyQuaternion(qb.clone().invert()),lower=V(directionMix(A(lowerA),A(lowerB),t)).multiplyScalar(arm.lower).applyQuaternion(q),wrist=elbow.clone().add(lower);
      const handA=qa.clone().invert().multiply(axisQuat(fa.advance,fa.axis)),handB=qb.clone().invert().multiply(axisQuat(fb.advance,fb.axis)),frame=q.clone().multiply(handA.slerp(handB,t)),handQ=frame.clone().multiply(new THREE.Quaternion(...arm.handFrameLocal).invert()),hand=wrist.clone().add(V(arm.palmOffset).applyQuaternion(handQ));
      pose.elbows.push(A(elbow));pose.hands.push(A(hand));pose.handDirections.push(A(X.clone().applyQuaternion(frame)));pose.handAdvances.push(A(Z.clone().applyQuaternion(frame)));
      const ga=a.handGripStrength?.[side]??((a.handGripping?.[side]??a.gripping)?1:0),gb=b.handGripStrength?.[side]??((b.handGripping?.[side]??b.gripping)?1:0),grip=ga+(gb-ga)*t;pose.handGripStrength.push(grip);pose.handGripping.push(grip>.5);
      pose.feet.push(mix(a.feet[side],b.feet[side],t));const fq=footQuat(a.footDirections?.[side],a.footNormals?.[side]).slerp(footQuat(b.footDirections?.[side],b.footNormals?.[side]),t);pose.footDirections.push(A(Z.clone().applyQuaternion(fq)));pose.footNormals.push(A(UP.clone().applyQuaternion(fq)));pose.kneeHints.push(mix(a.kneeHints?.[side]||[0,0,1],b.kneeHints?.[side]||[0,0,1],t));
    }
    if(a.spineTwist||b.spineTwist)pose.spineTwist=(a.spineTwist||0)+((b.spineTwist||0)-(a.spineTwist||0))*t;
    return pose;
  }
  function floorAt(record,x,z){const mat=record.mat;if(mat&&Math.abs(x-mat.position[0])<=mat.size[0]/2&&Math.abs(z-mat.position[2])<=mat.size[2]/2)return mat.position[1]+mat.size[1]/2;return 0;}
  function settleLegReach(record,pose,offset){
    const q=bodyQ(pose),margin=.0005;let drop=0;
    for(let side=0;side<2;side++){
      const leg=metrics.legs[side],root=V(leg.hipOffset).applyQuaternion(q).add(V(pose.hip)),ankle=V(pose.feet[side]).sub(V(leg.footContactOffset).applyQuaternion(footQuat(pose.footDirections[side],pose.footNormals[side]))),dx=root.x-ankle.x,dz=root.z-ankle.z,length=leg.upper+leg.lower-.001;
      const deficit=root.y-ankle.y-Math.sqrt(Math.max(0,length*length-dx*dx-dz*dz));
      drop+=deficit<=-margin?0:deficit>=margin?deficit:(deficit+margin)**2/(4*margin);
    }
    if(drop>1e-10){
      const calibrated=adaptDumbbellGrip({id:record.id,metrics,raw:pose,mask:record.weightHands,lifecycle:true});pose=calibrated.pose;pose.dbPrecalibrated=true;pose.dbGearPose=move(calibrated.gearPose,offset);
      for(const key of ['hip','shoulder','head'])pose[key][1]-=drop;pose.preparationLegSettle=drop;
    }
    return pose;
  }
  function walking(record,a,b,u,heldPose=null){
    const t=smooth(u),offset=mix(a,b,t),distance=V(b).sub(V(a)).length(),steps=Math.max(2,Math.ceil(distance/.2/2)*2),step=Math.min(steps-1,Math.floor(t*steps)),p=t*steps-step,feet=[];
    let pose=heldPose?copy(heldPose):neutral();const floor=(floorAt(record,offset[0],offset[2])+floorAt(record,offset[0],offset[2]+.145))*.5;
    const hipDrop=.070*Math.sin(Math.PI*t);pose=move(pose,[0,floor-hipDrop,0]);
    for(let side=0;side<2;side++){
      const previous=step<=side?0:Math.min(1,(Math.floor((step-1-side)/2)+1)*2/steps),next=Math.min(1,(Math.floor((step-side)/2)+1)*2/steps),swing=step%2===side;
      const from=add(mix(a,b,previous),[n.feet[side][0],0,n.feet[side][2]]),to=add(mix(a,b,next),[n.feet[side][0],0,n.feet[side][2]]),foot=swing?mix(from,to,smooth(p)):from;
      const lift=naturalPreparation&&record.definition.stationId==='dumbbell-curl'?preparationFootLift(p):Math.sin(p*Math.PI);
      foot[1]=.013+floorAt(record,foot[0],foot[2])+(swing?lift*.12:0);feet.push(foot.map((value,index)=>value-offset[index]));
    }
    pose.feet=feet;pose.footDirections=(record.stage.weights||record.stage.configurationKey==='straight-bar')?copy((heldPose||neutral()).footDirections):[[0,0,1],[0,0,1]];pose.footNormals=[[0,1,0],[0,1,0]];pose.kneeHints=[[0,0,1],[0,0,1]];
    if(naturalPreparation&&record.definition.stationId==='dumbbell-curl'){
      // A planted shoe must stay reachable when the other leg swings. The
      // old pelvis track occasionally overextended the trailing leg. Settle
      // the torso by the measured leg-length deficit instead of stretching
      // a bone or letting the sole float. The compact ramp anticipates the
      // constraint smoothly and is exactly zero at the original endpoints.
      // Keep the already calibrated palm/shaft frames while the legs bend.
      // dbGearPose is in rig space; the outer pose is still frame-local.
      pose=settleLegReach(record,pose,offset);
    }
    return{pose,offset};
  }
  function makeNode(pose,offset,stage,duration,extra={}){return{pose,offset,stage,duration,...extra};}
  function append(nodes,pose,offset,stage,duration,extra={}){nodes.push(makeNode(pose,offset,stage,extra.walk?duration*1.35:duration,extra));}
  function restHands(pose){return move(neutral(),pose.hip.map((v,i)=>v-n.hip[i])).hands;}
  function gripPose(pose,hands,directions,grip=1,advances=null){return{...copy(pose),hands:copy(hands),handDirections:copy(directions),handAdvances:advances?copy(advances):undefined,handNormals:undefined,elbows:undefined,elbowHints:[[-.8,-.5,.3],[.8,-.5,.3]],handGripping:[grip>.5,grip>.5],handGripStrength:[grip,grip],gripping:grip>.5};}
  function dumbbellBlend(a,b,t,record){
    if(b.dbSettleToExercise){
      // The last regrip joins the actual fixed-length bone frames, rather
      // than repeatedly pushing an elbow around a linearly moving handle.
      // The weights follow those same closed palm frames throughout.
      const from=adaptDumbbellGrip({id:record.id,metrics,raw:a,mask:record.weightHands,lifecycle:true}).pose,to=adaptDumbbellGrip({id:record.id,metrics,raw:b,mask:record.weightHands,lifecycle:true}).pose,pose=blend(from,to,t);
      pose.handFingerFlex=copy(to.handFingerFlex);pose.handThumbOpposition=copy(to.handThumbOpposition);pose.dbPrecalibrated=true;
      pose.dbGearPose={hands:copy(pose.hands),handDirections:copy(pose.handDirections),feet:copy(pose.feet)};
      for(let side=0;side<2;side++)if(record.weightHands[side]){const axis=V(pose.handDirections[side]),advance=V(pose.handAdvances[side]),offsets=dumbbellContactOffsets(record.id),normal=new THREE.Vector3().crossVectors(advance,axis).multiplyScalar(side?1:-1).normalize(),delta=normal.multiplyScalar(offsets.normal).addScaledVector(advance,offsets.advance);pose.dbGearPose.hands[side]=V(pose.hands[side]).sub(delta).toArray();}
      return pose;
    }
    const pose=blend(a,b,t);pose.hands=a.hands.map((p,i)=>mix(p,b.hands[i],t));pose.elbows=undefined;
    const freePath='dbFreeShaftWeight'in a||'dbFreeShaftWeight'in b;
    pose.elbowHints=[0,1].map(side=>{const fa=solveHandContactFrame(metrics,a,side),fb=solveHandContactFrame(metrics,b,side),pole=(p,f)=>freePath&&p.elbows?V(p.elbows[side]).sub(root(p,side)).normalize().toArray():p.elbowHints?.[side]||V(f.elbow).sub(root(p,side)).toArray();return mix(pole(a,fa),pole(b,fb),t);});
    pose.dbGripWeight=(a.dbGripWeight||0)+((b.dbGripWeight||0)-(a.dbGripWeight||0))*t;pose.dbNaturalGrip=(a.dbNaturalGrip||0)+((b.dbNaturalGrip||0)-(a.dbNaturalGrip||0))*t;pose.dbThighSupport=(a.dbThighSupport||0)+((b.dbThighSupport||0)-(a.dbThighSupport||0))*t;if('dbFreeShaftWeight'in a||'dbFreeShaftWeight'in b)pose.dbFreeShaftWeight=(a.dbFreeShaftWeight||0)+((b.dbFreeShaftWeight||0)-(a.dbFreeShaftWeight||0))*t;return pose;
  }
  function rack(record){
    const stage=record.stage,group=stage.group;
    box(group,[0,.705,1.40],[1.12,.07,.50],mats.pad);
    for(const sign of [-1,1]){box(group,[sign*.58,.36,1.36],[.065,.72,.065]);box(group,[sign*.58,.035,1.36],[.24,.07,.62]);}
    stage.staticVolumes.push({id:'lifecycle-dumbbell-tray',shape:'box',position:[0,.705,1.40],size:[1.12,.07,.50],allowedBodyParts:[]},...[-1,1].map(sign=>({id:`lifecycle-tray-post-${sign}`,shape:'box',position:[sign*.58,.36,1.36],size:[.065,.72,.065],allowedBodyParts:[]})));
  }
  function dumbbellNodes(record){
    rack(record);return buildDumbbellLifecycleNodes({record,metrics,neutral,torsoPose,gripPose,move,append,naturalPreparation});
  }
  function turfNodes(record){
    const id=record.definition.id,final=record.exercisePose,nodes=record.nodes,h=record.mat.position[1]+record.mat.size[1]/2;
    append(nodes,neutral(),record.gateOffset,'站在軟墊外',0);const destination=id==='seated-glute-stretch'?[0,0,.48]:[0,0,0];
    if(id==='seated-glute-stretch'){
      // Cross the raised edge in one deliberate step per foot. Intermediate
      // diagonal walking plants used to leave a heel inside the raised mat.
      const front=[0,0,1.45],inside=[0,0,.95];
      append(nodes,neutral(),front,'走到軟墊前',1.6,{walk:true});
      const lower=move(neutral(),[0,-.08,front[2]]);lower.feet=n.feet.map(p=>add(p,front));append(nodes,lower,[0,0,0],'站穩準備抬腳',.4);
      const first=move(neutral(),[0,h*.5-.08,(front[2]+inside[2])*.5]);first.feet=[add(n.feet[0],[0,h,inside[2]]),add(n.feet[1],front)];
      append(nodes,first,[0,0,0],'先把左腳踏上軟墊',.9,{stepFeet:true});
      const both=move(neutral(),[0,h-.08,inside[2]]);both.feet=n.feet.map(p=>add(p,[0,h,inside[2]]));
      append(nodes,both,[0,0,0],'右腳跟上並站穩',.9,{stepFeet:true});
      append(nodes,move(neutral(),[0,h,0]),inside,'站穩雙腳',.4);
      append(nodes,move(neutral(),[0,h,0]),destination,'走到軟墊上',.8,{walk:true});
    }else append(nodes,move(neutral(),[0,h,0]),destination,'走到軟墊上',1.8,{walk:true});
    let ready=move(neutral(),[0,h,0]);if(destination[2])ready=move(ready,destination);append(nodes,ready,[0,0,0],'站穩雙腳',.4);
    if(id==='seated-glute-stretch'){
      const feet=[[-.18,h+.013,.62],[.18,h+.013,.62]],sit=torsoPose([0,.32,0],0,{feet,hands:[[-.27,.57,.34],[.27,.57,.34]],elbowHints:[[-.8,-.4,.5],[.8,-.4,.5]],handGripping:[false,false],gripping:false});
      const positioned=copy(ready);positioned.feet=feet;append(nodes,positioned,[0,0,0],'把腳放到低凳前',.9,{stepFeet:true});append(nodes,sit,[0,0,0],'慢慢坐到低凳',1.7);append(nodes,final,[0,0,0],'扶腿並調整坐姿',1.3,{stepFeet:true});
    }else if(id==='kneeling-hip-flexor-stretch'){
      const lunge=torsoPose([0,.67,.02],0,{feet:[final.feet[0],[.11,h+.013,-.35]],hands:[[-.28,.75,.25],[.28,.75,.25]],kneeHints:[[0,1,1],[0,0,1]],handGripping:[false,false],gripping:false});append(nodes,lunge,[0,0,0],'前後站好再降低重心',1.4,{stepFeet:true});
      const kneel=copy(final);kneel.feet[1]=add(final.feet[1],[0,.14,0]);append(nodes,kneel,[0,0,0],'後膝靠近軟墊',1.2,{stepFeet:true});append(nodes,final,[0,0,0],'放下腳背並扶穩大腿',.8);
    }else append(nodes,final,[0,0,0],'調整伸展站姿',1.5,{stepFeet:true});
  }
  function straightBarNodes(record){
    const nodes=record.nodes,final=record.exercisePose,offset=[0,0,.30],park=copy(final);park.hands=[[-.24,1.20,.70],[.24,1.20,.70]];record.park=park;record.weightHands=[true,true];record.stage.setGearPose(park);
    append(nodes,neutral(),record.gateOffset,'走近龍門架',0,{gear:'park'});append(nodes,neutral(),offset,'走到直桿前',2.0,{walk:true,gear:'park'});
    const hands=(y,z)=>[[-.24,y,z],[.24,y,z]],grasp=(points,strength)=>{const pose=gripPose(neutral(),points,[[1,0,0],[-1,0,0]],strength,[[0,0,1],[0,0,1]]);pose.elbowHints=[[-.5,-1,.12],[.5,-1,.12]];pose.dbGripWeight=1;pose.dbNaturalGrip=1;return pose;};
    append(nodes,grasp(hands(1.38,.22),0),offset,'抬手準備正握',1.0,{gear:'park'});
    append(nodes,grasp(hands(1.20,.40),0),offset,'掌心對準直桿',.9,{gear:'park'});
    append(nodes,grasp(hands(1.20,.40),1),offset,'握穩直桿',.5,{gear:'held'});
    append(nodes,grasp(hands(1.28,.40),1),offset,'提離掛位',.65,{gear:'held'});
    append(nodes,copy(final),[0,0,0],'退半步並穩住握把',2.2,{gear:'held',stepFeet:true});
    append(nodes,copy(final),[0,0,0],'手肘靠近身體',.55,{gear:'held'});
  }
  function cableNodes(record){
    const id=record.definition.id,nodes=record.nodes,final=record.exercisePose,one=['single-arm-cable-row','cable-single-arm-lateral-raise'].includes(id),ankle=id==='cable-ankle-kickback',curl=id.includes('-curl'),face=id==='cable-rope-face-pull',rope=id==='rope-pushdown',vbar=id==='cable-v-bar-row';
    const park=copy(final);park.hands=rope?[[-.18,1.42,.80],[.18,1.42,.80]]:face?[[-.20,1.32,.85],[.20,1.32,.85]]:curl?[[-.24,.78,.96],[.24,.78,.96]]:vbar?[[-.14,1.06,.80],[.14,1.06,.80]]:one?[[-.30,.87,.05],[.32,id==='single-arm-cable-row'?1.18:.85,.88]]:copy(final.hands);park.handDirections=copy(final.handDirections||[[0,1,0],[0,1,0]]);if(face||rope||vbar)park.handDirections=[[0,1,0],[0,1,0]];if(id==='cable-single-arm-lateral-raise')park.handDirections=[[0,0,1],[0,0,1]];
    if(face)park.gearConnector=[0,1.73,.85];record.park=park;record.weightHands=one?[false,true]:[true,true];record.ankle=ankle;
    const band=[.85,.45,.15],connector=ankle?add(band,[.064,0,0]):record.stage.setGearPose(park),clipOffset=ankle?[.85,0,-.25]:one?[.42,0,.50]:face?[0,0,.50]:[0,0,.50];record.parkBand=band;record.connector=copy(connector);
    // The unused attachment rests on a visible peg while its carabiner is
    // opened and closed. Its cable remains rendered throughout the operation.
    const pegZ=connector[2]+.10,pegY=connector[1];rod(record.stage.group,[connector[0],.04,pegZ],[connector[0],pegY-.06,pegZ],.022,mats.frame);rod(record.stage.group,[connector[0],pegY,pegZ],[connector[0],pegY,connector[2]],.019,mats.chrome);
    record.stage.staticVolumes.push({id:'attachment-park-stand',shape:'capsule',start:[connector[0],.04,pegZ],end:[connector[0],pegY-.06,pegZ],radius:.022,allowedBodyParts:[]});
    const ring=new THREE.Group();record.stage.group.add(ring);record.clipRing=ring;for(const sign of [-1,1])rod(ring,[sign*.055,-.055,0],[sign*.055,.055,0],.008);rod(ring,[-.055,.055,0],[.055,.055,0],.008);record.clipGate=rod(ring,[-.055,-.055,0],[.055,-.055,0],.008);ring.position.fromArray(connector);
    append(nodes,neutral(),record.gateOffset,'走近龍門架',0,{gear:'park'});append(nodes,neutral(),clipOffset,'走到附件掛鉤前',2.0,{walk:true,gear:'park'});
    const clipHip=ankle?.35:curl?.70:id==='cable-single-arm-lateral-raise'?.55:.90,clipBody=torsoPose([0,clipHip,0],ankle?.50:curl?.22:0),hands=[add(connector,[-.06,0,0]),add(connector,[.06,0,0])].map(p=>p.map((v,i)=>v-clipOffset[i]));
    const clipPose=gripPose(clipBody,hands,[[1,0,0],[1,0,0]],0);clipPose.elbowHints=[[-1,.6,-.4],[1,.6,-.4]];if(!face&&id!=='cable-single-arm-lateral-raise')clipPose.handAdvances=[[0,0,1],[0,0,1]];if(ankle){clipPose.kneeHints=[[-1,0,-1],[1,0,-1]];clipPose.elbowHints=[[-1,-.3,1],[1,-.3,1]];}if(rope||vbar||id==='single-arm-cable-row'){const raised=gripPose(torsoPose([0,clipHip,0]),[[-.24,1.60,.15],[.24,1.60,.15]],[[1,0,0],[1,0,0]],0);append(nodes,raised,clipOffset,'抬手靠近扣環',.7,{gear:'park'});const above=copy(clipPose);above.hands=above.hands.map(p=>add(p,[0,vbar?.25:.14,-.10]));append(nodes,above,clipOffset,'從上方伸向掛鉤',.8,{gear:'park'});}append(nodes,clipPose,clipOffset,'雙手靠近掛鉤',1.0,{gear:'park'});append(nodes,{...clipPose,handGripStrength:[1,1],handGripping:[true,true]},clipOffset,'扣緊附件掛鉤',.65,{gear:'park',clipping:true});
    const pullOffset=ankle?[.85,0,-.25]:face?[0,0,.42]:curl?[0,0,.65]:vbar?[0,0,.42]:one?[0,0,.50]:[0,0,.30];
    const lowered=copy(clipPose);lowered.hands=lowered.hands.map(p=>add(p,[0,face?-.15:.18,-.12]));lowered.handGripStrength=[0,0];lowered.handGripping=[false,false];if(ankle){lowered.hands=[[-.30,.45,.50],[.30,.45,.50]];lowered.handAdvances=undefined;}append(nodes,lowered,clipOffset,'放開掛鉤',.5,{gear:'park'});
    if(id==='single-arm-cable-row'){
      const clear=copy(lowered);clear.hands[0]=add(clear.hands[0],[-.45,.08,-.20]);
      append(nodes,clear,clipOffset,'左手先退開握把',.7,{gear:'park'});
    }
    let graspBody=torsoPose([0,ankle?.35:curl?.82:id==='cable-single-arm-lateral-raise'?.74:one?.84:vbar?.90:n.hip[1],0],curl?.20:0),graspHands=copy(park.hands).map(p=>p.map((v,i)=>v-pullOffset[i]));if(ankle)graspHands=[[-.26,.52,.2],add(band,[0,.06,0]).map((v,i)=>v-pullOffset[i])];
    const grasp=gripPose(graspBody,graspHands,park.handDirections,0);if(face||rope){grasp.handAdvances=[[0,0,1],[0,0,1]];grasp.elbowHints=[[-1,.3,-.4],[1,.3,-.4]];}if(ankle)grasp.kneeHints=[[-1,0,-1],[1,0,-1]];if(vbar||id==='single-arm-cable-row')grasp.handAdvances=[[0,0,1],[0,0,1]];if(curl){grasp.handAdvances=[0,1].map(side=>{const f=solveHandContactFrame(metrics,grasp,side),axis=V(park.handDirections[side]).normalize(),v=V(f.advance);return A(v.addScaledVector(axis,-v.dot(axis)).normalize());});}if(one||ankle){grasp.hands[0]=graspBody.hands[0];grasp.handGripping[0]=false;}
    if(id==='cable-single-arm-lateral-raise'){grasp.handAdvances=[null,[0,-1,0]];const before=copy(grasp);before.hands[1]=add(before.hands[1],[0,.15,-.15]);append(nodes,before,pullOffset,'先從握把上方伸手',.65,{gear:'park'});}if(rope||vbar){const before=copy(grasp);before.hands=before.hands.map(p=>add(p,[0,.12,-.18]));append(nodes,before,pullOffset,'先從握把前方伸手',.65,{gear:'park'});}append(nodes,grasp,pullOffset,'調整站位並伸手',1.2,{gear:'park'});append(nodes,{...grasp,handGripping:ankle?[false,true]:record.weightHands,handGripStrength:(ankle?[false,true]:record.weightHands).map(Number)},pullOffset,'握住附件',.4,{gear:'held'});
    if(ankle){
      const carry=gripPose(neutral(),[[-.28,.9,.04],[.35,1.00,.25]],[[0,1,0],[0,1,0]],1);carry.handGripping=[false,true];carry.handGripStrength=[0,1];append(nodes,carry,pullOffset,'拿穩腳踝帶並站起',1.0,{gear:'held'});append(nodes,carry,[0,0,0],'帶到訓練位置',1.7,{walk:true,gear:'held'});
      const attach=torsoPose([0,.26,0],.50,{feet:copy(final.feet),hands:[[-.25,.43,.22],[.18,.153,-.0003]],handDirections:[[1,0,0],[1,0,0]],handAdvances:[null,[0,-1,0]],handGripping:[false,true],handGripStrength:[0,1],kneeHints:[[-1,.2,.7],[1,.2,.7]],elbowHints:[[-1,-.3,.2],[1,-.3,-.1]],gripping:true});append(nodes,attach,[0,0,0],'蹲下把腳踝帶靠到腳踝',1.5,{gear:'held'});append(nodes,attach,[0,0,0],'扣好腳踝帶',.5,{gear:'ankle'});
      const release=copy(attach);release.hands=[[-.30,.45,.40],[.30,.45,.40]];release.handGripStrength=[0,0];release.handGripping=[false,false];append(nodes,release,[0,0,0],'放手並準備站起',.7,{gear:'ankle'});const upright=copy(final);upright.hands=[[-.30,1.32,.34],[.30,1.32,.34]];append(nodes,upright,[0,0,0],'先站穩再伸手扶桿',1.5,{gear:'ankle'});append(nodes,final,[0,0,0],'站穩並扶好橫桿',.7,{gear:'ankle'});
    }else append(nodes,final,[0,0,0],'後退並調整訓練姿勢',1.8,{gear:'held'});
  }
  function build(id){
    const stage=getStage(id),key=stage.configurationKey?`${id}@${stage.configurationKey}`:id;if(records.has(key))return records.get(key);const definition=defs.get(id),exercisePose=copy(rig.sample(id,0,0)),mat=stage.staticVolumes.find(v=>v.id==='stretch-mat');
    const record={id,definition,stage,exercisePose,mat,nodes:[],mode:'idle',frame:null,gateOffset:definition.stationId==='dumbbell-curl'?[1.45,0,2.20]:definition.stationId==='cable-fly'?[0,0,-2.30]:id==='seated-glute-stretch'?[1.30,0,1.65]:[0,0,-1.55]};records.set(key,record);
    const previousChildren=new Set(stage.group.children),previousVolumes=new Set(stage.staticVolumes);
    if(stage.buildLifecycleNodes)stage.buildLifecycleNodes({record,metrics,neutral,torsoPose,gripPose,append});else if(definition.stationId==='dumbbell-curl'){record.exercisePose=prepareDumbbellRawPose(id,metrics,exercisePose);dumbbellNodes(record);}else if(definition.stationId==='stretch-zone')turfNodes(record);else if(stage.configurationKey==='straight-bar')straightBarNodes(record);else cableNodes(record);
    record.ownedObjects=stage.group.children.filter(object=>!previousChildren.has(object));record.ownedVolumes=stage.staticVolumes.filter(volume=>!previousVolumes.has(volume));
    let total=0;for(const node of record.nodes){total+=node.duration;node.time=total;}record.duration=total;
    for(let i=1;i<record.nodes.length;i++){
      const a=record.nodes[i-1],b=record.nodes[i],common={domain:definition.stationId==='dumbbell-curl'?'dumbbell':'unsupported',id,stage:b.stage,walk:b.walk,stepFeet:b.stepFeet,clipping:a.clipping||b.clipping};
      b.capturedTiming={enter:planCapturedTransition({...common,from:toBase(a),to:toBase(b),fromHeld:a.held,toHeld:b.held,fromGear:a.gear,toGear:b.gear}),exit:planCapturedTransition({...common,from:toBase(b),to:toBase(a),fromHeld:b.held,toHeld:a.held,fromGear:b.gear,toGear:a.gear})};
    }
    return record;
  }
  function frameAt(record,u,direction='enter'){
    const time=THREE.MathUtils.clamp(u,0,1)*record.duration,nodes=record.nodes;let index=1;while(index<nodes.length-1&&nodes[index].time<time)index++;
    const a=nodes[index-1],b=nodes[index],raw=b.duration?(time-a.time)/b.duration:1,profile=b.capturedTiming?.[direction],captured=capturedTransitionTiming?capturedTransitionProgress(profile,raw,{reversePath:direction==='exit'}):null,t=captured??smooth(raw);let pose,offset;
    if(b.walk){const walk=walking(record,a.offset,b.offset,raw,a.held||a.gear==='held'?a.pose:null);pose=walk.pose;offset=walk.offset;}
    else{const baseA=toBase(a),baseB=toBase(b);offset=mix(a.offset,b.offset,t);pose=move(record.stage.weights?dumbbellBlend(baseA,baseB,t,record):blend(baseA,baseB,t),offset.map(v=>-v));if(b.stepFeet){const moving=[0,1].filter(side=>V(baseA.feet[side]).distanceTo(V(baseB.feet[side]))>.06);for(const side of moving){const step=moving.length===2?THREE.MathUtils.clamp(raw*2-side,0,1):raw;pose.feet[side]=mix(baseA.feet[side],baseB.feet[side],smooth(step)).map((v,i)=>v-offset[i]);pose.feet[side][1]+=(naturalPreparation&&record.definition.stationId==='dumbbell-curl'?preparationFootLift(step):Math.sin(Math.PI*step))*.13;const fq=footQuat(baseA.footDirections?.[side],baseA.footNormals?.[side]).slerp(footQuat(baseB.footDirections?.[side],baseB.footNormals?.[side]),smooth(step));pose.footDirections[side]=A(Z.clone().applyQuaternion(fq));pose.footNormals[side]=A(UP.clone().applyQuaternion(fq));}}}
    if(b.stepFeet&&naturalPreparation&&record.definition.stationId==='dumbbell-curl')pose=settleLegReach(record,pose,offset);
    if(record.stage.configurationKey==='straight-bar'&&b.stepFeet){const drop=.035*Math.sin(raw*Math.PI);for(const key of ['hip','shoulder','head'])pose[key][1]-=drop;for(const key of ['hands','elbows'])if(pose[key])for(const point of pose[key])point[1]-=drop;}
    if(record.stage.adaptHandPose){pose.dbGripWeight=(a.pose.dbGripWeight||0)+((b.pose.dbGripWeight||0)-(a.pose.dbGripWeight||0))*t;pose.dbNaturalGrip=(a.pose.dbNaturalGrip||0)+((b.pose.dbNaturalGrip||0)-(a.pose.dbNaturalGrip||0))*t;}
    if(time<=.000001){pose=copy(nodes[0].pose);offset=copy(nodes[0].offset);}if(time>=record.duration-.000001){pose=copy(nodes.at(-1).pose);offset=copy(nodes.at(-1).offset);}
    const held=time>=nodes.at(-1).time?!!nodes.at(-1).held:!!a.held,gear=time>=nodes.at(-1).time?nodes.at(-1).gear:a.gear;
    const frame={pose,offset,rotation:0,stage:b.stage,contacts:{hands:[false,false],feet:[false,false]},held,gear,clipping:!!b.clipping,phase:THREE.MathUtils.clamp(u,0,1)};
    if(captured!==null)frame.transitionTiming={...profile,pathProgress:captured,storedPhase:raw,actualPhase:direction==='exit'?1-raw:raw,storedPathDirection:'enter',playbackDirection:direction,segmentRange:[a.time/record.duration,b.time/record.duration]};
    return frame;
  }
  function apply(record,frame){
    let base=toBase(frame);record.mode='lifecycle';record.frame=frame;const stage=record.stage;
    if(stage.weights){
      const calibrated=base.dbPrecalibrated?{pose:base,gearPose:base.dbGearPose,contactTargets:copy(base.hands)}:adaptDumbbellGrip({id:record.id,metrics,raw:base,mask:record.weightHands,lifecycle:true});
      stage.setWeights(frame.held?calibrated.gearPose:record.storage);frame.contacts.hands=frame.held?[...record.weightHands]:[false,false];
      if(base.dbThighSupport>.5)for(const volume of stage.dynamicVolumes)if(volume.id.endsWith('--1'))volume.allowedBodyParts.push(volume.id.startsWith('left-')?'leftThigh':'rightThigh');
      base=calibrated.pose;frame.pose=move(base,frame.offset.map(v=>-v));record.dbContactTargets=calibrated.contactTargets;
    }else if(stage.setGearPose){
      const id=record.id,isCurl=id==='cable-straight-bar-curl'||id==='cable-ez-bar-curl',isV=id==='cable-v-bar-row',isSingle=id==='single-arm-cable-row',isLateral=id==='cable-single-arm-lateral-raise',isStraight=stage.configurationKey==='straight-bar';
      if(frame.gear==='held'&&(isCurl||isV||isSingle||isLateral||isStraight)){
        if(isCurl||isV||isStraight){const centre=base.hands[0].map((v,i)=>(v+base.hands[1][i])/2),width=isV?.14:.24;base.hands=[add(centre,[-width,0,0]),add(centre,[width,0,0])];}
        for(let side=0;side<2;side++)if(record.weightHands[side]){const natural=solveHandContactFrame(metrics,base,side),axis=isStraight?[side?-1:1,0,0]:isCurl?(id==='cable-ez-bar-curl'?[1,0,side?-.4:.4]:[1,0,0]):natural.axis,direction=natural.advance,normal=V(axis).normalize(),advance=V(direction).addScaledVector(normal,-V(direction).dot(normal)).normalize();base.handDirections??=[null,null];base.handAdvances??=[null,null];base.handDirections[side]=axis;base.handAdvances[side]=A(advance);}
        frame.pose.hands=base.hands.map(p=>p.map((v,i)=>v-frame.offset[i]));frame.pose.handDirections=copy(base.handDirections);frame.pose.handAdvances=copy(base.handAdvances);
      }
      let gearPose=frame.gear==='held'?base:record.park,band=null;
      if(record.ankle){band=frame.gear==='ankle'?add(base.feet[1],[0,metrics.footHeightOffset,-metrics.footForwardOffset]):frame.gear==='held'?add(base.hands[1],[0,-.06,0]):record.parkBand;}
      const connector=stage.setGearPose(gearPose,band);if(record.clipRing){record.clipRing.position.fromArray(connector);record.clipGate.rotation.z=frame.clipping?Math.sin(frame.phase*Math.PI)*.8:0;}
      frame.contacts.hands=frame.gear==='held'?(record.ankle?[false,true]:[...record.weightHands]):[false,false];
      if(stage.adaptHandPose){base=stage.adaptHandPose(base);frame.pose=move(base,frame.offset.map(v=>-v));}
    }
    for(let side=0;side<2;side++)frame.contacts.feet[side]=Math.abs(base.feet[side][1]-.013-floorAt(record,base.feet[side][0],base.feet[side][2]))<.004&&(base.footNormals?.[side]?.[1]??1)>.8;
    let targetHands=copy(base.hands);
    if(stage.weights&&frame.held)targetHands=copy(record.dbContactTargets);
    if(stage.gearContacts&&frame.gear==='held')for(let side=0;side<2;side++)if(frame.contacts.hands[side]&&stage.gearContacts[side])targetHands[side]=copy(stage.gearContacts[side]);
    record.targets={hands:targetHands,feet:copy(base.feet),mask:copy(frame.contacts)};return frame;
  }
  return{
    getLifecycle(id){const r=build(id);return{gateOffset:copy(r.gateOffset),gateRotation:0,gateFloorY:0,entryDuration:r.duration,exitDuration:r.duration,stages:r.nodes.slice(1).map(n=>({label:n.stage,duration:n.duration})),persistentProps:true};},
    prepare(id){const r=build(id),stationId=r.definition.stationId,source=machines.get(stationId)?.group;if(source){if(!sourceVisibility.has(stationId))sourceVisibility.set(stationId,source.visible);source.visible=false;}preparedId=id;for(const other of records.values())if(other!==r&&other.definition.stationId===stationId)other.stage.group.visible=false;r.stage.group.visible=true;visibleStations.set(stationId,r);return apply(r,frameAt(r,0));},
    sampleLifecycle(id,direction,u){const r=build(id),frame=frameAt(r,direction==='exit'?1-u:u,direction);if(direction==='exit')frame.stage=EXIT_STAGES[frame.stage]||'整理器材並離開';return apply(r,frame);},
    getCapturedTransitionCoverage(id){const r=build(id);return{kind:'captured-transition-timing',activityId:id,enabled:!!capturedTransitionTiming,segments:r.nodes.slice(1).map((node,index)=>({stage:node.stage,range:[r.nodes[index].time/r.duration,node.time/r.duration],enter:copy(node.capturedTiming.enter),exit:copy(node.capturedTiming.exit)}))};},
    getNavigationVolumes(id){return getStage(id).staticVolumes.filter(v=>v.id!=='stretch-mat').map(copy);},
    getActualContacts(id){const stage=getStage(id),r=records.get(stage.configurationKey?`${id}@${stage.configurationKey}`:id);return r?.mode==='lifecycle'?copy(r.targets):null;},
    getLifecycleState(id){const r=build(id),stage=r.stage;return{mode:r.mode,visible:stage.group.visible,ownership:r.frame?.held?'held':r.frame?.gear||'park',propPositions:stage.weights?stage.weights.map(w=>w.position.toArray()):copy(stage.propPositions||stage.gearContacts||[]),propQuaternions:(stage.weights||stage.gearObjects||[]).map(w=>w.quaternion.toArray())};},
    hideStation(stationId){const record=visibleStations.get(stationId);if(!record)return;record.stage.group.visible=false;const source=machines.get(stationId)?.group;if(source)source.visible=sourceVisibility.get(stationId)??true;visibleStations.delete(stationId);sourceVisibility.delete(stationId);},
    markExercise(id){const stage=getStage(id),r=records.get(stage.configurationKey?`${id}@${stage.configurationKey}`:id);if(r)r.mode='exercise';},
    isPrepared:id=>preparedId===id,
    hasPreparedActivity:()=>preparedId!==null,
    invalidateConfiguration(id){if(preparedId!==null)return false;for(const [key,record]of records)if(key===id||key.startsWith(`${id}@`)){record.stage.group.visible=false;for(const object of record.ownedObjects||[])object.removeFromParent();const owned=new Set(record.ownedVolumes||[]);record.stage.staticVolumes=record.stage.staticVolumes.filter(volume=>!owned.has(volume));records.delete(key);}return true;},
    end({keepVisible=true}={}){if(!keepVisible){for(const [stationId,record]of visibleStations){record.stage.group.visible=false;const source=machines.get(stationId)?.group;if(source)source.visible=sourceVisibility.get(stationId)??true;}visibleStations.clear();sourceVisibility.clear();rig.end();}preparedId=null;},
  };
}
