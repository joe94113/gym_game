import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const dir='artifacts/equipment-review-v011';mkdirSync(dir,{recursive:true});
const hashes=()=>Object.fromEntries(readdirSync('src',{recursive:true}).filter(p=>/\.(js|css)$/.test(p)).map(p=>[`src/${p.replaceAll('\\','/')}`,createHash('sha256').update(readFileSync(`src/${p}`)).digest('hex')]));
const sourceHashes=hashes(),errors=[],frames=[],layouts=[];
const browser=await chromium.launch({...config.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[],headless:true}),page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',error=>errors.push(error.message));
try{
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.evaluate(()=>{document.querySelector('[data-action="free"]').click();window.__FORM__.world.setGraphicsQuality('flow');});
 for(const config of [{id:'cable-rope-hammer-curl'},{id:'cable-straight-arm-pulldown'},{id:'cable-rope-crunch'},...[0,1,15,30,45].map(angle=>({id:'dumbbell-bench-press',angle}))]){
  const info=await page.evaluate(config=>{
   const a=window.__FORM__,w=a.world;w.stopExercise();w.advanceUntilIdle(180,false);if(config.angle!==undefined&&!w.setEquipmentSettings(config.id,{benchAngle:config.angle}).ok)throw Error('bench setting rejected');a.openExercise(config.id);if(!w.advanceUntilReady(180,false))throw Error(`not ready ${config.id}`);w.setAnimationPaused(true);return{lifecycle:w.getLifecycleMetadata(),settings:w.getEquipmentSettings(config.id)};
  },config);
  let seatedPhase=.55;if(config.angle!==undefined){let seconds=0,found=false;for(const stage of info.lifecycle.stages){seconds+=stage.duration;if(stage.label==='啞鈴先穩放大腿上'){found=true;break;}}if(!found)throw Error('missing seated stage');seatedPhase=seconds/info.lifecycle.entryDuration;}
  for(const [moment,phase]of [['enter',seatedPhase],['loop',.5],['exit',config.angle!==undefined?1-seatedPhase:.45]])for(const view of ['front','side','back']){
   const capture=await page.evaluate(({moment,phase,view})=>{const w=window.__FORM__.world;if(moment==='loop')w.inspectExercise(phase);else w.inspectLifecycle(moment,phase);const capture=w.capturePoseReview(view,360);return{image:capture.image,contact:w.getContactDiagnostics(),clearance:w.getClearanceDiagnostics(),self:w.getSelfClearanceDiagnostics(),hands:w.getHandDiagnostics(),highlights:w.getMuscleHighlights()};},{moment,phase,view});
   const path=`${dir}/${config.id}${config.angle!==undefined?`-${config.angle}deg`:''}-${moment}-${view}.png`;writeFileSync(path,Buffer.from(capture.image.split(',')[1],'base64'));delete capture.image;frames.push({config,moment,phase,view,path,...capture});
  }
  if(config.angle===15){
   for(const [width,height]of [[1280,800],[1440,1000]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>{const w=window.__FORM__.world;w.resize();w.inspectExercise(.45);w.update(0);document.querySelector('.equipment-settings').open=true;});
    layouts.push(await page.locator('.bench-angle-controls').evaluate(element=>{const bounds=element.getBoundingClientRect();return{viewport:[innerWidth,innerHeight],bounds:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom},horizontalOverflow:element.closest('.station-scroll').scrollWidth>element.closest('.station-scroll').clientWidth,controlOverflowPixels:element.scrollWidth-element.clientWidth,withinSettings:[...element.querySelectorAll('select,input,button')].every(child=>{const r=child.getBoundingClientRect(),p=element.closest('.equipment-settings').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right;}),font:parseFloat(getComputedStyle(element.querySelector('label')).fontSize),options:element.querySelector('select').options.length};}));
    await page.screenshot({path:`${dir}/bench-controls-${width}.png`,animations:'disabled'});await page.locator('.bench-angle-apply').evaluate(button=>button.scrollIntoView({block:'end'}));await page.screenshot({path:`${dir}/bench-controls-${width}-apply.png`,animations:'disabled'});
   }await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>window.__FORM__.world.resize());
  }
 }
 const rooms=await page.evaluate(()=>{
  const w=window.__FORM__.world;w.stopExercise();w.advanceUntilIdle(180,false);w.placePlayerAtStation('chest-press');w.inspectView({position:[5,6,6],target:[-5,1,-4]});for(let i=0;i<300;i++)w.update(.05,false);w.update(0);return w.getRoomResourceDiagnostics();
 });
 for(const [id,view]of [['classroom',{position:[-24,5,31],target:[-24,1,25]}],['bathroom',{position:[18,4.5,12],target:[25,1,15]}]]){
  const capture=await page.evaluate(view=>{const w=window.__FORM__.world;w.inspectView(view);w.update(0);return{image:document.querySelector('#gym-canvas').toDataURL('image/png'),resources:w.getRoomResourceDiagnostics()};},view);writeFileSync(`${dir}/${id}-after-wake.png`,Buffer.from(capture.image.split(',')[1],'base64'));
 }
 const finalHashes=hashes(),changedSources=Object.keys(sourceHashes).filter(path=>sourceHashes[path]!==finalHashes[path]),pass=!errors.length&&!changedSources.length&&frames.every(frame=>frame.contact.maxReachError<.015&&!frame.clearance.collisions.length&&!frame.self.collisions.length)&&layouts.every(layout=>!layout.horizontalOverflow&&layout.withinSettings&&layout.font>=14&&layout.options===46);
 const report={pass,scope:'Native WebGL actual game isolated front/side/back screenshots of entry, movement and exit at representative samples; five bench settings plus three new cables, and room wake views. Dense motion/body/metal/skin tests live in separate CPU qualification. Static pictures are not continuous animation or trainer review.',sourceHashes,changedSources,errors,frames,layouts,coldRooms:rooms};writeFileSync(`${dir}/capture.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({pass,frames:frames.length,layouts,errors,changedSources}));if(!pass)process.exitCode=1;
}finally{await browser.close();}
