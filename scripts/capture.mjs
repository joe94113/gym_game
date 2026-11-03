import { chromium } from '@playwright/test';
import { mkdir, access } from 'node:fs/promises';
await mkdir('artifacts', {recursive:true});
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if (!executablePath) {
  try { await access(chromium.executablePath()); executablePath = chromium.executablePath(); } catch { /* Standard Playwright setup reports an actionable install hint if unavailable. */ }
}
const browser = await chromium.launch({headless:true, ...(executablePath ? {executablePath} : {}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror', error=>console.log('PAGE ERROR',error.message));
page.on('console', message=>{if(message.type()==='error')console.log('CONSOLE ERROR', message.text());});
await page.goto('http://127.0.0.1:5173');
await page.waitForFunction(()=>window.__FORM__?.state.loaded,{timeout:30000});
await page.screenshot({path:'artifacts/welcome.png'});
await page.click('[data-action="start"]');
await page.waitForTimeout(1200);
await page.screenshot({path:'artifacts/explore.png'});
await page.evaluate(()=>window.__FORM__.openStation(window.__FORM__.stations[0]));
await page.waitForTimeout(1200);
await page.screenshot({path:'artifacts/teaching.png'});
await page.click('[data-tab="range"]');
await page.screenshot({path:'artifacts/range.png'});
await page.keyboard.press('Escape');
await page.keyboard.press('m');
await page.screenshot({path:'artifacts/map.png'});
await page.keyboard.press('Escape');
await page.setViewportSize({width:1280,height:720});
await page.click('[data-action="choose"]');
await page.screenshot({path:'artifacts/welcome-1280.png'});
await page.click('[data-action="free"]');
await page.evaluate(()=>window.__FORM__.openStation(window.__FORM__.stations[3]));
await page.waitForTimeout(1000);
await page.screenshot({path:'artifacts/leg-press-1280.png'});
console.log(JSON.stringify(await page.evaluate(()=>({loaded:window.__FORM__.state.loaded,position:window.__FORM__.world.getPlayerPosition(),zone:window.__FORM__.state.zone,active:window.__FORM__.state.active?.id,body:document.body.scrollHeight,innerHeight:innerHeight,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON()}))));
await browser.close();
