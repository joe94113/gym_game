import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const files={unitBuild:'artifacts/seo-v014/unit-build.json',pagesBrowser:'artifacts/seo-v014/pages-browser/qualification.json',defaultJournal:'artifacts/seo-v014/default-journal-native.json',selfhostHTTP:'artifacts/seo-v014/selfhost-http.json',icons:'artifacts/seo-v014/icon-review/refined-visual-review.json'};
const evidence={},failures=[];
function current(hashes,prefix=''){assert.ok(hashes&&Object.keys(hashes).length,'source map missing');for(const [path,value]of Object.entries(hashes))assert.equal(sha(prefix+path),value,'changed '+prefix+path);}
for(const [name,file]of Object.entries(files)){
 try{
  assert.ok(existsSync(file),'missing '+file);const proof=read(file);
  if(name==='unitBuild'){
   assert.equal(proof.pass,true);assert.deepEqual(proof.changedSources,[]);current(proof.sourceHashes);assert.equal(proof.tests.tests,167);assert.equal(proof.tests.pass,167);
   for(const key of ['fail','skipped','cancelled','todo'])assert.equal(proof.tests[key],0);
   assert.equal(proof.runs.length,3);for(const run of proof.runs){assert.equal(run.pass,true);assert.equal(run.exitCode,0);assert.equal(sha(run.log),run.logSHA256);}
   current(proof.builds.default,'dist/');current(proof.builds.pages,'.local-tools/seo-v014-pages/');
   evidence[name]={pass:true,file,sha256:sha(file),tests:167,builds:2,sourceFiles:Object.keys(proof.sourceHashes).length};
  }else if(name==='pagesBrowser'){
   assert.equal(proof.pass,true);assert.equal(proof.status,'passed');assert.equal(proof.steps.length,9);assert.ok(proof.steps.every(step=>step.pass));
   for(const key of ['changedSources','changedBuildFiles','failures','apiRequests','pageErrors','consoleErrors'])assert.deepEqual(proof[key],[],key);
   current(proof.sourceHashes);current(proof.buildHashes,'.local-tools/seo-v014-pages/');assert.equal(sha(proof.sourceReceipt.path),proof.sourceReceipt.sha256);
   assert.ok(!/swiftshader|llvmpipe|software/i.test(proof.browser.actualRenderer.renderer));
   for(const image of proof.screenshots)assert.equal(sha(image.path),image.sha256);
   evidence[name]={pass:true,file,sha256:sha(file),steps:9,renderer:proof.browser.actualRenderer,scope:proof.scope,images:proof.screenshots};
  }else if(name==='defaultJournal'){
   assert.equal(proof.stats.expected,2);for(const key of ['unexpected','flaky','skipped'])assert.equal(proof.stats[key],0);
   const sourceFile='artifacts/seo-v014/default-journal-source.json',source=read(sourceFile);assert.equal(source.pass,true);assert.equal(source.exitCode,0);assert.deepEqual(source.changedSources,[]);current(source.sourceHashes);assert.equal(source.reportSHA256,sha(file));assert.equal(source.command.rendererEnvironment,'native');
   evidence[name]={pass:true,file,sha256:sha(file),tests:2,startTime:proof.stats.startTime,scope:'Existing manual-journal and two-browser self-hosted account/sync regression on native WebGL.'};
  }else if(name==='selfhostHTTP'){
   assert.equal(proof.pass,true);assert.equal(proof.serverSHA256,sha('server/start.mjs'));assert.equal(proof.checks.length,8);
   evidence[name]={pass:true,file,sha256:sha(file),requests:8,scope:proof.scope};
  }else{
   assert.equal(proof.pass,true);current(proof.sourceHashes);current(proof.dependencies);current(proof.imageHashes);
   evidence[name]={pass:true,file,sha256:sha(file),examined:proof.examined,findings:proof.findings,scope:'AI image inspection of small favicon, simulated installation masks and sharing card; no actual-device installation claim.'};
  }
 }catch(error){failures.push({name,error:error.message});evidence[name]={pass:false,file,error:error.message};}
}
const previous='artifacts/verification-summary-v0.13.json',prior=read(previous),preserved=['public/models/athlete/athlete.glb','public/models/athlete/rig.json','public/brand-mark.svg','public/icon-192.png','public/icon-512.png'];
for(const path of preserved)if(sha(path)!==prior.sourceHashes[path])failures.push({name:'preservation',error:path+' differs'});
const summary={version:'0.14.0',date:new Date().toISOString(),pass:failures.length===0,status:failures.length?'failed':'passed',scope:'SEO, static GitHub Pages deployment preparation, project-path asset loading, local journal and targeted default-account regression. No public deployment or new performance measurement.',sourceHashes:read(files.unitBuild).sourceHashes,evidence,preserved,failures,historicalExerciseQualification:{file:previous,sha256:sha(previous),full53CaseBrowserSuiteReexecutedForV014:false},limits:{publicWebsite:'No repository/domain/public deployment or Search Console verification has been performed. test-owner.github.io/gym-game is a local-build fixture.',seo:'Titles, readable content, metadata, schema and sitemap do not guarantee indexing, ranking or rich results.',accounts:'GitHub Pages build uses browser-local data and JSON transfer; live automatic account sync needs a separate backend.',robots:'Project-path robots.txt does not control the hostname root robots policy.',motion:'Existing authored motion and bounded cloth limitations remain; human trainer signoff is still deferred by the user.',performance:'v0.13 timing remains historical; no v0.14 FPS improvement is claimed.'}};
writeFileSync('artifacts/verification-summary-v0.14.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({pass:summary.pass,status:summary.status,failures}));if(!summary.pass)process.exitCode=1;
