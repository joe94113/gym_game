import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {sameLimbClips,sameLimbSources,sameLimbChannelNames,sameLimbQuantization,decodeSameLimbClip} from '../src/same-limb-data-v018.js';
import {sameLimbEffort,sampleSameLimbReference,getSameLimbSourceInfo} from '../scripts/same-limb-profile-v018.mjs';

const manifest=JSON.parse(readFileSync('public/motions/same-limb-v018.json','utf8'));
const tasks=['deadlift','deep_squat','heel_raise','stand_sit_transition'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('actual optical trial export reproduces from pinned raw files, marker angles and native times',()=>{
  const run=spawnSync('python',['scripts/import-same-limb-v018.py','--verify'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);const receipt=JSON.parse(run.stdout);assert.equal(receipt.sourceTrials,4);assert.equal(receipt.repetitions,12);assert.equal(receipt.sampledPoses,1452);
  assert.equal(manifest.sourceCommit,'233b0db6cfda8360338f92219e07fd3d3d1d7bdb');
  assert.equal(sha(readFileSync(manifest.runtimeData.path)),manifest.runtimeData.sha256);
});

test('four trials provide three observed complete repetitions each, with explicit original load and no upper-body claims',()=>{
  assert.equal(sameLimbSources.length,4);assert.equal(sameLimbClips.length,12);assert.equal(manifest.actualSourceTrials,4);assert.equal(manifest.selectedRepetitions,12);
  for(const task of tasks){const clips=sameLimbClips.filter(x=>x.task===task);assert.equal(clips.length,3);for(const clip of clips){assert.equal(clip.sampleCount,121);assert.equal(clip.nominalFPS,90);assert.equal(clip.stride,28);assert.ok(clip.lastFrameIndex>clip.firstFrameIndex);assert.ok(clip.sourceDurationSeconds>3&&clip.sourceDurationSeconds<4.1);assert.ok(clip.peakPhase>.15&&clip.peakPhase<.85);}}
  assert.match(getSameLimbSourceInfo('deadlift').sourceLoad,/box.*A4/);assert.match(getSameLimbSourceInfo('deep_squat').sourceLoad,/Unweighted/);assert.match(getSameLimbSourceInfo('heel_raise').sourceLoad,/Standing bilateral/);assert.match(getSameLimbSourceInfo('stand_sit_transition').sourceLoad,/Ordinary-chair/);
  assert.equal(manifest.professionalReview.status,'pending');assert.match(manifest.scope,/No torso, head, arms, hands/);
  assert.equal(manifest.license.name,'CC BY 4.0');assert.match(manifest.license.attribution,/Dongxu Tang/);assert.match(manifest.license.attribution,/Changes:/);assert.equal(sha(readFileSync('public/motions/same-limb-v018-LICENSE.txt')),manifest.license.sourceDocumentSHA256['CC-BY-4.0.txt']);
});

test('encoded measured channels retain declared quantization bounds and observed endpoints',()=>{
  assert.equal(sameLimbChannelNames.length,28);assert.equal(sameLimbQuantization.length,28);
  for(const clip of sameLimbClips){
    const bytes=Buffer.from(clip.data,'base64');assert.equal(sha(bytes),clip.encodedSHA256);const values=decodeSameLimbClip(clip);assert.equal(values.length,121*28);assert.ok(values.every(Number.isFinite));
    const record=manifest.clips.find(x=>x.id===clip.id);record.maxQuantizationErrorByChannel.forEach((value,i)=>assert.ok(value<=sameLimbQuantization[i]/2+1e-10));
    assert.ok(clip.rawEndpointMaxAngleDifferenceDeg>.1,'The measured raw rest endpoints must not be fabricated equal');
    const first=sampleSameLimbReference({task:clip.task,phase:0,cycle:clip.sourceRepetition-1}),last=sampleSameLimbReference({task:clip.task,phase:1,cycle:clip.sourceRepetition-1});assert.notDeepEqual(first.anglesDeg,last.anglesDeg);
  }
});

test('dense source references are finite, marker directions stay normalized and actual repetitions differ',()=>{
  for(const task of tasks){
    const seen=new Set();
    for(let cycle=0;cycle<3;cycle++)for(let i=0;i<=500;i++){
      const sample=sampleSameLimbReference({task,phase:i/500,cycle});seen.add(sample.clipId);
      for(const field of ['anglesDeg','pelvisRelativeAnkles','pelvisRelativeToeMidpoint'])assert.ok(sample[field].every(Number.isFinite));
      for(const directions of [sample.thighDirections,sample.shinDirections])for(const direction of directions)assert.ok(Math.abs(Math.hypot(...direction)-1)<1e-10);
      assert.ok(sample.pelvisRelativeAnkles[1]>.3&&sample.pelvisRelativeAnkles[1]<1.3);
    }
    assert.equal(seen.size,3);assert.notDeepEqual(sampleSameLimbReference({task,phase:.5,cycle:0}).anglesDeg,sampleSameLimbReference({task,phase:.5,cycle:1}).anglesDeg);
  }
});

test('derived measured effort is monotone per half and returns smoothly to rest without overwriting raw channels',()=>{
  const h=1e-7;
  for(const clip of sameLimbClips){const cycle=clip.sourceRepetition-1,values=Array.from({length:1001},(_,i)=>sameLimbEffort({task:clip.task,phase:i/1000,cycle})),peak=values.indexOf(Math.max(...values));assert.equal(values[0],0);assert.equal(values.at(-1),0);assert.ok(Math.max(...values)>.999);for(let i=1;i<values.length;i++){assert.ok(Number.isFinite(values[i])&&values[i]>=0&&values[i]<=1);if(i<=peak)assert.ok(values[i]>=values[i-1]-1e-10);else assert.ok(values[i]<=values[i-1]+1e-10);}assert.ok(sameLimbEffort({task:clip.task,phase:h,cycle})/h<.001);assert.ok(sameLimbEffort({task:clip.task,phase:1-h,cycle})/h<.001);}
  assert.equal(sampleSameLimbReference({task:'bench_press',phase:.5}),null);assert.equal(sameLimbEffort({task:'deadlift',phase:NaN}),null);assert.equal(sampleSameLimbReference({task:'deadlift',phase:.5,cycle:Infinity}),null);
});

test('derived anatomical frame is explicit and malformed optical frames are rejected without invented upper-body data',()=>{
  const code=`import importlib.util,numpy as np\ns=importlib.util.spec_from_file_location('same','scripts/import-same-limb-v018.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n_,a=m.load_trial('deadlift')\nb,p=m.anatomy_frame(a['motion_markers_named'].astype('float64'));r=a['motion_markers_named'][:60].mean(0);assert np.max(np.abs(b.T@b-np.eye(3)))<1e-8;assert ((r[6]-r[7])@b)[0]>0;assert (np.mean(r[[5,14]]-r[[4,13]],0)@b)[2]>0;assert p>0\nfor key,mutation in [('joint_angle_valid_mask',lambda z:z.__setitem__((0,0),False)),('joint_angles_deg',lambda z:z.__setitem__((0,0),float('nan'))),('time_motion_s',lambda z:z.__setitem__(1,z[0])),('motion_frame_number',lambda z:z.__setitem__(1,z[0]))]:\n c={k:np.array(v,copy=True) for k,v in a.items()};mutation(c[key])\n try:m.validate_trial('deadlift',c)\n except ValueError:pass\n else:raise AssertionError('invalid source accepted '+key)\nprint('guards passed')`;
  const run=spawnSync('python',['-c',code],{encoding:'utf8'});assert.equal(run.status,0,run.stderr||run.stdout);
  for(const source of sameLimbSources){assert.match(source.coordinateFrame.kind,/derived-initial-anatomical/);assert.match(source.sourceUnit,/unspecified/);assert.ok(Math.abs(Math.abs(source.coordinateFrame.determinant)-1)<1e-8);}
});
