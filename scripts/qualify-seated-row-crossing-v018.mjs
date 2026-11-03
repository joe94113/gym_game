import {createMocapFixtureV017} from './mocap-fixture-v017.mjs';
import {evaluateExerciseClearance,evaluateSelfClearance,evaluateSurfaceClearance} from '../src/collision-validation.js';
import {transformBody,transformSurface} from '../src/lifecycle-frame.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';

const fixture=await createMocapFixtureV017(),{THREE,metrics,character,machines,createMachineLifecycle}=fixture,machine=machines.get('seated-row');
const {createMachineLifecycle:oldFactory}=await import(pathToFileURL(resolve('.local-tools/v018-transition-before/src/machine-lifecycle.js')));
const after=createMachineLifecycle({THREE,machine,metrics,capturedTransitionTiming:false}),before=oldFactory({THREE,machine,metrics}),count=Number(process.env.ROW_V018_PHASES||401),rows=[];
const files=['src/machine-lifecycle.js','src/skinned-character.js','public/models/athlete/athlete.glb'],hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),hashes=Object.fromEntries(files.map(p=>[p,hash(p)]));
let contactsEqual=true,maxSupportFootDifference=0,maxHandDifference=0,geometryChangedSamples=0;
const difference=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const snapshot=frame=>{character.pose(frame.pose);const local=character.getContactPoints();return{body:transformBody(local,frame),skin:transformSurface(character.getSurfaceSamples({stride:24}),frame),feetSkin:transformSurface(character.getSurfaceSamples({stride:1,parts:['leftFoot','rightFoot']}),frame),reach:local.maxReachError};};
function qualify(label,life){const row={label,poses:0,collisions:[],maxReachError:0,maxFootIntrusion:0,footVertices:0};
 for(const mode of ['enter','exit'])for(let i=0;i<count;i++){const phase=i/(count-1),frame=life.sample(mode,phase),s=snapshot(frame),volumes=machine.getCollisionVolumes();
  const tests=[['body',evaluateExerciseClearance(s.body,volumes)],['self',evaluateSelfClearance(s.body)],['skin',evaluateSurfaceClearance(s.skin,volumes)],['full-foot-skin',evaluateSurfaceClearance(s.feetSkin,volumes,{tolerance:.001})]];
  row.footVertices=s.feetSkin.length;row.maxReachError=Math.max(row.maxReachError,s.reach);row.maxFootIntrusion=Math.max(row.maxFootIntrusion,tests[3][1].maxPenetration);
  for(const [kind,result]of tests)for(const hit of result.collisions){const key=`${kind}:${hit.bodyPart}:${hit.mesh}:${hit.volumeId}`,old=row.collisions.find(x=>x.key===key);if(!old)row.collisions.push({key,kind,mode,phase,...hit});else if(hit.depth>old.depth)Object.assign(old,{mode,phase,...hit});}
  if(label==='after'){const oldFrame=before.sample(mode,phase),old=snapshot(oldFrame);contactsEqual&&=JSON.stringify(frame.contacts)===JSON.stringify(oldFrame.contacts);for(let side=0;side<2;side++){if(frame.contacts.feet[side])maxSupportFootDifference=Math.max(maxSupportFootDifference,difference(s.body.feet[side],old.body.feet[side]));maxHandDifference=Math.max(maxHandDifference,difference(s.body.hands[side],old.body.hands[side]));}if(s.body.feet.some((p,j)=>difference(p,old.body.feet[j])>1e-7))geometryChangedSamples++;}
  row.poses++;
 }
 row.pass=!row.collisions.length&&row.maxReachError<.015;console.log(JSON.stringify(row));return row;
}
rows.push(qualify('before',before));rows.push(qualify('after',after));character.dispose();
const changedSources=files.filter(p=>hash(p)!==hashes[p]),report={pass:rows[1].pass&&contactsEqual&&maxSupportFootDifference<1e-6&&maxHandDifference<1e-6&&!changedSources.length,phaseCount:count,rows,contactsEqual,maxSupportFootDifference,maxHandDifference,geometryChangedSamples,hashes,changedSources,scope:'Independent legacy seated-row rail-crossing repair with captured timing disabled. Whole limb/body/self and stride24 whole skin plus every actual GLB foot vertex at 1mm tolerance, both entry/exit. Original before remains immutable; changes must be only the swinging shoe path, with planted feet, hands and contacts unchanged.'};
mkdirSync('artifacts/mocap-v018',{recursive:true});writeFileSync('artifacts/mocap-v018/seated-row-crossing-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,contactsEqual,maxSupportFootDifference,maxHandDifference,geometryChangedSamples}));if(!report.pass)process.exitCode=1;
