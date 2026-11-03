import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base=process.argv[2]||'http://127.0.0.1:5173',name=process.argv[3]||'after',dir='artifacts/performance-v09';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto(base,{timeout:120000});await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.evaluate(()=>{document.querySelector('[data-action="free"]').click();window.__FORM__.world.setGraphicsQuality('flow');});
 const results=[];
 for(const c of [{id:'main-floor',station:'chest-press',position:[5,6,6],target:[-5,1,-4]},{id:'classroom',exercise:'class-dance',position:[-24,5,31],target:[-24,1,25]},{id:'bathroom',facility:'shower',position:[18,4.5,12],target:[25,1,15]}]){
  const r=await page.evaluate(c=>{
   const a=window.__FORM__,w=a.world;w.inspectView(null);w.stopExercise();w.advanceUntilIdle(180,false);
   if(c.exercise||c.facility){const id=c.exercise||a.catalogActivities.find(e=>e.facilityKind===c.facility)?.id;if(!id)throw new Error(`Missing facility ${c.facility}`);a.openExercise(id);if(!w.advanceUntilReady(180,false))throw new Error(`Cannot start ${id}`);for(const e of document.querySelectorAll('input[type=checkbox][data-course-audio]')){e.checked=false;e.dispatchEvent(new Event('input',{bubbles:true}));}}
   else w.placePlayerAtStation(c.station);
   w.inspectView({position:c.position,target:c.target});for(let i=0;i<120;i++)w.update(1/60,false);w.update(0);
   const canvas=document.querySelector('#gym-canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info'),percent=(a,p)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
   const sample=render=>{const values=[];for(let i=0;i<80;i++){const t=performance.now();w.update(1/60,render);if(render)gl.finish();if(i>=16)values.push(performance.now()-t);}return{medianMs:percent(values,.5),p95Ms:percent(values,.95),samples:values.length,values};};
   const result={id:c.id,camera:{position:c.position,target:c.target},player:w.getPlayerPosition(),activity:w.getActivityState(),framebuffer:[canvas.width,canvas.height],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),cpuUpdate:sample(false),renderedFrame:sample(true),renderStats:w.getRenderStats(),quality:w.getPerformanceDiagnostics(),rooms:w.getRoomDiagnostics?.()||null,batching:w.getBatchDiagnostics?.()||null};w.update(0);result.image=canvas.toDataURL('image/png');return result;
  },c);writeFileSync(`${dir}/${name}-${c.id}.png`,Buffer.from(r.image.split(',')[1],'base64'));delete r.image;results.push(r);console.log(JSON.stringify(r));
 }
 const root=name.startsWith('before')?'.local-tools/v09-before/':'';const sources=['src/world.js','src/world-controller.js','src/gym-architecture.js','src/equipment.js','src/room-zones.js','src/equipment-batching.js','src/skinned-character.js','src/rig-lifecycle.js'].filter(p=>existsSync(root+p));const sourceHashes=Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(root+p)).digest('hex')]));
 writeFileSync(`${dir}/${name}.json`,JSON.stringify({name,base,viewport:[1280,800],deviceScaleFactor:1,profile:'flow',scope:'Automatic animation frames disabled BEFORE app loads, so all simulation clocks start deterministically. Same explicit quality, framebuffer, static camera and player setup before/after. Two simulation seconds settle room hysteresis, then 16 warmup plus 64 measured frames per mode, gl.finish for rendered timings; raw sample arrays retained. Software renderer measurements are not user hardware FPS.',sourceHashes,errors,results},null,2));if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
