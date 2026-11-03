import {solveHandContactFrame} from '../hand-contact-frame.js';
import {buildLocomotionPose} from '../locomotion.js';

const copy=value=>structuredClone(value),clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),add=(a,b)=>a.map((v,i)=>v+b[i]);
export const FLOOR_COURSE_MOTIONS={
  dance:['step-touch','march','v-step','knee-lift','hamstring-curl','side-reach','arm-combo','recover'],
  barbell:['hinge-prep','romanian-deadlift','bent-row','shallow-deadlift','biceps-curl','hold-rest','put-down-rest'],
  pilates:['breathe','toe-tap','heel-slide','knee-open','bridge','pelvic-control','rest'],
};
const BARBELL_FINGER_PROFILES={
  pronated:{thumb:[.55,.15,.25],index:[.35,1.15,.25],middle:[.95,.40,.25],ring:[.75,.40,.65],pinky:[.55,.15,.45]},
  supinated:{thumb:[.15,.90,.25],index:[.75,.40,.65],middle:[.95,.40,.85],ring:[.95,.40,.65],pinky:[.75,.15,.80]},
};
/** Contact-space group lessons. All points are relative to the top of the floor
 * or mat; the classroom owns the placement of each participant's whole rig. */
export function createFloorProgram({THREE,kind,metrics,group,materials={},geometries=new Set(),extraMaterials=new Set()}){
  if(!['dance','barbell','pilates'].includes(kind))throw new Error(`Unknown floor class: ${kind}`);
  const V=p=>new THREE.Vector3(...p),A=p=>p.toArray(),UP=new THREE.Vector3(0,1,0),X=new THREE.Vector3(1,0,0),Z=new THREE.Vector3(0,0,1);
  const n=metrics.neutral,torso=V(n.shoulder).sub(V(n.hip)),axis=torso.clone().normalize(),headSpan=n.head[1]-n.shoulder[1];
  const resources={geometries:new Set(),materials:new Set()},volumes=[],signs=[-1,1];let contacts={hands:[],feet:[]},bar=null,barPoint=null,barHeld=false,barGripTargets=null,barGripMode='pronated',courseContacts=null;
  const ownMaterial=options=>{const m=new THREE.MeshStandardMaterial(options);resources.materials.add(m);extraMaterials.add(m);return m;};
  const metal=materials.chrome||materials.steel||ownMaterial({color:'#bdc6bd',metalness:.8,roughness:.3}),rubber=materials.black||ownMaterial({color:'#25352e',roughness:.88}),mat=ownMaterial({color:'#57706a',roughness:.95});
  function mesh(parent,geometry,material){resources.geometries.add(geometry);geometries.add(geometry);const m=new THREE.Mesh(geometry,material);parent.add(m);m.castShadow=m.receiveShadow=true;return m;}
  function box(point,size,material){const m=mesh(group,new THREE.BoxGeometry(...size),material);m.position.fromArray(point);return m;}
  function rod(parent,a,b,r,material){const m=mesh(parent,new THREE.CylinderGeometry(r,r,1,14),material),p=V(a),d=V(b).sub(p);m.position.copy(p).addScaledVector(d,.5);m.scale.y=d.length();m.quaternion.setFromUnitVectors(UP,d.normalize());return m;}
  function frameQ(advance,preferred=X){const z=V(advance).normalize(),x=preferred.clone().addScaledVector(z,-preferred.dot(z)).normalize(),y=new THREE.Vector3().crossVectors(z,x).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
  const bodyQ=pose=>new THREE.Quaternion().setFromUnitVectors(axis,V(pose.shoulder).sub(V(pose.hip)).normalize());
  const armRoot=(pose,i)=>torso.clone().add(V(metrics.arms[i].shoulderOffset)).applyQuaternion(bodyQ(pose)).add(V(pose.hip));
  function neutral(){const p=buildLocomotionPose(metrics,0,0);p.feet=[[-.18,.013,.145],[.18,.013,.145]];p.kneeHints=[[0,0,1],[0,0,1]];return p;}
  function torsoPose(hip,lean=0){const p=neutral();p.hip=[...hip];p.shoulder=add(hip,[0,metrics.torsoLength*Math.cos(lean),metrics.torsoLength*Math.sin(lean)]);p.head=add(p.shoulder,[0,headSpan*Math.cos(lean),headSpan*Math.sin(lean)]);return p;}
  function arms(pose,upper,lower,preferred=[1,0,0]){
    pose.elbows=[];pose.hands=[];pose.handDirections=[];pose.handAdvances=[];delete pose.handNormals;
    for(let side=0;side<2;side++){
      const arm=metrics.arms[side],root=armRoot(pose,side),elbow=root.addScaledVector(V(upper[side]).normalize(),arm.upper),advance=V(lower[side]).normalize(),wrist=elbow.clone().addScaledVector(advance,arm.lower),frame=frameQ(A(advance),V(Array.isArray(preferred[0])?preferred[side]:preferred)),handQ=frame.clone().multiply(new THREE.Quaternion(...arm.handFrameLocal).invert());
      pose.elbows.push(A(elbow));pose.hands.push(A(wrist.add(V(arm.palmOffset).applyQuaternion(handQ))));pose.handDirections.push(A(X.clone().applyQuaternion(frame)));pose.handAdvances.push(A(Z.clone().applyQuaternion(frame)));
    }
    pose.gripping=false;pose.handGripping=[false,false];pose.handGripStrength=[0,0];pose.relaxedHands=true;return pose;
  }
  function shifted(pose,delta){const r=copy(pose);for(const k of ['hip','shoulder','head'])r[k]=add(r[k],delta);for(const k of ['hands','feet','elbows','knees'])if(r[k])r[k]=r[k].map(p=>add(p,delta));return r;}
  function blend(a,b,t){
    const q=bodyQ(a).slerp(bodyQ(b),t),hip=V(mix(a.hip,b.hip,t)),out={...copy(b),hip:A(hip),shoulder:A(torso.clone().applyQuaternion(q).add(hip)),head:mix(a.head,b.head,t),hands:[],elbows:[],handDirections:[],handAdvances:[],feet:a.feet.map((p,i)=>mix(p,b.feet[i],t)),footDirections:[],footNormals:[],handGripStrength:[],handGripping:[],kneeHints:[],gripping:false,relaxedHands:true};
    for(let side=0;side<2;side++){
      const arm=metrics.arms[side],fa=solveHandContactFrame(metrics,a,side),fb=solveHandContactFrame(metrics,b,side),ra=armRoot(a,side),rb=armRoot(b,side),root=torso.clone().add(V(arm.shoulderOffset)).applyQuaternion(q).add(hip);
      const dir=(x,y)=>{const start=V(x).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(start,V(y).normalize());return start.applyQuaternion(new THREE.Quaternion().slerp(rotation,t));};
      const upper=dir(A(V(fa.elbow).sub(ra)),A(V(fb.elbow).sub(rb))),elbow=root.addScaledVector(upper,arm.upper),lower=dir(A(V(fa.wrist).sub(V(fa.elbow))),A(V(fb.wrist).sub(V(fb.elbow)))),wrist=elbow.clone().addScaledVector(lower,arm.lower),frame=frameQ(fa.advance,V(fa.axis)).slerp(frameQ(fb.advance,V(fb.axis)),t),handQ=frame.clone().multiply(new THREE.Quaternion(...arm.handFrameLocal).invert());
      out.elbows.push(A(elbow));out.hands.push(A(wrist.add(V(arm.palmOffset).applyQuaternion(handQ))));out.handDirections.push(A(X.clone().applyQuaternion(frame)));out.handAdvances.push(A(Z.clone().applyQuaternion(frame)));
      const ga=a.handGripStrength?.[side]??((a.handGripping?.[side]??a.gripping)?1:0),gb=b.handGripStrength?.[side]??((b.handGripping?.[side]??b.gripping)?1:0),g=ga+(gb-ga)*t;out.handGripStrength.push(g);out.handGripping.push(g>.5);out.gripping||=g>.5;
      for(const key of ['footDirections','footNormals'])out[key].push(A(dir(a[key]?.[side]||(key==='footNormals'?[0,1,0]:[0,0,1]),b[key]?.[side]||(key==='footNormals'?[0,1,0]:[0,0,1]))));out.kneeHints.push(mix(a.kneeHints?.[side]||[0,0,1],b.kneeHints?.[side]||[0,0,1],t));
    }out.headPitch=(a.headPitch||0)+((b.headPitch||0)-(a.headPitch||0))*t;return out;
  }
  const floorParts=kind==='pilates'?['pelvis','torso','leftThigh','rightThigh','leftShin','rightShin','leftFoot','rightFoot','leftHand','rightHand','leftForearm','rightForearm']:['leftFoot','rightFoot'];
  if(kind==='pilates')box([0,-.025,0],[1.55,.05,2.1],mat);
  volumes.push({id:'class-floor',shape:'box',position:[0,-.06,0],size:[2.3,.10,2.8],allowedBodyParts:floorParts});
  if(kind==='barbell'){
    bar=new THREE.Group();group.add(bar);rod(bar,[-.76,0,0],[.76,0,0],.016,metal);
    for(const sign of signs){const plate=mesh(bar,new THREE.CylinderGeometry(.16,.16,.055,20),rubber);plate.rotation.z=Math.PI/2;plate.position.x=sign*.64;const collar=mesh(bar,new THREE.CylinderGeometry(.037,.037,.06,12),metal);collar.rotation.z=Math.PI/2;collar.position.x=sign*.55;}
    setBar([0,.16,.62],false);
  }
  function setBar(point,held){if(!bar)return;bar.position.fromArray(point);barPoint=[...point];barHeld=held;barGripTargets=null;}
  function orientBarGrip(pose,mode=barGripMode){
    pose.handDirections=mode==='supinated'?[[-1,0,0],[1,0,0]]:[[1,0,0],[-1,0,0]];delete pose.handNormals;delete pose.handAdvances;
    pose.handAdvances=pose.hands.map((_,i)=>{const advance=V(solveHandContactFrame(metrics,pose,i).advance);advance.x=0;advance.normalize();
      // This asset's index-to-pinky MCP row has a measured .247 advance
      // component. A supinated hand needs that small sideways component for
      // its actual knuckle row, rather than an abstract palm axis, to match
      // the steel shaft. It also keeps the wrist in line with the forearm.
      if(mode==='supinated'){const lateral=signs[i]*.247;advance.multiplyScalar(Math.sqrt(1-lateral*lateral));advance.x=lateral;}
      return A(advance.normalize());});return pose;
  }
  function calibrateBarGrip(pose){
    if(!bar)return pose;
    // The rig's palm marker is inside its metacarpals. The steel axis belongs
    // in the finger cavity, not through that marker or through a closed fist.
    // Keep the authored shaft trajectory independent from both real palms.
    const authored=copy(pose.hands),distances=authored.map(point=>Math.hypot(point[1]-barPoint[1],point[2]-barPoint[2])),approaches=distances.map(distance=>barHeld?1:ease(1-distance/.16)),thumbApproaches=distances.map(distance=>barHeld?1:ease((.30-distance)/.08));
    const lower=.032*Math.max(...approaches);for(const key of ['hip','shoulder','head'])pose[key][1]-=lower;if(pose.elbows)pose.elbows=pose.elbows.map(point=>[point[0],point[1]-lower,point[2]]);
    const frames=authored.map((_,i)=>solveHandContactFrame(metrics,pose,i)),offsets=frames.map((frame,i)=>{
      const advance=V(frame.advance),across=V(frame.axis),normal=new THREE.Vector3().crossVectors(advance,across).normalize().multiplyScalar(signs[i]),pronated=barGripMode==='pronated'?1:0;
      const delta=normal.multiplyScalar(pronated?-.030:-.020).addScaledVector(advance,-.015);delta.x=0;return A(delta);
    });
    pose.handAdvances=frames.map(f=>copy(f.advance));pose.handDirections=frames.map(f=>copy(f.axis));delete pose.handNormals;
    pose.hands=authored.map((point,i)=>add(point,offsets[i].map(v=>v*thumbApproaches[i])));
    const profile=BARBELL_FINGER_PROFILES[barGripMode],wasRelaxed=pose.relaxedHands;
    pose.handFingerFlex=signs.map((_,i)=>Object.fromEntries(Object.entries(profile).map(([finger,angles])=>[finger,angles.map((value,digit)=>{const relaxed=finger==='thumb'?[.20,.20,.13][digit]:[.30,.46,.23][digit]+(['ring','pinky'].includes(finger)?.055:0),open=finger==='thumb'?value:.12,free=(wasRelaxed?relaxed:open)+(open-(wasRelaxed?relaxed:open))*thumbApproaches[i],grip=barHeld?1:pose.handGripStrength?.[i]||0;return free+(value-free)*grip;})])));
    pose.relaxedHands=false;pose.handGripStrength=signs.map((_,i)=>Math.max(pose.handGripStrength?.[i]??(pose.handGripping?.[i]?1:0),approaches[i])*.50);
    pose.handThumbOpposition=signs.map((sign,i)=>barGripMode==='supinated'?sign*.90*thumbApproaches[i]:0);
    if(barHeld)barGripTargets=signs.map((sign,i)=>add([sign*.30,barPoint[1],barPoint[2]],offsets[i]));return pose;
  }
  function barPose(hinge=0,row=0){
    const p=torsoPose([0,n.hip[1]-.07*hinge,-.18*hinge],.70*hinge);p.feet=[[-.22,.013,.145],[.22,.013,.145]];
    const flare=clamp(row*2);p.hands=signs.map(sign=>[sign*.30,p.shoulder[1]-.48+row*.18,p.shoulder[2]+.23-row*.04]);p.handDirections=[[1,0,0],[-1,0,0]];p.elbowHints=signs.map(sign=>[sign*(.10+.90*flare),-1+.60*flare,-.06-.04*flare]);p.gripping=true;p.handGripping=[true,true];p.handGripStrength=[1,1];p.relaxedHands=false;delete p.handNormals;
    return orientBarGrip(p,'pronated');
  }
  function dance(phase){
    const p=neutral(),section=Math.min(3,Math.floor(phase*4)),local=(phase*4)%1,beat=(local*2)%1,drop=.045;
    p.hip[1]-=drop;p.shoulder[1]-=drop;p.head[1]-=drop;
    if(section===0||section===2){
      const index=Math.min(3,Math.floor(beat*4)),t=ease((beat*4)%1),x=[0,-.12,-.28,-.12,0],feet=[[[-.18,.013,.145],[.18,.013,.145]],[[-.45,.013,.145],[.18,.013,.145]],[[-.45,.013,.145],[-.10,.013,.145]],[[-.45,.013,.145],[.18,.013,.145]],[[-.18,.013,.145],[.18,.013,.145]]];
      p.hip[0]+=x[index]+(x[index+1]-x[index])*t;p.shoulder[0]=p.hip[0];p.head[0]=p.hip[0];p.feet=feet[index].map((point,i)=>mix(point,feet[index+1][i],t));const moving=index===0||index===3?0:1;p.feet[moving][1]+=.065*Math.sin(t*Math.PI);
    }else{
      const angle=beat*Math.PI*2;p.feet=p.feet.map((point,i)=>[point[0],point[1]+Math.max(0,Math.sin(angle+(i?Math.PI:0)))*.10,point[2]]);p.hip[0]+=.025*Math.sin(angle);p.shoulder[0]=p.hip[0];p.head[0]=p.hip[0];
    }
    const wave=Math.sin(beat*Math.PI*2),raise=section===2?.5-.5*Math.cos(beat*Math.PI*2):(section===3?.05:.20)*Math.sin(local*Math.PI)**2,upper=signs.map(sign=>[sign*(.22+raise),-.95+raise*.8,.12]),lower=signs.map(sign=>[sign*.18,-.82+raise*.6,.40+Math.abs(wave)*.12]);return arms(p,upper,lower);
  }
  function supine(lift=0,bridge=0){
    const p=neutral(),hip=[0,.12+.035*bridge,0],shoulder=[0,.12,-metrics.torsoLength];p.hip=hip;p.shoulder=shoulder;p.head=[0,.13,-metrics.torsoLength-headSpan];p.headPitch=-.30+.24*bridge;p.feet=[[-.18,.013,.64],[.18,.013,.64]];p.kneeHints=[[0,1,.2],[0,1,.2]];p.handDirections=[[1,0,0],[1,0,0]];
    arms(p,signs.map(sign=>[sign*.12,-.10,1]),signs.map(sign=>[sign*.08,-.02,1]),[[1,0,0],[-1,0,0]]);
    if(lift){const side=lift>0?0:1,t=Math.abs(lift);p.feet[side]=[signs[side]*.18,.013+.16*t,.64-.16*t];}return p;
  }
  function rawSample(phase){
    phase=clamp(phase);
    if(kind==='dance')return dance(phase===1?0:phase);
    if(kind==='barbell'){
      let hinge=0,row=0;if(phase<.2)hinge=.08*Math.sin(phase/.2*Math.PI)**2;
      else if(phase<.55)hinge=Math.sin((phase-.2)/.35*Math.PI*3)**2;
      else if(phase<.60)hinge=ease((phase-.55)/.05);
      else if(phase<.80){hinge=1;row=Math.sin((phase-.60)/.20*Math.PI*3)**2;}
      else if(phase<.85)hinge=1-ease((phase-.80)/.05);
      const pose=barPose(hinge,row);setBar([0,pose.hands[0][1],pose.hands[0][2]],true);return pose;
    }
    let lift=0,bridge=0;if(phase>=.20&&phase<.55)lift=Math.sin((phase-.20)/.35*Math.PI*4);else if(phase>=.55&&phase<.85)bridge=Math.sin((phase-.55)/.30*Math.PI*2)**2;return supine(lift,bridge);
  }
  function alignHeldBar(pose){
    const center=pose.hands[0].map((v,i)=>(v+pose.hands[1][i])/2);pose.hands=signs.map(sign=>[sign*.30,center[1],center[2]]);orientBarGrip(pose);
    pose.gripping=true;pose.handGripping=[true,true];pose.handGripStrength=[1,1];setBar([0,center[1],center[2]],true);return pose;
  }
  function danceCourse(id,phase,intensity){
    const p=neutral(),e=Math.sin(Math.PI*phase)**2,wave=Math.sin(Math.PI*2*phase),amount=.35+.65*intensity;
    for(const key of ['hip','shoulder','head'])p[key][1]-=.045;
    let raise=0,forward=0;
    if(['step-touch','side-reach'].includes(id)){
      const points=[[-.18,.18],[-.44,.18],[-.44,-.08],[-.44,.18],[-.18,.18],[-.18,.44],[.08,.44],[-.18,.44],[-.18,.18]],hips=[0,-.12,-.26,-.12,0,.12,.26,.12,0],j=Math.min(7,Math.floor(phase*8)),t=ease(phase*8-j),moving=[0,1,1,0,1,0,0,1][j];
      p.feet=signs.map((sign,i)=>[points[j][i]+(points[j+1][i]-points[j][i])*t,.013,.145]);p.feet[moving][1]+=.045*Math.sin(t*Math.PI)*amount;
      const x=(hips[j]+(hips[j+1]-hips[j])*t)*amount;for(const key of ['hip','shoulder','head'])p[key][0]=x;
      p.feet=p.feet.map((point,i)=>[signs[i]*.18+(point[0]-signs[i]*.18)*amount,point[1],point[2]]);if(id==='side-reach')raise=.75*e*amount;
    }else if(id==='v-step'){
      const points=[[[-.18,.145],[.18,.145]],[[-.37,.38],[.18,.145]],[[-.37,.38],[.37,.38]],[[-.18,.145],[.37,.38]],[[-.18,.145],[.18,.145]]],j=Math.min(3,Math.floor(phase*4)),t=ease(phase*4-j),moving=j%2;
      p.feet=points[j].map((point,i)=>[signs[i]*.18+(point[0]+(points[j+1][i][0]-point[0])*t-signs[i]*.18)*amount,.013+(i===moving?.055*Math.sin(t*Math.PI)*amount:0),.145+(point[1]+(points[j+1][i][1]-point[1])*t-.145)*amount]);
      const z=.10*e*amount;for(const key of ['hip','shoulder','head'])p[key][2]+=z;forward=.25*e*amount;
    }else{
      const height=(id==='knee-lift'?.17:id==='hamstring-curl'?.14:id==='recover'?.035:.085)*amount;
      p.feet=p.feet.map((point,i)=>{const lift=Math.max(0,wave*(i?-1:1));return[point[0],point[1]+height*lift,point[2]+(id==='hamstring-curl'?-.17:id==='knee-lift'?.055:0)*lift*amount];});
      if(id==='arm-combo'){raise=.72*e*amount;forward=.40*e*amount;}
      if(id==='march'||id==='knee-lift')forward=.14*Math.abs(wave)*amount;
    }
    return arms(p,signs.map(sign=>[sign*(.22+raise),-.95+raise*.8,.12+forward]),signs.map(sign=>[sign*.18,-.82+raise*.6,.40+forward]),[0,0,1]);
  }
  function barbellCourse(id,phase,intensity){
    const e=Math.sin(Math.PI*phase)**2,amount=.30+.70*intensity;
    if(id==='hold-rest')return barPose(0,0);
    if(id==='bent-row')return barPose(.80*amount,Math.min(.90,1.15*intensity)*e);
    if(id==='biceps-curl'){
      const p=barPose(0,0),curlAmount=.45+.55*intensity;p.hands=p.hands.map(point=>add(point,[0,.42*e*curlAmount,.035*e*curlAmount]));p.elbowHints=[[-.10,-1,-.06],[.10,-1,-.06]];p.handDirections=[[-1,0,0],[1,0,0]];delete p.handAdvances;return p;
    }
    if(id==='shallow-deadlift'){
      const p=barPose(.55*e*amount,0),drop=.12*e*amount;for(const key of ['hip','shoulder','head'])p[key][1]-=drop;p.hands=p.hands.map(point=>[point[0],point[1]-drop,point[2]]);return p;
    }
    return barPose((id==='hinge-prep'?.35:1)*e*amount,0);
  }
  function pilatesCourse(id,phase,intensity){
    const e=Math.sin(Math.PI*phase)**2,wave=Math.sin(Math.PI*2*phase),amount=.35+.65*intensity;
    if(id==='toe-tap')return supine(wave*amount,0);
    if(id==='bridge')return supine(0,e*amount);
    const p=supine(0,0);
    if(id==='heel-slide')p.feet=p.feet.map((point,i)=>[point[0],point[1],point[2]+.13*Math.max(0,wave*(i?-1:1))*amount]);
    else if(id==='knee-open')p.kneeHints=signs.map(sign=>[sign*.55*e*amount,1,.2]);
    else if(id==='pelvic-control')return supine(0,.20*e*amount);
    else if(id==='breathe')p.headPitch+=.012*e*amount;
    return p;
  }
  const rest=rawSample(0),gate=[0,0,-1.55],nodes=[];
  function append(pose,seconds,label,extra={}){nodes.push({pose:copy(pose),seconds,label,...extra});}
  append(shifted(neutral(),gate),0,'站在課程入口');
  if(kind==='dance'){
    append(neutral(),2.5,'走到自己的位置',{walk:true});append(rest,.9,'站穩並準備跟拍');
  }else if(kind==='barbell'){
    const at=torsoPose([0,.38,.02],1.0);at.feet=copy(rest.feet);at.hands=[[-.30,.16,.62],[.30,.16,.62]];at.handDirections=[[1,0,0],[-1,0,0]];at.handAdvances=[[0,-1,0],[0,-1,0]];at.elbowHints=[[-1,-.6,.5],[1,-.6,.5]];at.gripping=false;at.handGripping=[false,false];at.handGripStrength=[0,0];delete at.handNormals;
    append(neutral(),2.5,'走近課程槓鈴',{walk:true});const before=copy(at);before.hands=before.hands.map(p=>add(p,[0,.16,0]));append(before,1.2,'屈髖並彎膝伸手');append(at,.8,'掌心對準槓把');const grasp=copy(at);grasp.handGripping=[true,true];grasp.handGripStrength=[1,1];grasp.gripping=true;append(grasp,.45,'握穩槓把',{held:true});append(rest,1.8,'沿腿前方平順站起',{held:true});
  }else{
    const stood=shifted(neutral(),[0,0,.46]);stood.feet=copy(rest.feet);const crouch=torsoPose([0,.58,.22],.10);crouch.feet=copy(rest.feet);arms(crouch,signs.map(s=>[s*.45,-.6,.65]),signs.map(s=>[s*.2,-.6,.70]));const seated=torsoPose([0,.23,0],0);seated.feet=copy(rest.feet);seated.hands=[[-.40,.36,.1],[.40,.36,.1]];seated.elbowHints=[[-1,-.4,.2],[1,-.4,.2]];delete seated.handNormals;
    append(stood,3,'走到軟墊前方',{walk:true});append(crouch,1.3,'雙腳踩穩並降低重心');append(seated,1.4,'慢慢坐到軟墊');append(rest,2.2,'收下上身並躺穩');
  }
  let duration=0;for(const node of nodes){duration+=node.seconds;node.time=duration;}
  const meta={entryDuration:duration,exitDuration:duration,restPhase:0,gateOffset:gate,gateRotation:0,exitGateRotation:0,stages:nodes.slice(1).map(n=>({label:n.label,duration:n.seconds}))};
  if(bar)setBar([0,.16,.62],false);
  function track(pose){contacts={hands:copy(pose.hands),feet:copy(pose.feet)};return pose;}
  function sampleLifecycle(direction,u){
    const entering=direction==='enter'||direction==='entry',fraction=entering?clamp(u):1-clamp(u),time=fraction*duration;let index=1;while(index<nodes.length-1&&nodes[index].time<time)index++;const a=nodes[index-1],b=nodes[index],t=b.seconds?clamp((time-a.time)/b.seconds):1;let pose;
    if(entering&&clamp(u)<1e-8)barGripMode='pronated';
    if(b.walk){const weight=ease(t),from=a.pose.hip,to=b.pose.hip,delta=mix(from,to,weight).map((v,i)=>v-n.hip[i]);delta[1]+=.013;pose=shifted(buildLocomotionPose(metrics,t*b.seconds,Math.min(1,t*5,(1-t)*5)),delta);}
    else{const from=copy(a.pose),to=copy(b.pose);if(bar){
      if(barGripMode==='supinated'){if(index-1===2)from.hands=nodes[3].pose.hands.map(point=>add(point,[0,.04,-.14]));if(index===2)to.hands=nodes[3].pose.hands.map(point=>add(point,[0,.04,-.14]));}
      if(index-1>=2)orientBarGrip(from);if(index>=2)orientBarGrip(to);
      if(barGripMode==='supinated'&&(index-1===2||index===2)){const contact=orientBarGrip(copy(nodes[3].pose));for(const [p,j]of [[from,index-1],[to,index]])if(j===2){p.handDirections=copy(contact.handDirections);p.handAdvances=copy(contact.handAdvances);}}
    }pose=blend(from,to,ease(t));}
    if(time<1e-8)pose=copy(nodes[0].pose);if(time>duration-1e-8)pose=copy(rest);
    const held=kind==='barbell'&&(time>=nodes.find(n=>n.held)?.time-1e-7);
    if(held){const center=pose.hands[0].map((v,i)=>(v+pose.hands[1][i])/2);pose.hands=signs.map(sign=>[sign*.30,center[1],center[2]]);orientBarGrip(pose);}
    if(bar)setBar(held?[0,pose.hands[0][1],pose.hands[0][2]]:[0,.16,.62],held);
    const enterLabel=b.label,exitLabels={'走到自己的位置':'走回教室入口','站穩並準備跟拍':'放鬆雙臂準備離開','走近課程槓鈴':'離開槓鈴並回到入口','屈髖並彎膝伸手':'放手後慢慢站直','掌心對準槓把':'鬆開槓把','握穩槓把':'確認槓片落穩再放手','沿腿前方平順站起':'屈髖彎膝，把槓片放回地面','走到軟墊前方':'離開軟墊','雙腳踩穩並降低重心':'雙腳踩穩後起身','慢慢坐到軟墊':'從軟墊坐起','收下上身並躺穩':'收回雙腳，慢慢坐起'};
    if(bar)calibrateBarGrip(pose);track(pose);return{pose,offset:[0,0,0],rotation:0,stage:entering?enterLabel:exitLabels[enterLabel]||'離開課程',contacts:{hands:held?[true,true]:[false,false],feet:pose.feet.map(p=>p[1]<.025)}};
  }
  function sampleCourse(frame={}){
    courseContacts=null;
    if(frame.complete){barGripMode='pronated';const pose=rawSample(0);if(bar)calibrateBarGrip(pose);courseContacts={hands:kind==='barbell'?[true,true]:[false,false],feet:pose.feet.map(p=>p[1]<.025)};return track(pose);}
    const id=frame.motionId||FLOOR_COURSE_MOTIONS[kind][0],phase=clamp(frame.repPhase??0),intensity=clamp(frame.intensity??1),envelope=ease(clamp(frame.envelope??1));
    if(kind==='barbell'&&id==='put-down-rest'){
      const seconds=frame.block?.durationSeconds??frame.block?.seconds??30,local=frame.localSeconds??clamp(frame.progress??0)*seconds,settledTime=nodes[1].time+.0000001,travel=duration-settledTime;
      barGripMode=local<travel?(frame.previousBlock?.motionId==='biceps-curl'?'supinated':'pronated'):(frame.nextBlock?.motionId==='biceps-curl'?'supinated':'pronated');
      const progress=local<travel?1-local/duration:local>seconds-travel?(settledTime+local-(seconds-travel))/duration:settledTime/duration,life=sampleLifecycle('enter',clamp(progress));courseContacts=life.contacts;return life.pose;
    }
    if(kind==='barbell')barGripMode=id==='biceps-curl'?'supinated':'pronated';
    let pose=kind==='dance'?danceCourse(id,phase,intensity):kind==='barbell'?barbellCourse(id,phase,intensity):pilatesCourse(id,phase,intensity);
    const ready=kind==='barbell'&&id==='biceps-curl'?orientBarGrip(barbellCourse(id,0,intensity),'supinated'):rest;
    if(envelope<1)pose=blend(ready,pose,envelope);if(kind==='barbell'){alignHeldBar(pose);calibrateBarGrip(pose);}
    courseContacts={hands:kind==='barbell'?[true,true]:[false,false],feet:pose.feet.map(p=>p[1]<.025)};return track(pose);
  }
  const blocks={dance:[[0,.25,'踏併步','向側邊踏出，再把另一腳收近，腳步保持輕柔。'],[.25,.5,'原地抬膝','輪流抬腳，手臂跟著步伐擺動。'],[.5,.75,'踏步配合抬臂','先跟上腳步，再把手臂向側上方打開。'],[.75,1,'踏步放鬆','手臂慢慢放低，腳步回到原地。']],barbell:[[0,.20,'握槓站穩與屈髖準備','雙腳踩穩，握住短槓，先熟悉小幅度屈髖。'],[.20,.55,'羅馬尼亞硬舉','髖部向後送，讓槓沿腿前方平順下降，再回到站姿。'],[.55,.85,'屈髖划船','維持屈髖姿勢，彎肘拉起短槓，再慢慢放回。'],[.85,1,'回到站姿','控制速度站直，放鬆肩頸，準備下一段。']],pilates:[[0,.20,'仰躺呼吸','頭、肩和骨盆躺穩，保持平順呼吸。'],[.20,.55,'交替抬腳','一次抬一隻腳，骨盆保持穩定，不用憋氣。'],[.55,.85,'小幅橋式','雙腳踩穩，緩慢抬起骨盆，再一節節放回。'],[.85,1,'放回骨盆、緩和呼吸','雙腳回到墊上，放鬆肩頸並調整呼吸。']]};
  return{
    getMetadata:()=>copy(meta),sample(phase,cycle=phase){courseContacts=null;barGripMode='pronated';const pose=rawSample(phase);if(bar)calibrateBarGrip(pose);return track(pose);},sampleLifecycle,sampleCourse,getCourseMotionIds:()=>[...FLOOR_COURSE_MOTIONS[kind]],getCourseContacts:()=>courseContacts?copy(courseContacts):null,
    getCollisionVolumes(){return[...copy(volumes),...(barPoint?signs.map(sign=>({id:`class-barbell-plate-${sign}`,shape:'box',position:add(barPoint,[sign*.64,0,0]),size:[.055,.32,.32],allowedBodyParts:[]})):[]),...(barPoint?[{id:'class-barbell-shaft',shape:'capsule',start:add(barPoint,[-.76,0,0]),end:add(barPoint,[.76,0,0]),radius:.016,allowedBodyParts:['leftHand','rightHand']}]:[])];},
    getActualContacts(){const result=copy(contacts);if(barHeld&&barGripTargets)result.hands=copy(barGripTargets);else if(barHeld&&barPoint)result.hands=signs.map(sign=>[sign*.30,barPoint[1],barPoint[2]]);return result;},getSegment(phase){const b=blocks[kind].find(b=>phase>=b[0]&&phase<b[1])||blocks[kind].at(-1);return{label:b[2],description:b[3]};},
    getPropState:()=>({kind,held:barHeld,barPosition:barPoint?copy(barPoint):null,gripMode:barGripMode}),
  };
}
