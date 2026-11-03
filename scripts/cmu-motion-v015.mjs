import * as THREE from 'three';

const rad=Math.PI/180,scale=.056444;
const rotation=angles=>new THREE.Quaternion().setFromEuler(new THREE.Euler(angles[0]*rad,angles[1]*rad,angles[2]*rad,'ZYX'));
const rounded=value=>Number(value.toFixed(7));
/** Offline ASF/AMC importer. It does not stretch the game's rig or bind raw joints to equipment. */
export function parseCmuMotion(asf,amc,{fps=60}={}){
  if(!Number.isFinite(fps)||fps<=0||fps>240)throw Error('Invalid capture frame rate');
  const boneText=asf.split(':bonedata')[1]?.split(':hierarchy')[0],hierarchy=asf.split(':hierarchy')[1];
  if(!boneText||!hierarchy||!amc.includes(':DEGREES'))throw Error('Expected a CMU ASF skeleton and degree AMC');
  const bones=new Map(),children=new Map();
  for(const block of boneText.matchAll(/begin([\s\S]*?)end/g)){
    const fields=Object.fromEntries(block[1].trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/)).map(([key,...value])=>[key,value]));
    if(!fields.name||!fields.direction||!fields.axis||!fields.length)throw Error('Incomplete skeleton bone');
    const axis=rotation(fields.axis.slice(0,3).map(Number));
    bones.set(fields.name[0],{axis,inverse:axis.clone().invert(),direction:new THREE.Vector3(...fields.direction.map(Number)),length:Number(fields.length[0])*scale,dof:fields.dof||[]});
  }
  for(const line of hierarchy.split(/\r?\n/)){const [name,...list]=line.trim().split(/\s+/);if(list.length)children.set(name,list);}
  const raw=[];let frame;
  for(const line of amc.split(/\r?\n/)){
    const text=line.trim();if(/^\d+$/.test(text)){frame={frame:Number(text)};raw.push(frame);}
    else if(frame&&/^[a-z]/i.test(text)){const [name,...values]=text.split(/\s+/);frame[name]=values.map(Number);}
  }
  if(!raw.length)throw Error('Capture contains no frames');
  const samples=raw.map((data,index)=>{
    if(data.frame!==index+1||data.root?.length!==6||data.root.some(value=>!Number.isFinite(value)))throw Error('Missing/nonfinite root or non-contiguous frame');
    const positions=new Map([['root',new THREE.Vector3(...data.root.slice(0,3).map(value=>value*scale))]]),rotations=new Map([['root',rotation(data.root.slice(3))]]);
    function walk(parent){for(const name of children.get(parent)||[]){
      const bone=bones.get(name);if(!bone)throw Error('Unknown hierarchy bone '+name);
      if(bone.dof.length&&(data[name]?.length!==bone.dof.length||data[name].some(value=>!Number.isFinite(value))))throw Error('Missing/nonfinite joint '+name+' at '+data.frame);
      const angles=[0,0,0];for(const [i,key]of bone.dof.entries()){if(!/^r[xyz]$/.test(key))throw Error('Unsupported joint channel '+key);angles['xyz'.indexOf(key[1])]=data[name][i];}
      const q=rotations.get(parent).clone().multiply(bone.axis).multiply(rotation(angles)).multiply(bone.inverse);
      rotations.set(name,q);positions.set(name,positions.get(parent).clone().add(bone.direction.clone().multiplyScalar(bone.length).applyQuaternion(q)));walk(name);
    }}walk('root');
    const heading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-data.root[4]*rad);
    const dir=(a,b)=>{if(!positions.has(a)||!positions.has(b))throw Error('Missing arm segment');const vector=positions.get(b).clone().sub(positions.get(a)).applyQuaternion(heading).normalize();return[-vector.x,vector.y,vector.z].map(rounded);};
    const upper=[dir('lclavicle','lhumerus'),dir('rclavicle','rhumerus')],lower=[dir('lhumerus','lradius'),dir('rhumerus','rradius')];
    const elbowDegrees=upper.map((vector,side)=>rounded(Math.acos(THREE.MathUtils.clamp(vector.reduce((sum,value,i)=>sum+value*lower[side][i],0),-1,1))/rad));
    const thighs=[dir('lhipjoint','lfemur'),dir('rhipjoint','rfemur')],shins=[dir('lfemur','ltibia'),dir('rfemur','rtibia')];
    const kneeDegrees=thighs.map((vector,side)=>rounded(Math.acos(THREE.MathUtils.clamp(vector.reduce((sum,value,i)=>sum+value*shins[side][i],0),-1,1))/rad));
    return{frame:data.frame,timeSeconds:index/fps,upper,lower,elbowDegrees,thighs,shins,kneeDegrees};
  });
  return{fps,frames:samples.length,duration:samples.length/fps,scaleMetres:scale,coordinateConvention:'Game-local x is mirrored from CMU; y up, root yaw removed. Directions are reference data only.',samples};
}

export function measuredPressCurve(motion,{firstFrame,lastFrame,peakFrame,samples=121,channel='elbowDegrees'}={}){
  if(![firstFrame,lastFrame,peakFrame,samples].every(Number.isInteger)||firstFrame<1||lastFrame>motion.frames||firstFrame>=peakFrame||peakFrame>=lastFrame||samples<5)throw Error('Invalid measured press crop');
  if(!['elbowDegrees','kneeDegrees'].includes(channel))throw Error('Unsupported timing channel');
  const mean=index=>motion.samples[index][channel].reduce((a,b)=>a+b,0)/2*(channel==='kneeDegrees'?-1:1);
  const smooth=index=>{let sum=0,count=0;for(let offset=-6;offset<=6;offset++){const at=Math.max(firstFrame-1,Math.min(lastFrame-1,index+offset));sum+=mean(at);count++;}return sum/count;};
  const values=Array.from({length:lastFrame-firstFrame+1},(_,i)=>smooth(i+firstFrame-1)),peakIndex=peakFrame-firstFrame;
  const low=values[peakIndex],start=values[0],end=values.at(-1),normalized=values.map((value,index)=>Math.max(0,Math.min(1,(index<=peakIndex?start-value:end-value)/Math.max(.001,(index<=peakIndex?start:end)-low))));
  // Keep the measured timing while removing direction reversals from marker noise.
  for(let i=1;i<=peakIndex;i++)normalized[i]=Math.max(normalized[i-1],normalized[i]);
  for(let i=normalized.length-2;i>=peakIndex;i--)normalized[i]=Math.max(normalized[i+1],normalized[i]);
  normalized[0]=normalized[normalized.length-1]=0;normalized[peakIndex]=1;
  const progress=Array.from({length:samples},(_,i)=>{const position=i/(samples-1)*(normalized.length-1),index=Math.floor(position),fraction=position-index;return rounded(normalized[index]+((normalized[index+1]??normalized[index])-normalized[index])*fraction);});
  const maximum=Math.max(...progress);for(let i=0;i<progress.length;i++)progress[i]=rounded(progress[i]/maximum);
  progress[0]=progress[progress.length-1]=0;
  return{firstFrame,lastFrame,peakFrame,fps:motion.fps,sourceDurationSeconds:(lastFrame-firstFrame)/motion.fps,peakPhase:peakIndex/(lastFrame-firstFrame),progress,filter:{movingAverageRadius:6,monotonicWithinEachHalf:true,channel,normalization:'mean left/right measured joint flexion; no captured root/foot/hand translation is applied'}};
}
