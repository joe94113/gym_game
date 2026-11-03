import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRenderQuality} from '../src/render-quality.js';
import {createRenderQuality as previousQuality} from '../.local-tools/v016-before/src/render-quality.js';
import assert from 'node:assert/strict';
const directory='artifacts/mobile-v016/render-quality';mkdirSync(directory,{recursive:true});
const paths=['src/render-quality.js','src/device-profile-v016.js','tests/device-profile-v016.test.mjs','tests/render-quality.test.mjs','tests/adaptive-quality-v015.test.mjs','scripts/qualify-mobile-render-quality-v016.mjs'],sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),sourceHashes=Object.fromEntries(paths.map(path=>[path,sha(path)]));
const desktopCases=[];
function fixture(factory,dpr,software){let ratio=1;const calls=[],renderer={getContext:()=>({getExtension:()=>null,getParameter:()=>software?'SwiftShader':'Native desktop GPU'}),shadowMap:{},info:{render:{calls:300,triangles:450000}},setPixelRatio:value=>{ratio=value;calls.push(['ratio',value]);},getPixelRatio:()=>ratio,setSize:(...args)=>calls.push(['size',...args])},environment={innerWidth:1280,innerHeight:800,devicePixelRatio:dpr,navigator:{maxTouchPoints:10},matchMedia:query=>({matches:query==='(pointer: fine)'||query==='(hover: hover)'}),localStorage:{getItem:()=>null,setItem:(...args)=>calls.push(['stored',...args])}};return{quality:factory({renderer,environment}),renderer,environment,calls};}
let error=null;
try{
 for(const dpr of [1,1.5,3])for(const software of [false,true]){
  const a=fixture(previousQuality,dpr,software),b=fixture(createRenderQuality,dpr,software);let samples=0;
  for(const preference of ['auto','flow','clear','clear','auto']){
   a.quality.setPreference(preference);b.quality.setPreference(preference);
   for(let i=0;i<240;i++){
    const ms=i<100?16:[20,25,40,55][i%4];for(const h of [a,b]){h.renderer.shadowMap.needsUpdate=false;h.quality.recordFrame(ms);h.quality.observe(4,7);h.quality.beforeRender(samples/60,i%3===0);}
    const aa=a.quality.diagnostics(),bb=b.quality.diagnostics();for(const key of Object.keys(aa))assert.deepEqual(bb[key],aa[key],'desktop '+preference+' '+key);assert.deepEqual(b.renderer.shadowMap,a.renderer.shadowMap);samples++;
   }
   for(const h of [a,b]){h.environment.innerWidth+=10;h.quality.resize();}assert.deepEqual(b.calls,a.calls,'renderer commands');
  }
  desktopCases.push({dpr,software,samples,pass:true});
 }
}catch(e){error=e.stack||e.message;}
const result=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/device-profile-v016.test.mjs','tests/render-quality.test.mjs','tests/adaptive-quality-v015.test.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024});
writeFileSync(directory+'/unit.tap',(result.stdout||'')+(result.stderr||''));const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,Number(result.stdout?.match(new RegExp(`^# ${key} (\\d+)\\r?$`,'m'))?.[1]??NaN)])),changedSources=paths.filter(path=>sha(path)!==sourceHashes[path]);
const pass=!error&&result.status===0&&counts.tests===21&&counts.pass===21&&!changedSources.length;
const report={pass,recordedAt:new Date().toISOString(),sourceHashes,baselineSourceHashes:{'src/render-quality.js':sha('.local-tools/v016-before/src/render-quality.js')},changedSources,tests:counts,desktopCases,desktopComparedFrames:desktopCases.reduce((n,row)=>n+row.samples,0),tap:{path:directory+'/unit.tap',sha256:sha(directory+'/unit.tap')},error,scope:'Pure mobile budget/capability tests and 7200 controlled desktop frames compared to the actual v0.15 module. No GPU browser, mobile hardware, FPS or battery measurement.'};
writeFileSync(directory+'/qualification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass,tests:counts,desktopComparedFrames:report.desktopComparedFrames,error}));if(!pass)process.exitCode=1;
