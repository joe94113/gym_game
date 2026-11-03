import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const folder='artifacts/npc-lod-v010';mkdirSync(folder,{recursive:true});
const files=['src/npc-geometry-lod-v010.js','src/skinned-character.js','src/crowd.js','src/social-crowd.js','src/world-controller.js','src/locomotion.js','src/classes/warmup-program.js','src/pose-review.js','public/models/athlete/athlete.glb','public/models/athlete/lod-v010/manifest.json','public/models/athlete/lod-v010/indices.bin'];
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),hashes=()=>Object.fromEntries(files.map(p=>[p,hash(p)])),sourceHashes=hashes(),errors=[];
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});
 await page.waitForFunction(()=>window.__FORM__.world.getNpcLodDiagnostics().crowd.actors.some(a=>a.available),null,{timeout:30000,polling:100});
 const world=await page.evaluate(()=>{
  document.querySelector('[data-action="free"]').click();const w=window.__FORM__.world;w.setGraphicsQuality('flow');w.placePlayerAtStation('chest-press');w.inspectView({position:[5,6,6],target:[-5,1,-4]});for(let i=0;i<120;i++)w.update(1/60,false);
  const frames=[];for(const enabled of [false,true]){w.setNpcLodEnabled(enabled);w.update(0);frames.push({enabled,render:w.getRenderStats(),detail:w.getNpcLodDiagnostics(),body:w.getBodyWorldPoints(),image:document.querySelector('#gym-canvas').toDataURL('image/png')});}return frames;
 });
 for(const frame of world){frame.file=`world-${frame.enabled?'lod':'full'}.png`;writeFileSync(`${folder}/${frame.file}`,Buffer.from(frame.image.split(',')[1],'base64'));delete frame.image;}
 console.log(JSON.stringify({worldTriangles:world.map(f=>f.render.triangles)}));
 // Navigate the same page, releasing its gym WebGL context before the small
 // isolated fixture. Two live software contexts would confound this review.
 await page.route('**/npc-lod-review-v010',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><canvas></canvas><script type="module" src="/.local-tools/npc-lod-review-v010.js"></script></body></html>'}));
 await page.goto('http://127.0.0.1:5173/npc-lod-review-v010');
 await page.waitForFunction(()=>window.__LOD_REVIEW__?.status()==='ready',null,{timeout:120000,polling:100});
 const sheets=[];
 for(const [key,appearance]of [['adult',{}],['feminine',{bodyProfile:'feminine'}],['senior',{age:65}],['feminine-senior',{bodyProfile:'feminine',age:65}]])for(const poseName of ['standing','warmup']){
  const sheet=await page.evaluate(({appearance,poseName})=>window.__LOD_REVIEW__.sheet(appearance,poseName),{appearance,poseName});sheet.file=`${key}-${poseName}.png`;writeFileSync(`${folder}/${sheet.file}`,Buffer.from(sheet.image.split(',')[1],'base64'));delete sheet.image;sheets.push(sheet);console.log(sheet.file);
 }
 const final=hashes(),changedSources=files.filter(p=>sourceHashes[p]!==final[p]);
 const pass=!errors.length&&!changedSources.length&&world[1].render.triangles<world[0].render.triangles&&JSON.stringify(world[0].body)===JSON.stringify(world[1].body)&&sheets.every(s=>s.panels.every(p=>p.detail.level===p.level&&p.overlay));
 writeFileSync(`${folder}/capture-report.json`,JSON.stringify({pass,sourceHashes,changedSources,errors,world,sheets,scope:'Actual gym A/B at fixed camera and zero-time update. Four appearance variants, two poses, three levels and front/side/back using production GLB/controller/materials. Isolated sheets deliberately force simplified geometry at close range for inspection; normal gameplay restores full near the camera. Static panels need separate actual visual review and do not certify continuous motion or human coaching.'},null,2));
 if(!pass)process.exitCode=1;
}finally{await browser.close();}
