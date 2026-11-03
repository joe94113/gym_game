import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Run only under the parent-owned browser/GPU queue, after source freeze.
const base=process.argv[2]||'http://127.0.0.1:5173',revision=process.argv[3]||'after',root=revision==='before'?'.local-tools/v013-before/':'',folder='artifacts/preparation-v013/visual';mkdirSync(folder,{recursive:true});
const sources=['src/machine-lifecycle.js','src/auxiliary-strength-paths.js','src/cardio-lifecycle-paths.js','src/additional-lifecycle.js','src/additional-hip-lifecycle.js','src/preparation-step-turn-v013.js','src/dumbbell-grip.js','src/dumbbell-lifecycle-paths.js','src/skinned-character.js','src/equipment.js','src/additional-equipment.js','src/extended-rig.js','src/world-controller.js'].filter(file=>existsSync(root+file)),sha=file=>createHash('sha256').update(readFileSync(root+file)).digest('hex'),sourceHashes=Object.fromEntries(sources.map(file=>[file,sha(file)]));
const cases=[{id:'machine-calf-raise',key:'calf',phases:{enter:[.815,.825,.83,.84],exit:[.16,.17,.175,.185]}},{id:'machine-rower',key:'rower',phases:{enter:[.53,.55,.57,.59],exit:[.41,.43,.45,.47]}},{id:'machine-leg-press',key:'leg-press',phases:{enter:[.07,.085,.10,.13],exit:[.87,.90,.915,.93]}},{id:'machine-assisted-pullup',key:'assisted',phases:{enter:[.17,.22,.28,.33]}},{id:'machine-hip-abduction',key:'hip'},{id:'machine-back-extension',key:'back-extension',phases:{exit:[.68,.84,.90,.98]}},{id:'machine-leg-extension',key:'leg-extension'},{id:'dumbbell-bench-press',key:'dumbbell-bench'}];
if(revision!=='before'){
 // The replacement side-step happens later than the former sliding turn.
 // Sample its actual steps; these are semantic stage comparisons, not equal times.
 cases.find(item=>item.key==='leg-press').phases={enter:[.125,.215,.29,.44],exit:[.56,.71,.785,.875]};
 cases.push({id:'machine-calf-raise',key:'calf-change-plates',settings:{plateLoadKg:38.75},phases:{enter:[.20,.24,.26,.30],exit:[.70,.74,.76,.80]}},{id:'machine-leg-extension',key:'leg-extension-raised',settings:{seatHeightCm:73,weightKg:30},phases:{enter:[.62,.65,.67,.75],exit:[.25,.33,.35,.38]}});
}
const browser=await chromium.launch({...config.use.launchOptions,args:['--use-gl=angle','--use-angle=d3d11'],headless:true}),page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1}),errors=[],records=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.evaluate(()=>{document.querySelector('[data-action=free]').click();window.__FORM__.world.setGraphicsQuality('clear');});
 for(const item of cases){
  const result=await page.evaluate(async item=>{
   const a=window.__FORM__,w=a.world;w.stopExercise();w.advanceUntilIdle(180,false);if(item.settings){const changed=w.setEquipmentSettings(item.id,item.settings);if(!changed.ok)throw Error(JSON.stringify(changed));}a.openExercise(item.id);if(!w.advanceUntilReady(180,false))throw Error(`not ready ${item.id}`);w.setAnimationPaused(true);const sheets=[];
   for(const direction of ['enter','exit']){
    const canvas=document.createElement('canvas');canvas.width=1120;canvas.height=980;const ctx=canvas.getContext('2d'),panels=[];ctx.fillStyle='#e4e7e2';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#24352d';ctx.font='19px sans-serif';ctx.fillText(`${item.key}: ${direction}`,12,25);
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
     const phase=(item.phases?.[direction]||[.24,.43,.68,.83])[col],view=['front','side','back'][row],inspection=w.inspectLifecycle(direction,phase);if(!inspection)throw Error('no lifecycle inspection');const capture=w.capturePoseReview(view,280),picture=new Image();picture.src=capture.image;await picture.decode();ctx.drawImage(picture,col*280,35+row*310,280,280);ctx.fillStyle='#24352d';ctx.font='12px sans-serif';ctx.fillText(`${view} ${phase.toFixed(3)} ${inspection.frame.stage}`,col*280+5,330+row*310);panels.push({phase,view,stage:inspection.frame.stage,contact:inspection.contact,clearance:inspection.clearance,highlights:w.getMuscleHighlights()});
    }
    sheets.push({direction,panels,image:canvas.toDataURL('image/png')});
   }
   w.stopExercise();w.advanceUntilIdle(180,false);const definition=a.activities.find(activity=>activity.id===item.id);return{...item,expectedHighlights:{primary:definition.muscleKeys||[],secondary:definition.secondaryMuscleKeys||[]},sheets};
  },item);
  for(const sheet of result.sheets){sheet.path=`${folder}/${revision}-${item.key}-${sheet.direction}.png`;writeFileSync(sheet.path,Buffer.from(sheet.image.split(',')[1],'base64'));delete sheet.image;}
  records.push(result);console.log(JSON.stringify({revision,key:item.key,sheets:result.sheets.length}));
 }
 const changedSources=sources.filter(file=>sha(file)!==sourceHashes[file]),pass=!errors.length&&!changedSources.length&&records.every(record=>record.sheets.every(sheet=>sheet.panels.every(panel=>panel.contact.maxReachError<.015&&!panel.clearance.collisions.length&&['primary','secondary'].every(key=>JSON.stringify([...panel.highlights[key]].sort())===JSON.stringify([...record.expectedHighlights[key]].sort())))));
 writeFileSync(`${folder}/${revision}-capture.json`,JSON.stringify({pass,base,revision,sourceHashes,changedSources,errors,records,scope:'Native isolated actual-GLB 3-view lifecycle samples at four phases each direction. Parent must visually inspect all sheets and note occlusion. Static samples do not certify continuous naturalness or human trainer approval.'},null,2));if(!pass)process.exitCode=1;
}finally{await browser.close();}
