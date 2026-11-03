import * as THREE from 'three';
import {solveHandContactFrame} from './hand-contact-frame.js';
import {solveFreeDumbbellShaft} from './free-dumbbell-shaft.js';

const V=p=>new THREE.Vector3(...p),copy=p=>structuredClone(p);
export const DUMBBELL_IDS=Object.freeze(['dumbbell-curl','dumbbell-bench-press','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-goblet-squat','dumbbell-romanian-deadlift']);
const CLOSED={thumb:[.55,.15,.25],index:[.35,1.15,.25],middle:[.95,.40,.25],ring:[.75,.40,.65],pinky:[.55,.15,.45]};
// Free dumbbells need a power grasp with visible distal-joint curl. Cable
// adapters and the two-handed goblet support retain their original profiles.
export const DUMBBELL_POWER_GRIP=Object.freeze({thumb:Object.freeze([.9457793618165096,.057203486810139106,.19872645476754758]),index:Object.freeze([1.1391934149582925,.2380233084429197,.8371716198060581]),middle:Object.freeze([1.065586296864181,.5031512244160716,.9324724422852327]),ring:Object.freeze([1.0524086459018458,.16569617475810483,1.178459691243376]),pinky:Object.freeze([.6699880634771659,.03529844386244373,.9799828870507347])});
export function dumbbellContactOffsets(id,strength=1){const power=DUMBBELL_IDS.includes(id)&&id!=='dumbbell-goblet-squat',g=THREE.MathUtils.clamp(strength,0,1);return power?{normal:-.030+.014*g,advance:-.015+.005*g}:{normal:-.030,advance:-.015};}
const OPEN={thumb:[.55,.15,.25],index:[.12,.12,.12],middle:[.12,.12,.12],ring:[.12,.12,.12],pinky:[.12,.12,.12]};
const lerp=(a,b,t)=>a+(b-a)*t;
export function prepareDumbbellRawPose(id,metrics,input){
  if(input.dbRawPrepared)return copy(input);
  const raw=copy(input);raw.handDirections=[];raw.handAdvances=[];raw.handNormals=copy(input.handNormals||[null,null]);
  for(let side=0;side<2;side++){
    if(id==='dumbbell-single-arm-row'&&side===0){raw.handDirections.push(copy(input.handDirections?.[side]||[0,0,1]));raw.handAdvances.push(copy(input.handAdvances?.[side]||null));continue;}raw.handNormals[side]=null;
    if(id==='dumbbell-curl'){const u=THREE.MathUtils.clamp((input.hands[side][1]-.8518823723678755)/.018,0,1);raw.hands[side][0]+=(side?1:-1)*.020*u*u*(3-2*u);}
    const f=solveHandContactFrame(metrics,input,side),axis=V(input.handDirections?.[side]||f.axis);
    if(['dumbbell-shoulder-press','dumbbell-bench-press'].includes(id)&&side===1)axis.negate();
    if(id==='dumbbell-curl'&&side===0)axis.x=-axis.x;
    let advance=V(input.handAdvances?.[side]||f.advance);
    advance.addScaledVector(axis,-advance.dot(axis)/axis.lengthSq()).normalize();raw.handDirections.push(axis.normalize().toArray());raw.handAdvances.push(advance.toArray());
  }
  raw.dbRawPrepared=true;return raw;
}

/** A DB-only skin contact adapter. gearPose is the independent physical
 * weight frame; pose.hands are calibrated palm markers on its skin
 * contact surface. No skeleton or generic hand solver is changed. */
export function adaptDumbbellGrip({id,metrics,raw,mask=null,lifecycle=false}){
  if(!lifecycle)raw=prepareDumbbellRawPose(id,metrics,raw);
  const pose=copy(raw),gearPose=copy(raw),one=id==='dumbbell-single-arm-row',goblet=id==='dumbbell-goblet-squat';
  const active=mask||[!one,true],weight=lifecycle?(raw.dbGripWeight??0):1;
  const power=DUMBBELL_IDS.includes(id)&&!goblet,closedProfile=power?DUMBBELL_POWER_GRIP:CLOSED;
  pose.handDirections??=[null,null];pose.handAdvances??=[null,null];pose.handGripStrength??=raw.hands.map((_,i)=>(raw.handGripping?.[i]??raw.gripping??true)?1:0);pose.handGripping??=raw.hands.map((_,i)=>raw.gripping??true);pose.handFingerFlex=[{},{}];pose.handThumbOpposition=[0,0];
  const contactTargets=copy(raw.hands);
  if(weight<=0)return{pose,gearPose,contactTargets};
  for(let side=0;side<2;side++){
    if(!active[side])continue;
    const strength=THREE.MathUtils.clamp(raw.handGripStrength?.[side]??((raw.handGripping?.[side]??raw.gripping)?1:0),0,1),offsets=dumbbellContactOffsets(id,strength);
    let axis=V(raw.handDirections?.[side]||[0,0,1]);
    const reference=solveHandContactFrame(metrics,raw,side);
    let advance=V(raw.handAdvances?.[side]||reference.advance);if(goblet){advance.set((side?-1:1)*Math.cos(1.3),0,Math.sin(1.3));axis.set((side?1:-1)*Math.sin(1.3),0,Math.cos(1.3));}advance.addScaledVector(axis,-advance.dot(axis)/axis.lengthSq()).normalize();axis.normalize();
    if(goblet&&weight<1){const matrix=(x,z)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,new THREE.Vector3().crossVectors(z,x).normalize(),z)),qa=matrix(V(reference.axis),V(reference.advance)),qb=matrix(axis,advance),q=qa.slerp(qb,weight);axis=new THREE.Vector3(1,0,0).applyQuaternion(q);advance=new THREE.Vector3(0,0,1).applyQuaternion(q);}
    const freeShaft=lifecycle&&!goblet&&DUMBBELL_IDS.includes(id)?THREE.MathUtils.clamp(raw.dbFreeShaftWeight||0,0,1):0;
    // A free shaft uses the authored elbow pole directly. The older fixed-
    // shaft elbow correction must fade out with that constraint, otherwise
    // its repeated outside correction can rapidly flip the elbow plane.
    const natural=(lifecycle?(raw.dbNaturalGrip||0):1)*(1-freeShaft);
    if(!goblet&&natural>0){const initial=advance.clone(),candidate=copy(raw),restAxis=V(metrics.neutral.shoulder).sub(V(metrics.neutral.hip)).normalize(),bodyQ=new THREE.Quaternion().setFromUnitVectors(restAxis,V(raw.shoulder).sub(V(raw.hip)).normalize()),root=V(metrics.neutral.shoulder).sub(V(metrics.neutral.hip)).add(V(metrics.arms[side].shoulderOffset)).applyQuaternion(bodyQ).add(V(raw.hip));candidate.handNormals=undefined;candidate.handAdvances=[...(raw.handAdvances||[null,null])];candidate.handDirections=[...(raw.handDirections||[null,null])];candidate.handDirections[side]=axis.toArray();candidate.elbowHints=raw.elbows?raw.elbows.map((p,i)=>{const r=V(metrics.neutral.shoulder).sub(V(metrics.neutral.hip)).add(V(metrics.arms[i].shoulderOffset)).applyQuaternion(bodyQ).add(V(raw.hip));return V(p).sub(r).normalize().toArray();}):copy(raw.elbowHints||[[-.5,-1,.2],[.5,-1,.2]]);candidate.elbows=undefined;
      for(let i=0;i<12;i++){const normal=new THREE.Vector3().crossVectors(advance,axis).multiplyScalar(side?1:-1).normalize(),delta=normal.multiplyScalar(offsets.normal).addScaledVector(advance,offsets.advance);candidate.hands[side]=V(raw.hands[side]).add(delta).toArray();candidate.handAdvances[side]=advance.toArray();const solved=solveHandContactFrame(metrics,candidate,side),forearm=V(solved.wrist).sub(V(solved.elbow)),next=forearm.addScaledVector(axis,-forearm.dot(axis)).normalize(),outside=(side?1:-1)*(solved.elbow[0]-raw.hip[0]),error=Math.max(0,.245-outside);if(error>0)candidate.elbowHints[side]=V(candidate.elbowHints[side]).normalize().add(new THREE.Vector3((side?1:-1)*error*10,0,0)).normalize().toArray();if(next.distanceToSquared(advance)<1e-10&&error<.0001){advance=next;break;}advance.lerp(next,.65).normalize();}
      advance=initial.lerp(advance,natural).normalize();
      const hintA=raw.elbows?V(raw.elbows[side]).sub(root).normalize().toArray():raw.elbowHints?.[side]||[(side?1:-1)*.5,-1,.2];pose.elbowHints??=copy(candidate.elbowHints);pose.elbowHints[side]=hintA.map((v,i)=>v+(candidate.elbowHints[side][i]-v)*natural);pose.elbows=undefined;
    }
    // Once the weight is clear of its tray, an independent dumbbell can roll
    // with the forearm. Keeping its shaft locked to a world axis would force
    // the wrist to bend during carrying and sitting. The physical shaft and
    // the palm frame share this solution; rack contacts and exercise loops
    // never opt in, and a two-handed rigid cable bar cannot opt in.
    if(freeShaft>0){
      const solved=solveFreeDumbbellShaft({metrics,pose,side,center:raw.hands[side],axis,advance,contactWeight:weight,freedom:freeShaft,contactOffsets:offsets});axis=solved.axis;advance=solved.advance;
      gearPose.handDirections??=[null,null];gearPose.handDirections[side]=axis.toArray();
    }
    const normal=new THREE.Vector3().crossVectors(advance,axis).multiplyScalar(side?1:-1).normalize(),torsoVector=V(raw.shoulder).sub(V(raw.hip)).normalize(),lean=Math.acos(THREE.MathUtils.clamp(torsoVector.y,-1,1));
    const delta=goblet?new THREE.Vector3((side?1:-1)*.005,-.075-.008*Math.min(1,lean/.65),.025):normal.multiplyScalar(offsets.normal).addScaledVector(advance,offsets.advance);
    const target=V(raw.hands[side]).addScaledVector(delta,weight).toArray();
    pose.hands[side]=target;pose.handDirections[side]=axis.toArray();pose.handAdvances[side]=advance.toArray();if(pose.handNormals)pose.handNormals[side]=null;
    if(power)pose.handThumbOpposition[side]=(side?1:-1)*.6443248154640014*strength*weight;
    for(const finger of Object.keys(CLOSED))pose.handFingerFlex[side][finger]=closedProfile[finger].map((v,i)=>{const rest=raw.relaxedHands?(finger==='thumb'?[.20,.20,.13][i]:[.30,.46,.23][i]+(['ring','pinky'].includes(finger)?.055:0)):(finger==='thumb'?.13:.12),closed=finger==='thumb'?.48:i===0?.68:i===1?1.12:.75,original=lerp(rest,closed,strength);return lerp(original,goblet?.2:lerp(OPEN[finger][i],v,strength),weight);});
    pose.handGripping[side]=raw.handGripping?.[side]??raw.gripping??true;
    contactTargets[side]=target;
  }
  return{pose,gearPose,contactTargets};
}
