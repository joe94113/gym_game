import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Run only with the team's exclusive browser/GPU slot. Executing this separate
// capture command launches a browser; CPU qualification never imports it.
const folder='artifacts/nondumbbell-ergonomics-review';mkdirSync(folder,{recursive:true});
const sources=['src/rig-lifecycle.js','src/extended-rig.js','src/exercise-rig.js','src/skinned-character.js','src/pose-review.js'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const sourceHashes=hashes(),errors=[],reports=[],ids=['single-arm-cable-row','seated-glute-stretch'];
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:.5});
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.waitForTimeout(100);
  for(const id of ids){
    const result=await page.evaluate(async id=>{
      const app=window.__FORM__,world=app.world;app.openExercise(id);
      if(!world.advanceUntilReady(180,false))throw new Error(`Cannot start ${id}`);world.setAnimationPaused(true);
      const metadata=world.getLifecycleMetadata();
      const at=(label,q=.5)=>{let seconds=0;for(const stage of metadata.stages){if(stage.label===label)return(seconds+stage.duration*q)/metadata.entryDuration;seconds+=stage.duration;}throw new Error(`Missing ${label}`);};
      const points=id==='single-arm-cable-row'?[{label:'Former phase .68',phase:.68},{label:'Left hand clears handle',phase:at('左手先退開握把')},{label:'Align and grasp',phase:at('調整站位並伸手',.25)}]:[{label:'Former phase .13',phase:.13},{label:'Left foot crosses mat edge',phase:at('先把左腳踏上軟墊')},{label:'Right foot follows',phase:at('右腳跟上並站穩')}];
      const sheets=[];
      for(const direction of ['enter','exit']){
        const samples=direction==='enter'?points:points.toReversed().map(p=>({...p,phase:1-p.phase}));
        const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1020;const context=canvas.getContext('2d');
        context.fillStyle='#edf0e9';context.fillRect(0,0,900,1020);context.fillStyle='#263b30';context.font='20px sans-serif';context.fillText(`${id} / ${direction}`,12,29);const panels=[];
        for(let row=0;row<3;row++)for(let col=0;col<3;col++){
          const point=samples[col],view=['front','side','back'][row],inspection=world.inspectLifecycle(direction,point.phase);
          if(!inspection)throw new Error(`Cannot inspect ${id}`);
          const contact=world.getContactDiagnostics(),self=world.getSelfClearanceDiagnostics(),surface=world.getSurfaceDiagnostics({stride:24}),snapshot=world.capturePoseReview(view,300),image=new Image();image.src=snapshot.image;await image.decode();
          context.drawImage(image,col*300,42+row*325,300,295);context.fillStyle='#263b30';context.font='12px sans-serif';context.fillText(`${view} ${point.phase.toFixed(5)} / ${point.label}`,col*300+5,354+row*325);
          panels.push({view,phase:point.phase,label:point.label,stage:inspection.frame.stage,reach:contact.maxReachError,gearHands:contact.gearHands,contacts:inspection.frame.contacts,offset:inspection.frame.offset,collisions:inspection.clearance.collisions,self:self.collisions,surface:surface.collisions});
        }
        sheets.push({direction,points:samples,panels,image:canvas.toDataURL('image/png')});
      }
      world.seekExercise(0);world.stopExercise();if(!world.advanceUntilIdle(180,false))throw new Error(`Cannot leave ${id}`);
      return{id,metadata,sheets};
    },id);
    for(const sheet of result.sheets){sheet.file=`${id}-${sheet.direction}.png`;writeFileSync(`${folder}/${sheet.file}`,Buffer.from(sheet.image.split(',')[1],'base64'));delete sheet.image;}
    reports.push(result);console.log(JSON.stringify({id,sheets:2,panels:18}));
  }
  const afterHashes=hashes(),changedSources=sources.filter(p=>sourceHashes[p]!==afterHashes[p]);
  const pass=!errors.length&&!changedSources.length&&reports.every(r=>r.sheets.every(s=>s.panels.every(p=>p.reach<.015&&!p.collisions.length&&!p.self.length&&!p.surface.length)));
  writeFileSync(`${folder}/capture-report.json`,JSON.stringify({pass,sourceHashes,afterHashes,changedSources,errors,scope:'Two corrected non-DB lifecycle paths. Three actual timestamps per direction, front/side/back: four sheets, 36 panels. Static AI inspection does not replace continuous-motion or human coaching review.',reports},null,2));
  if(!pass)process.exitCode=1;
}finally{await browser.close();}
