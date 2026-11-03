import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {parseCmuFullBody,sampleFullBodyCrop,encodeFullBodyValues} from '../scripts/cmu-fullbody-v017.mjs';
import {parseCmuMotion} from '../scripts/cmu-motion-v015.mjs';
import {capturedFullBodyClips,capturedFullBodyLandmarks,capturedFullBodyAliases,capturedFullBodyQuantization,decodeCapturedFullBodyClip} from '../src/captured-fullbody-data-v017.js';

const manifest=JSON.parse(readFileSync('public/motions/cmu-fullbody-v017.json','utf8'));
const raw=new Map(manifest.sources.map(source=>[source.id,{asf:readFileSync(`.local-tools/cmu-v015/${source.subject}.asf`,'utf8'),amc:readFileSync(`.local-tools/cmu-v015/${source.motion}.amc`,'utf8')} ]));
const motions=new Map(manifest.sources.map(source=>[source.id,parseCmuFullBody(raw.get(source.id).asf,raw.get(source.id).amc,{fps:source.fps})]));
const sha=value=>createHash('sha256').update(value).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('full-body sources retain actual frame rate, actor skeleton and known source limits',()=>{
  assert.deepEqual(manifest.sources.map(source=>[source.motion,source.fps,source.sourceFrames]),[['79_93',60,1138],['13_29',120,4592]]);
  assert.equal(manifest.professionalReview.status,'pending');assert.equal(capturedFullBodyClips.length,4);assert.equal(capturedFullBodyLandmarks.length,27);
  assert.equal(capturedFullBodyAliases.leftElbow,'lhumerus');assert.equal(capturedFullBodyAliases.leftKnee,'lfemur');
  assert.ok(capturedFullBodyLandmarks.every(name=>!/(?:fingers|thumb)$/.test(name)));
  assert.match(manifest.sources[1].loadInSource,/Bodyweight only/);assert.match(manifest.scope,/not finger capture/);
  for(const source of manifest.sources)for(const [path,expected]of Object.entries(source.rawSourceHashes))assert.equal(sha(readFileSync(path)),expected);
  assert.equal(sha(readFileSync(manifest.module.path)),manifest.module.sha256);
  assert.ok(manifest.module.bytes<150000);
});

test('ASF endpoint reconstruction preserves actor lengths and reflected rotations',()=>{
  for(const motion of motions.values())for(const index of [0,Math.floor(motion.frames/3),Math.floor(motion.frames*2/3),motion.frames-1]){
    const sample=motion.samples[index];assert.deepEqual(sample.landmarks.root,[0,0,0]);
    for(const [name,bone]of Object.entries(motion.bones)){
      assert.ok(Math.abs(distance(sample.landmarks[name],sample.landmarks[bone.parent])-bone.lengthMetres)<4e-8);
      const q=new THREE.Quaternion(...sample.quaternions[name]);assert.ok(Math.abs(q.length()-1)<2e-8);
    }
  }
  // Source orientations are mirrored as M*R*M, not by merely negating a
  // position component. Check one limb segment against its endpoint vector.
  const text=raw.get('cmu-79-93').asf,block=[...text.matchAll(/\bbegin\s+([\s\S]*?)\bend\b/g)].find(match=>/name\s+lhumerus\s/.test(match[1]));
  const sourceDirection=block[1].match(/direction\s+([^\r\n]+)/)[1].trim().split(/\s+/).map(Number),rest=new THREE.Vector3(-sourceDirection[0],sourceDirection[1],sourceDirection[2]).normalize();
  for(const index of [212,388,558,711,835]){
    const sample=motions.get('cmu-79-93').samples[index],direction=new THREE.Vector3(...sample.landmarks.lhumerus).sub(new THREE.Vector3(...sample.landmarks.lclavicle)).normalize();
    assert.ok(rest.clone().applyQuaternion(new THREE.Quaternion(...sample.quaternions.lhumerus)).distanceTo(direction)<1e-6);
  }
});

test('full-body arm and leg directions agree with the preserved v015 reference convention',()=>{
  const input=raw.get('cmu-79-93'),legacy=parseCmuMotion(input.asf,input.amc,{fps:60}),motion=motions.get('cmu-79-93');
  for(const index of [212,388,558,711,835]){
    const sample=motion.samples[index],direction=(start,end)=>new THREE.Vector3(...sample.landmarks[end]).sub(new THREE.Vector3(...sample.landmarks[start])).normalize().toArray();
    for(const [actual,expected]of [[direction('lclavicle','lhumerus'),legacy.samples[index].upper[0]],[direction('rclavicle','rhumerus'),legacy.samples[index].upper[1]],[direction('lhumerus','lradius'),legacy.samples[index].lower[0]],[direction('lhipjoint','lfemur'),legacy.samples[index].thighs[0]],[direction('lfemur','ltibia'),legacy.samples[index].shins[0]]])assert.ok(distance(actual,expected)<3e-6);
  }
});

test('all compact poses reproduce actual smoothed source crops within the declared 0.05mm quantization',()=>{
  for(const clip of capturedFullBodyClips){
    const source=manifest.sources.find(item=>item.id===clip.sourceId),motion=motions.get(clip.sourceId),crop=sampleFullBodyCrop({...motion,landmarkNames:capturedFullBodyLandmarks},clip),decoded=decodeCapturedFullBodyClip(clip),encoded=encodeFullBodyValues(crop.values);
    assert.equal(clip.sampleCount,121);assert.equal(clip.stride,84);assert.equal(decoded.length,clip.stride*clip.sampleCount);assert.deepEqual(Array.from(decoded.slice(0,3)),[0,0,0]);
    assert.equal(encoded.quantizedLE,clip.quantizedLE);assert.equal(capturedFullBodyQuantization,.0001);
    for(let index=0;index<decoded.length;index++)assert.ok(Math.abs(decoded[index]-crop.values[index])<.0000502);
    const record=source.crops.find(item=>item.id===clip.id);assert.equal(sha(Buffer.from(clip.quantizedLE,'base64')),record.packedSHA256);
    assert.equal(record.seamMaxDistance,crop.seamMaxDistance);assert.ok(record.seamMaxDistance>.01);assert.match(clip.filter.loopCorrection,/none/);
  }
});

test('source payload carries independently changing torso, head, hips, elbows and knees rather than only tempo',()=>{
  for(const clip of capturedFullBodyClips){
    const values=decodeCapturedFullBodyClip(clip),range=channel=>{const a=Array.from({length:clip.sampleCount},(_,i)=>values[i*clip.stride+channel]);return Math.max(...a)-Math.min(...a);};
    assert.ok(range(1)>.02); // Actual source root vertical displacement.
    for(const [name,axis]of [['head',1],['lhumerus',2],['lfemur',2]])assert.ok(range(3+capturedFullBodyLandmarks.indexOf(name)*3+axis)>.02);
  }
});

test('malformed raw input and unrepresentable packed values fail without invented joints',()=>{
  const input=raw.get('cmu-79-93'),first=input.amc.replace(/\r?\n2\r?\n[\s\S]*$/,'');
  assert.throws(()=>parseCmuFullBody(input.asf,first,{fps:0}),/fps/);
  assert.throws(()=>parseCmuFullBody(input.asf,first.replace(/^[ \t]*lhumerus[ \t]+[^\r\n]*/m,''),{fps:60}),/Missing joint/);
  assert.throws(()=>parseCmuFullBody(input.asf,first.replace(/^[ \t]*root[ \t]+[^\r\n]*/m,'root NaN 0 0 0 0 0'),{fps:60}),/Missing root/);
  assert.throws(()=>parseCmuFullBody(input.asf,first.replace(/\n1\r?\n/,'\n2\n'),{fps:60}),/non-contiguous/);
  assert.throws(()=>sampleFullBodyCrop(motions.get('cmu-79-93'),{id:'bad',firstFrame:0,lastFrame:20}),/Invalid/);
  assert.throws(()=>encodeFullBodyValues([Infinity]),/Nonfinite/);assert.throws(()=>encodeFullBodyValues([10]),/Int16/);
  assert.throws(()=>decodeCapturedFullBodyClip({...capturedFullBodyClips[0],sampleCount:2}),/Corrupt/);
});
