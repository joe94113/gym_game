import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildTransitionDataset,buildTransitionClip,transitionMetric} from '../scripts/import-cmu-transitions-v018.mjs';
import {parseCmuFullBody} from '../scripts/cmu-fullbody-v017.mjs';
import {transitionCaptureClips,sampleTransitionCapture} from '../src/captured-transition-data-v018.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),manifest=JSON.parse(readFileSync('public/motions/cmu-transitions-v018.json'));

test('transition curves are reproduced from original measured ASF/AMC and exact crop provenance',()=>{
 const rebuilt=buildTransitionDataset();assert.equal(rebuilt.module,readFileSync('src/captured-transition-data-v018.js','utf8'));assert.deepEqual(rebuilt.clips,transitionCaptureClips);
 assert.deepEqual(rebuilt.manifest,manifest);for(const[path,hash]of Object.entries({...manifest.rawSourceHashes,...manifest.generatorHashes}))assert.equal(sha(readFileSync(path)),hash,path);
 assert.equal(manifest.dataModule.sha256,sha(readFileSync(manifest.dataModule.path)));assert.ok(manifest.dataModule.bytes<30000);
 for(const clip of transitionCaptureClips){const meta=manifest.clips.find(item=>item.id===clip.id);assert.equal(meta.rawSHA256,sha(JSON.stringify(clip.rawMetric)));assert.equal(meta.progressSHA256,sha(JSON.stringify(clip.progress)));assert.equal(clip.progress.length,121);assert.equal(clip.rawMetric.length,121);assert.ok(Math.abs(clip.rawMetric.at(-1)-clip.rawMetric[0])>.05);}
});

test('actual chair, box reach, and already-held dumbbell timing have distinct and honestly labelled roles',()=>{
 const counts={};for(const clip of transitionCaptureClips){counts[clip.role]=(counts[clip.role]||0)+1;assert.equal(clip.sourceDirection,'forward-capture');const descending=['sit-down','object-lower','held-lower'].includes(clip.role);assert.equal(clip.rawMetric.at(-1)<clip.rawMetric[0],descending);assert.ok([60,120].includes(clip.fps));}
 assert.deepEqual(counts,{'sit-down':2,'stand-up':2,'object-lower':2,'object-rise':2,'held-raise':1,'held-lower':1});
 assert.match(transitionCaptureClips.find(c=>c.id==='object-lower-a').sourceAction,/not a captured loaded putdown/);
 for(const role of ['held-raise','held-lower'])assert.match(transitionCaptureClips.find(c=>c.role===role).sourceAction,/Already holding dumbbells/);
 assert.match(manifest.scope,/timing only/);assert.match(manifest.scope,/reversed runtime adaptation/);assert.equal(manifest.professionalReview.status,'pending');
});

test('all ten measured transition timings remain monotone and C1 at their common zero/one endpoints',()=>{
 const h=1e-7;
 for(const clip of transitionCaptureClips){let previous=0;assert.equal(sampleTransitionCapture(clip.id,0),0);assert.equal(sampleTransitionCapture(clip.id,1),1);
  for(let i=0;i<=10000;i++){const p=sampleTransitionCapture(clip.id,i/10000);assert.ok(Number.isFinite(p)&&p>=0&&p<=1);assert.ok(p>=previous-1e-12);previous=p;}
  assert.ok(sampleTransitionCapture(clip.id,h)/h<.001,clip.id+' start tangent');assert.ok((1-sampleTransitionCapture(clip.id,1-h))/h<.001,clip.id+' end tangent');
 }
 assert.equal(sampleTransitionCapture('missing',.5),null);assert.equal(sampleTransitionCapture(transitionCaptureClips[0],NaN),null);assert.equal(sampleTransitionCapture(transitionCaptureClips[0],-.1),0);assert.equal(sampleTransitionCapture(transitionCaptureClips[0],1.1),1);
});

test('mixed press-plus-lowering ending is rejected rather than fabricated into a lowering curve',()=>{
 const prefix='.local-tools/cmu-v015/',motion=parseCmuFullBody(readFileSync(prefix+'79.asf','utf8'),readFileSync(prefix+'79_93.amc','utf8'),{fps:60}),definition={id:'mixed',role:'held-lower',motion:'79_93',fps:60,first:836,last:1138,metric:'mean-wrist-y-relative-pelvis'};
 assert.throws(()=>buildTransitionClip(motion,definition),/Nonmonotone source/);assert.equal(manifest.rejected.length,1);assert.equal(transitionCaptureClips.find(c=>c.role==='held-lower').first,1045);
 assert.throws(()=>buildTransitionClip(motion,{...definition,first:0}),/Invalid transition crop/);
 assert.throws(()=>buildTransitionClip(motion,{...definition,first:1,last:20}),/Insufficient captured transition range/);
 assert.throws(()=>transitionMetric(motion.samples[0],'not-a-measurement'),/Unsupported transition metric/);
});
