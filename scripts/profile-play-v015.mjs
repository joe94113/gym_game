// CDP CPU sampling diagnosis. Profiler overhead means this is not formal FPS.
import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
import {viteClientShim} from '../tests/vite-client-shim.js';
import {hashPerformanceSources} from './performance-source-v013.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [label='before',base='http://127.0.0.1:5174',quality='clear',scenario='walk',duration='8']=process.argv.slice(2),seconds=Number(duration);
if(!['flow','clear'].includes(quality)||!['walk','equipment','aerial'].includes(scenario)||!(seconds>0&&seconds<=60)||!/^[\w-]+$/.test(label))throw Error('Invalid profile arguments');
const baseline=label.startsWith('before'),root=baseline?'.local-tools/v015-before':'.',sourceHashes=hashPerformanceSources(root),directory='artifacts/performance-v015/profile';mkdirSync(directory,{recursive:true});
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),validatorSourceHashes=Object.fromEntries(['scripts/profile-play-v015.mjs','playwright.config.js','tests/vite-client-shim.js'].map(path=>[path,sha(path)]));
const browser=await chromium.launch({...config.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[],headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.goto(base);await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.locator('[data-action=free]').click();
 await page.evaluate(({quality,scenario})=>{const f=window.__FORM__,w=f.world;w.setGraphicsQuality(quality);if(scenario==='walk'){w.placePlayerAtStation('chest-press');w.inspectView({position:[5,6,6],target:[-5,1,-4]});}else{f.openExercise(scenario==='aerial'?'class-aerial':'dumbbell-bench-press');w.advanceUntilReady(180,false);if(scenario==='aerial')w.setDemoPhase(.172);w.update(0);}}, {quality,scenario});
 await page.waitForTimeout(2000);
 const setup=await page.evaluate(()=>({quality:window.__FORM__.world.getPerformanceDiagnostics(),position:window.__FORM__.world.getPlayerPosition(),activity:window.__FORM__.world.getActivityState()}));
 const session=await context.newCDPSession(page);await session.send('Performance.enable');await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{interval:1000});
 const beforeMetrics=await session.send('Performance.getMetrics'),startedAt=new Date().toISOString();await session.send('Profiler.start');
 if(scenario==='walk'){for(const key of ['w','s','w','s']){await page.keyboard.down(key);await page.waitForTimeout(seconds*250);await page.keyboard.up(key);}}else await page.waitForTimeout(seconds*1000);
 const {profile}=await session.send('Profiler.stop'),afterMetrics=await session.send('Performance.getMetrics'),completedAt=new Date().toISOString();
 const nodes=new Map(profile.nodes.map(node=>[node.id,node])),parent=new Map();for(const node of profile.nodes)for(const child of node.children||[])parent.set(child,node.id);
 const own=new Map(),inclusive=new Map();for(let i=0;i<(profile.samples||[]).length;i++){const id=profile.samples[i],delta=profile.timeDeltas?.[i]||1000;own.set(id,(own.get(id)||0)+delta);for(let ancestor=id;ancestor;ancestor=parent.get(ancestor))inclusive.set(ancestor,(inclusive.get(ancestor)||0)+delta);}
 const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([id,micros])=>({id,name:nodes.get(id).callFrame.functionName,url:nodes.get(id).callFrame.url,line:nodes.get(id).callFrame.lineNumber+1,ms:micros/1000}));
 const metrics=new Map(beforeMetrics.metrics.map(metric=>[metric.name,metric.value])),metricChanges=Object.fromEntries(afterMetrics.metrics.filter(metric=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','JSHeapUsedSize','Nodes'].includes(metric.name)).map(metric=>[metric.name,{before:metrics.get(metric.name),after:metric.value,delta:metric.value-(metrics.get(metric.name)||0)}]));
 const after=hashPerformanceSources(root),changedSources=Object.keys(sourceHashes).filter(path=>sourceHashes[path]!==after[path]),changedValidators=Object.keys(validatorSourceHashes).filter(path=>sha(path)!==validatorSourceHashes[path]);
 const prefix=`${directory}/${label}-${quality}-${scenario}`,profileFile=prefix+'-cpu.json';writeFileSync(profileFile,JSON.stringify(profile));
 const report={pass:!errors.length&&!changedSources.length&&!changedValidators.length,label,base,quality,scenario,seconds,startedAt,completedAt,sourceHashes,validatorSourceHashes,changedSources,changedValidators,setup,errors,profileFile,profileSHA256:sha(profileFile),profileDurationMs:(profile.endTime-profile.startTime)/1000,samples:profile.samples?.length||0,topOwn:top(own),topInclusive:top(inclusive),metricChanges,limits:'CDP sampling changes CPU load. This diagnosis is not an uninstrumented RAF cadence, GPU timing, displayed FPS or performance comparison.'};
 writeFileSync(prefix+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({file:prefix+'.json',pass:report.pass,samples:report.samples,topOwn:report.topOwn.slice(0,12),topInclusive:report.topInclusive.slice(0,12),metricChanges}));
 await context.close();
}finally{await browser.close();}
