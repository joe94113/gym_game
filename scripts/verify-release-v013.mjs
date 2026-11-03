import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readdirSync,existsSync,copyFileSync} from 'node:fs';
import {hashPerformanceSources} from './performance-source-v013.mjs';

// Run after runtime/asset freeze. The receipt records real child exits and
// detects source drift across tests/build; it never edits prior release files.
const folder='artifacts/release-v013';mkdirSync(folder,{recursive:true});
if(existsSync(`${folder}/unit-build.json`)){
 const archive=`${folder}/runs/${Date.now()}`;mkdirSync(archive,{recursive:true});
 for(const name of ['unit.tap','unit.stderr','build.log','build.json','source-freeze.json','unit-build.json'])if(existsSync(`${folder}/${name}`))copyFileSync(`${folder}/${name}`,`${archive}/${name}`);
}
const sourceHashes=hashPerformanceSources(),tests=readdirSync('tests').filter(file=>file.endsWith('.test.mjs')).sort().map(file=>`tests/${file}`);
const unit=spawnSync(process.execPath,['--test','--test-concurrency=2','--test-reporter=tap',...tests],{encoding:'utf8',maxBuffer:24*1024*1024});writeFileSync(`${folder}/unit.tap`,unit.stdout||'');writeFileSync(`${folder}/unit.stderr`,unit.stderr||'');
const build=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','npm.cmd run build'],{encoding:'utf8',maxBuffer:12*1024*1024}):spawnSync('npm',['run','build'],{encoding:'utf8',maxBuffer:12*1024*1024});writeFileSync(`${folder}/build.log`,(build.stdout||'')+(build.stderr||''));
const end=hashPerformanceSources(),changedSources=Object.keys(sourceHashes).filter(file=>sourceHashes[file]!==end[file]);
const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name=>[name,Number((unit.stdout||'').match(new RegExp(`^# ${name} (\\d+)\\r?$`,'m'))?.[1]??NaN)]));
const unitPass=unit.status===0&&!unit.error&&counts.tests>0&&counts.pass===counts.tests&&['fail','cancelled','skipped','todo'].every(name=>counts[name]===0),buildPass=build.status===0&&!build.error&&!changedSources.length;
writeFileSync(`${folder}/build.json`,JSON.stringify({pass:buildPass,command:process.platform==='win32'?'npm.cmd run build':'npm run build',exitCode:build.status,error:build.error?.message||null,sourceHashes,changedSources,scope:'Actual production Vite build child process, with source fingerprints before all unit tests and after build.'},null,2));
writeFileSync(`${folder}/source-freeze.json`,JSON.stringify({version:'0.13.0',pass:unitPass&&buildPass,sourceHashes,changedSources,scope:'Shipped source/assets at the start of the complete Node suite and production build. Mutable private account storage is excluded.'},null,2));
const report={pass:unitPass&&buildPass,unit:{passed:unitPass,files:tests,exitCode:unit.status,error:unit.error?.message||null,...counts},build:{pass:buildPass,exitCode:build.status},changedSources};writeFileSync(`${folder}/unit-build.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
