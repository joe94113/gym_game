import test from 'node:test';
import assert from 'node:assert/strict';
import {hashEntriesV019,nodeLogSummaryV019,nativeSummaryV019,publicHTTPSummaryV019,publicPlaySummaryV019,deploymentSummaryV019,verifySummaryOutputV019,backgroundCPUSummaryV019,backgroundPixelSummaryV019,scrubSummaryV019,matrixCacheSummaryV019,coalescingSummaryV019} from '../scripts/verify-release-v019.mjs';

const digest='a'.repeat(64),commit='b'.repeat(40),base='https://joe94113.github.io/gym_game/';
test('release verifier resolves grouped version hashes without treating before/after as files',()=>{
  const entries=hashEntriesV019({before:{'src/world-controller.js':digest},after:{'src/world-controller.js':digest}},{beforeRoot:'.local-tools/v019-before',afterRoot:''});
  assert.deepEqual(entries.map(entry=>[entry.path,entry.root]),[['src/world-controller.js','.local-tools/v019-before'],['src/world-controller.js','']]);assert.equal(entries.some(entry=>entry.path==='before'||entry.path==='after'),false);
  assert.equal(hashEntriesV019({'src/a.js':digest},{flatRoot:'.local-tools/custom'})[0].root,'.local-tools/custom');assert.throws(()=>hashEntriesV019({unexpected:{'src/a.js':digest}}),/unsupported nested hash schema/);
});
test('release verifier parses real Node summaries and rejects missing, skipped and failing results',()=>{
  const valid='✔ a test\nℹ tests 300\nℹ pass 300\nℹ fail 0\nℹ skipped 0\n';assert.equal(nodeLogSummaryV019(valid).tests,300);assert.throws(()=>nodeLogSummaryV019(valid.replace('skipped 0','skipped 1')));assert.throws(()=>nodeLogSummaryV019(valid.replace('pass 300','pass 299')));assert.throws(()=>nodeLogSummaryV019('still running\n'));
});
test('release verifier checks native per-test results instead of accepting only a stats label',()=>{
  const report={config:{filteredProjects:[{use:{launchOptions:{args:['--use-angle=d3d11']}}}]},stats:{expected:1,unexpected:0,skipped:0,flaky:0,duration:10},errors:[],suites:[{specs:[{tests:[{status:'expected',results:[{status:'passed',errors:[],attachments:[]}]}]}]}]};assert.equal(nativeSummaryV019(report).tests,1);report.suites[0].specs[0].tests[0].results[0].status='failed';assert.throws(()=>nativeSummaryV019(report),/per-test results/);report.suites[0].specs[0].tests[0].results[0].status='passed';report.config.filteredProjects[0].use.launchOptions.args=['--use-angle=swiftshader'];assert.throws(()=>nativeSummaryV019(report),/software renderer/);
});
test('release verifier recalculates public HTTP evidence counts and rejects an asset-check failure',()=>{
  const report={passed:true,base,expectedVersion:'0.19.0',errors:[],checks:[...['Delivered release version matches','Delivered release includes catch-up and NPC matrix fixes','Delivered release includes physical trainer actors'].map(name=>({name,pass:true})),...Array.from({length:778},()=>({pass:true}))],responses:Array.from({length:229},(_,index)=>index?{status:200}:{method:'GET',url:base,status:200,sha256:digest}),counts:{checks:781,responses:229,failed:0,staticPages:9,exerciseLinks:65},deepLinks:Array.from({length:65},(_,index)=>({id:`exercise-${index}`}))};assert.equal(publicHTTPSummaryV019(report).checks,781);report.checks[100].pass=false;assert.throws(()=>publicHTTPSummaryV019(report),/failed checks/);report.checks[100].pass=true;delete report.expectedVersion;assert.throws(()=>publicHTTPSummaryV019(report),/actual delivered 0.19.0/);
});
function playDevice(name){return{name,passed:true,emulation:{isMobile:name==='phone',hasTouch:name==='phone',deviceScaleFactor:name==='phone'?3:1},checks:[{label:'Production has no development bridge',pass:true},{label:'Journal survives an ordinary page reload',pass:true},...Array.from({length:20},(_,index)=>({label:`check ${index}`,pass:true}))],pageErrors:[],consoleErrors:[],failedRequests:[],badResponses:[],accountAPIRequests:[],activityFlows:[{kind:'normal-RAF-loop',samples:Array.from({length:8},()=>({phase:.2}))},{kind:'natural-put-back-and-exit'}],screenshots:[]};}
test('release verifier requires both normal-play devices and separate extended-class evidence',()=>{
  const report={passed:true,base,devices:[playDevice('desktop'),playDevice('phone')]};assert.equal(publicPlaySummaryV019(report).checks,44);assert.throws(()=>publicPlaySummaryV019({...report,devices:[report.devices[0]]}),/desktop and phone/);assert.throws(()=>publicPlaySummaryV019(report,{extended:true}),/class scope missing/);report.devices[0].accountAPIRequests.push({url:base+'api/form/v1'});assert.throws(()=>publicPlaySummaryV019(report),/accountAPIRequests/);
});
test('release verifier requires the actual current deployed commit and successful matching workflow',()=>{
  const receipt={pass:true,url:base,commit,http:{url:base,status:200},workflow:{id:123,headSHA:commit,status:'completed',conclusion:'success',url:'https://github.com/joe94113/gym_game/actions/runs/123'}};assert.equal(deploymentSummaryV019(receipt,{head:commit}).commit,commit);assert.throws(()=>deploymentSummaryV019(receipt,{head:'c'.repeat(40)}),/current git HEAD/);receipt.workflow.conclusion='failure';assert.throws(()=>deploymentSummaryV019(receipt,{head:commit}),/Successful Pages workflow/);
});
test('release verifier cannot overwrite either canonical summary with a local or failing result',()=>{
  for(const path of ['artifacts/verification-summary-v0.19.json','artifacts/verification-summary.json'])assert.throws(()=>verifySummaryOutputV019(path,false),/cannot overwrite/);assert.equal(verifySummaryOutputV019('artifacts/release-v019/diagnostic.json',false),'artifacts/release-v019/diagnostic.json');assert.equal(verifySummaryOutputV019('artifacts/verification-summary-v0.19.json',true),'artifacts/verification-summary-v0.19.json');
});
test('release verifier keeps CPU material proof separate from exact mobile pixel proof',()=>{
  const cpu={cpuPass:true,tests:{material:5,trainerRegression:8,total:13,failed:0},scope:'CPU-only material test',verified:['real GLB geometry unchanged'],baselineShaderSource:{path:'.local-tools/v019-before/src/skinned-character.js',sha256:digest}};
  assert.equal(backgroundCPUSummaryV019(cpu).proofKind,'cpu-only');assert.throws(()=>backgroundPixelSummaryV019(cpu),/pixel proof is incomplete/);
  const pixel={pass:true,phone:true,control:false,errors:[],cases:['reception','free-weights','cardio'].map(name=>({name,pass:true,bodyUnchanged:true,maxDifference:0,changedPixels:0,full:{sha256:digest},background:{sha256:digest}}))};assert.equal(backgroundPixelSummaryV019(pixel).cases.length,3);pixel.cases[0].maxDifference=28;assert.throws(()=>backgroundPixelSummaryV019(pixel),/not exact/);
});
test('release verifier requires native desktop/touch input and retained scrub DOM',()=>{
  const report={pass:true,testCount:2,rows:['desktop','touch'].map(project=>({project,allTrusted:true,nativeTrustedInputs:90,errors:[],observations:[{connected:true,same:true,previewed:true,paused:true}]}))};assert.equal(scrubSummaryV019(report).tests,2);report.rows[0].observations[0].same=false;assert.throws(()=>scrubSummaryV019(report),/proof failed/);
});
test('release verifier keeps matrix-cache equivalence CPU-only and retains its distinct frozen baseline',()=>{
  const report={gpu:false,poseSamples:211,surfaceVertices:199183,renderLikePasses:878,maxDifference:0,baseline:'.local-tools/v019-before-matrix',sourceHashes:{'src/npc-world-matrices-v019.js':digest},cases:[{pass:true},{pass:true},{pass:true},{pass:true}]};assert.equal(matrixCacheSummaryV019(report).proofKind,'actual-GLB-CPU-only');
  const entries=hashEntriesV019({before:{'src/skinned-character.js':digest},after:{'src/skinned-character.js':digest}},{beforeRoot:report.baseline});assert.equal(entries[0].root,'.local-tools/v019-before-matrix');report.maxDifference=.001;assert.throws(()=>matrixCacheSummaryV019(report),/differs from the baseline/);
});
test('release verifier separates pose-coalescing CPU coverage from native hitch acceptance',()=>{
  const report={pass:true,gpu:false,baseline:'.local-tools/v019-before-coalescing',frames:234,actorComparisons:3645,skinVertices:98362,cases:[{name:'default-exact-before-coalescing',pass:true},{name:'gym-clock-gear-contact-and-handoff',pass:true,stages:['exercise','return','release','stand','walk','idle'],current:{pendingPoses:0}},{name:'social-original-new-course-and-tablet',pass:true,current:{pendingPoses:0}}]};assert.equal(coalescingSummaryV019(report).proofKind,'actual-GLB-CPU-only');report.cases[1].current.pendingPoses=1;assert.throws(()=>coalescingSummaryV019(report),/flush proof/);
});
