import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:.65});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const advance=seconds=>page.evaluate(seconds=>{for(let i=0;i<seconds/.05;i++)window.__FORM__.world.update(.05,false);window.__FORM__.world.update(0);},seconds);
const capture=name=>page.screenshot({path:`artifacts/club-${name}.png`});
try{
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();await advance(3);await capture('entrance');
  await page.evaluate(()=>window.__FORM__.openExercise('inbody'));await advance(11);await capture('inbody');
  await page.locator('[data-action="close-teaching"]').first().click();await advance(2);
  const rays=[];
  for(const [name,position,target]of [
    ['wall-cutaway',[-2.2,3.2,22],[-5.5,1.1,10.6]],
    ['reception',[1.2,3.4,23.7],[-5.4,2.25,16.8]],
    ['older-member',[-26,2.8,-18.5],[-30,1.25,-25]],
  ]){
    await page.evaluate(({position,target})=>window.__FORM__.world.inspectView({position,target}),{position,target});
    await capture(name);rays.push({name,cutaway:await page.evaluate(()=>window.__FORM__.world.getFacilityDiagnostics().receptionCutaway)});
  }
  const diagnostics=await page.evaluate(()=>({facility:window.__FORM__.world.getFacilityDiagnostics(),social:window.__FORM__.world.getSocialDiagnostics(),crowd:window.__FORM__.world.getCrowdDiagnostics()}));
  writeFileSync('artifacts/reception-final-qa.json',JSON.stringify({errors,rays,...diagnostics},null,2));console.log(JSON.stringify({errors,rays}));
}finally{await browser.close();}
