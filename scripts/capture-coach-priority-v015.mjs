import {chromium} from '@playwright/test';import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {catalogActivities} from '../src/activity-catalog.js';
import {createReviewPackage,importReviewPackage,reviewHTML,reviewCSV} from '../src/motion-review-data-v015.js';
import {hashPerformanceSources} from './performance-source-v013.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';
const directory='artifacts/coach-review-v015/ready-pack';mkdirSync(directory,{recursive:true});
const ids=['dumbbell-shoulder-press','dumbbell-goblet-squat','dumbbell-bench-press','machine-squat-rack','machine-leg-press','machine-bike'];
const catalog=catalogActivities.filter(item=>item.runtime!=='facility'||item.classKind),sourceHashes=hashPerformanceSources(),evidence=[],images=[],errors=[];
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),startedAt=new Date().toISOString();
const browser=await chromium.launch({...config.use.launchOptions,args:['--use-gl=angle','--use-angle=d3d11'],headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);requestAnimationFrame=callback=>callback.name==='frame'&&String(callback).includes('recordFrameTiming')?0:native(callback);});
 await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.locator('[data-action=free]').click();
 for(const id of ids){
  await page.evaluate(id=>{const a=window.__FORM__,w=a.world;if(w.getActivityState().exerciseId){w.seekExercise(0);w.stopExercise();if(!w.advanceUntilIdle(180,false))throw Error('Cannot finish previous activity');}a.openExercise(id);if(!w.advanceUntilReady(180,false))throw Error('Cannot prepare '+id);w.setAnimationPaused(true);},id);
  for(const [direction,phase]of [['enter',.35],['loop',.5],['exit',.65]])for(const view of ['front','side','back']){
   const frame=await page.evaluate(({direction,phase,view})=>{const w=window.__FORM__.world;if(direction==='loop')w.inspectExercise(phase);else w.inspectLifecycle(direction,phase);const result=w.capturePoseReview(view,384);if(!result?.image)throw Error('No actual image');return{image:result.image,contact:w.getContactDiagnostics()};},{direction,phase,view});
   const capturedAt=new Date().toISOString(),path=`${directory}/${id}-${direction}-${view}.png`;writeFileSync(path,Buffer.from(frame.image.split(',')[1],'base64'));images.push({path,sha256:sha(path),id,direction,view,phase});evidence.push({id,direction,view,phase,capturedAt,sourceVersion:'0.15.0',image:frame.image,contact:frame.contact});
  }
  console.log(JSON.stringify({id,images:9,total:evidence.length}));
 }
}catch(error){errors.push(error.stack||error.message);}finally{await browser.close();}
const changedSources=Object.entries(sourceHashes).filter(([path,value])=>sha(path)!==value).map(([path])=>path);
let exports=null;
if(!errors.length&&!changedSources.length&&evidence.length===54){
 const payload=createReviewPackage({catalog,records:[],evidence});if(payload.checklist.some(item=>item.status!=='pending')||payload.professionalSignoff!==false)throw Error('Human status must remain pending');
 const json=JSON.stringify(payload,null,2),parsed=importReviewPackage(json,catalog);if(parsed.evidence.length!==54)throw Error('Roundtrip lost actual images');
 for(const [name,data]of [['review.json',json],['review.html',reviewHTML(payload,catalog)],['review.csv',reviewCSV(payload,catalog)]])writeFileSync(directory+'/'+name,data);
 exports=Object.fromEntries(['review.json','review.html','review.csv'].map(name=>[name,{path:directory+'/'+name,sha256:sha(directory+'/'+name)}]));
}
const report={pass:!errors.length&&!changedSources.length&&evidence.length===54,startedAt,completedAt:new Date().toISOString(),sourceHashes,changedSources,ids,images,exports,errors,professionalSignoff:false,scope:'54 actual native-GLB static renders: six priority exercises x three stages x three directions. No reviewer names or opinions entered; all65 checklist entries remain pending. Other59 movements have no new images in this first batch. Static views are not continuous-motion human review.'};
writeFileSync(directory+'/capture.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,images:images.length,errors}));if(!report.pass)process.exitCode=1;
