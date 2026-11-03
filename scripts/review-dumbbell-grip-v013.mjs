import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const label=process.argv[2]||'after',before=label.startsWith('before'),base=before?'http://127.0.0.1:5174':'http://127.0.0.1:5173',root=before?'.local-tools/v013-before/':'',folder=`artifacts/grip-v013/${label}`;mkdirSync(folder,{recursive:true});
const files=['src/dumbbell-grip.js','src/free-dumbbell-shaft.js','src/skinned-character.js','src/hand-contact-frame.js','src/extended-rig.js','src/exercise-rig.js','public/models/athlete/athlete.glb'],sha=p=>createHash('sha256').update(readFileSync(root+p)).digest('hex'),sourceHashes=Object.fromEntries(files.map(p=>[p,sha(p)])),records=[],errors=[];
const browser=await chromium.launch({...config.use.launchOptions,args:['--use-gl=angle','--use-angle=d3d11'],headless:true});
try{const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});
 const ids=label.startsWith('pilot')?['dumbbell-bench-press']:['dumbbell-bench-press','dumbbell-curl','dumbbell-hammer-curl','dumbbell-shoulder-press','dumbbell-lateral-raise','dumbbell-single-arm-row','dumbbell-romanian-deadlift','dumbbell-goblet-squat'];
 for(const id of ids){const results=await page.evaluate(id=>{const a=window.__FORM__,w=a.world;document.querySelector('[data-action=free]')?.click();w.stopExercise();w.advanceUntilIdle(180,false);a.openExercise(id);if(!w.advanceUntilReady(180,false))throw Error(`not ready ${id}`);w.setAnimationPaused(true);w.inspectExercise(.5);return['left-hand','right-hand'].map(view=>({view,capture:w.capturePoseReview(view,520),contact:w.getContactDiagnostics(),hands:w.getHandDiagnostics(),clearance:w.getClearanceDiagnostics(),highlights:w.getMuscleHighlights()}));},id);
  for(const result of results){const path=`${folder}/${id}-${result.view}.png`;writeFileSync(path,Buffer.from(result.capture.image.split(',')[1],'base64'));delete result.capture;records.push({id,path,...result});}
 }
}finally{await browser.close();}
const changedSources=files.filter(p=>sha(p)!==sourceHashes[p]),pass=!errors.length&&!changedSources.length&&records.every(r=>r.contact.maxReachError<.015&&!r.clearance.collisions.length);
writeFileSync(`${folder}/capture.json`,JSON.stringify({pass,label,sourceHashes,changedSources,errors,records,scope:'Actual native isolated hand closeups at one finite loop phase. True all-vertex metal contact and opening/closing are separately qualified; appearance alone cannot certify hidden surfaces.'},null,2));console.log(JSON.stringify({pass,images:records.length,changedSources,errors}));if(!pass)process.exitCode=1;
