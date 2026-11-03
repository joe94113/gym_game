import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {hashSourcesV019,changedHashesV019} from './performance-common-v019.mjs';

const directory='artifacts/public-teaching-v020',log=`${directory}/node-tests.txt`,receipt=`${directory}/node-tests.json`;
if(!existsSync('tests/teaching-references-v020.test.mjs'))throw Error('Teaching reference tests must be present before the final suite.');
mkdirSync(directory,{recursive:true});
if(existsSync(log)||existsSync(receipt)){
 const archive=`${directory}/node-test-runs/${Date.now()}`;mkdirSync(archive,{recursive:true});
 for(const file of [log,receipt])if(existsSync(file))copyFileSync(file,`${archive}/${file.split('/').at(-1)}`);
}
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`);
const startedAt=new Date().toISOString(),sourceHashes=hashSourcesV019(),testHashes=Object.fromEntries(files.map(p=>[p,sha(p)]));
const harnessFiles=['scripts/run-node-tests-v020.mjs','scripts/performance-common-v019.mjs'],harnessHashes=Object.fromEntries(harnessFiles.map(p=>[p,sha(p)]));
const args=['--test','--test-concurrency=2','--test-reporter=tap',...files];
console.log(JSON.stringify({startedAt,testFiles:files.length,concurrency:2,log}));
const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:32*1024*1024}),completedAt=new Date().toISOString();
writeFileSync(log,(result.stdout||'')+(result.stderr||''));
const sourceHashesEnd=hashSourcesV019(),currentFiles=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`),testHashesEnd=Object.fromEntries(currentFiles.map(p=>[p,sha(p)])),harnessHashesEnd=Object.fromEntries(harnessFiles.map(p=>[p,sha(p)]));
const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,Number((result.stdout||'').match(new RegExp(`^# ${key} (\\d+)\\r?$`,'m'))?.[1]??NaN)]));
const changedSources=changedHashesV019(sourceHashes,sourceHashesEnd),changedTests=changedHashesV019(testHashes,testHashesEnd),changedHarness=changedHashesV019(harnessHashes,harnessHashesEnd);
const pass=result.status===0&&!result.error&&counts.tests>0&&counts.pass===counts.tests&&['fail','cancelled','skipped','todo'].every(key=>counts[key]===0)&&!changedSources.length&&!changedTests.length&&!changedHarness.length;
const report={pass,gpu:false,startedAt,completedAt,executable:process.execPath,args,command:`node ${args.join(' ')}`,concurrency:2,files,exitCode:result.status,signal:result.signal,error:result.error?.stack||null,counts,log,sourceHashMethod:'hashSourcesV019',sourceHashes,sourceHashesEnd,changedSources,testHashes,testHashesEnd,changedTests,harnessHashes,harnessHashesEnd,changedHarness,scope:'Complete sorted tests/*.test.mjs Node suite with test-file concurrency 2. Production browser sources/assets, exact test files and runner are fingerprinted before and after. No browser/GPU benchmark is started; mutable private server/account storage is outside hashSourcesV019.'};
writeFileSync(receipt,JSON.stringify(report,null,2));console.log(JSON.stringify({pass,counts,exitCode:result.status,changedSources,changedTests,changedHarness,receipt}));if(!pass)process.exitCode=1;
