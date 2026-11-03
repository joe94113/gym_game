import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {groupClassDefinitions} from '../src/classes/class-data.js';
import {coursePlanFor,courseTimelineAt} from '../src/classes/class-timeline.js';

const folder='artifacts/full-course-review';mkdirSync(folder,{recursive:true});
const requested=process.argv.slice(2);
const list=groupClassDefinitions.filter(d=>!requested.length||requested.includes(d.id)).map(d=>{
  const p=coursePlanFor(d.classKind),motions=new Map();
  for(const b of p.blocks)if(!motions.has(b.motionId)||b.intensity>motions.get(b.motionId).intensity)motions.set(b.motionId,b);
  return{id:d.id,name:d.name,duration:d.duration,motions:[...motions.values()].map(b=>({id:b.motionId,label:b.label,times:[.25,.5,.75].map(q=>{
    if(b.motionId==='put-down-rest')return b.startSeconds+(q===.25?2:q===.75?b.seconds-2:b.seconds/2);
    if(d.classKind==='cycle'){
      const mid=(b.startSeconds+b.endSeconds)/2,target=Math.floor(courseTimelineAt('cycle',mid).cycleTurns)+q;let lo=mid-2,hi=mid+2;
      for(let i=0;i<40;i++){const t=(lo+hi)/2;if(courseTimelineAt('cycle',t).cycleTurns<target)lo=t;else hi=t;}return(lo+hi)/2;
    }
    return b.startSeconds+(Math.floor(b.repetitions/2)+q)*b.seconds/b.repetitions;
  })}))};
});
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:.5}),errors=[],reports=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  for(const course of list){
    const result=await page.evaluate(async course=>{
      const a=window.__FORM__,w=a.world;a.openExercise(course.id);if(!w.advanceUntilReady(180,false))throw new Error(`Cannot start ${course.id}`);w.setAnimationPaused(true);
      const motions=[];
      for(const motion of course.motions){
        const canvas=document.createElement('canvas');canvas.width=900;canvas.height=960;const c=canvas.getContext('2d');c.fillStyle='#eef0eb';c.fillRect(0,0,900,960);c.fillStyle='#263b30';c.font='21px sans-serif';c.fillText(`${course.name} / ${motion.id}`,14,30);const poses=[];
        for(let row=0;row<3;row++)for(let col=0;col<3;col++){
          const elapsed=motion.times[col],phase=elapsed/course.duration,view=['front','side','back'][row];w.inspectExercise(phase,phase);
          const d=w.getContactDiagnostics(),clearance=w.getClearanceDiagnostics(),self=w.getSelfClearanceDiagnostics(),snap=w.capturePoseReview(view,300),img=new Image();img.src=snap.image;await img.decode();c.drawImage(img,col*300,48+row*304,300,280);c.fillStyle='#263b30';c.font='14px sans-serif';c.fillText(`${view}  ${elapsed.toFixed(2)} sec`,col*300+10,344+row*304);
          poses.push({view,elapsed,phase,reach:d.maxReachError,grips:d.gearHands.map(h=>h.error),collisions:clearance.collisions,self:self.collisions});
        }
        motions.push({id:motion.id,poses,image:canvas.toDataURL('image/png')});
      }
      w.seekExercise(.53);w.update(0,false);w.inspectView({position:[-12,8,32],target:[-24,1,25.5]});w.update(0);const roomImage=document.querySelector('#gym-canvas').toDataURL('image/png');w.inspectView(null);
      w.stopExercise();if(!w.advanceUntilIdle(180,false))throw new Error(`Cannot leave ${course.id}`);
      return{id:course.id,name:course.name,motions,roomImage};
    },course);
    for(const m of result.motions){writeFileSync(`${folder}/${course.id}-${m.id}.png`,Buffer.from(m.image.split(',')[1],'base64'));delete m.image;}
    writeFileSync(`${folder}/${course.id}-room.png`,Buffer.from(result.roomImage.split(',')[1],'base64'));delete result.roomImage;reports.push(result);console.log(JSON.stringify({id:result.id,motions:result.motions.length,panels:result.motions.length*9}));
  }
  const previous=requested.length&&existsSync(`${folder}/report.json`)?JSON.parse(readFileSync(`${folder}/report.json`,'utf8')).reports:[],merged=new Map(previous.map(r=>[r.id,r]));reports.forEach(r=>merged.set(r.id,r));
  writeFileSync(`${folder}/report.json`,JSON.stringify({errors,reports:[...merged.values()]},null,2));
  if(errors.length||reports.some(r=>r.motions.some(m=>m.poses.some(p=>p.reach>.015||p.grips.some(e=>e>.015)||p.collisions.length||p.self.length))))process.exitCode=1;
}finally{await browser.close();}
