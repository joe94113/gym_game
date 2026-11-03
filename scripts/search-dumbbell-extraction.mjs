import {THREE,character,rig} from './dumbbell-test-helpers.mjs';
import {writeFileSync} from 'node:fs';
const meta=rig.getLifecycle('dumbbell-curl');let seconds=0;for(const s of meta.stages){seconds+=s.duration;if(s.label==='掌心對準握把')break;}
const frame=rig.sampleLifecycle('dumbbell-curl','enter',seconds/meta.entryDuration),base=structuredClone(frame.pose),out=[];
for(const thumb of [[.55,.15,.25],[0,0,0],[.15,.15,.15],[.3,.15,.15],[.7,.15,.25],[.55,.4,.4]]){
 const p=structuredClone(base);for(const f of p.handFingerFlex)f.thumb=thumb;character.pose(p);const pts=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']}).map(p=>({position:p.position.map((v,i)=>v+frame.offset[i]),part:p.part}));
 for(let k=0;k<72;k++){const angle=k/72*Math.PI*2,dy=Math.sin(angle),dz=Math.cos(angle);let max=0;
  for(let j=0;j<=50;j++){const d=j/50*.23;for(const s of pts){const side=s.part==='leftHand'?-1:1,x=s.position[0]-side*.34,y=s.position[1]+dy*d-.86,z=s.position[2]+dz*d-1.34,depth=Math.min(.016-Math.hypot(y,z),.19-Math.abs(x));max=Math.max(max,depth);}}
  out.push({thumb,dy,dz,max});}
}
out.sort((a,b)=>a.max-b.max);writeFileSync('artifacts/dumbbell-extraction-search.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out.slice(0,20)));character.dispose();
