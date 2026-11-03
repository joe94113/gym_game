import * as THREE from 'three';
import {buildLocomotionPose} from '../locomotion.js';
import {solveHandContactFrame} from '../hand-contact-frame.js';
import {bodyCollisionProxies} from '../collision-validation.js';
import {floorHeightAt} from '../gym-layout.js';

const V=p=>new THREE.Vector3(...p),A=v=>v.toArray(),C=value=>structuredClone(value),UP=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0),Z=new THREE.Vector3(0,0,1);
const clamp=value=>Math.max(0,Math.min(1,value)),ease=value=>{value=clamp(value);return value*value*(3-2*value);},mix=(a,b,t)=>a.map((value,index)=>value+(b[index]-value)*t),add=(a,b)=>a.map((value,index)=>value+b[index]);
export const AERIAL_MOTIONS=Object.freeze(['aerial-standing-reach','aerial-assisted-hinge','aerial-hinge-hold','aerial-side-left','aerial-side-right','aerial-recovery','aerial-supported-seat','aerial-supported-inversion']);
export const AERIAL_AIR_MOTIONS=Object.freeze(['aerial-supported-seat','aerial-supported-inversion']);

/** Authored kinematic support state. A seek evaluates this state directly;
 * neither actor pose nor cloth depends on the order of previously seen frames. */
export function aerialFlightState(frame={}){
 if(!AERIAL_AIR_MOTIONS.includes(frame.motionId))return{mount:0,angle:0,progress:0,supported:false};
 const progress=clamp(frame.progress??(frame.localSeconds!==undefined&&frame.block?.seconds?frame.localSeconds/frame.block.seconds:frame.repPhase??frame.phase??0));
 const ramp=frame.motionId==='aerial-supported-inversion'?.20:.22;
 let mount=ease(progress/ramp)*ease((1-progress)/ramp),angle=frame.motionId==='aerial-supported-inversion'?-Math.PI*5/6*ease((progress-.20)/.20)*ease((.80-progress)/.20):0;
 // Legacy finite-pose probes supply only envelope, while real course frames
 // have a block clock. Both keep the common ready pose at envelope zero.
 if(frame.envelope===0&&!frame.returning){mount=0;angle=0;}
 if(frame.joining){mount*=ease((frame.joinProgress||0)/.4);angle*=ease(((frame.joinProgress||0)-.4)/.6);}
 if(frame.returning){const u=clamp(frame.returnProgress||0);angle*=1-ease(u/.6);mount*=1-ease((u-.6)/.4);}
 return{mount,angle,progress,supported:mount>.001};
}

export function createAerialSuspensionProgram({metrics,group,materials={},geometries=new Set(),extraMaterials=new Set()}){
 const n=metrics.neutral,torso=V(n.shoulder).sub(V(n.hip)),headOffset=V(n.head).sub(V(n.hip)),neutral=buildLocomotionPose(metrics,0,0),floorOffset=floorHeightAt(group.position.x,group.position.z)-group.position.y;
 const material=(name,color,options={})=>{if(materials[name])return materials[name];const value=new THREE.MeshStandardMaterial({color,roughness:.75,...options});extraMaterials.add(value);return value;};
 const fabric=material('aerialFabric','#9a72a3',{side:THREE.DoubleSide}),steel=material('chrome','#b6c7bf'),graphite=material('graphite','#293a35');
 const localGeometry=new Map(),geometry=(key,create)=>{if(!localGeometry.has(key)){const value=create();geometries.add(value);localGeometry.set(key,value);}return localGeometry.get(key);};
 const mesh=(geometry,material)=>{const value=new THREE.Mesh(geometry,material);value.castShadow=value.receiveShadow=true;group.add(value);return value;};
 const rod=(radius,material)=>mesh(geometry(`rod:${radius}`,()=>new THREE.CylinderGeometry(radius,radius,1,10)),material);
 const place=(object,start,end)=>{const a=V(start),b=V(end),delta=b.clone().sub(a);object.position.copy(a).lerp(b,.5);object.scale.y=Math.max(.00001,delta.length());object.quaternion.setFromUnitVectors(UP,delta.normalize());};
 const anchors=[[-.70,2.65+floorOffset,1.35],[.70,2.65+floorOffset,1.35]],fixed=[];
 const railStart=[-.75,2.65+floorOffset,1.35],railEnd=[.75,2.65+floorOffset,1.35],rail=rod(.035,graphite);place(rail,railStart,railEnd);fixed.push({id:'aerial-ceiling-rail',shape:'capsule',start:railStart,end:railEnd,radius:.035,allowedBodyParts:[]});
 for(let i=0;i<2;i++){const top=[anchors[i][0],3.55+floorOffset,anchors[i][2]],hanger=rod(.022,steel),spreadStart=add(anchors[i],[0,0,-.10]),spreadEnd=add(anchors[i],[0,0,.10]),spreader=rod(.02,steel);place(hanger,anchors[i],top);place(spreader,spreadStart,spreadEnd);fixed.push({id:`aerial-ceiling-hanger-${i}`,shape:'capsule',start:anchors[i],end:top,radius:.022,allowedBodyParts:[]},{id:`aerial-ceiling-spreader-${i}`,shape:'capsule',start:spreadStart,end:spreadEnd,radius:.02,allowedBodyParts:[]});}
 const grips=[rod(.018,fabric),rod(.018,fabric)],gripStraps=[rod(.015,fabric),rod(.015,fabric)],gripBranches=[rod(.012,fabric),rod(.012,fabric)];
 const NX=9,NZ=5,count=NX*NZ,positions=new Float64Array(count*3),previous=new Float64Array(count*3),targets=new Float64Array(count*3),pinned=new Uint8Array(count),indices=[],links=[];
 const at=(i,j)=>j*NX+i;
 for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const index=at(i,j);if(i===0||i===NX-1)pinned[index]=1;else if(Math.abs(i/(NX-1)*2-1)<=.5)pinned[index]=2;if(i<NX-1)links.push([index,at(i+1,j)]);if(j<NZ-1)links.push([index,at(i,j+1)]);if(i<NX-1&&j<NZ-1){links.push([index,at(i+1,j+1)],[at(i+1,j),at(i,j+1)]);indices.push(index,at(i+1,j),at(i,j+1),at(i+1,j),at(i+1,j+1),at(i,j+1));}}
 const clothGeometry=new THREE.BufferGeometry();clothGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));clothGeometry.setIndex(indices);geometries.add(clothGeometry);const cloth=mesh(clothGeometry,fabric);cloth.name='aerial-load-bearing-hammock';cloth.userData.aerialSupport=true;
 let dynamic=[],lastPose=null,lastContacts=null,lastFlight={mount:0,angle:0},lastHeld=false,solverTicks=0,solverActiveTicks=0,diagnostics={},cachedKey=null,parkedFrames=null;
 const groundPose=frame=>{
  const id=frame.motionId||'aerial-recovery',wave=.5-.5*Math.cos(clamp(frame.repPhase||0)*Math.PI*2),weight=clamp(frame.envelope??1)*clamp(frame.intensity??1),hinge=(id==='aerial-assisted-hinge'?wave:id==='aerial-hinge-hold'?.65:0)*weight,reach=id==='aerial-standing-reach'?wave*weight:0,side=(id==='aerial-side-left'?-1:id==='aerial-side-right'?1:0)*weight,q=new THREE.Quaternion().setFromAxisAngle(X,.35*hinge),hip=[.025*side,n.hip[1]-.025-.04*hinge,-.10*hinge];
  return{hip,shoulder:A(torso.clone().applyQuaternion(q).add(V(hip))),head:A(headOffset.clone().applyQuaternion(q).add(V(hip))),feet:[[-.18,.013,.15],[.18,.013,.15]],kneeHints:[[0,0,1],[0,0,1]],footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],hands:[[-.34,1.13-.08*hinge+.035*reach+.020*Math.max(0,-side),.43+.04*hinge],[.34,1.13-.08*hinge+.035*reach+.020*Math.max(0,side),.43+.04*hinge]],handDirections:[[1,0,0],[1,0,0]],elbowHints:[[-1,-.1,.5],[1,-.1,.5]],gripping:true,handGripping:[true,true],handGripStrength:[1,1]};
 };
 // Unheld handles hang above the approach corridor. Reach up to grasp
 // them first, then lower them into the existing ready position.
 const ready=groundPose({}),park=ready.hands.map(point=>add(point,[0,.47,-.13]));
 function flightPose(frame){
  const state=aerialFlightState(frame),m=state.mount,q=new THREE.Quaternion().setFromAxisAngle(X,state.angle),ground=groundPose({...frame,motionId:'aerial-recovery',envelope:0}),forward=ease(m/.38),lift=ease((m-.28)/.72),hip=[0,n.hip[1]-.025-.05*Math.sin(forward*Math.PI)+(1.04-(n.hip[1]-.025))*lift,.65*forward];
  const pose={...ground,hip,bodyQuaternion:q.toArray(),shoulder:A(torso.clone().applyQuaternion(q).add(V(hip))),head:A(headOffset.clone().applyQuaternion(q).add(V(hip))),hands:[],feet:[],elbowHints:[],kneeHints:[],footDirections:[],footNormals:[],aerialFlight:C(state)};
  for(let i=0;i<2;i++){
   const sign=i?1:-1,groundFoot=[sign*.18,.013,.15+.50*forward],airFoot=V([sign*.46,-.50,.53]).applyQuaternion(q).add(V(hip));pose.feet.push(mix(groundFoot,A(airFoot),lift));
   pose.hands.push(mix(ground.hands[i],A(V([sign*.40,.22,.30]).applyQuaternion(q).add(V(hip))),ease(m/.45)));
   pose.elbowHints.push(A(V(mix([sign,-.1,.5],[sign*.15,-.15,1],ease(m/.4))).applyQuaternion(q)));
   pose.kneeHints.push(A(V(mix([0,0,1],[0,1,0],lift)).normalize().applyQuaternion(q)));
   pose.footDirections.push(A(Z.clone().applyQuaternion(q)));pose.footNormals.push(A(UP.clone().applyQuaternion(q)));
  }
  return pose;
 }
 function calibrated(raw){const pose=C(raw);for(const key of ['hip','shoulder','head'])pose[key][1]+=floorOffset;for(const key of ['hands','feet','elbows','knees'])if(pose[key])pose[key]=pose[key].map(point=>add(point,[0,floorOffset,0]));pose.aerialCalibrated=true;return pose;}
 function twoBone(root,target,upper,lower,hint){const delta=target.clone().sub(root),distance=THREE.MathUtils.clamp(delta.length(),Math.abs(upper-lower)+.00001,upper+lower-.00001),axis=delta.normalize(),bend=hint.clone().addScaledVector(axis,-hint.dot(axis)).normalize(),along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));return root.clone().addScaledVector(axis,along).addScaledVector(bend,height);}
 function bodyOf(pose){
  const hip=V(pose.hip),q=pose.bodyQuaternion?new THREE.Quaternion(...pose.bodyQuaternion):new THREE.Quaternion().setFromUnitVectors(torso.clone().normalize(),V(pose.shoulder).sub(hip).normalize()),body={shoulders:[],elbows:[],wrists:[],hands:C(pose.hands),hips:[],knees:[],ankles:[],feet:C(pose.feet)};
  for(let i=0;i<2;i++){
   const root=torso.clone().add(V(metrics.arms[i].shoulderOffset)).applyQuaternion(q).add(hip),frame=solveHandContactFrame(metrics,pose,i);body.shoulders.push(A(root));body.elbows.push(frame.elbow);body.wrists.push(frame.wrist);
   const leg=metrics.legs[i],legRoot=V(leg.hipOffset).applyQuaternion(q).add(hip),normal=V(pose.footNormals?.[i]||[0,1,0]),forward=V(pose.footDirections?.[i]||[0,0,1]),footQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(normal,forward).normalize(),normal,forward)),ankle=V(pose.feet[i]).sub(V(leg.footContactOffset).applyQuaternion(footQ)),knee=twoBone(legRoot,ankle,leg.upper,leg.lower,V(pose.kneeHints?.[i]||[0,0,1]));body.hips.push(A(legRoot));body.knees.push(A(knee));body.ankles.push(A(ankle));
  }
  return body;
 }
 const supportAllowed=['pelvis','leftThigh','rightThigh'];
 function targetCloth(pose,mount){
  const q=pose.bodyQuaternion?new THREE.Quaternion(...pose.bodyQuaternion):new THREE.Quaternion(),approach=ease(mount/.15),hip=V(mix([0,1.04+floorOffset,-.30],pose.hip,approach));
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
   const u=i/(NX-1)*2-1,v=j/(NZ-1)-.5,side=u<0?0:1,sign=side?1:-1,inside=Math.abs(u)<=.5,t=clamp((Math.abs(u)-.5)/.5),x=inside?u*.60:sign*.30,lift=ease((mount-.28)/.72),z=-.22+(v+.5)*(.10+.24*lift),anterior=ease((z+.18)/.30);
   // The authored GLB's outer shorts/thigh surface reaches 102.6 mm below
   // its pelvis in the seated support pose. A shallow saddle clears that
   // outer surface; the front edge folds down while the thighs are lowered
   // during boarding. These centimetre-scale bounds are calibrated offline,
   // so four class actors never reskin the full GLB for cloth contact.
   const pouchY=-.110+.018*(x/.30)**2-.014*(v/.5)**2-.38*(1-lift)*anterior;
   const local=new THREE.Vector3(x,pouchY,z),point=local.applyQuaternion(q).add(hip);
   // A low, rounded load pouch is separate in material coordinates from the
   // rising gathered side panels. The latter stay outside the torso instead
   // of drawing a broad curtain through the shoulders on the way to the rail.
   if(!inside){const gathered=V([sign*.30,-.10,-.20+v*.06]).applyQuaternion(q).add(hip),anchor=V(anchors[side]).add(new THREE.Vector3(0,0,v*.08));point.lerp(gathered,Math.min(1,t*3));point.lerp(anchor,t);if(t<1)point.x+=sign*.014*Math.cos(j*Math.PI);}
   const index=at(i,j)*3;targets[index]=point.x;targets[index+1]=point.y;targets[index+2]=point.z;
  }
 }
 // A coarse guide edge contains folded fabric, so compression is allowed and
 // only its material-length upper bound is constrained. It is not a rubber
 // spring that forces every visible straight span to equal a resting chord.
 const materialLengthFactor=3.2;
 // Material width belongs to the opened pouch, not its folded boarding
 // state. Folding changes the visible chord without shrinking the fabric.
 targetCloth(calibrated(flightPose({motionId:'aerial-supported-seat',progress:.5})),1);const restLengths=links.map(([a,b])=>Math.hypot(targets[a*3]-targets[b*3],targets[a*3+1]-targets[b*3+1],targets[a*3+2]-targets[b*3+2])*materialLengthFactor);
 const supportNode=index=>Math.abs((index%NX)/(NX-1)*2-1)<=.26;
 // The pouch and its gathered lower side seams can contact pelvis/thigh.
 // The upper rail panels are a separate, non-contact material region.
 const supportRegion=index=>Math.abs((index%NX)/(NX-1)*2-1)<=.75;
 function pushOut(index,body,margin=.018){
  if(pinned[index])return;const at=index*3;let px=positions[at],py=positions[at+1],pz=positions[at+2];
  for(const capsule of body){const ax=capsule.start[0],ay=capsule.start[1],az=capsule.start[2],dx=capsule.end[0]-ax,dy=capsule.end[1]-ay,dz=capsule.end[2]-az,denom=dx*dx+dy*dy+dz*dz,t=denom?clamp(((px-ax)*dx+(py-ay)*dy+(pz-az)*dz)/denom):0,cx=ax+dx*t,cy=ay+dy*t,cz=az+dz*t,x=px-cx,y=py-cy,z=pz-cz,length=Math.hypot(x,y,z),minimum=capsule.radius+margin;if(length<minimum){const sign=px<0?-1:1,desired=cx+sign*(Math.sqrt(Math.max(0,minimum*minimum-y*y-z*z))+.004);px=sign<0?Math.min(px,desired):Math.max(px,desired);}}
  positions[at]=px;positions[at+1]=py;positions[at+2]=pz;
 }
 function pushSurfacePoint(ids,weights,body){
  let px=0,py=0,pz=0;for(let i=0;i<ids.length;i++){const at=ids[i]*3;px+=positions[at]*weights[i];py+=positions[at+1]*weights[i];pz+=positions[at+2]*weights[i];}
  for(const capsule of body){if(ids.every(index=>pinned[index]===2)&&supportAllowed.includes(capsule.id))continue;const ax=capsule.start[0],ay=capsule.start[1],az=capsule.start[2],dx=capsule.end[0]-ax,dy=capsule.end[1]-ay,dz=capsule.end[2]-az,denom=dx*dx+dy*dy+dz*dz,t=denom?clamp(((px-ax)*dx+(py-ay)*dy+(pz-az)*dz)/denom):0,x=px-(ax+dx*t),y=py-(ay+dy*t),z=pz-(az+dz*t),length=Math.hypot(x,y,z),minimum=capsule.radius+.018;if(length>=minimum)continue;let sum=0;for(let i=0;i<ids.length;i++)if(!pinned[ids[i]])sum+=weights[i]*weights[i];if(!sum)continue;const sign=px<0?-1:1,delta=(ax+dx*t)+sign*(Math.sqrt(Math.max(0,minimum*minimum-y*y-z*z))+.004)-px;for(let i=0;i<ids.length;i++){if(!pinned[ids[i]])positions[ids[i]*3]+=delta*weights[i]/sum;}px+=delta;
  }
 }
 function pushEdges(body){
  for(const [a,b]of links)for(const capsule of body){
   if(pinned[a]&&pinned[b])continue;
   if(pinned[a]===2&&pinned[b]===2&&supportAllowed.includes(capsule.id))continue;const aa=a*3,bb=b*3,ux=positions[bb]-positions[aa],uy=positions[bb+1]-positions[aa+1],uz=positions[bb+2]-positions[aa+2],vx=capsule.end[0]-capsule.start[0],vy=capsule.end[1]-capsule.start[1],vz=capsule.end[2]-capsule.start[2],rx=positions[aa]-capsule.start[0],ry=positions[aa+1]-capsule.start[1],rz=positions[aa+2]-capsule.start[2],A=ux*ux+uy*uy+uz*uz,E=vx*vx+vy*vy+vz*vz,F=vx*rx+vy*ry+vz*rz,C=ux*rx+uy*ry+uz*rz,B=ux*vx+uy*vy+uz*vz;let s=0,t=0;
   if(A<1e-10&&E<1e-10){}
   else if(A<1e-10)t=clamp(F/E);
   else if(E<1e-10)s=clamp(-C/A);
   else{const denominator=A*E-B*B;s=Math.abs(denominator)>1e-10?clamp((B*F-C*E)/denominator):0;t=(B*s+F)/E;if(t<0){t=0;s=clamp(-C/A);}else if(t>1){t=1;s=clamp((B-C)/A);}}
   const dx=rx+ux*s-vx*t,dy=ry+uy*s-vy*t,dz=rz+uz*s-vz*t;if(Math.hypot(dx,dy,dz)<capsule.radius+.018)pushSurfacePoint([a,b],[1-s,s],[capsule]);
  }
 }
 function gatherCrossSections(){
  // A bunched side panel moves as a folded cross-section. Moving just one
  // width node around a wrist would spuriously stretch a tiny gathered edge.
  for(const column of [1,NX-2]){const sign=column<NX/2?-1:1;let displacement=0;for(let row=0;row<NZ;row++){const index=at(column,row)*3;displacement=Math.max(displacement,(positions[index]-targets[index])*sign);}for(let row=0;row<NZ;row++){const index=at(column,row)*3;positions[index]=targets[index]+sign*displacement;}}
 }
 function solveCloth(pose,mount){
  const key=JSON.stringify([pose.hip,pose.shoulder,pose.bodyQuaternion,pose.hands,pose.feet,pose.elbowHints,pose.handDirections,pose.handAdvances,pose.footNormals,pose.footDirections,pose.aerialBoarding,mount]);if(key===cachedKey)return;cachedKey=key;solverTicks++;targetCloth(pose,mount);positions.set(targets);previous.set(targets);
  const collisionBody=bodyOf(pose),proxies=bodyCollisionProxies(collisionBody).map(proxy=>({id:proxy.id,start:A(proxy.start),end:A(proxy.end),radius:proxy.radius+(/Hand$/.test(proxy.id)?.020:0)}));proxies.push({id:'head',start:pose.head,end:pose.head,radius:.12});
  const active=mount>.00001||pose.aerialBoarding===true,steps=active?2:1,iterations=active?12:3;if(active)solverActiveTicks++;
  for(let step=0;step<steps;step++){
   for(let index=0;index<count;index++){if(pinned[index])continue;for(let axis=0;axis<3;axis++){const at=index*3+axis,p=positions[at];positions[at]+=(positions[at]-previous[at])*.90+(axis===1?-9.81/3600:0);previous[at]=p;}}
   for(let iteration=0;iteration<iterations;iteration++){
    for(let l=0;l<links.length;l++){const [a,b]=links[l],aa=a*3,bb=b*3,dx=positions[bb]-positions[aa],dy=positions[bb+1]-positions[aa+1],dz=positions[bb+2]-positions[aa+2],length=Math.hypot(dx,dy,dz),wa=pinned[a]?0:1,wb=pinned[b]?0:1,sum=wa+wb;if(!sum||!length)continue;const correction=Math.max(0,length-restLengths[l])/length*.82/sum;for(let axis=0;axis<3;axis++){const delta=axis===0?dx:axis===1?dy:dz;positions[aa+axis]+=delta*correction*wa;positions[bb+axis]-=delta*correction*wb;}}
    for(let index=0;index<count;index++){
     const k=index*3;if(pinned[index]){positions[k]=targets[k];positions[k+1]=targets[k+1];positions[k+2]=targets[k+2];continue;}
     // Authored support contacts follow the kinematic pelvis. The rest of the
     // fabric remains free to sag, constrain distances and avoid the body.
     const attraction=supportNode(index)&&active?.3:active?.08:.20;for(let axis=0;axis<3;axis++)positions[k+axis]+=(targets[k+axis]-positions[k+axis])*attraction;
     pushOut(index,proxies);
    }
    if(active){pushEdges(proxies);for(let t=0;t<indices.length;t+=3)pushSurfacePoint(indices.slice(t,t+3),[1/3,1/3,1/3],proxies);gatherCrossSections();}
   }
   // Contact projection is not a launch impulse. This quasi-static solve
   // dissipates projected velocity before the next relaxation substep.
   previous.set(positions);
  }
  const attribute=clothGeometry.attributes.position;attribute.array.set(positions);attribute.needsUpdate=true;clothGeometry.computeVertexNormals();clothGeometry.computeBoundingSphere();
  let maxStretch=0,tensionRatio=0,anchorError=0,pouchContactError=0;for(let l=0;l<links.length;l++){const [a,b]=links[l],ratio=Math.hypot(positions[a*3]-positions[b*3],positions[a*3+1]-positions[b*3+1],positions[a*3+2]-positions[b*3+2])/restLengths[l];tensionRatio=Math.max(tensionRatio,ratio);maxStretch=Math.max(maxStretch,ratio-1);}for(let index=0;index<count;index++)if(pinned[index]){const error=Math.hypot(...[0,1,2].map(axis=>positions[index*3+axis]-targets[index*3+axis]));if(pinned[index]===1)anchorError=Math.max(anchorError,error);else pouchContactError=Math.max(pouchContactError,error);}
  let upperPanelMinimumY=Infinity,upperTriangles=0;for(let t=0;t<indices.length;t+=3){const ids=indices.slice(t,t+3);if(ids.every(supportRegion))continue;upperTriangles++;for(const id of ids)upperPanelMinimumY=Math.min(upperPanelMinimumY,positions[id*3+1]);}
  const supportedBodyMaximumY=Math.max(...collisionBody.hips.map(point=>point[1]+.11),...collisionBody.knees.map(point=>point[1]+.082));
  diagnostics={nodes:count,links:links.length,substeps:steps,iterations,active,materialLengthFactor,tensionRatio,maxStretch,anchorError,pouchContactError,kinematicPouchNodes:Array.from(pinned).filter(value=>value===2).length,freeGatheredNodes:Array.from(pinned).filter(value=>value===0).length,materialRegions:{pouchAndLowerSeamNodes:Array.from({length:count},(_,i)=>supportRegion(i)).filter(Boolean).length,upperRailNodes:Array.from({length:count},(_,i)=>!supportRegion(i)).filter(Boolean).length,upperTriangles,upperPanelMinimumY,supportedBodyMaximumY,upperRegionLowerBodyGap:upperPanelMinimumY-supportedBodyMaximumY},finite:[...positions].every(Number.isFinite),mode:'deterministic quasi-static Verlet/PBD gathered-panel solve with folded material bounds, kinematic load-pouch contacts and body collision constraints'};
 }
 function applyGear(pose,isHeld=true){
  const flight=pose.aerialFlight||{mount:0,angle:0},mount=flight.mount||0;solveCloth(pose,mount);dynamic=[];
  for(let i=0;i<2;i++){
   const hand=isHeld?pose.hands[i]:add(park[i],[0,floorOffset,0]),frame=isHeld?solveHandContactFrame(metrics,pose,i):parkedFrames[i],axis=V(frame.axis),ends=[A(V(hand).addScaledVector(axis,-.085)),A(V(hand).addScaledVector(axis,.085))],outer=V(Math.abs(ends[0][0])>Math.abs(ends[1][0])?ends[0]:ends[1]),connector=outer.clone().add(new THREE.Vector3(i?.18:-.18,.12,.06)),handAnchor=[i?.70:-.70,anchors[i][1],anchors[i][2]];place(grips[i],...ends);place(gripBranches[i],A(outer),A(connector));place(gripStraps[i],A(connector),handAnchor);
   dynamic.push({id:`aerial-grip-${i}`,shape:'capsule',start:ends[0],end:ends[1],radius:.018,allowedBodyParts:[i?'rightHand':'leftHand']},{id:`aerial-hand-branch-${i}`,shape:'capsule',start:A(outer),end:A(connector),radius:.012,allowedBodyParts:[i?'rightHand':'leftHand']},{id:`aerial-hand-strap-${i}`,shape:'capsule',start:A(connector),end:handAnchor,radius:.015,allowedBodyParts:[]});
  }
  const p=index=>Array.from(positions.subarray(index*3,index*3+3));
  for(const [index,[a,b]]of links.entries())dynamic.push({id:`aerial-support-cloth-${index}`,shape:'capsule',start:p(a),end:p(b),radius:.008,allowedBodyParts:supportRegion(a)&&supportRegion(b)?[...supportAllowed]:[]});
  lastPose=C(pose);lastFlight=C(flight);lastHeld=isHeld;lastContacts={hands:isHeld?C(pose.hands):park.map(point=>add(point,[0,floorOffset,0])),feet:C(pose.feet)};
 }
 const touch={...C(neutral),hands:C(park),handDirections:[[1,0,0],[1,0,0]],elbowHints:[[-.7,-.7,.5],[.7,-.7,.5]],gripping:false,handGripping:[false,false],handGripStrength:[0,0]},held={...C(touch),gripping:true,handGripping:[true,true],handGripStrength:[1,1]};delete touch.handNormals;delete held.handNormals;
 // Approach from the open front. The parked pouch stays behind the pelvis,
 // so boarding never walks through a horizontal sheet before grasping it.
 const nodes=[{pose:C(neutral),time:0,d:0,label:'站在吊布外',held:false},{pose:C(neutral),time:2.3,d:2.3,label:'退到吊布前站穩',walk:true,held:false},{pose:touch,time:3.3,d:1,label:'雙手靠近吊布',held:false},{pose:held,time:3.75,d:.45,label:'握穩吊布',held:true},{pose:C(held),time:4.4,d:.65,label:'確認布面與雙腳支撐',held:true},{pose:C(ready),time:5.3,d:.9,label:'站穩準備上布',held:true}],duration=5.3,gate=[1.35,0,1.05];
 function blend(a,b,t){const pose={...C(b)};for(const key of ['hip','shoulder','head'])pose[key]=mix(a[key],b[key],t);for(const key of ['hands','feet'])pose[key]=a[key].map((point,i)=>mix(point,b[key][i],t));if(a.elbowHints&&b.elbowHints)pose.elbowHints=a.elbowHints.map((point,i)=>mix(point,b.elbowHints[i],t));pose.handGripStrength=[0,1].map(i=>(a.handGripStrength?.[i]??0)+((b.handGripStrength?.[i]??1)-(a.handGripStrength?.[i]??0))*t);pose.handGripping=pose.handGripStrength.map(value=>value>.5);pose.gripping=pose.handGripping.some(Boolean);return pose;}
 function walking(from,to,u,exiting){
  const t=ease(u),offset=mix(from,to,t),pose=C(neutral),distance=V(to).sub(V(from)).length(),steps=Math.max(2,Math.ceil(distance/.18/2)*2),step=Math.min(steps-1,Math.floor(t*steps)),within=t===1?1:t*steps-step;
  for(const key of ['hip','shoulder','head'])pose[key][1]-=.04*Math.sin(t*Math.PI);
  for(let i=0;i<2;i++){const completed=i===0?Math.floor((step+1)/2):Math.floor(step/2),moving=step%2===i,p=(completed+(moving?ease(within):0))/(steps/2);pose.feet[i]=add(mix(from,to,Math.min(1,p)),n.feet[i]).map((value,j)=>value-offset[j]);if(moving)pose.feet[i][1]+=.11*Math.sin(within*Math.PI);}
  applyGear(calibrated({...pose,hands:pose.hands.map(point=>add(point,offset)),feet:pose.feet.map(point=>add(point,offset))}),false);return{pose,offset,rotation:0,stage:exiting?'走回吊布外':'走到吊布前',contacts:{hands:[false,false],feet:[0,1].map(i=>step%2!==i)}};
 }
 function sampleLifecycle(direction,u){const exiting=direction==='exit',t=(exiting?1-clamp(u):clamp(u))*duration;let index=1;while(index<nodes.length-1&&nodes[index].time<t)index++;const a=nodes[index-1],b=nodes[index],progress=clamp((t-a.time)/b.d);if(b.walk)return walking(gate,[0,0,0],progress,exiting);const raw=t<=0?C(neutral):t>=duration?C(ready):blend(a.pose,b.pose,ease(progress)),pose=calibrated(raw),isHeld=t>=3.75;pose.aerialBoarding=true;applyGear(pose,isHeld);return{pose,offset:[0,0,0],rotation:0,stage:exiting?isHeld?'站穩並放鬆布面':'放開吊布，雙手收回':b.label,contacts:{hands:[isHeld,isHeld],feet:[true,true]}};}
 const sampleCourse=frame=>{if(!AERIAL_MOTIONS.includes(frame.motionId))throw Error(`Unknown aerial course motion ${frame.motionId}`);const raw=AERIAL_AIR_MOTIONS.includes(frame.motionId)?flightPose(frame):groundPose({...frame,envelope:(frame.envelope??1)*(frame.joining?ease(frame.joinProgress||0):1)}),pose=calibrated(raw);applyGear(pose,true);return pose;};
 parkedFrames=[0,1].map(index=>solveHandContactFrame(metrics,calibrated(touch),index));applyGear(calibrated(touch),false);
 return{
  sampleCourse,sample(phase=0){const p=clamp(phase),part=p<.25?0:p<.75?1:2,u=part===0?p/.25:part===1?(p-.25)/.5:(p-.75)/.25;return sampleCourse({motionId:part===1?'aerial-assisted-hinge':'aerial-standing-reach',repPhase:(u*(part===1?4:2))%1,envelope:1,intensity:1});},sampleLifecycle,
  getMetadata:()=>({gateOffset:[...gate],gateRotation:0,exitGateRotation:0,entryDuration:duration,exitDuration:duration,restPhase:0,persistentProps:true,stages:nodes.slice(1).map(node=>node.label)}),
  getCourseMotionIds:()=>[...AERIAL_MOTIONS],getActualContacts:()=>C(lastContacts),getCourseContacts:()=>({hands:[lastHeld,lastHeld],feet:lastPose.feet.map(point=>point[1]<=floorOffset+.03)}),getActualGripAxes:()=>grips.map(object=>A(UP.clone().applyQuaternion(object.quaternion))),getHardGripCylinders:()=>[],
  getCourseReturnDuration:frame=>AERIAL_AIR_MOTIONS.includes(frame.motionId)?14:2,
  getCollisionVolumes:()=>[...fixed,...dynamic].map(C),getPropState:()=>({ownership:lastHeld?'held':'park',hands:grips.map(object=>object.position.toArray()),support:C(lastFlight),cloth:{...diagnostics}}),
  getSuspensionDiagnostics:()=>({...diagnostics,solverTicks,solverActiveTicks,flight:C(lastFlight),anchors:C(anchors),floorOffset,clothTriangles:indices.length/3}),
  getCollisionBody:()=>bodyOf(lastPose),
  getClothSurface:()=>({positions:Array.from(clothGeometry.attributes.position.array),indices:[...indices],supportNodes:Array.from({length:count},(_,index)=>supportRegion(index)),loadPouchNodes:Array.from(pinned,value=>value===2),supportCoreRadiusFactor:.68}),
  getSegment:phase=>({label:phase<.25?'握布與站姿活動':phase<.75?'吊布支撐坐姿與倒掛':'落地、回正與放鬆',description:'暖身後再上布，回正並確認雙腳踩穩，最後才放開吊布。'}),
 };
}
