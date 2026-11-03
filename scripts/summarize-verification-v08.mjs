import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const browser=read('artifacts/playwright-v08.json'),tap=readFileSync('artifacts/unit-v08.tap','utf8');
if(browser.stats.expected!==30||browser.stats.unexpected||browser.stats.skipped||browser.stats.flaky)throw new Error('Final full browser suite is not 30 passing tests');
if(!/^# tests 29\r?$/m.test(tap)||!/^# pass 29\r?$/m.test(tap)||!/^# fail 0\r?$/m.test(tap))throw new Error('Final Node suite is not 29 passing tests');
const proofs={
 dumbbell:'artifacts/dumbbell-ergonomics-qualification.json',dumbbellSourceBridge:'artifacts/v08-db-interface-bridge.json',
 squat:'artifacts/squat-rack-dense-qualification.json',squatSourceBridge:'artifacts/squat-metadata-equivalence.json',
 running:'artifacts/performance/running-qualification.json',crowd:'artifacts/performance/crowd-throttling-qualification.json',
 otherRigLoops:'artifacts/nondumbbell-loop-regression-v08.json',otherRigLifecycles:'artifacts/nondumbbell-rig-regression-v08.json',
 dumbbellCapture:'artifacts/dumbbell-ergonomics-review/capture-report.json',squatCapture:'artifacts/ergonomics-review/capture-report.json',
 interfaceLayout:'artifacts/ergonomics-review/interface-layout.json',
 otherRigCapture:'artifacts/nondumbbell-ergonomics-review/capture-report.json',
};
const evidence={};for(const [key,path]of Object.entries(proofs)){const p=read(path);if(p.pass!==true)throw new Error(`Failed proof: ${path}`);evidence[key]={file:path,sha256:sha(path),pass:true};}
const sourceHashes={};function visit(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${item.name}`;if(item.isDirectory())visit(path);else sourceHashes[path]=sha(path);}}visit('src');
for(const path of ['package.json','package-lock.json','public/models/athlete/athlete.glb','public/models/athlete/rig.json'])sourceHashes[path]=sha(path);
const dbBridge=read(proofs.dumbbellSourceBridge),squatBridge=read(proofs.squatSourceBridge);
for(const hashes of [dbBridge.currentSourceHashes,squatBridge.toSourceHashes,read(proofs.running).sourceHashes,read(proofs.otherRigLifecycles).sourceHashes])for(const [path,hash]of Object.entries(hashes)){if(sha(path)!==hash)throw new Error(`Evidence source changed: ${path}`);}
const response=await fetch('http://127.0.0.1:5173/');if(response.status!==200)throw new Error('Local playable URL does not respond HTTP200');
const report={version:'0.8.0',date:'2026-10-28',build:'passed',http:{url:response.url,status:response.status},sourceHashes,
 browserTests:{distinctPassed:30,failed:0,fullRun:{...browser.stats},file:'artifacts/playwright-v08.json',scope:'Real browser: Shift walking/running and physical-key WASD handling; graphics settings; decoded zh-TW recording playback and generated music nodes; independent volume/mute/pause; original 28 interaction, class, social, collision and player lifecycle cases.'},
 unitTests:{passed:29,failed:0,file:'artifacts/unit-v08.tap',scope:'22 course/audio/timing cases plus 7 render quality cases. All recorded WAV formats and PCM payloads checked; complete authored timelines, count-in and cancellation rules.'},
 catalog:{entries:70,ordinaryMovements:55,groupCourses:7,otherFacilities:8,learningProgressTotal:62,stations:56,permanentMachines:46,cardioMachines:18},
 audio:{recordedClips:184,language:'zh-TW',source:'Offline Hanhan synthesized recordings; not human recordings',music:'Original Web Audio arrangements',independentVolumes:true,independentMute:true,preparationCountInSeconds:3,nextMoveReminderSeconds:8,endCountdown:[3,2,1],boundedDecodedCache:4},
 performance:{before:read('artifacts/performance/before.json'),after:read('artifacts/performance/after-v0.8.json'),scope:'Same software SwiftShader renderer and 1280x800 DPR1 viewport. Flow reduces framebuffer to1088x680 and disables shadows, plus CPU skeleton/crowd optimizations. Not a same-quality GPU comparison or a user-device FPS guarantee.'},
 evidence,visual:{dumbbells:'artifacts/dumbbell-ergonomics-review/visual-review.json',squat:'artifacts/ergonomics-review/visual-record.json',runningAndInterface:'artifacts/ergonomics-review/readability-visual-record.json',otherRig:'artifacts/nondumbbell-ergonomics-review/visual-review.json',scope:'Actual PNG files opened by agents. Static AI review with explicit occlusion, pixel and finite-sampling limits; no human trainer certification.'},
 historicalEvidence:{previousVersion:'artifacts/verification-summary-v0.7.json',overwrittenLegacyRigFile:'The old common rig-lifecycle-qualification.json was overwritten during diagnosis without a backup. It is not used as original v0.7 evidence; current v0.8 results have unique report names.'},
 remaining:['Human trainer review of teaching suitability and continuous full movements','Human motion capture','Personalized intensity and progression','Arbitrary bench angles and handle/action combinations','Advanced aerial yoga with unsupported feet','Static mesh batching/model LOD and hardware coverage beyond this test environment'],
};
report.visual.artifactHashes={};for(const path of Object.values(report.visual)){if(typeof path!=='string'||!path.endsWith('.json'))continue;const record=read(path);if(record.pass===false)throw new Error(`Visual record failed: ${path}`);report.visual.artifactHashes[path]=sha(path);}
writeFileSync('artifacts/verification-summary.json',JSON.stringify(report,null,2));console.log(JSON.stringify({version:report.version,browser:30,node:29,proofs:Object.keys(evidence).length}));
