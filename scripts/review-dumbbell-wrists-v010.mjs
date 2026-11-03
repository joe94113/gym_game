import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const base=process.argv[2]||'http://127.0.0.1:5173';
const revision=process.argv[3]||'after';
const before=revision==='before',sourceRoot=before?'.local-tools/v010-before/':'';
const folder='artifacts/dumbbell-wrist-review-v010';mkdirSync(folder,{recursive:true});
const files=['src/rig-lifecycle.js','src/dumbbell-lifecycle-paths.js','src/dumbbell-grip.js','src/free-dumbbell-shaft.js','src/hand-contact-frame.js','src/extended-rig.js','src/incline-bench.js','src/skinned-character.js','src/pose-review.js'].filter(p=>existsSync(sourceRoot+p));
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(sourceRoot+p)).digest('hex')]));
const sourceHashes=hashes();
const cases=before?[{id:'dumbbell-bench-press',key:'bench-flat',settings:{benchAngle:0}}]:[
 {id:'dumbbell-bench-press',key:'bench-flat',settings:{benchAngle:0}},
 {id:'dumbbell-bench-press',key:'bench-incline',settings:{benchAngle:30}},
 {id:'dumbbell-shoulder-press',key:'shoulder-press'},
 {id:'dumbbell-single-arm-row',key:'single-arm-row'},
 {id:'dumbbell-goblet-squat',key:'goblet-squat'},
 {id:'dumbbell-curl',key:'curl'},
 {id:'dumbbell-hammer-curl',key:'hammer-curl'},
 {id:'dumbbell-lateral-raise',key:'lateral-raise'},
 {id:'dumbbell-romanian-deadlift',key:'romanian-deadlift'},
];
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:.5}),errors=[],reports=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.goto(base,{timeout:120000});
 await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});
 await page.evaluate(()=>{document.querySelector('[data-action="free"]').click();window.__FORM__.world.setGraphicsQuality('flow');});
 for(const item of cases){
  const result=await page.evaluate(async item=>{
   const app=window.__FORM__,w=app.world;
   if(item.settings){const changed=w.setEquipmentSettings(item.id,item.settings);if(!changed.ok)throw Error(JSON.stringify(changed));}
   app.openExercise(item.id);if(!w.advanceUntilReady(180,false))throw Error(`Cannot start ${item.key}`);w.setAnimationPaused(true);
   const meta=w.getLifecycleMetadata();
   const at=(name,q=1)=>{let elapsed=0;for(const stage of meta.stages){if(stage.label===name)return(elapsed+stage.duration*q)/meta.entryDuration;elapsed+=stage.duration;}throw Error(`Missing stage ${name}`);};
   const start=at('持鈴站起',0),end=at('持鈴走到訓練位置'),worst={enter:{degrees:-1},exit:{degrees:-1}};
   for(const direction of ['enter','exit'])for(let i=0;i<=160;i++){
    const canonical=start+(end-start)*i/160,u=direction==='enter'?canonical:1-canonical;
    const inspected=w.inspectLifecycle(direction,u),hands=w.getHandDiagnostics();
    for(let side=0;side<2;side++)if(inspected.frame.contacts.hands[side]){
     const degrees=hands[side].wristBendRadians*180/Math.PI;
     if(degrees>worst[direction].degrees)worst[direction]={degrees,u,side,stage:inspected.frame.stage};
    }
   }
   const bench=item.id==='dumbbell-bench-press';
   const entry=[['closed pickup',at('握穩啞鈴')],['largest carry wrist angle',worst.enter.u],[bench?'sitting with support':'carry at training position',bench?at('持鈴坐上椅墊',.5):at('持鈴走到訓練位置')],[bench?'controlled recline':'settling into exercise grip',bench?at('收緊身體帶鈴慢慢後躺',.7):at(item.id==='dumbbell-single-arm-row'?'扶穩椅墊':'調整訓練姿勢',.65)]];
   const sheets=[],closeups=[];
   for(const direction of ['enter','exit']){
    const points=direction==='enter'?entry:entry.toReversed().map(([label,u])=>[label,1-u]);
    const canvas=document.createElement('canvas');canvas.width=points.length*320;canvas.height=1080;const context=canvas.getContext('2d');
    context.fillStyle='#edf0e9';context.fillRect(0,0,canvas.width,1080);context.fillStyle='#263b30';context.font='20px sans-serif';context.fillText(`${item.key} / ${direction}`,14,29);
    const panels=[];
    for(let row=0;row<3;row++)for(let col=0;col<points.length;col++){
     const [label,u]=points[col],view=['front','side','back'][row],inspected=w.inspectLifecycle(direction,u);
     const capture=w.capturePoseReview(view,320),image=new Image();image.src=capture.image;await image.decode();context.drawImage(image,col*320,40+row*345,320,320);
     const hands=w.getHandDiagnostics(),contact=w.getContactDiagnostics(),clearance=w.getClearanceDiagnostics(),self=w.getSelfClearanceDiagnostics();
     context.fillStyle='#263b30';context.font='11px sans-serif';context.fillText(`${view} ${u.toFixed(5)} ${label}`,col*320+5,375+row*345);
     panels.push({view,u,label,stage:inspected.frame.stage,contact:contact.maxContactError,reach:contact.maxReachError,wristDegrees:hands.map(h=>h.wristBendRadians*180/Math.PI),collisions:clearance?.collisions||[],self:self?.collisions||[]});
    }
    sheets.push({direction,panels,image:canvas.toDataURL('image/png')});
   }
   w.inspectLifecycle('enter',worst.enter.u);
   for(const view of ['right-hand','right-hand-side'])closeups.push({...w.capturePoseReview(view,650),u:worst.enter.u,wristDegrees:w.getHandDiagnostics().map(h=>h.wristBendRadians*180/Math.PI)});
   w.seekExercise(0);w.stopExercise();if(!w.advanceUntilIdle(180,false))throw Error(`Cannot leave ${item.key}`);
   return{...item,meta,worst,sheets,closeups};
  },item);
  for(const sheet of result.sheets){sheet.file=`${revision}-${item.key}-${sheet.direction}.png`;writeFileSync(`${folder}/${sheet.file}`,Buffer.from(sheet.image.split(',')[1],'base64'));delete sheet.image;}
  for(const shot of result.closeups){shot.file=`${revision}-${item.key}-${shot.view}.png`;writeFileSync(`${folder}/${shot.file}`,Buffer.from(shot.image.split(',')[1],'base64'));delete shot.image;}
  reports.push(result);console.log(JSON.stringify({revision,key:item.key,worst:result.worst,panels:result.sheets.reduce((sum,s)=>sum+s.panels.length,0),closeups:2}));
 }
 const finalHashes=hashes(),changedSources=files.filter(p=>sourceHashes[p]!==finalHashes[p]);
 const pass=!errors.length&&!changedSources.length&&reports.every(r=>r.sheets.every(s=>s.panels.every(p=>p.reach<.015&&!p.collisions.length&&!p.self.length)));
 writeFileSync(`${folder}/${revision}-capture.json`,JSON.stringify({pass,revision,base,sourceRoot,sourceHashes,changedSources,errors,scope:'Production GLB, runtime and props. Front/side/back at four lifecycle key points in each direction, two right-hand close views at largest sampled held-carry wrist angle. Wrist angle is an animation metric, not clinical safety clearance. Capture success does not substitute for actual visual review or human trainer acceptance.',reports},null,2));
 if(!pass)process.exitCode=1;
}finally{await browser.close();}
