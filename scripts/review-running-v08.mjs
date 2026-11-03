import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const folder='artifacts/ergonomics-review';mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,headless:true}),page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 const result=await page.evaluate(async()=>{
  const w=window.__FORM__.world,c=document.createElement('canvas');c.width=1500;c.height=1000;const g=c.getContext('2d');g.fillStyle='#edf0e9';g.fillRect(0,0,c.width,c.height);g.fillStyle='#263b30';g.font='24px sans-serif';g.fillText('Actual skinned character / running / one full 0.68 s stride',16,30);
  const panels=[];for(let row=0;row<3;row++)for(let col=0;col<5;col++){const view=['front','side','back'][row],time=col*.68/4,s=w.captureMovementReview(time,1,1,view,300),img=new Image();img.src=s.image;await img.decode();g.drawImage(img,col*300,45+row*315,300,290);g.fillStyle='#263b30';g.font='14px sans-serif';g.fillText(`${view} / ${time.toFixed(3)} s`,col*300+10,350+row*315);panels.push({view,time});}return{image:c.toDataURL(),panels};
 });writeFileSync(`${folder}/running-three-views.png`,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
 await page.locator('.header-actions [data-action="help"]').click();await page.screenshot({path:`${folder}/readable-help-1280.png`});await page.keyboard.press('Escape');
 await page.locator('.header-actions [data-action="classes"]').click();await page.locator('[data-demo="class-dance"]').click();await page.evaluate(()=>{const w=window.__FORM__.world;w.advanceUntilReady(180,false);w.setAnimationPaused(true);w.update(0);});
 await page.screenshot({path:`${folder}/readable-class-1280.png`});await page.locator('.course-audio-settings summary').click();await page.locator('.course-audio-settings').scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/audio-controls-1280.png`});
 writeFileSync(`${folder}/running-capture-report.json`,JSON.stringify({errors,...result},null,2));if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
