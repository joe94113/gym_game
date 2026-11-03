import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
mkdirSync('artifacts/motion-review',{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:.5}),errors=[],reports=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.waitForTimeout(200);
  const requested=process.argv.slice(2),list=(await page.evaluate(()=>window.__FORM__.catalogActivities.filter(e=>e.runtime!=='facility'&&e.runtime!=='class').map(e=>({id:e.id,name:e.name})))).filter(e=>!requested.length||requested.includes(e.id));
  for(const {id,name}of list){
    const result=await page.evaluate(async({id,name})=>{
      const a=window.__FORM__,w=a.world;a.openExercise(id);if(!w.advanceUntilReady(180,false))throw new Error(`Cannot start ${id}`);w.setAnimationPaused(true);
      const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=960;const c=canvas.getContext('2d');c.fillStyle='#f5f5f0';c.fillRect(0,0,1500,960);c.fillStyle='#263b30';c.font='24px sans-serif';c.fillText(`${id}  ${name}`,18,32);
      const poses=[],views=['front','side','back'],phases=[0,.22,.44,.72,1];
      for(let row=0;row<3;row++)for(let col=0;col<5;col++){
        const phase=phases[col];w.inspectExercise(phase,phase);const d=w.getContactDiagnostics(),clearance=w.getClearanceDiagnostics(),self=w.getSelfClearanceDiagnostics(),snap=w.capturePoseReview(views[row],300),img=new Image();img.src=snap.image;await img.decode();c.drawImage(img,col*300,48+row*304,300,280);c.fillStyle='#263b30';c.font='14px sans-serif';c.fillText(`${views[row]}  ${phase.toFixed(2)}${snap.prone?' / lying view':''}`,col*300+10,344+row*304);
        poses.push({view:views[row],phase,reach:d.maxReachError,collisions:clearance.collisions,self:self.collisions});
      }
      w.stopExercise();if(!w.advanceUntilIdle(180,false))throw new Error(`Cannot leave ${id}`);
      return{id,name,poses,image:canvas.toDataURL('image/png')};
    },{id,name});
    writeFileSync(`artifacts/motion-review/${id}.png`,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;reports.push(result);console.log(JSON.stringify({id,poses:result.poses.length,issues:result.poses.filter(p=>p.collisions.length||p.self.length||p.reach>.015).length}));
  }
  const prior=requested.length&&existsSync('artifacts/motion-review/report.json')?JSON.parse(readFileSync('artifacts/motion-review/report.json','utf8')).reports:[],merged=new Map(prior.map(r=>[r.id,r]));reports.forEach(r=>merged.set(r.id,r));writeFileSync('artifacts/motion-review/report.json',JSON.stringify({errors,reports:[...merged.values()]},null,2));
  if(errors.length||reports.some(r=>r.poses.some(p=>p.collisions.length||p.self.length||p.reach>.015)))process.exitCode=1;
}finally{await browser.close();}
