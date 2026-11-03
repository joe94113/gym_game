import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {hashPerformanceSources} from './performance-source-v013.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Root-owned native/GPU queue. Captures observations; a separate actual image
// review is required before these can count as accepted visual evidence.
const folder='artifacts/release-v013/visual',sourceHashes=hashPerformanceSources();mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,args:['--use-gl=angle','--use-angle=d3d11'],headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1}),errors=[],images=[],poses=[],lifecycles=[];
page.on('pageerror',e=>errors.push(e.message));
async function screenshot(name){const path=`${folder}/${name}.png`;await page.screenshot({path});images.push(path);}
async function stop(){await page.evaluate(()=>{const w=window.__FORM__.world;w.stopExercise();if(!w.advanceUntilIdle(240,false))throw Error('Cannot leave prior exercise.');});}
try{
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.evaluate(()=>window.__FORM__.journal.ready);await screenshot('welcome');
 await page.locator('[data-action=free]').click();await page.evaluate(()=>window.__FORM__.world.setGraphicsQuality('clear'));
 await page.evaluate(()=>{const a=window.__FORM__;a.openExercise('class-aerial');if(!a.world.advanceUntilReady(240,false))throw Error('Aerial not ready');a.world.setAnimationPaused(true);});
 for(const [name,seconds]of [['aerial-seat',360],['aerial-inversion',520]]){
  const result=await page.evaluate(({name,seconds})=>{const w=window.__FORM__.world;w.seekExercise(seconds/1800);w.update(0);return{name,seconds,body:w.getBodyWorldPoints(),contact:w.getContactDiagnostics(),clearance:w.getClearanceDiagnostics(),self:w.getSelfClearanceDiagnostics(),classes:w.getClassDiagnostics(),muscles:w.getMuscleHighlights(),views:['front','side','back'].map(view=>w.capturePoseReview(view,640))};},{name,seconds});
  for(const view of result.views){const path=`${folder}/${name}-${view.view}.png`;writeFileSync(path,Buffer.from(view.image.split(',')[1],'base64'));images.push(path);}delete result.views;poses.push(result);
  await page.evaluate(()=>window.__FORM__.world.update(0));await screenshot(`${name}-classroom`);
 }
 for(const direction of ['enter','exit']){
  const record=await page.evaluate(async direction=>{const w=window.__FORM__.world,canvas=document.createElement('canvas');canvas.width=1120;canvas.height=980;const ctx=canvas.getContext('2d'),panels=[],phases=direction==='enter'?[.22,.52,.72,.92]:[.08,.28,.48,.78];ctx.fillStyle='#e4e7e2';ctx.fillRect(0,0,1120,980);ctx.fillStyle='#24352d';ctx.font='18px sans-serif';ctx.fillText(`aerial: ${direction}`,12,25);
   for(let row=0;row<3;row++)for(let col=0;col<4;col++){const phase=phases[col],view=['front','side','back'][row],inspection=w.inspectLifecycle(direction,phase),capture=w.capturePoseReview(view,280),picture=new Image();picture.src=capture.image;await picture.decode();ctx.drawImage(picture,col*280,35+row*310,280,280);ctx.fillStyle='#24352d';ctx.font='12px sans-serif';ctx.fillText(`${view} ${phase} ${inspection.frame.stage}`,col*280+5,330+row*310);panels.push({phase,view,stage:inspection.frame.stage,contact:inspection.contact,clearance:inspection.clearance,self:w.getSelfClearanceDiagnostics()});}
   return{direction,panels,image:canvas.toDataURL('image/png')};},direction);
  const path=`${folder}/aerial-${direction}.png`;writeFileSync(path,Buffer.from(record.image.split(',')[1],'base64'));delete record.image;record.path=path;images.push(path);lifecycles.push(record);
 }
 await page.evaluate(()=>window.__FORM__.world.seekExercise(520/1800));await stop();await page.evaluate(()=>{const a=window.__FORM__;a.openExercise('machine-chest-press');if(!a.world.advanceUntilReady(180,false))throw Error('Chest press not ready');a.world.update(0);});await page.locator('details[aria-label=器材設定] summary').click();await screenshot('equipment-settings');
 await page.locator('.header-actions [data-action=journal]').click();await screenshot('training-journal');await page.keyboard.press('Escape');
 await page.locator('.header-actions [data-action=account]').click();await screenshot('account-sync');await page.keyboard.press('Escape');
 await page.locator('.header-actions [data-action=help]').click();await page.locator('[data-action=motion-review]').click();await page.locator('[data-review-view=side]').click();await screenshot('motion-review-workspace');await page.keyboard.press('Escape');
}catch(e){errors.push(String(e.stack||e));}finally{await browser.close();}
const final=hashPerformanceSources(),changedSources=Object.keys(sourceHashes).filter(path=>sourceHashes[path]!==final[path]),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const pass=!errors.length&&!changedSources.length&&images.length===15&&poses.length===2&&poses.every(p=>p.contact.maxReachError<.015&&!p.clearance.collisions.length&&!p.self.collisions.length&&p.classes.suspension.length===4&&p.classes.suspension.every(actor=>actor.flight.supported))&&lifecycles.length===2&&lifecycles.every(record=>record.panels.length===12&&record.panels.every(panel=>panel.contact.maxReachError<.015&&!panel.clearance.collisions.length&&!panel.self.collisions.length));
const report={pass,sourceHashes,changedSources,errors,images,imageHashes:Object.fromEntries(images.map(path=>[path,sha(path)])),poses,lifecycles,scope:'Native1280x800 actual UI and actual GLB plus aerial cloth geometry. Isolated views exclude other class actors; classroom images include them. These screenshots require explicit visual observation and do not certify biomechanics or every intermediate frame.'};writeFileSync(`${folder}/capture.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({pass,images:images.length,changedSources,errors}));if(!pass)process.exitCode=1;
