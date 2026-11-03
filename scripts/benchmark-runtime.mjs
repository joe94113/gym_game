import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const name=process.argv[2]||'runtime';
const browser=await chromium.launch({...config.use.launchOptions,headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
try{
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 const report=await page.evaluate(()=>{
  const w=window.__FORM__.world,canvas=document.querySelector('#gym-canvas'),gl=canvas.getContext('webgl2'),extension=gl.getExtension('WEBGL_debug_renderer_info'),percent=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
  const sample=render=>{const times=[];for(let i=0;i<32;i++){const t=performance.now();w.update(1/60,render);if(render)gl.finish();if(i>=8)times.push(performance.now()-t);}return{medianMs:percent(times,.5),p95Ms:percent(times,.95)};};
  return{renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),framebuffer:[canvas.width,canvas.height],cpuUpdate:sample(false),renderedFrame:sample(true),stats:w.getRenderStats(),performance:w.getPerformanceDiagnostics?.()||null};
 });mkdirSync('artifacts/performance',{recursive:true});writeFileSync(`artifacts/performance/${name}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
