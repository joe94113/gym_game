import {spawnSync} from 'node:child_process';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

const root=process.cwd(),directory='artifacts/seo-v014';mkdirSync(directory,{recursive:true});
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function tree(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.name==='data'&&directory==='server'?[]:entry.isDirectory()?tree(directory+'/'+entry.name):[directory+'/'+entry.name]);}
const paths=[...['src','public','site','server'].flatMap(tree),'index.html','vite.config.js','package.json','package-lock.json','.github/workflows/pages.yml','scripts/build-pages.mjs','scripts/verify-seo-v014.mjs'];
const hashes=()=>Object.fromEntries(paths.sort().map(path=>[path,sha(path)]));
const before=hashes(),startedAt=new Date().toISOString(),runs=[];
function run(name,args,env=process.env){
  const startedAt=new Date().toISOString(),result=spawnSync(process.execPath,args,{encoding:'utf8',env,maxBuffer:64*1024*1024}),log=`${directory}/${name}.log`;
  writeFileSync(log,(result.stdout||'')+(result.stderr||''));const item={name,startedAt,completedAt:new Date().toISOString(),exitCode:result.status,pass:result.status===0,log,logSHA256:sha(log)};runs.push(item);if(!item.pass)throw Error(name+' failed; see '+log);return result.stdout;
}
let error=null,testCounts=null;
try{
  const tests=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
  const tap=run('node',['--test','--test-reporter=tap','--test-concurrency=2',...tests]);
  testCounts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,Number(tap.match(new RegExp(`^# ${key} (\\d+)\\r?$`,'m'))?.[1]??NaN)]));
  if(!testCounts.tests||testCounts.tests!==testCounts.pass||['fail','cancelled','skipped','todo'].some(key=>testCounts[key]!==0))throw Error('Node TAP was incomplete');
  run('build-default',['node_modules/vite/bin/vite.js','build'],{...process.env,VITE_SITE_URL:'',VITE_BASE_PATH:'/',VITE_ACCOUNT_MODE:'server'});
  run('build-pages',['node_modules/vite/bin/vite.js','build','--mode','pages','--outDir','.local-tools/seo-v014-pages'],{...process.env,VITE_SITE_URL:'https://test-owner.github.io/gym-game/',VITE_ACCOUNT_MODE:'local'});
}catch(e){error=e.message;}
const after=hashes(),changed=Object.keys(before).filter(path=>before[path]!==after[path]),pass=!error&&!changed.length&&runs.length===3&&runs.every(run=>run.pass);
const report={version:'0.14.0',pass,startedAt,completedAt:new Date().toISOString(),sourceHashes:before,changedSources:changed,tests:testCounts,runs,error,pagesFixture:{publicURL:'https://test-owner.github.io/gym-game/',output:'.local-tools/seo-v014-pages',actuallyDeployed:false},builds:{default:Object.fromEntries(tree('dist').map(path=>[relative(resolve('dist'),resolve(path)).replaceAll('\\','/'),sha(path)])),pages:Object.fromEntries(tree('.local-tools/seo-v014-pages').map(path=>[relative(resolve('.local-tools/seo-v014-pages'),resolve(path)).replaceAll('\\','/'),sha(path)]))}};
writeFileSync(directory+'/unit-build.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass,tests:testCounts,sourceFiles:paths.length,changedSources:changed,error}));if(!pass)process.exitCode=1;
