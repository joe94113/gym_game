import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {buildLocomotionPose} from './locomotion.js';
import {createAdditionalLifecycle} from './additional-lifecycle.js';
import {createHipMachineLifecycle} from './additional-hip-lifecycle.js';
import {decomposePlateLoad,machineAdjustmentsFor,validateCalibrationPatch} from './equipment-calibration-v013.js';

import {inertialCurlEffort} from './inertial-curl-v018.js';

export const ADDITIONAL_EQUIPMENT_TYPES=new Set(['assistedPullup','assistedDip','hipAbduction','hipAdduction','backExtension','preacherCurl','lyingChestPress','declineChestPress']);

const copy=value=>JSON.parse(JSON.stringify(value)),signs=[-1,1],UP=new THREE.Vector3(0,1,0);
const read=point=>new THREE.Vector3(...point),add=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,s)=>a.map(v=>v*s);
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t,mixPoint=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const unit=point=>read(point).normalize().toArray();

/** New machines own physical fixtures, contact-space motion and their complete
 * entry/exit. They use the same actual bone measurements as the protagonist. */
export function createAdditionalEquipment({scene,stations,materials,geometries=new Set(),extraMaterials=new Set(),textures=new Set(),label,collider=()=>{},characterMetrics:metrics,baseMachines=new Map()}){
  if(!metrics?.arms)throw new Error('Additional equipment requires the production human measurements');
  const machines=new Map(),cache=new Map();
  const own=material=>(extraMaterials.add(material),material);
  const mat={frame:materials.graphite,metal:materials.steel,chrome:materials.chrome,rubber:materials.black,accent:materials.accent,
    pad:own(new THREE.MeshStandardMaterial({color:'#314c41',roughness:.88})),seam:own(new THREE.MeshStandardMaterial({color:'#728776',roughness:.95})),
    plate:own(new THREE.MeshStandardMaterial({color:'#202b25',roughness:.72,metalness:.2}))};
  const torso=metrics.torsoLength,headSpan=metrics.neutral.head[1]-metrics.neutral.shoulder[1];
  const upperLeg=metrics.legs[0].upper,lowerLeg=metrics.legs[0].lower,footForward=metrics.footForwardOffset,footHeight=metrics.footHeightOffset;
  const geometry=(key,make)=>{if(!cache.has(key)){const value=make();cache.set(key,value);geometries.add(value);}return cache.get(key);};
  function mesh(parent,geom,material,x=0,y=0,z=0){const object=new THREE.Mesh(geom,material);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
  function box(parent,x,y,z,w,h,d,material=mat.frame,allowedBodyParts=[],register=true){
    const object=mesh(parent,geometry(`box:${w}:${h}:${d}`,()=>new RoundedBoxGeometry(w,h,d,1,Math.min(.035,w/3,h/3,d/3))),material,x,y,z);
    if(register)object.userData.solid={shape:'box',size:[w,h,d],allowedBodyParts};return object;
  }
  function cylinder(parent,x,y,z,r,h,material=mat.chrome){return mesh(parent,geometry(`cyl:${r}:${h}`,()=>new THREE.CylinderGeometry(r,r,h,16)),material,x,y,z);}
  function rod(parent,a,b,r=.045,material=mat.frame,allowedBodyParts=[]){const object=cylinder(parent,0,0,0,r,1,material);setRod(object,a,b);object.userData.solid={shape:'capsule',radius:r,allowedBodyParts};return object;}
  function setRod(object,a,b){const from=read(a),direction=read(b).sub(from);object.position.copy(from).addScaledVector(direction,.5);object.scale.y=direction.length();object.quaternion.setFromUnitVectors(UP,direction.normalize());}
  function pad(parent,x,y,z,w,h,d,allowedBodyParts){const object=box(parent,x,y,z,w,h,d,mat.pad,allowedBodyParts);box(object,0,h/2+.002,0,w*.88,.005,d*.86,mat.seam,[],false);return object;}
  function base(group,w=1.8,d=2.2,openSide=false){for(const s of signs){if(openSide)rod(group,[s*(w/2-.1),.075,-d/2],[s*(w/2-.1),.075,-.45],.06,mat.frame,['leftFoot','rightFoot']);else rod(group,[s*(w/2-.1),.075,-d/2],[s*(w/2-.1),.075,d/2],.06,mat.frame,['leftFoot','rightFoot']);for(const z of [-d/2,d/2])box(group,s*(w/2-.1),.035,z,.25,.07,.24,mat.rubber,['leftFoot','rightFoot']);}rod(group,[-w/2+.1,.10,-d/2],[w/2-.1,.10,-d/2],.05);if(openSide){rod(group,[-w/2+.1,.075,d/2],[w/2-.1,.075,d/2],.045,mat.frame,['leftFoot','rightFoot']);rod(group,[0,.075,.10],[0,.075,d/2],.04,mat.frame,['leftFoot','rightFoot']);}}
  function chair(group,hip=.755){
    const seatTop=hip-.125;pad(group,0,seatTop-.055,-.09,.53,.11,.45,['pelvis','leftThigh','rightThigh']);
    pad(group,0,seatTop+.33,-.33,.49,.64,.105,['torso','pelvis','head']);rod(group,[0,.12,-.15],[0,seatTop-.10,-.15],.05,mat.metal);
    for(const s of signs)rod(group,[s*.35,.15,-.37],[s*.35,seatTop+.60,-.37],.035);
  }
  function stack(group,x=.9,z=-.65){
    const outer=new THREE.Group();group.add(outer);outer.position.set(x,0,z);
    box(outer,0,1.03,-.10,.53,1.95,.16,mat.frame);
    for(const s of signs)rod(outer,[s*.20,.15,.10],[s*.20,2.02,.10],.02,mat.chrome);
    const carriage=new THREE.Group();outer.add(carriage);carriage.userData.moving=true;
    for(let i=0;i<10;i++)box(carriage,0,.23+i*.064,.08,.39,.05,.29,mat.metal);
    cylinder(carriage,.20,.48,.24,.022,.08,mat.accent).rotation.x=Math.PI/2;
    cylinder(outer,0,1.95,.11,.09,.06,mat.rubber).rotation.z=Math.PI/2;
    label?.(outer,'肌動',0,1.64,.05,{width:.35,height:.13,color:'#cce3a4',size:60});
    return effort=>{carriage.position.y=effort*.22;};
  }
  function makeGrip(group,index){const grip=new THREE.Group();group.add(grip);grip.userData.moving=true;const name=index?'right':'left';rod(grip,[-.10,0,0],[.10,0,0],.028,mat.rubber,[`${name}Hand`,`${name}Forearm`]);return grip;}
  function armRoots(pose){const rotation=new THREE.Quaternion().setFromUnitVectors(UP,read(pose.shoulder).sub(read(pose.hip)).normalize());return metrics.arms.map(arm=>read(metrics.neutral.shoulder).sub(read(metrics.neutral.hip)).add(read(arm.shoulderOffset)).applyQuaternion(rotation).add(read(pose.hip)).toArray());}
  function hipRoots(pose){const rotation=new THREE.Quaternion().setFromUnitVectors(UP,read(pose.shoulder).sub(read(pose.hip)).normalize());return metrics.legs.map(leg=>read(leg.hipOffset).applyQuaternion(rotation).add(read(pose.hip)).toArray());}
  function upright(hip=[0,.755,0]){return{hip:[...hip],shoulder:add(hip,[0,torso,0]),head:add(hip,[0,torso+headSpan,0]),hands:[[-.4,hip[1]+.1,-.18],[.4,hip[1]+.1,-.18]],feet:[[-.20,.013,.55],[.20,.013,.55]],elbowHints:[[-1,-.3,.1],[1,-.3,.1]],kneeHints:[[0,0,1],[0,0,1]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],gripping:true};}
  function naturalHands(pose){pose.handNormals=pose.hands.map((_,index)=>{const frame=solveHandContactFrame(metrics,pose,index);return read(frame.advance).cross(read(frame.axis)).multiplyScalar(index?1:-1).normalize().toArray();});pose.handDirections=pose.hands.map((_,index)=>solveHandContactFrame(metrics,pose,index).axis);return pose;}
  function placeGrips(grips,pose){naturalHands(pose);grips.forEach((grip,index)=>{grip.position.fromArray(pose.hands[index]);grip.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),read(pose.handDirections[index]));});}
  const plateGeometry=geometry('plate-with-bore',()=>{const shape=new THREE.Shape();shape.absarc(0,0,.25,0,Math.PI*2);const hole=new THREE.Path();hole.absarc(0,0,.03,0,Math.PI*2,true);shape.holes.push(hole);const result=new THREE.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:true,bevelSize:.005,bevelThickness:.005,bevelSegments:1,curveSegments:24});result.translate(0,0,-.0275);return result;});
  function plateHorns(group){
    const horns=signs.map(sign=>{const horn=new THREE.Group();group.add(horn);horn.userData.moving=true;rod(horn,[0,0,0],[sign*.48,0,0],.025,mat.chrome);return horn;});
    let load=10;
    function set(kg){const pieces=decomposePlateLoad(Number(kg));if(!pieces)return false;load=Number(kg);horns.forEach((horn,index)=>{for(const child of [...horn.children])if(child.userData.plate)child.removeFromParent();const sign=signs[index],gap=.07;for(let i=0;i<pieces.length;i++){const p=mesh(horn,plateGeometry,mat.plate,sign*(.10+i*gap),0,0);p.rotation.y=Math.PI/2;p.scale.setScalar(pieces[i]<2.5?.48:pieces[i]<5?.55:pieces[i]===5?.77:1);p.userData.plate=true;p.userData.plateKg=pieces[i];p.userData.solid={shape:'box',size:[.5,.5,.065],allowedBodyParts:[]};}});return true;}
    set(10);return{horns,set,get:()=>load,state:()=>({kgPerSide:load,visiblePlates:{left:decomposePlateLoad(load).length,right:decomposePlateLoad(load).length},plateKg:{left:load,right:load}})};
  }
  function collisionRecords(group){group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),records=[];group.traverse(object=>{if(object.userData.solid)records.push({object,shape:object.userData.solid,matrix:new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld)});});return records;}
  function volumesFor(group,records){group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert();return records.map(({object,shape,matrix},index)=>{const local=object.parent?new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld):matrix;const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();local.decompose(p,q,s);if(shape.shape==='capsule')return{id:`solid-${index}`,shape:'capsule',start:new THREE.Vector3(0,-(shape.height||1)/2,0).applyMatrix4(local).toArray(),end:new THREE.Vector3(0,(shape.height||1)/2,0).applyMatrix4(local).toArray(),radius:shape.radius*Math.max(Math.abs(s.x),Math.abs(s.z)),allowedBodyParts:shape.allowedBodyParts};return{id:`solid-${index}`,shape:'box',position:p.toArray(),size:shape.size.map((v,i)=>v*Math.abs(s.getComponent(i))),rotation:new THREE.Euler().setFromQuaternion(q).toArray().slice(0,3),allowedBodyParts:shape.allowedBodyParts};});}
  function batchFixed(group){
    const batches=new Map(),inverse=group.matrixWorld.clone().invert();group.traverse(object=>{if(!object.isMesh||object.material.transparent||Array.isArray(object.material))return;for(let ancestor=object;ancestor&&ancestor!==group;ancestor=ancestor.parent)if(ancestor.userData.moving)return;if(!batches.has(object.material))batches.set(object.material,[]);batches.get(object.material).push(object);});
    for(const [material,objects]of batches){if(objects.length<3)continue;const pieces=objects.map(object=>{const g=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld));});const result=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());if(result){geometries.add(result);mesh(group,result,material);objects.forEach(object=>object.removeFromParent());}}
  }

  for(const station of stations.filter(station=>ADDITIONAL_EQUIPMENT_TYPES.has(station.type)||station.type==='reverseFly')){
    const type=station.type,group=new THREE.Group();scene.add(group);group.position.set(station.position.x,0,station.position.z);group.rotation.y=station.rotation||0;
    let footprint={w:2.25,d:2.3},offset=2.55,sampler,loadable=null,grips=null,restPose,records=[];
    const movingGroups=[];
    if(type==='reverseFly'){
      base(group,2.1,2.0,true);pad(group,0,.52,-.09,.53,.11,.45,['pelvis','leftThigh','rightThigh']);rod(group,[0,.12,-.15],[0,.44,-.15],.05,mat.metal);
      pad(group,0,1.03,.28,.18,.48,.10,['torso']);rod(group,[0,.12,.38],[0,1.18,.38],.035,mat.metal);
      const lifts=signs.map(sign=>stack(group,sign*.93,-.65));
      for(const sign of signs){rod(group,[sign*.80,.10,-.60],[sign*.80,2.08,-.60],.045);const points=Array.from({length:28},(_,index)=>{const angle=.10+1.4*index/27;return new THREE.Vector3(sign*(.17+.48*Math.sin(angle)),1.95,.10+.48*Math.cos(angle));});mesh(group,geometry(`reverse-rail:${sign}`,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),27,.025,7,false)),mat.chrome);}
      rod(group,[-.80,2.08,-.60],[.80,2.08,-.60],.045);
      grips=signs.map((_,i)=>makeGrip(group,i));const stalks=signs.map(sign=>rod(group,[sign*.22,1.24,.58],[sign*.22,1.95,.58],.028,mat.metal));stalks.forEach(object=>object.userData.moving=true);
      sampler=effort=>{const pose=upright([0,.70,0]);pose.shoulder[2]=.08;pose.head[2]=.09;const angle=.10+1.4*effort;pose.hands=signs.map(sign=>[sign*(.17+.48*Math.sin(angle)),1.10,.10+.48*Math.cos(angle)]);pose.handDirections=[[0,1,0],[0,1,0]];pose.elbowHints=[[-1,-.1,.5],[1,-.1,.5]];placeGrips(grips,pose);stalks.forEach((object,index)=>{const hand=pose.hands[index],axis=pose.handDirections[index];setRod(object,add(hand,scale(axis,.14)),[hand[0],1.95,hand[2]]);});lifts.forEach(lift=>lift(effort));return pose;};
      footprint={w:2.5,d:2.25};offset=2.5;
    }else if(type==='hipAbduction'||type==='hipAdduction'){
      base(group,1.95,2);chair(group,.755);const lift=stack(group,.93,-.65);grips=signs.map((_,i)=>makeGrip(group,i));for(const sign of signs)rod(group,[sign*.35,.70,-.37],[sign*.40,.855,-.30],.03,mat.metal);
      const legs=signs.map(sign=>{const object=new THREE.Group();group.add(object);object.userData.moving=true;return{group:object,sign,
        pad:pad(object,0,.66,0,.10,.26,.27,[sign<0?'leftThigh':'rightThigh']),
        plate:box(object,0,.055,0,.25,.05,.40,mat.metal,['leftFoot','rightFoot']),
        stem:rod(object,[0,.06,0],[0,.63,0],.025,mat.metal),link:rod(object,[0,.04,-.25],[0,.04,0],.028,mat.metal,['leftFoot','rightFoot'])};});
      sampler=effort=>{
        const open=type==='hipAbduction'?effort:1-effort,pose=upright(),roots=hipRoots(pose),kneeX=.20+.28*open,kneeY=.093+footHeight+lowerLeg;
        pose.knees=roots.map((root,index)=>{const x=signs[index]*kneeX;return[x,kneeY,Math.sqrt(Math.max(.001,upperLeg**2-(x-root[0])**2-(kneeY-root[1])**2))];});
        pose.feet=[];pose.footDirections=[];
        legs.forEach((item,index)=>{const root=roots[index],knee=pose.knees[index],direction=unit([knee[0]-root[0],0,knee[2]-root[2]]),ankle=[knee[0],kneeY-lowerLeg,knee[2]],foot=add(ankle,add(scale(direction,footForward),[0,-footHeight,0]));pose.feet.push(foot);pose.footDirections.push(direction);
          const inward=type==='hipAdduction'?-1:1,access=group.userData.hipAccess||0,accessX=Math.max(0,Math.min(1,(access-1/3)*3))*.50,accessZ=access>2/3?(1-access)*3*.60:access<1/3?access*3*.60:.60,padX=knee[0]+item.sign*.13*inward+item.sign*accessX,postX=padX+item.sign*.06*inward,padZ=knee[2]+accessZ;
          item.pad.position.set(padX,kneeY+.06,padZ);item.plate.position.set(foot[0]-direction[0]*.035,.055,foot[2]-direction[2]*.035);item.plate.rotation.y=Math.atan2(direction[0],direction[2]);
          setRod(item.stem,type==='hipAbduction'?[0,.10,-.40]:[padX,.10,padZ],[padX,kneeY-.06,padZ]);setRod(item.link,[0,.04,-.25],[postX,.04,padZ]);
        });
        pose.kneeHints=pose.knees.map((knee,index)=>knee.map((v,i)=>v-roots[index][i]));pose.handDirections=[[0,0,1],[0,0,1]];lift(effort);placeGrips(grips,pose);return pose;
      };footprint={w:2.4,d:2.25};
    }else if(type==='assistedPullup'||type==='assistedDip'){
      base(group,1.9,2);const lift=stack(group,.94,-.60);
      for(const sign of signs){rod(group,[sign*.73,.10,-.50],[sign*.73,2.45,-.50],.06);rod(group,[sign*.73,2.45,-.50],[sign*.60,2.45,.30],.055);}
      rod(group,[-.73,2.45,-.50],[.73,2.45,-.50],.06);
      box(group,0,.14,.59,.88,.28,.72,mat.metal,['leftFoot','rightFoot']);
      for(let i=0;i<5;i++)box(group,0,.285,.31+i*.13,.78,.012,.025,mat.rubber,['leftFoot','rightFoot'],false);
      const support=new THREE.Group();group.add(support);support.userData.moving=true;
      for(const sign of signs)pad(support,sign*.105,0,.31,.24,.10,.18,[`${sign<0?'left':'right'}Thigh`,`${sign<0?'left':'right'}Shin`]);
      for(const sign of signs)rod(support,[sign*.45,-.075,.40],[sign*.24,-.075,.40],.035,mat.metal);rod(group,[.52,.25,.42],[.52,1.55,.42],.025,mat.chrome);
      grips=signs.map((_,i)=>makeGrip(group,i));
      const supports=signs.map(sign=>type==='assistedPullup'?rod(group,[sign*.60,2.45,.30],[sign*.52,2.12,.06],.035,mat.metal):rod(group,[sign*.60,1.28,.28],[sign*.38,1.28,.18],.035,mat.metal));
      if(type==='assistedDip')for(const sign of signs)rod(group,[sign*.73,1.35,-.5],[sign*.60,1.28,.28],.035,mat.metal);
      sampler=effort=>{
        const hipY=type==='assistedPullup'?1.20+.28*effort:1.24-.18*effort,pose=upright([0,hipY,0]),roots=hipRoots(pose);
        pose.knees=roots.map(root=>add(root,scale(unit([0,-.34,.25]),upperLeg)));
        pose.feet=pose.knees.map(knee=>add(add(knee,scale(unit([0,-.30,-.31]),lowerLeg)),[0,-footHeight,footForward]));
        pose.kneeHints=pose.knees.map((knee,index)=>knee.map((v,i)=>v-roots[index][i]));
        pose.hands=signs.map(sign=>[sign*(type==='assistedPullup'?.40:.38),type==='assistedPullup'?2.12:1.28,.06]);pose.handDirections=type==='assistedPullup'?[[1,0,0],[1,0,0]]:[[0,0,1],[0,0,1]];
        pose.elbowHints=type==='assistedPullup'?[[-1,-.4,.05],[1,-.4,.05]]:[[-1,-.4,-.5],[1,-.4,-.5]];
        support.position.y=pose.knees[0][1]-.11;lift(effort);placeGrips(grips,pose);return pose;
      };footprint={w:2.3,d:2.5};offset=2.7;
    }else if(type==='backExtension'){
      base(group,1.5,2.3,true);
      for(const sign of signs){rod(group,[sign*.57,.10,-.75],[sign*.44,.72,.12],.055,mat.metal);const cushion=cylinder(group,sign*.35,.75,.04,.08,.25,mat.pad);cushion.rotation.z=Math.PI/2;cushion.userData.solid={shape:'capsule',radius:.08,allowedBodyParts:['pelvis','leftThigh','rightThigh']};
        for(const end of [-1,1])mesh(group,geometry('hip-pad-end',()=>new THREE.SphereGeometry(.08,14,10)),mat.pad,sign*.35+end*.125,.75,.04);
        cushion.userData.solid.height=.25;
        const roll=cylinder(group,sign*.17,.25,-.56,.075,.32,mat.pad);roll.rotation.z=Math.PI/2;roll.userData.solid={shape:'capsule',radius:.075,height:.32,allowedBodyParts:['leftShin','rightShin']};}
      box(group,0,.05,-.42,.90,.06,.52,mat.metal,['leftFoot','rightFoot']);
      sampler=effort=>{const angle=.72-1.07*effort,hip=[0,.88,0],axis=[0,Math.sin(angle),Math.cos(angle)],pose={hip,shoulder:add(hip,scale(axis,torso)),head:add(hip,scale(axis,torso+headSpan)),hands:[[-.30,.96,.11],[.30,.96,.11]],feet:[[-.15,.093,-.30],[.15,.093,-.30]],elbowHints:[[-1,.1,.1],[1,.1,.1]],kneeHints:[[0,0,1],[0,0,1]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],handNormals:[[0,-1,0],[0,-1,0]],gripping:false,relaxedHands:true};return pose;};
      footprint={w:1.7,d:2.3};offset=2.35;
    }else if(type==='preacherCurl'){
      base(group,2,1.9,true);pad(group,0,.535,-.09,.53,.11,.45,['pelvis','leftThigh','rightThigh']);rod(group,[0,.12,-.15],[0,.475,-.15],.05,mat.metal);const armPad=pad(group,0,.984,.054,.78,.11,.28,['leftUpperArm','rightUpperArm','torso']);armPad.rotation.x=.85;
      for(const sign of signs){rod(group,[sign*.85,.12,-.45],[sign*.85,.85,-.45],.045,mat.metal);rod(group,[sign*.85,.85,-.45],[sign*.40,.85,.054],.045,mat.metal);}grips=signs.map((_,i)=>makeGrip(group,i));loadable=plateHorns(group);
      const levers=signs.map(sign=>rod(group,[sign*.70,.965,.223],[sign*.70,.8,.47],.035,mat.metal));levers.forEach(object=>object.userData.moving=true);
      const shaftParts=[rod(group,[-.70,.8,.4],[-.27,.8,.4],.021,mat.chrome),rod(group,[-.07,.8,.4],[.07,.8,.4],.021,mat.chrome),rod(group,[.27,.8,.4],[.70,.8,.4],.021,mat.chrome)];shaftParts.forEach(object=>object.userData.moving=true);
      sampler=effort=>{const pose=upright([0,.70,0]);pose.shoulder[2]=.05;pose.head[2]=.065;const roots=armRoots(pose);pose.elbows=roots.map((root,index)=>add(root,scale(unit([signs[index]*.04,-.75,.66]),metrics.arms[index].upper)));const angle=-.65+1.85*effort;
        pose.hands=pose.elbows.map((elbow,index)=>add(elbow,scale(unit([0,Math.sin(angle),Math.cos(angle)]),metrics.arms[index].lower+metrics.arms[index].palmLength-.017)));
        pose.handDirections=[[1,0,0],[1,0,0]];placeGrips(grips,pose);levers.forEach((lever,index)=>{const elbow=pose.elbows[index],hand=pose.hands[index],x=signs[index]*.70;setRod(lever,[x,elbow[1],elbow[2]],[x,hand[1],hand[2]]);loadable.horns[index].position.set(x,hand[1],hand[2]);});const y=pose.hands[0][1],z=pose.hands[0][2];[[-.70,-.27],[-.07,.07],[.27,.70]].forEach(([a,b],index)=>setRod(shaftParts[index],[a,y,z],[b,y,z]));return pose;
      };footprint={w:2.6,d:2.15};
    }else if(type==='lyingChestPress'||type==='declineChestPress'){
      const decline=type==='declineChestPress',tilt=decline?-.22:0,benchTop=.55,padY=benchTop+Math.tan(-tilt)*(-.57)-.065*Math.cos(tilt);
      base(group,2.6,2.6,true);const cushion=pad(group,0,padY,-.37,.52,.13,1.14,['torso','pelvis','head']);cushion.rotation.x=tilt;
      rod(group,[0,.16,-.78],[0,.16,.27],.04);for(const z of [-.76,.25])rod(group,[0,.06,z],[0,benchTop+Math.tan(-tilt)*(z-.20)-.11,z],.04,mat.chrome);
      grips=signs.map((_,i)=>makeGrip(group,i));loadable=plateHorns(group);
      const links=signs.map(sign=>[rod(group,[sign*.95,.5,-.6],[sign*.95,.9,0],.045,mat.metal),rod(group,[sign*.95,.9,0],[sign*.4,1,.1],.04,mat.metal)]);links.flat().forEach(object=>object.userData.moving=true);
      sampler=effort=>{const hip=[0,.675,.20],rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),tilt),axis=read([0,0,-1]).applyQuaternion(rotation).toArray(),pose={hip,shoulder:add(hip,scale(axis,torso)),head:add(add(hip,scale(axis,torso+headSpan)),read([0,.015,0]).applyQuaternion(rotation).toArray()),feet:[[-.23,.013,.80],[.23,.013,.80]],elbowHints:[[-1,1,0],[1,1,0]],kneeHints:[[0,1,1],[0,1,1]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],handDirections:[[1,0,0],[1,0,0]],lying:true,gripping:true};
        const roots=armRoots(pose);pose.elbows=roots.map((root,index)=>add(root,scale(read(unit(mixPoint([signs[index]*.81,-.29,.51],[signs[index]*.13,.99,.04],effort))).applyQuaternion(rotation).toArray(),metrics.arms[index].upper)));
        pose.hands=pose.elbows.map((elbow,index)=>add(elbow,scale(read(unit(mixPoint([0,1,0],[-signs[index]*.07,.997,0],effort))).applyQuaternion(rotation).toArray(),metrics.arms[index].lower+metrics.arms[index].palmLength-.017)));
        placeGrips(grips,pose);links.forEach((pair,index)=>{const sign=signs[index],pivot=read([sign*.95,.5,-.6]),end=read(pose.hands[index]).addScaledVector(read(pose.handDirections[index]),sign*.14),delta=end.clone().sub(pivot),distance=delta.length(),direction=delta.normalize(),pole=new THREE.Vector3(sign,0,0).addScaledVector(direction,-sign*direction.x).normalize(),a=.70,b=.66,along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along)),joint=pivot.clone().addScaledVector(direction,along).addScaledVector(pole,height);setRod(pair[0],pivot.toArray(),joint.toArray());setRod(pair[1],joint.toArray(),end.toArray());loadable.horns[index].position.copy(joint).add(new THREE.Vector3(sign*.12,0,0));});return pose;
      };footprint={w:3.3,d:3.0};offset=2.8;
    }
    if(!sampler)continue;
    label?.(group,station.number,-.65,1.60,-.65,{width:.4,height:.25,color:'#c7e2a2',size:72});
    let lastPose,contacts;
    const machine={station,group,type,footprint,interaction:new THREE.Vector3(station.position.x,0,station.position.z+offset),get contacts(){return contacts;},
      update(effort=0){lastPose=sampler(Math.max(0,Math.min(1,effort)));contacts={hands:lastPose.hands.map(point=>[...point]),feet:lastPose.feet.map(point=>[...point])};return lastPose;},
      sampleActivity(phase=0,cycle=0){const p=Math.max(0,Math.min(1,phase)),u=p<.44?p/.44:1-(p-.44)/.56;return this.update(inertialCurlEffort(`machine-${station.id}`,p,cycle)??smooth(u));},
      getActualContacts:()=>contacts,
      getActualGripAxes:()=>grips?grips.map(grip=>new THREE.Vector3(1,0,0).applyQuaternion(grip.quaternion).toArray()):[null,null],
      getCollisionVolumes:()=>volumesFor(group,records),
      getSetup(){return{exerciseId:`machine-${station.id}`,stationId:station.id,origin:group.position.toArray(),rotation:group.rotation.y,duration:6,attachmentId:station.plateLoaded?'plate-loaded-mechanism':'machine-handles',setupLabel:station.name,cameraYaw:1.0,cameraPitch:.30,cameraDistance:type.startsWith('assisted')?5.4:5,cameraTargetHeight:type.startsWith('assisted')?1.3:.95,entryReadyPose:copy(restPose),approachOffset:[0,0,offset]};},
    };
    if(loadable){machine.setPlateLoad=kg=>{if(!loadable.set(kg))return false;records=[...records.filter(record=>!record.object.userData.plate),...collisionRecords(group).filter(record=>record.object.userData.plate)];return true;};machine.getPlateLoad=loadable.get;machine.getPlateState=loadable.state;machine.getEquipmentSettings=()=>({plateLoadKg:loadable.get()});machine.getEquipmentOptions=()=>({adjustments:machineAdjustmentsFor(type,{plateLoaded:true}),benchAngles:[],handleOptions:[]});machine.setEquipmentSettings=patch=>{const current=machine.getEquipmentSettings(),next=validateCalibrationPatch(machineAdjustmentsFor(type,{plateLoaded:true}),current,patch);if(!next)return{ok:false,reason:'unsupported-setting',settings:current};const changed=next.plateLoadKg!==current.plateLoadKg;if(changed)machine.setPlateLoad(next.plateLoadKg);return{ok:true,changed,settings:machine.getEquipmentSettings()};};}
    machine.update(0);restPose=copy(lastPose);records=collisionRecords(group);batchFixed(group);machine.update(0);
    collider(station.position.x,station.position.z,footprint.w,footprint.d);
    machine._metrics=metrics;machine._restPose=restPose;
    if(type==='hipAdduction')machine.setHipAccess=value=>{group.userData.hipAccess=Math.max(0,Math.min(1,value));};
    const lifecycle=(type==='hipAbduction'||type==='hipAdduction'?createHipMachineLifecycle:createAdditionalLifecycle)({machine,metrics,restPose});machine.getLifecycle=()=>copy(lifecycle.meta);machine.sampleLifecycle=(direction,u)=>lifecycle.sample(direction,u);
    machines.set(station.id,machine);
  }
  return {machines};
}

/** Keep one installed butterfly station while swapping its compatible facing,
 * chest pad and overhead handles for the reverse-fly movement. */
export function applyAdditionalVariants(machines,options){
  const base=machines.get('pec-deck');if(!base)return machines;
  const definition={...base.station,type:'reverseFly',rotation:Math.PI};
  const reverse=createAdditionalEquipment({...options,stations:[definition]}).machines.get('pec-deck');
  reverse.group.visible=false;reverse.group.position.copy(base.group.position);
  let reverseActive=false;
  const isReverse=id=>id==='machine-reverse-fly';
  const select=id=>{reverseActive=isReverse(id);reverse.group.visible=reverseActive;base.group.visible=!reverseActive;reverse.group.position.copy(base.group.position);};
  const wrapper={...base,group:base.group,station:base.station,
    getBatchRoots(){return[base.group,reverse.group];},
    beginActivity(id){select(id);},endActivity(){select(null);},
    getSetup(id){const result=(isReverse(id)?reverse:base).getSetup(id);return{...result,exerciseId:id||result.exerciseId};},
    getEquipmentOptions(id){return isReverse(id)?{adjustments:[],benchAngles:[],handleOptions:[]}:base.getEquipmentOptions?.(id)||{adjustments:[],benchAngles:[],handleOptions:[]};},
    getEquipmentSettings(id){return isReverse(id)?{}:base.getEquipmentSettings?.(id)||{};},
    setEquipmentSettings(settings,id){return isReverse(id)?{ok:false,reason:'unsupported-setting',settings:{}}:base.setEquipmentSettings?.(settings,id)||{ok:false,reason:'unsupported-setting',settings:{}};},
    sampleActivity(phase,cycle,id){select(id);return(reverseActive?reverse:base).sampleActivity(phase,cycle,id);},
    getActualContacts(){return(reverseActive?reverse:base).getActualContacts();},
    getActualGripAxes(){return(reverseActive?reverse:base).getActualGripAxes();},
    getCollisionVolumes(){return(reverseActive?reverse:base).getCollisionVolumes();},
    getVisualGroup(){return(reverseActive?reverse:base).group;},
    getLifecycle(id){return(isReverse(id)?reverse:base).getLifecycle?.(id);},
    sampleLifecycle(direction,u,id){select(id);return(reverseActive?reverse:base).sampleLifecycle?.(direction,u,id);},
  };
  Object.defineProperty(wrapper,'contacts',{get(){return(reverseActive?reverse:base).getActualContacts();}});
  machines.set('pec-deck',wrapper);return machines;
}

