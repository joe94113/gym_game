import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {nativeSummaryV019,scrubSummaryV019} from './verify-release-v019.mjs';

const options=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const directory=options.directory||'artifacts/release-v019/scrub',reportPath=options.report||join(directory,'playwright-native.json'),output=options.output||join(directory,'summary.json');
const sourceFiles=['src/trial-ui.js','src/activity-dom-v019.js','src/camera-panel-layout-v019.js','src/world-controller.js','src/crowd.js','src/social-crowd.js','src/skinned-character.js','src/npc-world-matrices-v019.js','tests/course-scrub-v019.spec.js','playwright.course-scrub-v019.config.js'];
const read=path=>JSON.parse(readFileSync(path,'utf8')),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),assert=(value,message)=>{if(!value)throw new Error(message);};
const startedAt=new Date().toISOString(),failures=[];let summary;
mkdirSync(directory,{recursive:true});
try{
  const reporter=read(reportPath),native=nativeSummaryV019(reporter);assert(native.tests===2,'Exactly the desktop and touch tests must have passed.');
  const tests=[];function walk(suite){for(const spec of suite.specs||[])for(const test of spec.tests||[])tests.push(test);for(const child of suite.suites||[])walk(child);}reporter.suites.forEach(walk);
  const hashes=Object.fromEntries(sourceFiles.map(path=>[path,sha(path)])),newestSourceMs=Math.max(...sourceFiles.map(path=>statSync(path).mtimeMs)),evidenceHashes={[reportPath]:sha(reportPath)},rows=[];
  for(const project of ['desktop','touch']){
    const matching=tests.filter(test=>test.projectName===project);assert(matching.length===1,`One real ${project} reporter result is required.`);
    const test=matching[0],result=test.results.at(-1),began=Date.parse(result.startTime),ended=began+result.duration;
    assert(Number.isFinite(began)&&Number.isFinite(ended)&&result.duration>0,`${project}: real test timestamps/duration missing.`);
    assert(newestSourceMs<=began+1000,`${project}: current source was modified after this test began; rerun the native test instead of restamping old evidence.`);
    const attachment=result.attachments.find(item=>item.name==='continuous-scrub'&&item.contentType==='application/json');assert(typeof attachment?.body==='string',`${project}: actual reporter JSON attachment missing.`);
    const recorded=JSON.parse(Buffer.from(attachment.body,'base64').toString('utf8')),jsonPath=join(directory,`${project}.json`),pngPath=join(directory,`${project}.png`),raw=read(jsonPath);
    assert(JSON.stringify(recorded)===JSON.stringify(raw),`${project}: raw JSON no longer matches the successful reporter attachment.`);
    assert(raw.project===project&&!raw.errors?.length&&raw.trustedInputs?.length>10&&raw.trustedInputs.every(input=>input.trusted===true),`${project}: native input/error evidence failed.`);
    const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
    assert(same(raw.muscles.actual.primary,raw.muscles.expectedPrimary)&&same(raw.muscles.actual.secondary,raw.muscles.expectedSecondary),`${project}: exact lesson muscle groups differ.`);
    assert(raw.muscles.primary==='rgb(220, 104, 85)'&&raw.muscles.secondary==='rgb(226, 162, 97)',`${project}: red/orange legend evidence differs.`);
    for(const path of [jsonPath,pngPath]){const modified=statSync(path).mtimeMs;assert(modified>=began-1500&&modified<=ended+3000,`${project}: ${path} is outside the successful test interval.`);evidenceHashes[path]=sha(path);}
    const png=readFileSync(pngPath);assert(png.length>=24&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&png.readUInt32BE(16)>100&&png.readUInt32BE(20)>100,`${project}: actual screenshot PNG missing or invalid.`);
    rows.push({project,renderer:raw.renderer,nativeTrustedInputs:raw.trustedInputs.length,allTrusted:true,observations:raw.observations,errors:raw.errors,screenshot:{path:pngPath,sha256:evidenceHashes[pngPath]},testStartedAt:result.startTime,testDurationMs:result.duration});
  }
  assert(rows[0].renderer===rows[1].renderer,'Native renderer differs between desktop and touch.');
  const hashesEnd=Object.fromEntries(sourceFiles.map(path=>[path,sha(path)]));assert(sourceFiles.every(path=>hashes[path]===hashesEnd[path]),'Sources changed during summary assembly.');
  summary={pass:true,testCount:2,renderer:rows[0].renderer,startedAt:reporter.stats.startTime,completedAt:new Date(Date.parse(reporter.stats.startTime)+reporter.stats.duration).toISOString(),assembledAt:new Date().toISOString(),hashes,sourceHashesEnd:hashesEnd,evidenceHashes,harnessHashes:{'scripts/assemble-scrub-summary-v019.mjs':sha('scripts/assemble-scrub-summary-v019.mjs')},rows,coverage:['First uninterrupted mouse/touch drag enters preview without replacing the range.','Completed-to-playing reverse drag retains track geometry until release.','Keyboard input retains range focus and the same DOM node.','Completion controls and red/orange lesson muscles match the selected segment.','Audio stops for preview and resumes with real play input.','Exit and switching to a nonclass exercise remain available.'],limits:'Native desktop Chromium and touch-emulated Chromium only; no physical iOS/Android claim. Assembled from successful per-project reporter attachments, matching current raw JSON/PNGs, and source files predating both tests. No tester identity or professional approval was invented.'};
  scrubSummaryV019(summary);
  if(existsSync(output)){const backup=join(directory,`summary-before-refresh-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);copyFileSync(output,backup);}
  writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({pass:true,output,tests:2,rows:rows.map(row=>({project:row.project,trusted:row.nativeTrustedInputs,screenshot:row.screenshot.path})),sourceFiles:sourceFiles.length},null,2));
}catch(error){
  failures.push(error.stack||String(error));const diagnostic=join(directory,`summary-refresh-incomplete-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);writeFileSync(diagnostic,JSON.stringify({pass:false,startedAt,recordedAt:new Date().toISOString(),reportPath,failures,scope:'Summary assembly failed. The existing summary and actual test reports were left unchanged.'},null,2)+'\n');console.error(JSON.stringify({pass:false,diagnostic,failures},null,2));process.exitCode=1;
}
