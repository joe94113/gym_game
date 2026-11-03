import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {preparationSourceHashes,preparationValidatorHashes} from './preparation-sources-v013.mjs';

const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),extra=['tests/preparation-v013.test.mjs','scripts/qualify-preparation-unit-v013.mjs'],hashes=()=>({...preparationSourceHashes(),...preparationValidatorHashes(),...Object.fromEntries(extra.map(path=>[path,hash(path)]))}),sourceHashes=hashes();
const run=spawnSync(process.execPath,['--test','--test-reporter=tap','tests/preparation-v013.test.mjs'],{encoding:'utf8',maxBuffer:8*1024*1024}),tap=run.stdout||'',finalHashes=hashes(),changedSources=Object.keys(sourceHashes).filter(path=>sourceHashes[path]!==finalHashes[path]),pass=run.status===0&&!run.error&&/^# tests 8\r?$/m.test(tap)&&/^# pass 8\r?$/m.test(tap)&&/^# fail 0\r?$/m.test(tap)&&!changedSources.length;
mkdirSync('artifacts/preparation-v013',{recursive:true});writeFileSync('artifacts/preparation-v013/unit.tap',tap);
const report={pass,command:'node --test --test-reporter=tap tests/preparation-v013.test.mjs',tests:8,sourceHashes,changedSources,tap:{path:'artifacts/preparation-v013/unit.tap',sha256:hash('artifacts/preparation-v013/unit.tap')},exitCode:run.status,error:run.error?.message||null,stderr:run.stderr||'',scope:'Eight production-GLB preparation regression tests; source and validator hashes taken before and after the actual Node child process.'};
writeFileSync('artifacts/preparation-v013/unit-receipt.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass,tests:8,changedSources,exitCode:run.status}));if(!pass)process.exitCode=1;
