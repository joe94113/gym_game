import * as THREE from 'three';
import {buildLocomotionPose} from './locomotion.js';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {floorHeightAt} from './gym-layout.js';
const C=p=>structuredClone(p),V=p=>new THREE.Vector3(...p),A=v=>v.toArray(),UP=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0),Z=new THREE.Vector3(0,0,1);
const add=(a,b)=>a.map((v,i)=>v+b[i]),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),ease=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const direction=(a,b,t)=>{const v=V(a).normalize(),q=new THREE.Quaternion().setFromUnitVectors(v,V(b).normalize());return A(v.applyQuaternion(new THREE.Quaternion().slerp(q,t)));};
const frameQuaternion=(advance,axis)=>{const z=V(advance).normalize(),x=V(axis).addScaledVector(z,-V(axis).dot(z)).normalize(),y=new THREE.Vector3().crossVectors(z,x).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};
const EXIT_STAGES=Object.freeze({
  '站在器材後方':'離開器材',
  '走近後方底桿':'走回器材外側',
  '抬起一腳跨過底桿':'另一腳跨回底桿外',
  '另一腳跨過底桿':'先抬一腳跨回底桿外',
  '先沿座椅左側踏入':'另一腳退出座椅旁',
  '再沿座椅右側踏入':'先退出一腳',
  '抬手避開靠墊':'放下雙手準備離開',
  '坐入椅面並前移一腳':'起身並收回另一腳',
  '另一腳放到器材前方':'收回一腳',
  '調整內側腳站位':'另一腳移到座椅旁',
  '調整另一腳並坐穩':'先把一腳移到座椅旁',
  '上臂靠好再伸手':'抬起上臂離開靠墊',
  '從外側伸向握把':'抬手避開胸靠',
  '掌心對準握把':'雙手離開握把',
  '握穩握把':'放開握把',
});
/** Actual bench access: walk around the lever, sit with planted feet, lie with
 * hands over the chest, then approach the handles from above. */
export function createUpperBodyMachineLifecycle({machine,metrics,restPose}){
  const preacher=machine.type==='preacherCurl',rest=C(restPose),n=metrics.neutral,torsoVector=V(n.shoulder).sub(V(n.hip)),restAxis=torsoVector.clone().normalize(),gate=[0,0,-1.85],entryYaw=0,exitYaw=Math.PI;
  const worldGate=V(gate).applyAxisAngle(UP,machine.group.rotation.y).add(machine.group.position);gate[1]=floorHeightAt(worldGate.x,worldGate.z)-floorHeightAt(machine.station.position.x,machine.station.position.z);
  function translate(p,delta){const r=C(p);for(const k of ['hip','shoulder','head'])r[k]=add(r[k],delta);for(const k of ['hands','feet','elbows','knees'])if(r[k])r[k]=r[k].map(a=>add(a,delta));return r;}
  function at(x,z,yaw=0,y=n.hip[1]-.04){const p=buildLocomotionPose(metrics,0,0),q=new THREE.Quaternion().setFromAxisAngle(UP,yaw),dy=y-p.hip[1];for(const k of ['hip','shoulder','head'])p[k]=A(V(add(p[k],[0,dy,0])).applyQuaternion(q).add(new THREE.Vector3(x,0,z)));for(const k of ['hands','feet'])p[k]=p[k].map(a=>A(V(add(a,[0,k==='hands'?dy:0,0])).applyQuaternion(q).add(new THREE.Vector3(x,0,z))));for(const k of ['handNormals','handDirections','handAdvances','elbowHints','footDirections','footNormals','kneeHints'])if(p[k])p[k]=p[k].map(a=>A(V(a).applyQuaternion(q)));p.yaw=yaw;return p;}
  const qBody=p=>new THREE.Quaternion().setFromUnitVectors(restAxis,V(p.shoulder).sub(V(p.hip)).normalize()),root=(p,i)=>torsoVector.clone().add(V(metrics.arms[i].shoulderOffset)).applyQuaternion(qBody(p)).add(V(p.hip));
  function blend(a,b,t){
    const qa=qBody(a),qb=qBody(b),q=qa.clone().slerp(qb,t),hip=V(mix(a.hip,b.hip,t)),p={hip:A(hip),shoulder:A(torsoVector.clone().applyQuaternion(q).add(hip)),head:mix(a.head,b.head,t),hands:[],elbows:[],feet:[],handDirections:[],handAdvances:[],handGripStrength:[],handGripping:[],kneeHints:[],footDirections:[],footNormals:[],gripping:false,relaxedHands:true,yaw:0};
    for(let i=0;i<2;i++){const arm=metrics.arms[i],fa=solveHandContactFrame(metrics,a,i),fb=solveHandContactFrame(metrics,b,i),ri=torsoVector.clone().add(V(arm.shoulderOffset)).applyQuaternion(q).add(hip),ua=A(V(fa.elbow).sub(root(a,i)).applyQuaternion(qa.clone().invert())),ub=A(V(fb.elbow).sub(root(b,i)).applyQuaternion(qb.clone().invert())),elbow=V(direction(ua,ub,t)).multiplyScalar(arm.upper).applyQuaternion(q).add(ri),la=A(V(fa.wrist).sub(V(fa.elbow)).applyQuaternion(qa.clone().invert())),lb=A(V(fb.wrist).sub(V(fb.elbow)).applyQuaternion(qb.clone().invert())),wrist=V(direction(la,lb,t)).multiplyScalar(arm.lower).applyQuaternion(q).add(elbow),ha=qa.clone().invert().multiply(frameQuaternion(fa.advance,fa.axis)),hb=qb.clone().invert().multiply(frameQuaternion(fb.advance,fb.axis)),hf=q.clone().multiply(ha.slerp(hb,t)),handQ=hf.clone().multiply(new THREE.Quaternion(...arm.handFrameLocal).invert());p.elbows.push(A(elbow));p.hands.push(A(V(arm.palmOffset).applyQuaternion(handQ).add(wrist)));p.handDirections.push(A(X.clone().applyQuaternion(hf)));p.handAdvances.push(A(Z.clone().applyQuaternion(hf)));p.feet.push(mix(a.feet[i],b.feet[i],t));p.footDirections.push(direction(a.footDirections?.[i]||[0,0,1],b.footDirections?.[i]||[0,0,1],t));p.footNormals.push(direction(a.footNormals?.[i]||[0,1,0],b.footNormals?.[i]||[0,1,0],t));p.kneeHints.push(mix(a.kneeHints?.[i]||[0,1,1],b.kneeHints?.[i]||[0,1,1],t));const ga=a.handGripStrength?.[i]??((a.handGripping?.[i]??a.gripping)?1:0),gb=b.handGripStrength?.[i]??((b.handGripping?.[i]??b.gripping)?1:0);p.handGripStrength.push(ga+(gb-ga)*t);p.handGripping.push(p.handGripStrength[i]>.5);}
    return p;
  }
  function output(p,stage,contacts={hands:[false,false],feet:[true,true]}){const yaw=p.yaw||0,offset=[p.hip[0],0,p.hip[2]],r=C(p);for(const k of ['hip','shoulder','head'])r[k]=A(V(r[k]).sub(V(offset)).applyAxisAngle(UP,-yaw));for(const k of ['hands','feet','elbows','knees'])if(r[k])r[k]=r[k].map(a=>A(V(a).sub(V(offset)).applyAxisAngle(UP,-yaw)));for(const k of ['handNormals','handDirections','handAdvances','elbowHints','footDirections','footNormals','kneeHints'])if(r[k])r[k]=r[k].map(a=>a?A(V(a).applyAxisAngle(UP,-yaw)):null);delete r.yaw;return{pose:r,offset,rotation:yaw,stage,contacts};}
  function walk(a,b,u,stage,raised=false){const t=ease(u),yaw=(a.yaw||0)+Math.atan2(Math.sin((b.yaw||0)-(a.yaw||0)),Math.cos((b.yaw||0)-(a.yaw||0)))*t,hip=mix(a.hip,b.hip,t),p=at(hip[0],hip[2],yaw,hip[1]-.035*Math.sin(t*Math.PI)),distance=V(a.hip).sub(V(b.hip)).setY(0).length(),count=Math.max(2,Math.ceil(distance/.18/2)*2),step=Math.min(count-1,Math.floor(t*count)),within=t===1?1:t*count-step,swings=count/2;for(let i=0;i<2;i++){const completed=i===0?Math.floor((step+1)/2):Math.floor(step/2),moving=step%2===i,progress=Math.min(1,(completed+(moving?ease(within):0))/swings);p.feet[i]=mix(a.feet[i],b.feet[i],progress);if(moving)p.feet[i][1]+=.14*Math.sin(within*Math.PI);}if(raised){p.hands=[[-.30,1.50,.25],[.30,1.50,.25]].map(v=>add(v,[hip[0],0,hip[2]]));p.elbowHints=[[-1,2,.2],[1,2,.2]];delete p.handNormals;}return output(p,stage,{hands:[false,false],feet:[0,1].map(i=>step%2!==i||within<.00001||within>.99999)});}
  function raised(hip,feet){const p=at(hip[0],hip[2],0,hip[1]);p.feet=C(feet);p.hands=[[-.30,1.50,hip[2]+.25],[.30,1.50,hip[2]+.25]].map(v=>[v[0]+hip[0],v[1],v[2]]);p.elbowHints=[[-1,2,.2],[1,2,.2]];delete p.handNormals;return p;}
  const first=at(gate[0],gate[2],entryYaw,n.hip[1]-.013);for(const k of ['hip','shoulder','head'])first[k][1]+=gate[1];first.hands=first.hands.map(p=>add(p,[0,gate[1],0]));first.feet=first.feet.map(p=>add(p,[0,gate[1],0]));
  const outside=at(0,-1.40,0,.89),barOne=at(0,-1.05,0,.82);barOne.feet=[[-.23,.013,-.70],outside.feet[1]];
  const behind=at(0,-.70,0,.89);behind.feet=[[-.23,.013,-.70],[.23,.013,-.70]];
  const sideOne=at(0,-.40,0,.78);sideOne.feet=[[-.40,.013,-.10],behind.feet[1]];
  const sideTwo=at(0,-.40,0,.78);sideTwo.feet=[[-.40,.013,-.10],[.40,.013,-.10]];
  const handsUp=raised(sideTwo.hip,sideTwo.feet),one=raised([0,.70,-.05],[[-.40,.013,.55],sideTwo.feet[1]]),two=raised(rest.hip,[[-.40,.013,.55],[.40,.013,.55]]),footOne=raised(rest.hip,[rest.feet[0],two.feet[1]]),seated=raised(rest.hip,rest.feet);seated.shoulder=C(rest.shoulder);seated.head=C(rest.head);seated.kneeHints=C(rest.kneeHints||[[0,0,1],[0,0,1]]);
  for(const p of [barOne,behind,sideOne,sideTwo,handsUp,one,two,footOne])p.kneeHints=[[-.8,.2,1],[.8,.2,1]];if(preacher)for(const p of [one,two,footOne])p.kneeHints=[[0,1,1],[0,1,1]];
  const pre=C(rest);pre.handGripping=[false,false];pre.handGripStrength=[0,0];pre.gripping=false;delete pre.handNormals;delete pre.handAdvances;
  if(preacher){pre.hands=rest.elbows.map((elbow,i)=>add(elbow,[0,(metrics.arms[i].lower+metrics.arms[i].palmLength-.017)*.55,(metrics.arms[i].lower+metrics.arms[i].palmLength-.017)*.835]));}
  else{delete pre.elbows;pre.hands=[[-.32,1.14,.50],[.32,1.14,.50]];pre.elbowHints=[[-1,-.1,.5],[1,-.1,.5]];}
  const touching=C(rest);touching.handGripStrength=[0,0];touching.handGripping=[false,false];touching.gripping=false;
  const closed=C(rest);closed.handGripStrength=[1,1];closed.handGripping=[true,true];
  const nodes=[{p:first,d:0,label:'站在器材後方'},{p:outside,d:1.2,label:'走近後方底桿',walk:true},{p:barOne,d:.9,label:'抬起一腳跨過底桿',stepSide:0,via:[-.23,.32,-.75],liftOver:.35},{p:behind,d:.9,label:'另一腳跨過底桿',stepSide:1,via:[.23,.32,-.75],liftOver:.35},{p:sideOne,d:.9,label:'先沿座椅左側踏入',stepSide:0,via:[-.40,.30,-.40]},{p:sideTwo,d:.9,label:'再沿座椅右側踏入',stepSide:1,via:[.40,.30,-.40]},{p:handsUp,d:.7,label:'抬手避開靠墊'},{p:one,d:.9,label:'坐入椅面並前移一腳',stepSide:0,via:[-.40,.20,.25]},{p:two,d:.9,label:'另一腳放到器材前方',stepSide:1,via:[.40,.20,.25]},{p:footOne,d:.6,label:'調整內側腳站位',stepSide:0,via:[-.30,.15,.55]},{p:seated,d:.6,label:'調整另一腳並坐穩',stepSide:1,via:[.30,.15,.55]},{p:pre,d:1.1,label:preacher?'上臂靠好再伸手':'從外側伸向握把'},{p:touching,d:.8,label:'掌心對準握把'},{p:closed,d:.5,label:'握穩握把'}];let duration=0;for(const node of nodes){duration+=node.d;node.time=duration;}
  const exitGate=at(gate[0],gate[2],exitYaw,n.hip[1]-.013);for(const k of ['hip','shoulder','head'])exitGate[k][1]+=gate[1];exitGate.hands=exitGate.hands.map(p=>add(p,[0,gate[1],0]));exitGate.feet=exitGate.feet.map(p=>add(p,[0,gate[1],0]));
  const meta={gateOffset:gate,gateRotation:entryYaw,entryGateRotation:entryYaw,exitGateRotation:exitYaw,entryDuration:duration,exitDuration:duration,restPhase:0,stages:nodes.slice(1).map(n=>n.label)};
  return{meta,sample(direction,u){machine.update(0);const exiting=direction==='exit'||direction==='out',t=Math.max(0,Math.min(1,u));if(exiting&&t>=(duration-1.2)/duration)return walk(outside,exitGate,(t*duration-(duration-1.2))/1.2,'走回器材外側');const time=(exiting?1-t:t)*duration;let i=1;while(i<nodes.length-1&&nodes[i].time<time)i++;const a=nodes[i-1],b=nodes[i],raw=Math.max(0,Math.min(1,(time-a.time)/b.d));if(b.walk)return walk(a.p,b.p,raw,b.label,b.raised);const p=time<=0?C(first):time>=duration?C(closed):blend(a.p,b.p,ease(raw));if(b.stepSide!==undefined){const side=b.stepSide;if(b.liftOver){const from=a.p.feet[side],to=b.p.feet[side],high=Math.max(from[1],to[1])+b.liftOver,lifted=[from[0],high,from[2]],across=[to[0],high,to[2]];p.feet[side]=raw<.3?mix(from,lifted,ease(raw/.3)):raw<.7?mix(lifted,across,ease((raw-.3)/.4)):mix(across,to,ease((raw-.7)/.3));}else p.feet[side]=raw<.5?mix(a.p.feet[side],b.via,ease(raw*2)):mix(b.via,b.p.feet[side],ease((raw-.5)*2));}const hands=i===nodes.length-1?[p.handGripStrength[0]>.5,p.handGripStrength[1]>.5]:[false,false];return output(p,exiting?(EXIT_STAGES[b.label]||'起身離開器材'):b.label,{hands,feet:[0,1].map(side=>side!==b.stepSide||raw<.00001||raw>.99999)});}};
}
