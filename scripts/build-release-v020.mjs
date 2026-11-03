import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {hashSourcesV019,changedHashesV019} from './performance-common-v019.mjs';

const directory='artifacts/public-teaching-v020';mkdirSync(directory,{recursive:true});
const startedAt=new Date().toISOString(),sourceHashes=hashSourcesV019(),builds=[];
for(const build of [
  {name:'production',args:['node_modules/vite/bin/vite.js','build'],env:{}},
  {name:'pages',args:['scripts/build-pages.mjs','--outDir','.local-tools/v020-pages'],env:{VITE_SITE_URL:'https://joe94113.github.io/gym_game/'}},
  {name:'mobile-static-preview',args:['node_modules/vite/bin/vite.js','build','--mode','pages','--outDir','.local-tools/mobile-v016-preview'],env:{VITE_SITE_URL:'',VITE_BASE_PATH:'/',VITE_ACCOUNT_MODE:'local'}},
]){
  const result=spawnSync(process.execPath,build.args,{env:{...process.env,...build.env},encoding:'utf8'});
  const log=`${directory}/build-${build.name}.txt`;writeFileSync(log,(result.stdout||'')+(result.stderr||''));
  builds.push({name:build.name,command:`node ${build.args.join(' ')}`,exitCode:result.status,log,environment:build.env});
  console.log(JSON.stringify(builds.at(-1)));if(result.status!==0)break;
}
const sourceHashesEnd=hashSourcesV019(),changedSources=changedHashesV019(sourceHashes,sourceHashesEnd);
const pass=builds.length===3&&builds.every(build=>build.exitCode===0)&&!changedSources.length;
writeFileSync(`${directory}/builds.json`,JSON.stringify({pass,startedAt,completedAt:new Date().toISOString(),builds,sourceHashes,sourceHashesEnd,changedSources},null,2));
if(!pass)process.exitCode=1;
