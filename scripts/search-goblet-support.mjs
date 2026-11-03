import {THREE,character,rig} from './dumbbell-test-helpers.mjs';
import {writeFileSync} from 'node:fs';
const base=rig.sample('dumbbell-goblet-squat',0),rawY=base.hands[0][1]+.051,centerZ=base.hands[0][2],headBottom=rawY-.0375,results=[];
for(const angle of [.4,.7,1.0,1.3])for(const x of [.09,.105,.12])for(const z of [-.025,0,.025])for(const y of [.045,.055,.065,.075,.085])for(const flex of [0,.1,.2]){
 const p=structuredClone(base);p.elbows=undefined;p.handDirections=[];p.handAdvances=[];p.handFingerFlex=[];p.handGripStrength=[0,0];p.relaxedHands=false;
 for(let side=0;side<2;side++){const s=side?1:-1,a=[-s*Math.cos(angle),0,Math.sin(angle)],axis=[s*Math.sin(angle),0,Math.cos(angle)];p.hands[side]=[s*x,rawY-y,centerZ+z];p.handDirections.push(axis);p.handAdvances.push(a);p.handFingerFlex.push(Object.fromEntries(['thumb','index','middle','ring','pinky'].map(f=>[f,[flex,flex,flex]])));}
 character.pose(p);const samples=character.getSurfaceSamples({stride:1,parts:['leftHand','rightHand']});let depth=0,gap=Infinity;
 for(const q of samples){const [px,py,pz]=q.position,r=Math.hypot(px,pz-centerZ);for(const cy of [rawY,rawY-.33])depth=Math.max(depth,Math.min(.108-r,.0375-Math.abs(py-cy)));depth=Math.max(depth,Math.min(.016-r,.19-Math.abs(py-(rawY-.165))));if(r<.105&&py<headBottom+.002)gap=Math.min(gap,headBottom-py);}
 results.push({angle,x,z,y,flex,depth,gap,score:depth*100+Math.max(0,gap)});
}
results.sort((a,b)=>a.score-b.score);writeFileSync('artifacts/goblet-support-search.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.slice(0,15)));character.dispose();
