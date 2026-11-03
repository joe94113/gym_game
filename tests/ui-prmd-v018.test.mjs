import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {upperBodyClips,upperBodySources,upperBodyChannelNames,upperBodyQuantization,decodeUpperBodyClip} from '../src/upper-body-data-v018.js';
import {sampleUpperBodyReference,upperBodyMeasuredEffort,upperBodySourceInfo} from '../src/upper-body-reference-v018.js';

const manifest=JSON.parse(readFileSync('public/motions/ui-prmd-v018.json','utf8')),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const basename=value=>String(value).replaceAll('\\','/').split('/').at(-1);

test('selected actual Vicon episodes reproduce from source files with the documented39-marker/100Hz/mm contract',()=>{
 const run=spawnSync('python',['scripts/import-ui-prmd-v018.py','--verify'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr||run.stdout);const report=JSON.parse(run.stdout);assert.equal(report.episodes,6);assert.equal(report.sampledPoses,726);assert.equal(report.tasks,3);
 assert.equal(manifest.sensor,'Vicon optical');assert.equal(manifest.fps,100);assert.equal(manifest.sourcePositionUnit,'millimeter');assert.equal(sha(readFileSync(manifest.runtimeData.path)),manifest.runtimeData.sha256);
 assert.equal(manifest.sourceMarkerNames[16],'RSHO');assert.equal(manifest.sourceMarkerNames[18],'RELB');assert.equal(manifest.sourceMarkerNames[20],'RWRA');assert.equal(manifest.sourceMarkerNames[21],'RWRB');
});

test('recorded input identity matches the original official ZIP-entry download receipts, not the Kinect visualizer copies',()=>{
 const recorded=new Map();function collect(value){if(value&&typeof value==='object'){if(typeof value.path==='string'&&typeof value.sha256==='string')recorded.set(basename(value.path),value.sha256);for(const child of Object.values(value))collect(child);}}
 for(const path of ['artifacts/mocap-v018/research/uiprmd-trial-receipts.json','artifacts/mocap-v018/research/uiprmd-e03-receipts.json'])collect(JSON.parse(readFileSync(path,'utf8')));
 for(const source of upperBodySources)for(const [kind,key]of [['positions','positionsSHA256'],['angles','anglesSHA256']]){const name=`${source.task}_s01_${source.episode}_${kind}.txt`;assert.equal(source[key],recorded.get(name),name);assert.equal(sha(readFileSync('.local-tools/ui-prmd-v018/'+name)),source[key]);}
});

test('six complete source cycles exclude incomplete episodes and keep unweighted right-sided movement provenance',()=>{
 assert.equal(upperBodySources.length,6);assert.equal(upperBodyClips.length,6);assert.equal(manifest.actualEpisodes,6);assert.equal(manifest.license.id,'PDDL-1.0');assert.equal(manifest.license.articleLicenseNotBasis,true);assert.match(manifest.license.attribution,/Vakanski/);
 for(const source of upperBodySources){assert.equal(source.capturedSide,'right');assert.match(source.sourceLoad,/Unweighted/);assert.ok(source.sourceArmElevationMarkerDegrees[0]<20);assert.ok(source.sourceArmElevationMarkerDegrees[2]<20);assert.ok(source.durationSeconds>1&&source.durationSeconds<3.1);}
 assert.deepEqual(upperBodyClips.filter(x=>x.task==='m07').map(x=>x.id),['uiprmd-vicon-m07-s01-e02','uiprmd-vicon-m07-s01-e03']);
 assert.ok(manifest.rejected.some(x=>x.id==='m07_s01_e01'));assert.ok(manifest.rejected.some(x=>x.id==='m10_s01_e01'));assert.equal(upperBodySourceInfo('m09'),null);
 assert.match(upperBodySourceInfo('m10').taskName,/scaption/);assert.doesNotMatch(upperBodySourceInfo('m10').taskName,/curl/i);assert.equal(manifest.professionalReview.status,'pending');
});

test('dequantized raw references retain source overhead range and distinct observed endpoints instead of game limits',()=>{
 assert.equal(upperBodyChannelNames.length,23);assert.equal(upperBodyQuantization.length,23);
 for(const clip of upperBodyClips){const bytes=Buffer.from(clip.data,'base64');assert.equal(sha(bytes),clip.encodedSHA256);const values=decodeUpperBodyClip(clip);assert.equal(values.length,121*23);assert.ok(values.every(Number.isFinite));const record=manifest.clips.find(x=>x.id===clip.id);record.maxQuantizationErrorByChannel.forEach((value,i)=>assert.ok(value<=upperBodyQuantization[i]/2+1e-10));assert.ok(clip.rawEndpointMaxAngleDifferenceDeg>.1);const a=sampleUpperBodyReference({task:clip.task,phase:0,cycle:upperBodyClips.filter(x=>x.task===clip.task).indexOf(clip)}),b=sampleUpperBodyReference({task:clip.task,phase:1,cycle:upperBodyClips.filter(x=>x.task===clip.task).indexOf(clip)});assert.notDeepEqual(a.rightUpper,b.rightUpper);}
 for(const source of upperBodySources.filter(x=>x.task==='m07'))assert.ok(source.sourceArmElevationMarkerDegrees[1]>120,'Actual source is above game lateral-raise range; do not silently clamp the recorded data');
});

test('actual right-arm references mirror only the named derived left-arm fields and keep unit marker directions',()=>{
 for(const task of ['m07','m08','m10'])for(let cycle=0;cycle<2;cycle++)for(let i=0;i<=500;i++){
  const sample=sampleUpperBodyReference({task,phase:i/500,cycle});assert.equal(sample.capturedSide,'right');assert.equal(sample.leftArmDerivedByMirroring,true);
  for(const key of ['rightUpper','rightLower','rightHand','leftMirroredUpper','leftMirroredLower','leftMirroredHand','torso','head'])assert.ok(Math.abs(Math.hypot(...sample[key])-1)<1e-10);
  for(const [actual,mirrored]of [['rightUpper','leftMirroredUpper'],['rightLower','leftMirroredLower'],['rightHand','leftMirroredHand']])assert.deepEqual(sample[mirrored],[-sample[actual][0],sample[actual][1],sample[actual][2]]);
  for(const key of ['pelvisRelativeAnkles','shoulderRelativePelvis'])assert.ok(sample[key].every(Number.isFinite));
 }
 const abduction=sampleUpperBodyReference({task:'m07',phase:.5}),extension=sampleUpperBodyReference({task:'m08',phase:.5}),scaption=sampleUpperBodyReference({task:'m10',phase:.5});assert.ok(abduction.rightUpper[0]>.4);assert.ok(extension.rightUpper[2]<-.4);assert.ok(scaption.rightUpper[2]>.4);assert.ok(scaption.rightUpper[0]>.4);
});

test('derived effort has smooth rest joins, valid bounds and monotone halves while source references remain unchanged',()=>{
 const h=1e-7;
 for(const task of ['m07','m08','m10'])for(let cycle=0;cycle<2;cycle++){const values=Array.from({length:1001},(_,i)=>upperBodyMeasuredEffort({task,phase:i/1000,cycle})),peak=values.indexOf(Math.max(...values));assert.equal(values[0],0);assert.equal(values.at(-1),0);assert.ok(Math.max(...values)>.999);assert.ok(upperBodyMeasuredEffort({task,phase:h,cycle})/h<.001);assert.ok(upperBodyMeasuredEffort({task,phase:1-h,cycle})/h<.001);for(let i=1;i<values.length;i++){assert.ok(Number.isFinite(values[i])&&values[i]>=0&&values[i]<=1);if(i<=peak)assert.ok(values[i]>=values[i-1]-1e-10);else assert.ok(values[i]<=values[i-1]+1e-10);}}
 assert.equal(sampleUpperBodyReference({task:'m09',phase:.5}),null);assert.equal(sampleUpperBodyReference({phase:NaN}),null);assert.equal(sampleUpperBodyReference({phase:.5,cycle:Infinity}),null);
});

test('Kinect shape, nonfinite optical positions and wrong marker order are rejected without inferred skeleton playback',()=>{
 const code=`import importlib.util,json,numpy as np\ns=importlib.util.spec_from_file_location('ui','scripts/import-ui-prmd-v018.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);p=json.load(open('artifacts/mocap-v018/research/uiprmd-protocol.json'));names=p['recording']['markerNames'];original=m.np.loadtxt;pos=original(m.INPUT/'m07_s01_e02_positions.txt',delimiter=',');ang=original(m.INPUT/'m07_s01_e02_angles.txt',delimiter=',')\nfor kind in ['kinect','nan','markerNames']:\n a=pos.copy();a[0,0]=float('nan') if kind=='nan' else a[0,0];m.np.loadtxt=lambda path,delimiter:np.zeros((len(pos),66)) if kind=='kinect' else a if str(path).endswith('positions.txt') else ang\n try:m.load_trial('m07','e02',names[:-1] if kind=='markerNames' else names)\n except ValueError:pass\n else:raise AssertionError('invalid source accepted '+kind)\nprint('optical guards passed')`;
 const run=spawnSync('python',['-c',code],{encoding:'utf8'});assert.equal(run.status,0,run.stderr||run.stdout);
 assert.match(manifest.scope,/not clinical|Not clinical/);assert.match(manifest.angleFileUse,/no Euler\/FK/);assert.match(upperBodySourceInfo('m07').bilateralRule,/not an actual bilateral/);
});
