import * as THREE from 'three';

const radians=Math.PI/180;
const rotation=angles=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles.map(value=>value*radians),'ZYX'));
const finiteVector=(values,size)=>Array.isArray(values)&&values.length===size&&values.every(Number.isFinite);
const round=value=>Number(value.toFixed(8));
export const fullBodyAliases=Object.freeze({pelvis:'root',leftHip:'lhipjoint',rightHip:'rhipjoint',leftKnee:'lfemur',rightKnee:'rfemur',leftAnkle:'ltibia',rightAnkle:'rtibia',leftForefoot:'lfoot',rightForefoot:'rfoot',leftToe:'ltoes',rightToe:'rtoes',waist:'lowerback',upperSpine:'upperback',chest:'thorax',neck:'lowerneck',head:'head',leftShoulder:'lclavicle',rightShoulder:'rclavicle',leftElbow:'lhumerus',rightElbow:'rhumerus',leftWrist:'lradius',rightWrist:'rradius',leftHand:'lhand',rightHand:'rhand'});

/** CMU ASF/AMC forward kinematics. Bone names describe ASF segment ENDPOINTS.
 * The captured actor's lengths are provenance, never the game's limb lengths.
 * Supports the explicit CMU root/axis convention found in these source files.
 */
export function parseCmuFullBody(asf,amc,{fps}={}){
  if(!Number.isFinite(fps)||fps<=0||fps>240)throw Error('Explicit capture fps required');
  const rootText=asf.split(':root')[1]?.split(':bonedata')[0],boneText=asf.split(':bonedata')[1]?.split(':hierarchy')[0],hierarchy=asf.split(':hierarchy')[1];
  if(!rootText||!boneText||!hierarchy||!amc.includes(':DEGREES'))throw Error('Expected degree ASF/AMC');
  if(!/order\s+TX TY TZ RX RY RZ/.test(rootText)||!/axis\s+XYZ/.test(rootText)||!/orientation\s+0\s+0\s+0/.test(rootText))throw Error('Unsupported root convention');
  const units=asf.split(':units')[1]?.split(':documentation')[0],unitLength=Number(units?.match(/\blength\s+([\d.]+)/)?.[1]);
  if(!Number.isFinite(unitLength)||unitLength<=0)throw Error('Missing ASF length units');
  const scaleMetres=.0254/unitLength,bones=new Map(),children=new Map(),parents=new Map();
  for(const block of boneText.matchAll(/\bbegin\s+([\s\S]*?)\bend\b/g)){
    const fields=Object.fromEntries(block[1].trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/)).map(([key,...value])=>[key,value]));
    const name=fields.name?.[0],direction=fields.direction?.map(Number),length=Number(fields.length?.[0]),axisAngles=fields.axis?.slice(0,3).map(Number);
    if(!name||bones.has(name)||!finiteVector(direction,3)||Math.hypot(...direction)<.1||!Number.isFinite(length)||length<0||!finiteVector(axisAngles,3)||fields.axis[3]!=='XYZ')throw Error('Invalid ASF bone');
    const dof=fields.dof||[];if(dof.some(value=>!/^r[xyz]$/.test(value)))throw Error('Unsupported joint channel');
    const axis=rotation(axisAngles);bones.set(name,{name,direction:new THREE.Vector3(...direction).normalize(),length:length*scaleMetres,axis,inverse:axis.clone().invert(),dof});
  }
  for(const line of hierarchy.split(/\r?\n/)){
    const [parent,...list]=line.trim().split(/\s+/);if(!list.length)continue;
    if(parent!=='root'&&!bones.has(parent))throw Error('Unknown hierarchy parent');
    if(children.has(parent))throw Error('Duplicate hierarchy parent');children.set(parent,list);
    for(const child of list){if(!bones.has(child)||parents.has(child))throw Error('Invalid hierarchy child');parents.set(child,parent);}
  }
  const names=['root',...bones.keys()];if(names.length<25||parents.size!==bones.size)throw Error('Incomplete full-body hierarchy');
  const order=[],visiting=new Set(),visited=new Set();
  function visit(name){if(visiting.has(name))throw Error('Cyclic skeleton');if(visited.has(name))return;visiting.add(name);order.push(name);for(const child of children.get(name)||[])visit(child);visiting.delete(name);visited.add(name);}
  visit('root');if(visited.size!==names.length)throw Error('Disconnected skeleton');
  const raw=[];let frame;
  for(const line of amc.split(/\r?\n/)){
    const text=line.trim();if(/^\d+$/.test(text)){frame={frame:Number(text)};raw.push(frame);}
    else if(frame&&/^[a-z]/i.test(text)){const [name,...values]=text.split(/\s+/);if(frame[name])throw Error('Duplicate motion channel');frame[name]=values.map(Number);}
  }
  if(!raw.length)throw Error('Capture contains no frames');
  const samples=raw.map((data,index)=>{
    if(data.frame!==index+1||!finiteVector(data.root,6))throw Error('Missing root or non-contiguous frame');
    const rootPosition=new THREE.Vector3(...data.root.slice(0,3).map(value=>value*scaleMetres));
    const positions=new Map([['root',rootPosition]]),orientations=new Map([['root',rotation(data.root.slice(3))]]);
    for(const name of order.slice(1)){
      const bone=bones.get(name),values=data[name];if(bone.dof.length&&!finiteVector(values,bone.dof.length))throw Error(`Missing joint ${name} at frame ${data.frame}`);
      const angles=[0,0,0];for(const [i,channel]of bone.dof.entries())angles['xyz'.indexOf(channel[1])]=values[i];
      const parent=parents.get(name),q=orientations.get(parent).clone().multiply(bone.axis).multiply(rotation(angles)).multiply(bone.inverse).normalize();
      orientations.set(name,q);positions.set(name,positions.get(parent).clone().add(bone.direction.clone().multiplyScalar(bone.length).applyQuaternion(q)));
    }
    const heading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-data.root[4]*radians);
    const landmarks={},quaternions={};
    for(const name of names){
      const p=positions.get(name).clone().sub(rootPosition).applyQuaternion(heading);landmarks[name]=[-p.x,p.y,p.z].map(round);
      const q=heading.clone().multiply(orientations.get(name));quaternions[name]=[q.x,-q.y,-q.z,q.w].map(round);
    }
    return{frame:data.frame,timeSeconds:index/fps,rootPosition:rootPosition.toArray().map(round),rootYawDegrees:data.root[4],landmarks,quaternions};
  });
  return{fps,frames:samples.length,durationSeconds:(samples.length-1)/fps,scaleMetres,landmarkNames:names,aliases:fullBodyAliases,bones:Object.fromEntries([...bones].map(([name,bone])=>[name,{parent:parents.get(name),lengthMetres:round(bone.length)}])),coordinateConvention:'Source actor in metres; y up, root translation subtracted, root Euler-Y yaw removed, x reflected. ASF bone names are endpoints. Mirrored quaternions are [x,-y,-z,w].',samples};
}

/** Sample all landmarks together. Smoothing is documented source-reference
 * processing; the game's IK must reconstruct its own fixed-length limbs. */
export function sampleFullBodyCrop(motion,{id,firstFrame,lastFrame,sampleCount=121,smoothingRadius=2}={}){
  if(!id||!Number.isInteger(firstFrame)||!Number.isInteger(lastFrame)||firstFrame<1||lastFrame>motion.frames||lastFrame<=firstFrame||!Number.isInteger(sampleCount)||sampleCount<3||!Number.isInteger(smoothingRadius)||smoothingRadius<0||smoothingRadius>6)throw Error('Invalid full-body crop');
  const names=motion.landmarkNames,stride=3+names.length*3,startRoot=motion.samples[firstFrame-1].rootPosition,heading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-motion.samples[firstFrame-1].rootYawDegrees*radians);
  const flattened=Array.from({length:lastFrame-firstFrame+1},(_,offset)=>{
    const at=firstFrame-1+offset,rootDelta=new THREE.Vector3(...motion.samples[at].rootPosition).sub(new THREE.Vector3(...startRoot)).applyQuaternion(heading),values=[-rootDelta.x,rootDelta.y,rootDelta.z];
    for(const name of names)values.push(...motion.samples[at].landmarks[name]);return values;
  });
  const smooth=flattened.map((_,at)=>Array.from({length:stride},(_,channel)=>{
    let sum=0,count=0;for(let offset=-smoothingRadius;offset<=smoothingRadius;offset++){const index=Math.max(0,Math.min(flattened.length-1,at+offset));sum+=flattened[index][channel];count++;}return sum/count;
  }));
  // Root delta is defined relative to the smoothed first sample, not to the
  // source actor's arbitrary global floor origin.
  const rootOrigin=smooth[0].slice(0,3);for(const values of smooth)for(let axis=0;axis<3;axis++)values[axis]-=rootOrigin[axis];
  const values=[];
  for(let i=0;i<sampleCount;i++){
    const at=i/(sampleCount-1)*(smooth.length-1),index=Math.floor(at),fraction=at-index;
    for(let channel=0;channel<stride;channel++)values.push(smooth[index][channel]+((smooth[index+1]?.[channel]??smooth[index][channel])-smooth[index][channel])*fraction);
  }
  const rest=Array.from({length:stride},(_,i)=>(values[i]+values[(sampleCount-1)*stride+i])/2);
  let seamMaxDistance=0;for(let offset=0;offset<stride;offset+=3)seamMaxDistance=Math.max(seamMaxDistance,Math.hypot(...[0,1,2].map(axis=>values[offset+axis]-values[(sampleCount-1)*stride+offset+axis])));
  return{id,firstFrame,lastFrame,sourceDurationSeconds:(lastFrame-firstFrame)/motion.fps,fps:motion.fps,sampleCount,stride,values,rest,seamMaxDistance,filter:{movingAverageRadius:smoothingRadius,resampling:'linear in source time, inclusive endpoints',loopCorrection:'none; runtime must blend constrained loop/rest seams'}};
}

export function encodeFullBodyValues(values,{quantizationMetres=.0001}={}){
  if(!Number.isFinite(quantizationMetres)||quantizationMetres<=0)throw Error('Invalid quantization');
  const bytes=Buffer.alloc(values.length*2);let maxErrorMetres=0;
  for(const [i,value]of values.entries()){
    if(!Number.isFinite(value))throw Error('Nonfinite full-body sample');const quantized=Math.round(value/quantizationMetres);
    if(quantized<-32768||quantized>32767)throw Error('Full-body coordinate exceeds Int16 range');
    bytes.writeInt16LE(quantized,i*2);maxErrorMetres=Math.max(maxErrorMetres,Math.abs(quantized*quantizationMetres-value));
  }
  return{quantizedLE:bytes.toString('base64'),quantizationMetres,maxErrorMetres};
}
