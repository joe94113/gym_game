import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashPerformanceSources} from './performance-source-v013.mjs';
const directory='artifacts/performance-v015/auto',baseline='.local-tools/v015-before/';mkdirSync(directory+'/play',{recursive:true});
const sourceHashes=hashPerformanceSources(),baselineSourceHashes=hashPerformanceSources(baseline),startedAt=new Date().toISOString(),runs=[];
let error=null;
try{
 for(const name of ['before-1','after-1','after-2','before-2']){
  console.log(JSON.stringify({starting:name,time:new Date().toISOString()}));
  const args=['scripts/benchmark-play-v013.mjs',name,`--root=${name.startsWith('before')?baseline:''}`,`--base-url=http://127.0.0.1:${name.startsWith('before')?5174:5173}`,`--output=${directory}/play`,'--profiles=auto','--scenarios=walking,equipment','--seconds=12','--warmup=3'];
  const runStart=new Date().toISOString(),result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:32*1024*1024}),log=directory+'/play/'+name+'.log';
  writeFileSync(log,(result.stdout||'')+(result.stderr||''));const report=JSON.parse(readFileSync(directory+'/play/'+name+'-off.json','utf8'));
  const run={name,startedAt:runStart,completedAt:new Date().toISOString(),exitCode:result.status,pass:result.status===0&&report.pass,log};runs.push(run);
  console.log(JSON.stringify({...run,rows:report.results.map(row=>({profile:row.profile,scenario:row.scenario,meanMs:row.cadence.meanMs,p95Ms:row.cadence.p95Ms,over50Percent:row.cadence.over50Percent}))}));
  if(!run.pass)throw Error('Formal timing failed '+name);
 }
 const result=spawnSync(process.execPath,['scripts/compare-auto-v015.mjs',`--output=${directory}`],{encoding:'utf8',maxBuffer:16*1024*1024});writeFileSync(directory+'/comparison.log',(result.stdout||'')+(result.stderr||''));if(result.status!==0)throw Error('Formal comparison failed; see comparison.log');
}catch(e){error=e.message;}
const after=hashPerformanceSources(),oldAfter=hashPerformanceSources(baseline),changedSources=Object.keys(sourceHashes).filter(path=>after[path]!==sourceHashes[path]),changedBaselineSources=Object.keys(baselineSourceHashes).filter(path=>oldAfter[path]!==baselineSourceHashes[path]);
const pass=!error&&!changedSources.length&&!changedBaselineSources.length&&runs.length===4&&runs.every(run=>run.pass),report={pass,startedAt,completedAt:new Date().toISOString(),sourceHashes,baselineSourceHashes,changedSources,changedBaselineSources,runs,error,conditions:'One project GPU workflow; agents and other project tests are idle during formal timing. Same auto preference, geometry and pose rate; actual resolution/shadows may adapt and are reported. Native Intel UHD630, 1280x800 DPR1. ABBA order, two scenarios;3s warmup and12s actual key input/game RAF. CPU profiles, GL wrappers and portable capture are off.'};
writeFileSync(directory+'/measurement-session.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass,error,runs:runs.length,changedSources,changedBaselineSources}));if(!pass)process.exitCode=1;
