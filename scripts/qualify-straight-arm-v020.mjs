import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {collectUnchangedRigV020} from './straight-arm-golden-v020.mjs';
import {equipmentAdjustmentsFor} from '../src/equipment-calibration-v013.js';

// Reuse every original body, skin, metal, foot, wrist, speed and seam threshold.
// The inherited qualifier uses the production GLB, not a synthetic stick rig.
const id='cable-straight-arm-pulldown',directory='artifacts/public-teaching-v020';
const files=['src/cable-stages-v011.js','src/extended-rig.js','src/rig-lifecycle.js','src/skinned-character.js','src/dumbbell-grip.js','src/hand-contact-frame.js','src/free-dumbbell-shaft.js','src/equipment-calibration-v013.js','src/collision-validation.js','scripts/qualify-cable-v011.mjs','scripts/qualify-straight-arm-v020.mjs','scripts/straight-arm-settings-v020.mjs','scripts/straight-arm-golden-v020.mjs','public/models/athlete/athlete.glb','public/models/athlete/rig.json'];
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),sourceHashes=Object.fromEntries(files.map(p=>[p,sha(p)]));
const height=equipmentAdjustmentsFor(id).find(x=>x.key==='pulleyHeightCm'),heights=Array.from({length:1+(height.max-height.min)/height.step},(_,i)=>height.min+i*height.step),weights=[5,15,30,45,55],cases=[];
mkdirSync(directory,{recursive:true});let index=1,out;
do{out=`${directory}/straight-arm-qualification-${String(index++).padStart(3,'0')}.json`;}while(existsSync(out));
for(let i=0;i<heights.length;i++){
 const settings={pulleyHeightCm:heights[i],weightKg:weights[i]},label=`v020-straight-arm-h${settings.pulleyHeightCm}-w${settings.weightKg}`;
 const output=execFileSync(process.execPath,['--import','./scripts/straight-arm-settings-v020.mjs','scripts/qualify-cable-v011.mjs',id],{encoding:'utf8',env:{...process.env,STRAIGHT_ARM_SETTINGS_V020:JSON.stringify(settings),CABLE_PHASE_COUNT:'201',CABLE_REPORT_LABEL:label},maxBuffer:1024*1024});
 const report=JSON.parse(readFileSync(`artifacts/v011-cable-qualification-${label}.json`));
 cases.push({settings,...report});console.log(output.trim());
}
const before=JSON.parse(readFileSync(`${directory}/unaffected-rig-before.json`)),after=await collectUnchangedRigV020(),changes=after.filter(row=>before.rows.find(old=>old.id===row.id)?.sha256!==row.sha256),changedSources=files.filter(p=>sha(p)!==sourceHashes[p]);
const report={pass:cases.length===heights.length&&cases.every(x=>x.pass)&&!changes.length&&after.length===before.rows.length&&!changedSources.length,gpu:false,sourceHashes,changedSources,fullSkinCases:cases,unaffectedActivities:{count:after.length,frames:after.reduce((sum,r)=>sum+r.frames,0),changes,rows:after},scope:'201 equally spaced phases each for the actual GLB loop, entry and exit, plus every lifecycle seam. All five valid pulley heights and low/mid/high representative selector settings use unchanged legacy thresholds, full hand vertices against every actual metal cylinder, stride24 body skin, fixed bones, grounded soles and natural-wrist budgets. The separate tests cover all 55 valid height/weight pairs and their physical selector geometry. This is finite CPU geometry qualification, not continuous triangle collision, a GPU result or professional approval.'};
writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,path:out,cases:cases.length,frames:cases.reduce((sum,r)=>sum+r.results[0].frames,0),changedSources,unaffectedChanges:changes}));if(!report.pass)process.exitCode=1;
