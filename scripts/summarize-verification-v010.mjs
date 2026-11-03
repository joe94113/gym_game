import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const browser=read('artifacts/playwright-v010.json'),tap=readFileSync('artifacts/unit-v010.tap','utf8');
if(browser.stats.expected!==40||browser.stats.unexpected||browser.stats.skipped||browser.stats.flaky)throw Error('Expected 40 passing browser/collision tests');
if(!/^# pass 73\r?$/m.test(tap)||!/^# fail 0\r?$/m.test(tap)||!/^# cancelled 0\r?$/m.test(tap)||!/^# skipped 0\r?$/m.test(tap))throw Error('Expected 73 passing Node tests');

function validateSourceHashes(proof,root=''){
 for(const [path,expected]of Object.entries(proof.sourceHashes||proof.hashes||proof.currentSourceHashes||{}))if(hash(root+path)!==expected)throw Error(`Evidence source changed: ${path}`);
 if(proof.changedSources?.length||proof.staleSources?.length)throw Error('Evidence reports changed sources');
}
const files={dumbbell:'artifacts/v010-dumbbell-validation-summary.json',wristCapture:'artifacts/dumbbell-wrist-review-v010/after-capture.json',wristVisual:'artifacts/dumbbell-wrist-review-v010/visual-review.json',lodTopology:'artifacts/npc-lod-v010/qualification.json',lodCapture:'artifacts/npc-lod-v010/capture-report.json',lodVisual:'artifacts/npc-lod-v010/visual-review.json',interface:'artifacts/ui-v010/layout.json',interfaceVisual:'artifacts/ui-v010/visual-review.json'};
const evidence={},loaded={};
for(const [key,file]of Object.entries(files)){
 const proof=read(file);if((proof.pass??proof.passed)!==true)throw Error(`Evidence failed: ${file}`);validateSourceHashes(proof);
 for(const image of proof.images||[])if(hash(image.file)!==image.sha256||image.viewed!==true)throw Error(`Image review missing or changed: ${image.file}`);
 evidence[key]={file,sha256:hash(file),pass:true};loaded[key]=proof;
}
for(const proof of Object.values(loaded.dumbbell.evidence)){
 if(proof.pass!==true||proof.staleSources.length||hash(proof.path)!==proof.sha256)throw Error(`Dumbbell leaf evidence failed: ${proof.path}`);
 validateSourceHashes(read(proof.path));
}
const beforeCapture=read('artifacts/dumbbell-wrist-review-v010/before-capture.json');
validateSourceHashes(beforeCapture,'.local-tools/v010-before/');
const prior=read('artifacts/verification-summary-v0.9.json'),sourceHashes={};
function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())visit(path);else sourceHashes[path]=hash(path);}}
visit('src');visit('public/models/athlete/lod-v010');
for(const path of ['package.json','package-lock.json','public/models/athlete/athlete.glb','public/models/athlete/rig.json'])sourceHashes[path]=hash(path);
for(const path of ['src/data.js','src/gym-layout.js','src/locomotion.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json'])if(sourceHashes[path]!==prior.sourceHashes[path])throw Error(`Preserved layout/locomotion/model changed: ${path}`);
const world=loaded.lodCapture.world;
if(world.length!==2||world[1].render.triangles>=world[0].render.triangles||JSON.stringify(world[0].body)!==JSON.stringify(world[1].body))throw Error('LOD A/B did not preserve body or reduce drawn triangles');
const response=await fetch('http://127.0.0.1:5173/');if(response.status!==200)throw Error('Playable page unavailable');
const report={
 version:'0.10.0',date:'2026-10-28',build:'passed',http:{url:response.url,status:response.status},sourceHashes,
 browserTests:{passed:40,failed:0,stats:browser.stats,file:'artifacts/playwright-v010.json'},unitTests:{passed:73,failed:0,file:'artifacts/unit-v010.tap'},
 catalog:{entries:70,ordinaryMovements:55,groupCourses:7,otherFacilities:8,learningProgressTotal:62,stations:56,permanentMachines:46,cardioMachines:18},
 evidence,
 dumbbell:{comparison:loaded.dumbbell.wristComparison,collision:loaded.dumbbell.collision,continuity:loaded.dumbbell.continuity,closure:loaded.dumbbell.closure,preservation:loaded.dumbbell.preservation,visual:{beforeImages:4,afterImages:36,lifecyclePanels:216,handCloseups:18},scope:'Actual free DB pickup/carry/seating/recline/return paths revised. Canonical exercise loops, unrelated motions and goblet path preserved. Static images and dense samples are not human trainer or clinical approval.'},
 geometryLod:{perPersonTriangles:[56185,42369,35847],derivedBinaryBytes:469296,worldDrawnTriangles:world.map(frame=>frame.render.triangles),worldDrawCalls:world.map(frame=>frame.render.calls),worldFractionReduction:1-world[1].render.triangles/world[0].render.triangles,scope:'Same current world/camera/zero-time pose A/B; triangle reduction does not assert native hardware FPS improvement. Player, near characters, equipment handoff and every class participant retain full geometry.',cpuProof:files.lodTopology,surfaceDifferenceNote:'Candidate-face samples reach approximately 18.30 mm difference from the original surface. Source vertex/attribute equality is not complete reduced-surface equality.',memoryUnloading:false},
 trainingRoute:{stepProgressSeparateFromMovementLearning:true,repeatedWarmupCooldownStationPreserved:true,mobility15Minutes:{explorationSteps:6,uniqueMovements:5},cancelOrUnrelatedActivityAdvances:false,realWorkoutRecorded:false,ordinaryGoalsPreserved:true},
 remaining:['Human motion capture and qualified trainer review','Inherited goblet/curl/lateral-raise exercise wrist shapes and changed preparation arm elevation require human review','Arbitrary continuous bench angles and unqualified attachments','Advanced unsupported-feet aerial yoga','Actual room/model/texture resource unloading','Broader native hardware performance coverage'],
 namingAndIcon:'Deferred at user request until feature work is finished; placeholder brand retained.',previous:'artifacts/verification-summary-v0.9.json',
};
writeFileSync('artifacts/verification-summary.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({version:report.version,browser:40,node:73,worldTriangles:report.geometryLod.worldDrawnTriangles,evidence:Object.keys(evidence)}));
