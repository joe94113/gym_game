import {adaptDumbbellGrip} from './dumbbell-grip.js';
import {installCableCalibration} from './equipment-calibration-v013.js';
const copy=value=>structuredClone(value);

/** A separately configured, fixed-width overhand bar. The rope stage is
 * unchanged and supplies the already-authored elbow-extension timing only. */
export function createStraightBarPushdownStage({THREE,scene,source,metrics,geometries}){
  const group=new THREE.Group();group.name='exercise:rope-pushdown:straight-bar';group.userData.noStaticBatch=true;group.position.fromArray(source.origin);group.rotation.y=source.rotation;group.visible=false;scene.add(group);
  if(source.group.children[27]?.geometry?.parameters?.radiusTop!==.09)throw new Error('Cable frame layout changed');
  for(const part of source.group.children.slice(0,29))group.add(part.clone());
  const material=source.group.children[28].material;
  const cylinder=(radius,length)=>{const geometry=new THREE.CylinderGeometry(radius,radius,length,16);geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;};
  const bar=cylinder(.016,.80);bar.rotation.z=Math.PI/2;
  const cable=cylinder(.009,1),anchorArray=[0,2.24,1.04],anchor=new THREE.Vector3(...anchorArray),up=new THREE.Vector3(0,1,0);
  cable.name='calibrated-cable';
  const stage={...source,group,weights:undefined,configurationKey:'straight-bar',handle:'straight-bar',attachmentId:'straight-bar',configurationLabel:'高滑輪・直桿',staticVolumes:source.staticVolumes.filter(v=>!v.id.startsWith('attachment-')).map(copy),dynamicVolumes:[],gearObjects:[bar],gearContacts:[],propPositions:[],pose:null};
  group.children[27].position.y=2.24;group.children[28].position.y=2.24;
  installCableCalibration({THREE,stage,anchor:anchorArray,pulleyParts:[group.children[27],group.children[28]],rod:(parent,a,b,r,m)=>{const object=cylinder(r,1);object.material=m;const delta=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));object.position.fromArray(a).addScaledVector(delta,.5);object.scale.y=delta.length();object.quaternion.setFromUnitVectors(up,delta.normalize());return object;},mat:{chrome:material,rubber:material}});
  stage.setGearPose=pose=>{
    const center=pose.hands[0].map((v,i)=>(v+pose.hands[1][i])/2);bar.position.fromArray(center);stage.barCenter=center;stage.propPositions=[copy(center)];
    anchor.fromArray(anchorArray);const end=new THREE.Vector3(...center).add(new THREE.Vector3(0,.025,0)),delta=end.clone().sub(anchor);cable.position.copy(anchor).addScaledVector(delta,.5);cable.scale.y=Math.max(.00001,delta.length());cable.quaternion.setFromUnitVectors(up,delta.normalize());
    stage.dynamicVolumes=[{id:'straight-pushdown-bar',shape:'capsule',start:[-.40,center[1],center[2]],end:[.40,center[1],center[2]],radius:.016,allowedBodyParts:['leftHand','rightHand']}];return end.toArray();
  };
  stage.adaptHandPose=raw=>{
    const result=adaptDumbbellGrip({id:'straight-bar-pushdown',metrics,raw,lifecycle:true,mask:[true,true]});
    for(let side=0;side<2;side++){
      const strength=raw.handGripStrength?.[side]??(raw.handGripping?.[side]?1:0),clearance=.012*(raw.dbGripWeight||0)*(1-strength);
      if(clearance){result.pose.hands[side][2]-=clearance;result.contactTargets[side]=copy(result.pose.hands[side]);}
    }
    stage.gearContacts=result.contactTargets;return result.pose;
  };
  stage.sample=(phase,cycle)=>{
    const raw=copy(source.sample(phase,cycle)),u=phase<=.44?phase/.44:(1-phase)/.56,e=u*u*(3-2*u),angle=1.35-.75*e;
    const upper=metrics.arms[0].upper,lower=metrics.arms[0].lower+metrics.arms[0].palmLength-.005,elbowY=metrics.neutral.shoulder[1]-Math.sqrt(upper*upper-.059*.059-.020*.020),elbowZ=metrics.neutral.shoulder[2]+.020;
    raw.hands=[[-.24,elbowY-lower*Math.cos(angle),elbowZ+lower*Math.sin(angle)],[.24,elbowY-lower*Math.cos(angle),elbowZ+lower*Math.sin(angle)]];raw.handDirections=[[1,0,0],[-1,0,0]];raw.handAdvances=undefined;raw.handNormals=undefined;raw.elbows=undefined;raw.elbowHints=[[-.5,-1,.12],[.5,-1,.12]];raw.handGripping=[true,true];raw.handGripStrength=[1,1];raw.dbGripWeight=1;raw.dbNaturalGrip=1;
    stage.setGearPose(raw);stage.pose=raw;return raw;
  };
  stage.pose=stage.sample(0,0);stage.entryReadyPose=copy(stage.pose);return stage;
}
