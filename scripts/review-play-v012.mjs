import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const gripOnly=process.argv.includes('--grips'),dir='artifacts/performance-v012/visual'+(gripOnly?'/grips':'');mkdirSync(dir,{recursive:true});
const sourceFiles=['src/skinned-character.js','src/actor-skeletons-v012.js','src/gym-architecture.js','src/reception-scenes.js','src/canvas-updates-v012.js','src/world-controller.js','src/navigation-search-v012.js'],hashes=()=>Object.fromEntries(sourceFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),sourceHashes=hashes(),records=[],errors=[];
const browser=await chromium.launch({...config.use.launchOptions,args:['--use-gl=angle','--use-angle=d3d11'],headless:true});
try{
 for(const [version,base]of [['before','http://127.0.0.1:5174'],['after','http://127.0.0.1:5173']]){
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.evaluate(()=>{document.querySelector('[data-action=free]').click();window.__FORM__.world.setGraphicsQuality('clear');});
  for(const view of gripOnly?[]:['front','side','back']){
   const capture=await page.evaluate(view=>{const w=window.__FORM__.world;return w.captureMovementReview(1.19,1,1,view,420);},view);const path=`${dir}/${version}-sprint-${view}.png`;writeFileSync(path,Buffer.from(capture.image.split(',')[1],'base64'));records.push({version,id:'sprint',view,path});
  }
  for(const [id,view]of gripOnly?[['dumbbell-bench-press','left-hand'],['dumbbell-bench-press','right-hand']]:[['dumbbell-bench-press','side'],['dumbbell-bench-press','right-hand-side'],['cable-rope-crunch','side'],['cable-straight-arm-pulldown','back'],['machine-leg-press','side'],['class-dance','front']]){
   const result=await page.evaluate(({id,view})=>{const a=window.__FORM__,w=a.world;w.stopExercise();w.advanceUntilIdle(180,false);a.openExercise(id);if(!w.advanceUntilReady(180,false))throw Error(`not ready ${id}`);w.setAnimationPaused(true);w.inspectExercise(.5);const capture=w.capturePoseReview(view,420);return{image:capture.image,contact:w.getContactDiagnostics(),clearance:w.getClearanceDiagnostics(),self:w.getSelfClearanceDiagnostics(),highlights:w.getMuscleHighlights(),hands:w.getHandDiagnostics(),work:w.getFrameWorkDiagnostics?.()||null};},{id,view});
   const path=`${dir}/${version}-${id}-${view}.png`;writeFileSync(path,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;records.push({version,id,view,path,...result});
  }
  await page.close();
 }
 const finalHashes=hashes(),changedSources=sourceFiles.filter(path=>sourceHashes[path]!==finalHashes[path]),pass=!errors.length&&!changedSources.length&&records.every(record=>!record.contact||record.contact.maxReachError<.015&&!record.clearance.collisions.length&&!record.self.collisions.length);
 writeFileSync(`${dir}/capture.json`,JSON.stringify({pass,sourceHashes,changedSources,errors,records,scope:'Actual native WebGL clear quality before/after, same fixed poses and isolated review views. Images are for manual comparison; actual zero-error deformation is separately checked against the original actor factory in the CPU proof.'},null,2));console.log(JSON.stringify({pass,images:records.length,changedSources,errors}));if(!pass)process.exitCode=1;
}finally{await browser.close();}
