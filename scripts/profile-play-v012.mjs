import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const name=process.argv[2]||'baseline',base=process.argv[3]||'http://127.0.0.1:5174',dir='artifacts/performance-v012';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({...config.use.launchOptions,args:['--use-gl=angle','--use-angle=d3d11'],headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.addInitScript(()=>{
  const raf=window.requestAnimationFrame.bind(window);window.__PROFILE_FRAMES__={active:false,frames:[],draws:0,texImage:0,texSub:0,mips:0};
  for(const [method,key]of [['drawElements','draws'],['drawElementsInstanced','draws'],['drawArrays','draws'],['texImage2D','texImage'],['texSubImage2D','texSub'],['generateMipmap','mips']]){const original=WebGL2RenderingContext.prototype[method];WebGL2RenderingContext.prototype[method]=function(...args){if(window.__PROFILE_FRAMES__.active)window.__PROFILE_FRAMES__[key]++;return original.apply(this,args);};}
  window.requestAnimationFrame=function(callback){return raf(function(now){const audit=window.__PROFILE_FRAMES__;if(!audit.active||callback.name!=='frame')return callback(now);const before={draws:audit.draws,texImage:audit.texImage,texSub:audit.texSub,mips:audit.mips},start=performance.now();callback(now);audit.frames.push({time:now,jsMs:performance.now()-start,...Object.fromEntries(Object.keys(before).map(key=>[key,audit[key]-before[key]]))});});};
 });
 await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.locator('[data-action=free]').click();
 const session=await page.context().newCDPSession(page);await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:1000});
 for(const quality of ['flow','auto']){
  await page.evaluate(quality=>{const w=window.__FORM__.world;w.setGraphicsQuality(quality);w.placePlayerAtStation('chest-press');w.inspectView({position:[5,6,6],target:[-5,1,-4]});},quality);await page.waitForTimeout(2000);
  await session.send('Profiler.start');await page.evaluate(()=>{window.__PROFILE_FRAMES__.frames=[];window.__PROFILE_FRAMES__.active=true;});await page.waitForTimeout(8000);await page.evaluate(()=>{window.__PROFILE_FRAMES__.active=false;});const {profile}=await session.send('Profiler.stop');
  const result=await page.evaluate(()=>{const w=window.__FORM__.world,frames=window.__PROFILE_FRAMES__.frames,percent=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)],intervals=frames.slice(1).map((frame,i)=>frame.time-frames[i].time);return{renderer:w.getPerformanceDiagnostics().renderer,quality:w.getPerformanceDiagnostics(),frames,summary:{frames:frames.length,p50:percent(intervals,.5),p95:percent(intervals,.95),p99:percent(intervals,.99),js50:percent(frames.map(frame=>frame.jsMs),.5),js95:percent(frames.map(frame=>frame.jsMs),.95),max:Math.max(...intervals),totalUploads:frames.reduce((sum,frame)=>sum+frame.texImage+frame.texSub,0),totalMips:frames.reduce((sum,frame)=>sum+frame.mips,0)}};});
  writeFileSync(`${dir}/${name}-${quality}-cpu-profile.json`,JSON.stringify(profile));writeFileSync(`${dir}/${name}-${quality}-profile.json`,JSON.stringify(result,null,2));
  const nodes=new Map(profile.nodes.map(node=>[node.id,node])),own=new Map();for(let i=0;i<(profile.samples||[]).length;i++){const id=profile.samples[i],delta=profile.timeDeltas?.[i]||1000;own.set(id,(own.get(id)||0)+delta);}
  const top=[...own].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([id,micros])=>({name:nodes.get(id).callFrame.functionName,url:nodes.get(id).callFrame.url.split('/').at(-1),line:nodes.get(id).callFrame.lineNumber+1,ms:micros/1000}));console.log(JSON.stringify({quality,...result.summary,top}));
 }
}finally{await browser.close();}
