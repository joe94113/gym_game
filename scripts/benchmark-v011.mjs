import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const name=process.argv[2]||'after-1',before=name.startsWith('before'),base=before?'http://127.0.0.1:5174':'http://127.0.0.1:5173',root=before?'.local-tools/v011-before/':'',dir='artifacts/performance-v011';
mkdirSync(dir,{recursive:true});
const hashSources=()=>Object.fromEntries(readdirSync(`${root}src`,{recursive:true}).filter(p=>/\.(js|css)$/.test(p)).map(p=>[`src/${p.replaceAll('\\','/')}`,createHash('sha256').update(readFileSync(`${root}src/${p}`)).digest('hex')]));
const sourceHashes=hashSources(),browser=await chromium.launch({...config.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[],headless:true}),errors=[],results=[];
try{
 for(const view of [{id:'main-floor',station:'chest-press',position:[5,6,6],target:[-5,1,-4]},{id:'classroom',station:'group-class',position:[-24,5,31],target:[-24,1,25]},{id:'bathroom',station:'shower-1',position:[18,4.5,12],target:[25,1,15]}]){
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.requestAnimationFrame=()=>0;window.__BENCH_GL__={buffersCreated:0,buffersDeleted:0,texturesCreated:0,texturesDeleted:0};
   for(const [suffix,key]of [['Buffer','buffers'],['Texture','textures']]){
    const live=new WeakSet(),prototype=WebGL2RenderingContext.prototype,create=prototype[`create${suffix}`],remove=prototype[`delete${suffix}`];
    prototype[`create${suffix}`]=function(){const object=create.call(this);if(object){live.add(object);window.__BENCH_GL__[`${key}Created`]++;}return object;};
    prototype[`delete${suffix}`]=function(object){if(object&&live.has(object)){live.delete(object);window.__BENCH_GL__[`${key}Deleted`]++;}return remove.call(this,object);};
   }
  });await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});
  const result=await page.evaluate(view=>{
   const a=window.__FORM__,w=a.world;document.querySelector('[data-action="free"]').click();w.setGraphicsQuality('flow');
   w.setRoomManagementEnabled(false);w.inspectView({position:[-24,5,31],target:[-24,1,25]});w.update(0);w.inspectView({position:[18,4.5,12],target:[25,1,15]});w.update(0);
   if(!w.placePlayerAtStation(view.station))throw Error(`missing station ${view.station}`);w.inspectView(view);w.setRoomManagementEnabled(true);
   for(let i=0;i<900;i++)w.update(1/60,false);w.update(0);
   const canvas=document.querySelector('#gym-canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info'),renderer=String(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
   if(/swiftshader|llvmpipe|software|basic render/i.test(renderer))throw Error('native renderer required');
   const percent=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
   const sample=render=>{const values=[];for(let i=0;i<80;i++){const start=performance.now();w.update(1/60,render);if(render)gl.finish();if(i>=16)values.push(performance.now()-start);}return{medianMs:percent(values,.5),p95Ms:percent(values,.95),samples:values.length,values};};
   const cpuUpdate=sample(false),renderedFrame=sample(true);
   const counters={...window.__BENCH_GL__},liveHandles={buffers:counters.buffersCreated-counters.buffersDeleted,textures:counters.texturesCreated-counters.texturesDeleted};
   return{id:view.id,camera:{position:view.position,target:view.target},player:w.getPlayerPosition(),renderer,framebuffer:[canvas.width,canvas.height],cpuUpdate,renderedFrame,renderStats:w.getRenderStats(),quality:w.getPerformanceDiagnostics(),rooms:w.getRoomDiagnostics(),resources:w.getRoomResourceDiagnostics?.()||null,batching:w.getBatchDiagnostics(),glCounters:counters,liveHandles,image:canvas.toDataURL('image/png')};
  },view);
  writeFileSync(`${dir}/${name}-${view.id}.png`,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;results.push(result);console.log(JSON.stringify({name,view:result.id,cpu:result.cpuUpdate.medianMs,frame:result.renderedFrame.medianMs,p95:result.renderedFrame.p95Ms,calls:result.renderStats.calls,geometries:result.resources?.rendererMemory.geometries??null,renderer:result.renderer}));await page.close();
 }
 const finalHashes=hashSources(),changedSources=Object.keys(sourceHashes).filter(path=>sourceHashes[path]!==finalHashes[path]);
 const report={pass:!errors.length&&!changedSources.length,name,base,rendererKind:'native',viewport:[1280,800],deviceScaleFactor:1,profile:'flow',scope:'Separate fresh page per view. Automatic RAF disabled before load; both rooms rendered once, fixed player/camera, 15 simulation seconds for identical clocks and room cooling. 16 warmup and 64 timed frames per mode. Rendered timings include gl.finish and CPU update, not displayed FPS or isolated GPU time. Run on one Intel UHD 630; no claim for all hardware.',sourceHashes,changedSources,errors,results};
 writeFileSync(`${dir}/${name}.json`,JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
}finally{await browser.close();}
