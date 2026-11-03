import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,basename} from 'node:path';
import {hashSourcesV019,changedHashesV019} from './performance-common-v019.mjs';

const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const url='https://joe94113.github.io/gym_game/',sourceHashes=hashSourcesV019(),startedAt=new Date().toISOString();
const sha=data=>createHash('sha256').update(data).digest('hex'),headers={'User-Agent':'MuscleBase-release/0.20','Cache-Control':'no-cache'};
let workflow=null,http=null,pass=false,error=null;
for(let attempt=0;attempt<40;attempt++){
  const response=await fetch('https://api.github.com/repos/joe94113/gym_game/actions/runs?per_page=5',{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Workflow API ${response.status}`);
  const data=await response.json(),run=data.workflow_runs.find(item=>item.head_sha===commit);
  if(run){
    workflow={id:run.id,headSHA:run.head_sha,status:run.status,conclusion:run.conclusion,url:run.html_url};console.log(JSON.stringify(workflow));
    if(run.status==='completed'&&run.conclusion!=='success'){error=`Pages workflow ${run.conclusion}`;break;}
    if(run.status==='completed'&&run.conclusion==='success'){
      const home=await fetch(url,{headers,signal:AbortSignal.timeout(30000)}),html=await home.text();
      const entry=html.match(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/i)?.[1];
      if(home.ok&&entry){
        const scriptURL=new URL(entry,url).href,script=await fetch(scriptURL,{headers,signal:AbortSignal.timeout(30000)}),body=Buffer.from(await script.arrayBuffer());
        const local=readFileSync(resolve('.local-tools/v020-pages/assets',basename(new URL(scriptURL).pathname))),text=body.toString('utf8');
        const markers={version:text.includes('0.20.0'),publicTeaching:text.includes('公開教學對照'),dated:text.includes('2026-11-03'),corrected:text.includes('corrected-checked'),sameCompiledBytes:sha(body)===sha(local)};
        http={url,status:home.status,homeSHA256:sha(html),scriptURL,scriptStatus:script.status,scriptSHA256:sha(body),localScriptSHA256:sha(local),markers};
        if(script.ok&&Object.values(markers).every(Boolean)){pass=true;break;}
      }
    }
  }else console.log(JSON.stringify({waitingForCommit:commit}));
  await new Promise(done=>setTimeout(done,15000));
}
const sourceHashesEnd=hashSourcesV019(),changedSources=changedHashesV019(sourceHashes,sourceHashesEnd);pass&&=!changedSources.length;
mkdirSync('artifacts/public-teaching-v020',{recursive:true});
writeFileSync('artifacts/public-teaching-v020/deployment.json',JSON.stringify({pass,commit,url,workflow,http,startedAt,completedAt:new Date().toISOString(),sourceHashes,sourceHashesEnd,changedSources,error,scope:'Successful Pages workflow for current HEAD and byte equality with the tested local Pages bundle. Browser use and source attribution are checked separately.'},null,2));
if(!pass)process.exitCode=1;
