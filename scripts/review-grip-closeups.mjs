import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {coursePlanFor} from '../src/classes/class-timeline.js';
const folder='artifacts/full-course-review/grips';mkdirSync(folder,{recursive:true});
const requested=process.argv.slice(2),cases=[['barbell','romanian-deadlift'],['barbell','biceps-curl'],['barbell','put-down-rest'],['cycle','cycle-steady'],['trx','trx-low-row'],['aerial','aerial-standing-reach']].filter(([kind])=>!requested.length||requested.includes(kind)).map(([kind,motion])=>{
 const p=coursePlanFor(kind),b=motion==='put-down-rest'?p.blocks.find((b,i)=>b.motionId===motion&&p.blocks[i+1]?.motionId==='biceps-curl'):p.blocks.find(b=>b.motionId===motion);
 return{kind,motion,id:`class-${kind}`,phase:(b.startSeconds+(motion==='put-down-rest'?b.seconds-1.75:(Math.floor(b.repetitions/2)+.5)*b.seconds/b.repetitions))/p.duration};
});
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:.5}),errors=[],reports=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 for(const c of cases){const r=await page.evaluate(c=>{const a=window.__FORM__,w=a.world;a.openExercise(c.id);if(!w.advanceUntilReady(180,false))throw new Error(`Cannot join ${c.id}`);w.setAnimationPaused(true);w.inspectExercise(c.phase);const views=c.kind==='aerial'?['left-hand','right-hand','left-hand-side','right-hand-side']:['left-hand','right-hand'],images=views.map(view=>({view,...w.capturePoseReview(view,620)}));w.stopExercise();w.advanceUntilIdle(180,false);return images;},c);for(const v of r){writeFileSync(`${folder}/${c.kind}-${c.motion}-${v.view}.png`,Buffer.from(v.image.split(',')[1],'base64'));delete v.image;}reports.push({...c,views:r});console.log(JSON.stringify({kind:c.kind,motion:c.motion}));}
 writeFileSync(`${folder}/report.json`,JSON.stringify({errors,reports},null,2));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
