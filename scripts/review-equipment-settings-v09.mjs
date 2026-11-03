import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const folder='artifacts/equipment-settings-review-v09';mkdirSync(folder,{recursive:true});
const files=['src/extended-rig.js','src/rig-lifecycle.js','src/incline-bench.js','src/straight-bar-pushdown.js','src/dumbbell-lifecycle-paths.js','src/dumbbell-grip.js','src/equipment-options.js','src/skinned-character.js'];
const hashes=()=>Object.fromEntries(files.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),sourceHashes=hashes();
const cases=[{id:'dumbbell-bench-press',key:'incline-30',settings:{benchAngle:30},restore:{benchAngle:0}},{id:'rope-pushdown',key:'straight-pushdown',settings:{handle:'straight-bar'},restore:{handle:'triceps-rope'}}],errors=[],reports=[];
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:.5});page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 for(const item of cases){const result=await page.evaluate(async item=>{
  const app=window.__FORM__,w=app.world,changed=w.setEquipmentSettings(item.id,item.settings);if(!changed.ok)throw new Error(JSON.stringify(changed));app.openExercise(item.id);if(!w.advanceUntilReady(180,false))throw new Error(`Cannot start ${item.key}`);w.setAnimationPaused(true);
  const metadata=w.getLifecycleMetadata(),at=(label,q=1)=>{let time=0;for(const stage of metadata.stages){if(stage.label===label)return(time+stage.duration*q)/metadata.entryDuration;time+=stage.duration;}throw new Error(`Missing ${label}`);};
  const bench=item.key==='incline-30',points=bench?[
   ['thigh support',at('啞鈴先穩放大腿上')],['recline',at('收緊身體帶鈴慢慢後躺',.7)],['back supported',at('背部靠穩再把啞鈴移到胸旁')]
  ]:[['open hand alignment',at('掌心對準直桿')],['closed overhand grip',at('握穩直桿')],['half step back',at('退半步並穩住握把')]];
  const sheets=[],closeups=[];
  async function sheet(mode,points){const canvas=document.createElement('canvas');canvas.width=points.length*300;canvas.height=1050;const g=canvas.getContext('2d');g.fillStyle='#edf0e9';g.fillRect(0,0,canvas.width,canvas.height);g.fillStyle='#263b30';g.font='23px sans-serif';g.fillText(`${item.key} / ${mode}`,14,30);const panels=[];
   for(let row=0;row<3;row++)for(let col=0;col<points.length;col++){const [label,phase]=points[col],view=['front','side','back'][row];if(mode==='loop')w.inspectExercise(phase,phase);else w.inspectLifecycle(mode,phase);const contact=w.getContactDiagnostics(),collision=w.getClearanceDiagnostics(),self=w.getSelfClearanceDiagnostics(),snap=w.capturePoseReview(view,300),image=new Image();image.src=snap.image;await image.decode();g.drawImage(image,col*300,44+row*330,300,300);g.fillStyle='#263b30';g.font='12px sans-serif';g.fillText(`${view} ${phase.toFixed(5)} / ${label}`,col*300+6,360+row*330);panels.push({view,phase,label,contactError:contact.maxContactError,reach:contact.maxReachError,collisions:collision.collisions,self:self.collisions});}
   return{mode,panels,image:canvas.toDataURL('image/png')};
  }
  for(const direction of ['enter','exit'])sheets.push(await sheet(direction,direction==='enter'?points:points.toReversed().map(([label,p])=>[label,1-p])));
  sheets.push(await sheet('loop',[0,.44,.72].map(p=>[`phase ${p}`,p])));
  w.inspectExercise(.44);for(const view of ['left-hand','right-hand'])closeups.push({view,...w.capturePoseReview(view,620)});
  w.seekExercise(0);w.stopExercise();if(!w.advanceUntilIdle(180,false))throw new Error('Cannot leave');const restored=w.setEquipmentSettings(item.id,item.restore);if(!restored.ok)throw new Error('Cannot restore default');return{...item,metadata,sheets,closeups};
 },item);
 for(const sheet of result.sheets){sheet.file=`${item.key}-${sheet.mode}.png`;writeFileSync(`${folder}/${sheet.file}`,Buffer.from(sheet.image.split(',')[1],'base64'));delete sheet.image;}
 for(const closeup of result.closeups){closeup.file=`${item.key}-${closeup.view}.png`;writeFileSync(`${folder}/${closeup.file}`,Buffer.from(closeup.image.split(',')[1],'base64'));delete closeup.image;}
 reports.push(result);console.log(JSON.stringify({key:item.key,sheets:result.sheets.length,panels:result.sheets.reduce((sum,s)=>sum+s.panels.length,0),closeups:result.closeups.length}));
 }
 const finalHashes=hashes(),changedSources=files.filter(path=>sourceHashes[path]!==finalHashes[path]),pass=!errors.length&&!changedSources.length&&reports.every(r=>r.sheets.every(s=>s.panels.every(p=>p.reach<.015&&!p.collisions.length&&!p.self.length)));
 writeFileSync(`${folder}/capture-report.json`,JSON.stringify({pass,errors,sourceHashes,changedSources,scope:'Actual configured world/runtime. Two new equipment profiles, front/side/back lifecycle key points and loop phases; static AI viewing required separately. Not human trainer or continuous-motion approval.',reports},null,2));if(!pass)process.exitCode=1;
}finally{await browser.close();}
