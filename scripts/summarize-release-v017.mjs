import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashMobileSources,changedHashes} from './mobile-performance-common-v016.mjs';

const dir='artifacts/mocap-v017/',read=path=>JSON.parse(readFileSync(path,'utf8')),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sources=hashMobileSources(),qualification=read(dir+'qualification-release.json'),browser=read(dir+'browser-release/report.json'),mobile=read(dir+'mobile-regression.json'),review=read(dir+'review-browser-qualified.json'),preview=read(dir+'static-preview-browser.json'),pack=read(dir+'coach-pack/review.json');
const log=readFileSync(dir+'node-tests-qualified.txt','utf8').replace(/\u001b\[[0-9;]*m/g,'').replaceAll('\r','');
const count=name=>Number(log.match(new RegExp('^ℹ '+name+' (\\d+)$','m'))?.[1]);
const changedSinceMotionBrowser=changedHashes(browser.sourceHashes,sources),changedSinceGeometry=changedHashes(qualification.sourceHashes,sources);
const onlyReviewVersion=paths=>paths.every(path=>path==='src/motion-review-data-v015.js');
const opinions=read(dir+'visual-press-review.json'),goblet=read(dir+'visual-goblet-final-review.json'),reviewedHashes=new Set();
function hashes(value){if(typeof value==='string'&&/^[a-f\d]{64}$/.test(value))reviewedHashes.add(value);else if(Array.isArray(value))value.forEach(hashes);else if(value&&typeof value==='object')Object.values(value).forEach(hashes);}hashes(opinions);hashes(goblet);
const checks={
 version:read('package.json').version==='0.17.0',
 node:count('tests')===227&&count('pass')===227&&count('fail')===0&&count('skipped')===0,
 geometry:qualification.pass&&qualification.rows.length===2&&qualification.rows.every(row=>row.loopPoses===202&&row.lifecyclePoses===202&&row.lifecycleIdentical&&row.maxMetalDepth<=.001&&row.maxContactError<.015),
 motionSourcesCurrent:onlyReviewVersion(changedSinceGeometry)&&onlyReviewVersion(changedSinceMotionBrowser),
 liveMotion:browser.pass&&browser.cases.length===3&&browser.images.length===36,
 visual:browser.images.every(image=>sha(image.path)===image.sha256&&reviewedHashes.has(image.sha256)),
 mobileRegression:mobile.stats.expected===6&&mobile.stats.unexpected===0&&mobile.stats.skipped===0,
 currentReviewVersion:review.stats.expected===1&&review.stats.unexpected===0&&pack.sourceVersion==='0.17.0',
 actualReviewPack:pack.evidence.length===18&&pack.checklist.length===65&&pack.professionalSignoff===false&&pack.checklist.every(row=>row.status==='pending'),
 staticPreview:preview.pass&&preview.capturedExerciseStarted&&preview.apiRequests.length===0,
 builds:['build-default-qualified.txt','build-pages-qualified.txt','build-phone-qualified.txt'].every(path=>/built in/.test(readFileSync(dir+path,'utf8'))),
};
const evidence=['qualification-release.json','browser-release/report.json','mobile-regression.json','review-browser-qualified.json','static-preview-browser.json','visual-press-review.json','visual-goblet-final-review.json','node-tests-qualified.txt','coach-pack/review.json','build-default-qualified.txt','build-pages-qualified.txt','build-phone-qualified.txt'];
const report={version:'0.17.0',pass:Object.values(checks).every(Boolean),recordedAt:new Date().toISOString(),checks,sourceHashes:sources,evidenceHashes:Object.fromEntries(evidence.map(path=>[dir+path,sha(dir+path)])),changedSinceMotionBrowser,changedSinceGeometry,
 verificationScope:'The current 227-test Node run and targeted native review export test include the final review-version/allowlist fix. The earlier six-case mobile regression, three native mocap cases and geometry qualification have identical posing/rendering sources; only motion-review-data-v015.js metadata/import compatibility changed afterward. This distinction is explicit rather than claiming another complete browser run.',
 implemented:{exerciseIds:['dumbbell-shoulder-press','dumbbell-goblet-squat'],kind:'source-driven multi-joint retargeting with fixed-length actor IK and grip/foot constraints',sourceCaptures:['CMU 79_93 standing dumbbell press','CMU 13_29 unweighted squat adapted to goblet hold'],lifecycle:'Authored pickup/return paths unchanged from frozen v0.16',professionalApproval:false},
 limits:['Two exercise loops were enhanced; this is not full-skeleton/finger playback or a full library of equipment mocap.','The squat performer held no dumbbell. Source balancing arms are replaced by the authored goblet hold.','Finite body/skin/hand-surface sampling and static visual review do not certify all continuous poses or trainer approval; all65 review entries remain pending.','Native graphics and phone emulation use the existing Intel UHD630 machine; no additional physical phone or GPU result is claimed.','v0.16 performance numbers remain historical and were not remeasured as v0.17 FPS.'],
 previews:{desktop:'http://127.0.0.1:5173/',phone:'http://192.168.114.55:5175/',phoneRequiresSameReachableLAN:true},
 retainedFailedAttempts:['qualification-initial.json','qualification-grip-lift.json','legacy-timing-initial.txt','node-tests-release.txt','review-browser.json'],
};
writeFileSync('artifacts/verification-summary-v0.17.json',JSON.stringify(report,null,2));if(report.pass)writeFileSync('artifacts/verification-summary.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,checks,changedSinceMotionBrowser,changedSinceGeometry}));if(!report.pass)process.exitCode=1;
