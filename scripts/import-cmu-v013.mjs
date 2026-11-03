import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
const base='.local-tools/cmu-v013',scale=.056444,rad=Math.PI/180;
const rotation=values=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...values.map(v=>v*rad),'ZYX'));
function convert(subject,motion,first,count){
 const asf=readFileSync(`${base}/${subject}.asf`,'utf8'),amc=readFileSync(`${base}/${motion}.amc`,'utf8'),bones=new Map(),children=new Map();
 for(const block of asf.split(':bonedata')[1].split(':hierarchy')[0].matchAll(/begin([\s\S]*?)end/g)){
  const fields=Object.fromEntries(block[1].trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/)).map(([key,...value])=>[key,value]));
  const axis=rotation(fields.axis.slice(0,3).map(Number));bones.set(fields.name[0],{axis,inverse:axis.clone().invert(),direction:new THREE.Vector3(...fields.direction.map(Number)),length:Number(fields.length[0])*scale,dof:fields.dof||[]});
 }
 for(const line of asf.split(':hierarchy')[1].split(/\r?\n/)){const [name,...list]=line.trim().split(/\s+/);if(list.length)children.set(name,list);}
 const frames=[];let frame;
 for(const line of amc.split(/\r?\n/)){const text=line.trim();if(/^\d+$/.test(text)){frame={};frames.push(frame);}else if(frame&&/^[a-z]/i.test(text)){const [name,...values]=text.split(/\s+/);frame[name]=values.map(Number);}}
 const directions=[];
 for(const data of frames.slice(first,first+count)){
  const positions=new Map([['root',new THREE.Vector3(...data.root.slice(0,3).map(x=>x*scale))]]),rotations=new Map([['root',rotation(data.root.slice(3))]]);
  function walk(parent){for(const name of children.get(parent)||[]){const bone=bones.get(name),angles=[0,0,0];for(const [i,key]of bone.dof.entries())angles['xyz'.indexOf(key[1])]=data[name]?.[i]||0;const q=rotations.get(parent).clone().multiply(bone.axis).multiply(rotation(angles)).multiply(bone.inverse);rotations.set(name,q);positions.set(name,positions.get(parent).clone().add(bone.direction.clone().multiplyScalar(bone.length).applyQuaternion(q)));walk(name);}}
  walk('root');const heading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-data.root[4]*rad),dir=(a,b)=>{const v=positions.get(b).clone().sub(positions.get(a)).applyQuaternion(heading).normalize();return[-v.x,v.y,v.z].map(x=>Number(x.toFixed(6)));};
  directions.push({upper:[dir('lclavicle','lhumerus'),dir('rclavicle','rhumerus')],lower:[dir('lhumerus','lradius'),dir('rhumerus','rradius')]});
 }
 if(directions.length!==count)throw Error(`Missing CMU frames ${motion}`);
 return{id:motion,source:`https://mocap.cs.cmu.edu/subjects/${subject}/${motion}.amc`,skeleton:`https://mocap.cs.cmu.edu/subjects/${subject}/${subject}.asf`,sourceFrames:frames.length,firstFrame:first+1,frames:count,fps:120,duration:count/120,sha256:{asf:createHash('sha256').update(asf).digest('hex'),amc:createHash('sha256').update(amc).digest('hex')},samples:directions};
}
const clips={walk:convert('07','07_01',80,114),run:convert('09','09_01',25,81)};
mkdirSync('public/motions',{recursive:true});
const metadata={source:'CMU Graphics Lab Motion Capture Database',terms:'https://mocap.cs.cmu.edu/faqs.php',homepage:'https://mocap.cs.cmu.edu/',attribution:'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.',scope:'Real captured arm directions retimed to the original game stride; ground contacts, body proportions, hands and equipment use the existing IK. These clips do not provide exercise preparation or professional review.',clips};
writeFileSync('public/motions/cmu-v013.json',JSON.stringify(metadata));
writeFileSync('src/mocap-samples-v013.js',`// Derived from the CMU capture identified in public/motions/cmu-v013.json.\nexport const capturedGaits=${JSON.stringify(clips)};\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(clips).map(([name,c])=>[name,{frames:c.frames,sourceFrames:c.sourceFrames,first:c.samples[0]}]))));
