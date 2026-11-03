import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DUMBBELL_IDS} from '../src/dumbbell-grip.js';

// Requires the team's exclusive GPU/browser slot. All panels use the actual
// world, actor, attachments and lifecycle sampler; no copied animation.
const folder='artifacts/dumbbell-ergonomics-review';mkdirSync(folder,{recursive:true});
const checked=['src/rig-lifecycle.js','src/dumbbell-lifecycle-paths.js','src/dumbbell-grip.js','src/extended-rig.js','src/exercise-rig.js','src/skinned-character.js','src/pose-review.js'];
const hashes=()=>Object.fromEntries(checked.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),sourceHashes=hashes(),requested=process.argv.slice(2),ids=DUMBBELL_IDS.filter(id=>!requested.length||requested.includes(id));
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:.5}),errors=[],reports=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.waitForTimeout(150);
 for(const id of ids){const result=await page.evaluate(async id=>{
  const app=window.__FORM__,w=app.world;app.openExercise(id);if(!w.advanceUntilReady(180,false))throw new Error(`Cannot start ${id}`);w.setAnimationPaused(true);const metadata=w.getLifecycleMetadata(),stages=metadata.stages;
  const at=(label,q=1)=>{let elapsed=0;for(const s of stages){if(s.label===label)return(elapsed+s.duration*q)/metadata.entryDuration;elapsed+=s.duration;}throw new Error(`Missing stage ${label}`);};
  const bench=id==='dumbbell-bench-press',goblet=id==='dumbbell-goblet-squat',one=id==='dumbbell-single-arm-row',shoulder=id==='dumbbell-shoulder-press';
  const keyPoints=bench?[
   {label:'近架站位',phase:at('走近啞鈴架')},{label:'屈髖閉握',phase:at('握穩啞鈴')},{label:'低位身側持鈴',phase:at('放低啞鈴穩定身側')},{label:'轉直再坐下',phase:at('持鈴坐上椅墊',.5)},
   {label:'啞鈴支撐大腿',phase:at('啞鈴先穩放大腿上')},{label:'分段後躺',phase:at('收緊身體帶鈴慢慢後躺',.7)},{label:'背部靠穩',phase:at('背部靠穩再把啞鈴移到胸旁')},{label:'胸推起點',phase:1},
  ]:[
   {label:'近架站位',phase:at('走近啞鈴架')},{label:'屈髖伸手',phase:at('屈髖伸手')},{label:goblet?'托住上盤':'閉握握把',phase:at('握穩啞鈴')},{label:'提離架面',phase:at('抬離啞鈴架')},
   {label:goblet?'身前持鈴':'低位身側持鈴',phase:at(goblet?'持鈴站起':'放低啞鈴穩定身側')},{label:'帶到訓練位置',phase:at('持鈴走到訓練位置')},
   {label:one?'支撐手靠近椅墊':shoulder?'帶到肩旁':'調整手臂站位',phase:one?at('屈髖並伸出支撐手'):shoulder?at('把啞鈴穩穩帶到肩旁'):at('調整訓練姿勢',.5)},{label:'動作起點',phase:1},
  ];
  const sheets=[];
  for(const direction of ['enter','exit']){const points=direction==='enter'?keyPoints:keyPoints.toReversed().map(p=>({...p,phase:1-p.phase}));for(let part=0;part<2;part++){
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1050;const ctx=canvas.getContext('2d');ctx.fillStyle='#edf0e9';ctx.fillRect(0,0,1200,1050);ctx.fillStyle='#263b30';ctx.font='22px sans-serif';ctx.fillText(`${id} / ${direction} / ${part*4+1}–${part*4+4}`,15,30);const panels=[];
   for(let row=0;row<3;row++)for(let col=0;col<4;col++){const p=points[part*4+col],view=['front','side','back'][row],inspected=w.inspectLifecycle(direction,p.phase);if(!inspected)throw new Error(`Cannot inspect ${id}`);const contact=w.getContactDiagnostics(),self=w.getSelfClearanceDiagnostics(),snap=w.capturePoseReview(view,300),image=new Image();image.src=snap.image;await image.decode();ctx.drawImage(image,col*300,45+row*330,300,300);ctx.fillStyle='#263b30';ctx.font='12px sans-serif';ctx.fillText(`${view}  ${p.phase.toFixed(5)}  ${p.label}`,col*300+6,361+row*330);panels.push({view,u:p.phase,keyPoint:p.label,stage:inspected.frame.stage,contacts:inspected.frame.contacts,contact,collisions:inspected.clearance.collisions,self:self.collisions});}
   sheets.push({direction,part:part+1,panels,image:canvas.toDataURL('image/png')});
  }}
  w.seekExercise(0);w.stopExercise();if(!w.advanceUntilIdle(180,false))throw new Error(`Cannot leave ${id}`);return{id,metadata,keyPoints,sheets};
 },id);
 for(const s of result.sheets){s.file=`${id}-${s.direction}-${s.part}.png`;writeFileSync(`${folder}/${s.file}`,Buffer.from(s.image.split(',')[1],'base64'));delete s.image;}reports.push(result);console.log(JSON.stringify({id,sheets:result.sheets.length,panels:48}));
 }
 const finalHashes=hashes(),changedSources=checked.filter(p=>sourceHashes[p]!==finalHashes[p]),pass=!errors.length&&!changedSources.length&&reports.every(r=>r.sheets.every(s=>s.panels.every(p=>p.contact.maxReachError<.015&&!p.collisions.length&&!p.self.length)));
 writeFileSync(`${folder}/capture-report.json`,JSON.stringify({pass,sourceHashes,changedSources,errors,scope:'Actual world lifecycle, production skinned athlete and rendered DB/rack/bench. Eight key points per direction, front/side/back. Static visual samples do not prove continuous movement or professional coaching approval.',reports},null,2));if(!pass)process.exitCode=1;
}finally{await browser.close();}
