import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const copy=value=>structuredClone(value);
/** Rotate the upper body and its held weights as a rigid contact-space frame.
 * Feet keep their authored floor targets; the leg IK still has fixed bones. */
export function rotateBenchUpperBody({THREE,pose,angle,pivot=pose.hip}){
  const result=copy(pose),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle*Math.PI/180),origin=new THREE.Vector3(...pivot);
  const point=p=>new THREE.Vector3(...p).sub(origin).applyQuaternion(q).add(origin).toArray();
  const direction=p=>p?new THREE.Vector3(...p).applyQuaternion(q).toArray():p;
  for(const key of ['hip','shoulder','head'])if(result[key])result[key]=point(result[key]);
  for(const key of ['hands','elbows'])if(result[key])result[key]=result[key].map(point);
  for(const key of ['handDirections','handAdvances','handNormals','elbowHints'])if(result[key])result[key]=result[key].map(direction);
  result.benchAngle=angle;return result;
}

/** The default flat stage is left intact. This separate configured stage
 * shares its immutable DB meshes and materials, with a real angled backrest. */
export function createInclineBenchStage({THREE,scene,flat,angle=30,geometries}){
  const radians=angle*Math.PI/180,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),radians),pivot=new THREE.Vector3(0,.675,.20);
  // At a shallow incline the back pad still supports the pelvis. Tilt the
  // fixed-size seat down at its rear while keeping its rounded front under
  // the upper thighs, instead of lifting its rear into the lower-back path.
  // Thirty degrees and steeper retain the original qualified seat geometry.
  const seatTilt=angle<30?-(1-angle/30)*15*Math.PI/180:0;
  const seatHeight=angle<30?.55+.013*(1-angle/30)-.065*Math.cos(seatTilt)-.135*Math.abs(Math.sin(seatTilt)):.485;
  const transform=p=>new THREE.Vector3(...p).sub(pivot).applyQuaternion(q).add(pivot).toArray();
  const group=new THREE.Group();group.name=`exercise:dumbbell-bench-press:incline-${angle}`;group.userData.noStaticBatch=true;group.position.fromArray(flat.origin);group.rotation.y=flat.rotation;group.visible=false;scene.add(group);
  // The original builder owns seven fixed bench meshes, then two DB groups.
  // Explicit checks avoid accidentally including a later lifecycle tray.
  if(flat.group.children.length<9||!flat.weights||flat.weights.length!==2)throw new Error('Flat DB bench structure is incomplete');
  for(let i=0;i<7;i++){
    const part=flat.group.children[i].clone();if(!part.isMesh)throw new Error('Unexpected fixed DB bench part');
    if(i<2){part.position.fromArray(transform(part.position.toArray()));part.quaternion.premultiply(q);}group.add(part);
  }
  const seatGeometry=new RoundedBoxGeometry(.52,.13,.27,1,.045);geometries.add(seatGeometry);
  const seat=new THREE.Mesh(seatGeometry,flat.group.children[0].material);seat.position.set(0,seatHeight,.20);seat.rotation.x=seatTilt;seat.castShadow=seat.receiveShadow=true;group.add(seat);
  const weights=flat.weights.map(weight=>{const object=weight.clone(true);group.add(object);return object;});
  const staticVolumes=flat.staticVolumes.filter(v=>!v.id.startsWith('lifecycle-')).map(v=>{
    const volume=copy(v);if(v.id==='bench-pad'){volume.position=transform(v.position);volume.rotation=[radians,0,0];}return volume;
  });
  staticVolumes.push({id:'incline-seat-pad',shape:'box',position:[0,seatHeight,.20],size:[.52,.13,.27],...(seatTilt?{rotation:[seatTilt,0,0]}:{}),allowedBodyParts:['pelvis','leftThigh','rightThigh']});
  const stage={...flat,group,weights,staticVolumes,dynamicVolumes:[],configurationKey:`bench-${angle}`,benchAngle:angle,pose:null,entryReadyPose:null};
  stage.setWeights=pose=>{
    stage.dynamicVolumes=[];
    weights.forEach((weight,index)=>{
      const point=pose.hands[index],axis=new THREE.Vector3(...pose.handDirections[index]).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),axis);
      weight.position.fromArray(point);weight.quaternion.copy(rotation);
      for(const sign of [-1,1])stage.dynamicVolumes.push({id:`${index?'right':'left'}-dumbbell-${sign}`,shape:'box',position:new THREE.Vector3(...point).addScaledVector(axis,sign*.165).toArray(),size:[.075,.23,.23],rotation:new THREE.Euler().setFromQuaternion(rotation).toArray().slice(0,3),allowedBodyParts:[index?'rightHand':'leftHand']});
    });
  };
  stage.sample=(phase,cycle)=>{const pose=rotateBenchUpperBody({THREE,pose:flat.sample(phase,cycle),angle});stage.setWeights(pose);stage.pose=pose;return pose;};
  stage.pose=stage.sample(0,0);stage.entryReadyPose=copy(stage.pose);return stage;
}
