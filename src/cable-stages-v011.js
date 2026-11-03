import {inertialCurlEffort} from './inertial-curl-v018.js';
import {adaptDumbbellGrip} from './dumbbell-grip.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {solveFreeDumbbellShaft} from './free-dumbbell-shaft.js';
import {installCableCalibration} from './equipment-calibration-v013.js';

const copy=value=>structuredClone(value),add=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,k)=>a.map(v=>v*k),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const signs=[-1,1],clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const effort=p=>p<.43?smooth(p/.43):p<.53?1:1-smooth((p-.53)/.47);

/** Three independent cable movements. Their physical grips, cable endpoints
 * and calibrated palm frames share a single authored equipment pose. */
export function configureCableStageV011({stage,THREE,metrics,box,rod,setRod,mat,capturedPose=true}){
  const {group,definition}=stage,id=definition.id,crunch=id==='cable-rope-crunch',bar=id==='cable-straight-arm-pulldown',curl=!crunch&&!bar;
  const V=p=>new THREE.Vector3(...p),norm=p=>V(p).normalize().toArray(),n=metrics.neutral,frameZ=crunch?-1.12:1.12;
  stage.configurationKey=`v011:${id}`;stage.cameraYaw=crunch?1.7:1.15;stage.cameraDistance=4.8;
  for(const sign of signs){
    rod(group,[sign*1.08,.08,frameZ],[sign*1.08,2.32,frameZ],.055,mat.frame);
    box(group,[sign*.94,1.1,frameZ+(crunch?-.1:.1)],[.34,2.08,.25]);
    stage.staticVolumes.push({id:`v011-cable-upright-${sign}`,shape:'capsule',start:[sign*1.08,.08,frameZ],end:[sign*1.08,2.32,frameZ],radius:.055,allowedBodyParts:[]},{id:`v011-stack-${sign}`,shape:'box',position:[sign*.94,1.1,frameZ+(crunch?-.1:.1)],size:[.34,2.08,.25],allowedBodyParts:[]});
  }
  rod(group,[-1.08,2.32,frameZ],[1.08,2.32,frameZ],.055,mat.frame);
  stage.staticVolumes.push({id:'v011-cable-top',shape:'capsule',start:[-1.08,2.32,frameZ],end:[1.08,2.32,frameZ],radius:.055,allowedBodyParts:[]});
  const anchor=[0,curl?.16:2.24,frameZ+(crunch?.08:-.08)],cable=rod(group,anchor,[0,1.2,.5],.007,mat.chrome);
  cable.name='calibrated-cable';
  // The axle and its sheave make the selected high / low pulley visible.
  const pulleyAxle=rod(group,[-.055,anchor[1],anchor[2]],[.055,anchor[1],anchor[2]],.034,mat.rubber);
  installCableCalibration({THREE,stage,anchor,pulleyParts:[pulleyAxle],rod,mat});stage.attachmentId=definition.attachmentId;
  const grips=bar?[rod(group,[-.44,0,0],[.44,0,0],.016,mat.chrome)]:signs.map(()=>rod(group,[0,0,0],[0,1,0],.016,mat.rubber));
  const branches=bar?[]:signs.map(()=>rod(group,[0,0,0],[0,1,0],.009,mat.rope));
  const stops=bar?[]:signs.map(()=>rod(group,[0,0,0],[0,1,0],.025,mat.rubber));
  const link=rod(group,[0,0,0],[0,1,0],.011,mat.chrome);
  stage.gearObjects=grips;stage.gripCylinders=[];
  // Parked attachments rest on a real cantilever cradle. The user lifts
  // them clear before moving them, then retraces that path on release.
  const cradleY=crunch?1.686:bar?1.195:1.077,cradleZ=crunch?.18:.50,cradleX=bar?.42:.275;
  for(const sign of signs){
    const a=[sign*1.08,cradleY,frameZ],b=[sign*.58,cradleY,cradleZ],c=[sign*cradleX,cradleY,cradleZ];
    rod(group,a,b,.012,mat.frame);rod(group,b,c,.008,mat.chrome);
    stage.staticVolumes.push({id:`v011-cradle-arm-${sign}`,shape:'capsule',start:a,end:b,radius:.012,allowedBodyParts:[]},{id:`v011-cradle-${sign}`,shape:'capsule',start:b,end:c,radius:.008,allowedBodyParts:[]});
  }
  function neutral(){return{hip:copy(n.hip),shoulder:copy(n.shoulder),head:copy(n.head),feet:copy(n.feet),footDirections:[[0,0,1],[0,0,1]],footNormals:[[0,1,0],[0,1,0]],gripping:true,handGripping:[true,true],handGripStrength:[1,1],elbowHints:[[-1,-.6,.2],[1,-.6,.2]],dbGripWeight:1,dbNaturalGrip:0};}
  function directions(pose){
    pose.handDirections??=bar?[[1,0,0],[-1,0,0]]:[[0,0,1],[0,0,1]];
    pose.handAdvances=pose.hands.map((_,side)=>{
      const frame=solveHandContactFrame(metrics,pose,side),axis=V(pose.handDirections[side]);
      return V(frame.advance).addScaledVector(axis,-V(frame.advance).dot(axis)).normalize().toArray();
    });return pose;
  }
  stage.setGearPose=pose=>{
    const center=pose.hands[0].map((v,i)=>(v+pose.hands[1][i])/2);let connector;
    stage.dynamicVolumes=[];stage.gripCylinders=[];
    if(bar){
      const a=add(center,[-.44,0,0]),b=add(center,[.44,0,0]);setRod(grips[0],a,b);
      connector=add(center,[0,.045,.015]);setRod(link,center,connector);
      stage.dynamicVolumes.push({id:'v011-pulldown-bar',shape:'capsule',start:a,end:b,radius:.016,allowedBodyParts:['leftHand','rightHand']});
      stage.gripCylinders=signs.map(sign=>({center:add(center,[sign*.32,0,0]),axis:[1,0,0],radius:.016,halfLength:.08}));
    }else{
      connector=crunch?[0,center[1]+.30,Math.min(-.19,center[2]-.18)]:[0,center[1]-.02,center[2]+.36];
      setRod(link,connector,add(connector,[0,.035,crunch?-.015:.015]));
      for(let side=0;side<2;side++){
        const axis=norm(pose.handDirections?.[side]||[0,0,1]),entrySign=crunch?-1:1,a=add(pose.hands[side],scale(axis,.085*entrySign)),b=add(pose.hands[side],scale(axis,-.085*entrySign));
        setRod(grips[side],a,b);
        const stop=add(pose.hands[side],scale(axis,-.12*entrySign));setRod(stops[side],add(stop,scale(axis,-.015)),add(stop,scale(axis,.015)));
        setRod(branches[side],a,connector);
        stage.dynamicVolumes.push({id:`v011-rope-grip-${side}`,shape:'capsule',start:a,end:b,radius:.016,allowedBodyParts:[side?'rightHand':'leftHand']},{id:`v011-rope-stop-${side}`,shape:'capsule',start:add(stop,scale(axis,-.015)),end:add(stop,scale(axis,.015)),radius:.025,allowedBodyParts:[]},{id:`v011-rope-branch-${side}`,shape:'capsule',start:a,end:connector,radius:.009,allowedBodyParts:[side?'rightHand':'leftHand']});
        stage.gripCylinders.push({center:copy(pose.hands[side]),axis,radius:.016,halfLength:.08});
      }
    }
    setRod(cable,anchor,connector);stage.connector=copy(connector);stage.propPositions=grips.map(object=>object.position.toArray());return connector;
  };
  stage.adaptHandPose=raw=>{
    const freedom=raw.dbNaturalGrip||0;
    if(freedom>0){
      raw=copy(raw);const bodyQ=new THREE.Quaternion().setFromUnitVectors(V(n.shoulder).sub(V(n.hip)).normalize(),V(raw.shoulder).sub(V(raw.hip)).normalize());
      if(raw.elbows){raw.elbowHints=raw.elbows.map((elbow,side)=>V(elbow).sub(V(n.shoulder).sub(V(n.hip)).add(V(metrics.arms[side].shoulderOffset)).applyQuaternion(bodyQ).add(V(raw.hip))).normalize().toArray());raw.elbows=undefined;}
      for(let side=0;side<2;side++){
        const frame=solveHandContactFrame(metrics,raw,side),solved=solveFreeDumbbellShaft({metrics,pose:raw,side,center:raw.hands[side],axis:V(raw.handDirections?.[side]||frame.axis),advance:V(raw.handAdvances?.[side]||frame.advance),contactWeight:raw.dbGripWeight||0,freedom});
        raw.handDirections??=[null,null];raw.handAdvances??=[null,null];raw.handDirections[side]=solved.axis.toArray();raw.handAdvances[side]=solved.advance.toArray();
      }
      raw.dbNaturalGrip=0;
    }
    if(bar)raw={...raw,dbNaturalGrip:(1-freedom)*(raw.dbGripWeight||0)};
    const result=adaptDumbbellGrip({id,metrics,raw,mask:[true,true],lifecycle:true});
    // An opening hand backs away along its palm normal while the fingers
    // unfold. This is a real clearance path, not a smaller collision shape.
    for(let side=0;side<2;side++){
      const strength=raw.handGripStrength?.[side]??((raw.handGripping?.[side]??raw.gripping)?1:0),axis=V(result.pose.handDirections?.[side]||[1,0,0]),advance=V(result.pose.handAdvances?.[side]||[0,0,1]),normal=new THREE.Vector3().crossVectors(advance,axis).multiplyScalar(side?1:-1).normalize();
      const open=(1-strength)*(raw.dbGripWeight||0),retreat=normal.multiplyScalar(-.024*open).addScaledVector(advance,-(crunch?.015:.011)*open);result.pose.hands[side]=V(result.pose.hands[side]).add(retreat).toArray();result.contactTargets[side]=copy(result.pose.hands[side]);
    }
    stage.gearContacts=copy(result.contactTargets);return result.pose;
  };
  stage.sample=(phase,cycle=0)=>{
    const e=(capturedPose?inertialCurlEffort(id,phase,cycle):null)??effort(phase),pose=neutral();
    if(curl){
      const angle=.27+1.62*e;
      pose.elbows=signs.map((sign,side)=>add(n.shoulder,[sign*.275,-metrics.arms[side].upper*.965,.025]));
      pose.hands=pose.elbows.map((elbow,side)=>add(elbow,[0,-Math.cos(angle)*(metrics.arms[side].lower+.040),Math.sin(angle)*(metrics.arms[side].lower+.040)]));
      pose.handDirections=signs.map(()=>[0,Math.sin(angle),Math.cos(angle)]);
    }else if(bar){
      const angle=.83+1.68*e;
      pose.hands=signs.map(sign=>[sign*.32,n.shoulder[1]+.48*Math.cos(angle),n.shoulder[2]+.48*Math.sin(angle)]);
      pose.handDirections=[[1,0,0],[-1,0,0]];pose.elbowHints=[[-1,-.3,.2],[1,-.3,.2]];
    }else{
      // pelvis orientation and hip position remain fixed. Only the three
      // spine bones flex, rather than pitching the whole torso at the hip.
      pose.spineLean=.38*e;
      const lean=pose.spineLean,anchors=metrics.spine?.anchors;
      let shoulder=V(n.shoulder),head=V(n.head);
      if(anchors?.length===3){
        const root=V(anchors[0]);let current=root.clone();
        for(let i=1;i<anchors.length;i++)current.add(V(anchors[i]).sub(V(anchors[i-1])).applyAxisAngle(new THREE.Vector3(1,0,0),lean*i/3));
        const tip=V(anchors.at(-1));shoulder=V(n.shoulder).sub(tip).applyAxisAngle(new THREE.Vector3(1,0,0),lean).add(current);head=V(n.head).sub(tip).applyAxisAngle(new THREE.Vector3(1,0,0),lean).add(current);
      }
      pose.hands=signs.map(sign=>add(head.toArray(),[sign*.255,-.055,.015]));
      pose.handDirections=signs.map(()=>[0,-Math.sin(lean),Math.cos(lean)]);pose.elbowHints=[[-1,-.55,.8],[1,-.55,.8]];
    }
    directions(pose);stage.setGearPose(pose);stage.pose=pose;return pose;
  };
  stage.buildLifecycleNodes=({record,neutral:standing,gripPose,append})=>{
    const nodes=record.nodes,ready=copy(record.exercisePose),park=directions({...neutral(),hands:signs.map(sign=>[sign*(bar?.32:.275),crunch?1.72:1.22,crunch?.06:.50]),handDirections:bar?[[1,0,0],[-1,0,0]]:crunch?[[0,0,1],[0,0,1]]:[[0,1,0],[0,1,0]]});
    record.park=park;record.weightHands=[true,true];record.gateOffset=[0,0,-1.6];
    const body=standing({footDirections:[[0,0,1],[0,0,1]]}),open=gripPose(body,park.hands,park.handDirections,0,park.handAdvances);open.dbGripWeight=1;
    const outside=copy(open);outside.hands=signs.map(sign=>[sign*(crunch?.18:.47),crunch?1.42:1.4,crunch?.30:.24]);
    const above=copy(open);above.hands=above.hands.map((p,i)=>{if(!crunch)return add(p,[0,.18,-.04]);const normal=new THREE.Vector3().crossVectors(V(park.handAdvances[i]),V(park.handDirections[i])).multiplyScalar(i?1:-1).normalize();return V(p).addScaledVector(normal,-.16).toArray();});
    outside.dbNaturalGrip=1;above.dbNaturalGrip=1;
    const hold=copy(open);hold.hands=copy(park.hands);hold.handGripping=[true,true];hold.handGripStrength=[1,1];
    const lifted=copy(hold);lifted.hands=lifted.hands.map(p=>add(p,[0,crunch?.045:.10,crunch?-.10:-.045]));directions(lifted);
    append(nodes,body,record.gateOffset,'站穩',0,{gear:'park'});
    append(nodes,body,[0,0,0],'走近龍門架',2,{walk:true,gear:'park'});
    append(nodes,outside,[0,0,0],'抬手靠近扣環',1.1,{gear:'park'});
    append(nodes,above,[0,0,0],'先從握把上方伸手',.8,{gear:'park'});
    append(nodes,open,[0,0,0],'掌心對準握把',.7,{gear:'park'});
    append(nodes,hold,[0,0,0],'握住附件',.65,{gear:'held'});
    append(nodes,lifted,[0,0,0],'提離掛位',.8,{gear:'held'});
    append(nodes,ready,[0,0,0],'後退並調整訓練姿勢',1.8,{gear:'held'});
  };
  stage.pose=stage.sample(0);stage.entryReadyPose=copy(stage.pose);return stage;
}
