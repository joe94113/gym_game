import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {coursePlans} from '../src/classes/course-plans.js';
import {coursePlanFor} from '../src/classes/class-timeline.js';
import {courseAudioCues,courseCountInCues,createCourseCueScheduler} from '../src/classes/course-audio-cues.js';
import {createCourseAudio,chooseChineseVoice,courseMusicProfile} from '../src/classes/course-audio.js';
import {courseVoiceManifest} from '../src/classes/course-voice-manifest.js';

test('all authored courses have unique start, next-move, rest, 3-2-1 and completion thresholds',()=>{
  for(const kind of Object.keys(coursePlans)){
    const plan=coursePlanFor(kind),cues=courseAudioCues(kind);
    assert.equal(new Set(cues.map(c=>c.id)).size,cues.length);
    assert.equal(cues[0].at,0);assert.equal(cues[0].type,'course-start');
    assert.equal(cues.at(-1).at,plan.duration);assert.equal(cues.at(-1).type,'course-complete');
    assert.equal(cues.filter(c=>c.type==='countdown').length,plan.blocks.length*3);
    assert.equal(cues.filter(c=>c.type==='prepare-next').length,plan.blocks.length-1);
    assert.ok(cues.every((cue,i)=>cue.text&&cue.at>=0&&(!i||cue.at>=cues[i-1].at)));
    if(['barbell','trx','cycle','dance','pilates','aerial'].includes(kind))assert.ok(cues.some(c=>c.type==='rest-start'),kind);
  }
});

test('elapsed thresholds deliver each cue exactly once through all seven complete courses',()=>{
  for(const kind of Object.keys(coursePlans)){
    const scheduler=createCourseCueScheduler(),duration=coursePlanFor(kind).duration,heard=[];
    for(let tick=0;tick<=duration*5;tick++)heard.push(...scheduler.update({id:kind,kind,elapsed:tick/5}).cues.map(c=>c.id));
    assert.deepEqual(heard,courseAudioCues(kind).map(c=>c.id),kind);
    for(let i=0;i<5;i++)assert.equal(scheduler.update({id:kind,kind,elapsed:duration}).cues.length,0);
  }
});

test('pause, seek, preview end, switching and restart never replay a backlog',()=>{
  const s=createCourseCueScheduler(),frame={id:'class-dance',kind:'dance',elapsed:0};
  assert.equal(s.update({...frame,paused:true}).cues.length,0);
  assert.equal(s.update(frame).cues[0].type,'course-start');
  assert.equal(s.update(frame).cues.length,0);
  assert.equal(s.update({...frame,elapsed:66}).cues.length,0);
  assert.equal(s.update({...frame,elapsed:67}).cues[0].type,'prepare-next');
  assert.equal(s.update({...frame,elapsed:67,paused:true}).cues.length,0);
  assert.equal(s.update({...frame,elapsed:67}).cues.length,0);
  assert.equal(s.update({...frame,elapsed:800,previewed:true}).cues.length,0);
  assert.equal(s.update({...frame,elapsed:1800,previewed:true}).cues.length,0);
  assert.equal(s.update({...frame,elapsed:1799,previewed:true,paused:true}).cues.length,0);
  assert.equal(s.update({...frame,elapsed:1799,previewed:true}).cues.length,0);
  assert.match(s.update({...frame,elapsed:1800,previewed:true}).cues[0].text,/預覽/);
  assert.equal(s.update({...frame,elapsed:0}).cues[0].type,'course-start');
  assert.equal(s.update({id:'class-trx',kind:'trx',elapsed:0}).cues[0].type,'course-start');
});

test('a slow frame emits only the newest relevant cue and a suspended tab skips history',()=>{
  const s=createCourseCueScheduler();s.update({kind:'dance',elapsed:70});
  const crossed=s.update({kind:'dance',elapsed:72.4});assert.equal(crossed.cues.length,1);assert.equal(crossed.cues[0].at,72);
  const jump=s.update({kind:'dance',elapsed:1500});assert.equal(jump.reason,'seek');assert.equal(jump.cues.length,0);
});

test('voice preference is Taiwan Mandarin, then other Chinese; it never uses English for Chinese cues',()=>{
  const cn={name:'Chinese',lang:'zh-CN',localService:true},tw={name:'Taiwan',lang:'zh-TW'},en={name:'English',lang:'en-US'};
  assert.equal(chooseChineseVoice([en,cn,tw]),tw);assert.equal(chooseChineseVoice([en,cn]),cn);assert.equal(chooseChineseVoice([en]),null);
  assert.equal(chooseChineseVoice([{name:'Hant',lang:'zh-Hant-TW'},tw]).name,'Hant');
});

test('music arrangement changes with course and stage, with softer slower cooldowns',()=>{
  const main=Object.keys(coursePlans).map(kind=>courseMusicProfile(kind,'main'));
  assert.equal(new Set(main.map(p=>JSON.stringify(p))).size,7);
  for(const p of main){const warm=courseMusicProfile(p.kind,'warmup'),cool=courseMusicProfile(p.kind,'cooldown');assert.ok(p.bpm>warm.bpm&&warm.bpm>cool.bpm);assert.ok(p.energy>warm.energy&&warm.energy>cool.energy);}
  assert.equal(courseMusicProfile('aerial').ambient,true);assert.equal(courseMusicProfile('dance').dense,true);
});

function browserMock(initialVoices=[{name:'Taiwan',lang:'zh-TW',localService:true}]){
  const calls={utterances:[],oscillators:[],buffers:[],cancel:0,contexts:[]},listeners=new Map();
  const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;},exponentialRampToValueAtTime(value){this.value=value;}});
  const node=()=>({connect(){},disconnect(){},stop(time){this.stopped=true;if(time===undefined)this.onended?.();},start(time){this.startedAt=time;}});
  class AudioContext{
    constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination={};calls.contexts.push(this);}
    createGain(){return{...node(),gain:param()};}
    createOscillator(){const n={...node(),frequency:param()};calls.oscillators.push(n);return n;}
    createBufferSource(){const n=node();calls.buffers.push(n);return n;}
    createBiquadFilter(){return{...node(),frequency:param()};}
    createBuffer(channels,length){return{getChannelData:()=>new Float32Array(length)};}
    async resume(){this.state='running';}
    async close(){this.state='closed';}
  }
  const synth={voices:initialVoices,getVoices(){return this.voices;},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name),cancel(){calls.cancel++;},speak(u){calls.utterances.push(u);u.onstart?.();}};
  class SpeechSynthesisUtterance{constructor(text){this.text=text;}}
  return{environment:{AudioContext,speechSynthesis:synth,SpeechSynthesisUtterance},calls,synth,listeners,refresh:()=>listeners.get('voiceschanged')?.()};
}
const dance=elapsed=>({id:'class-dance',kind:'dance',elapsed,duration:1800,stage:'warmup',paused:false,speed:1,previewed:false});

test('engine unlock uses real speech interface, polyphonic audio nodes and separate volumes',async()=>{
  const mock=browserMock(),captions=[];const audio=createCourseAudio({environment:mock.environment,onCue:c=>captions.push(c)});
  assert.equal(mock.calls.contexts.length,0);await audio.unlock();audio.update(dance(0));
  assert.equal(mock.calls.contexts.length,1);assert.equal(mock.calls.utterances.length,1);assert.match(mock.calls.utterances[0].text,/開始/);
  assert.equal(mock.calls.utterances[0].lang,'zh-TW');assert.equal(captions[0].spoken,true);assert.equal(audio.getDiagnostics().ducking,true);
  assert.ok(mock.calls.oscillators.length>=5,'bass, drum and chord voices must be scheduled');assert.ok(mock.calls.buffers.length>0);
  audio.setSettings({musicVolume:.2,voiceVolume:.7});assert.equal(audio.getSettings().musicVolume,.2);assert.equal(mock.calls.utterances[0].volume,.7);
  audio.setSettings({musicEnabled:false});assert.equal(audio.getDiagnostics().activeMusicNodes,0);assert.equal(audio.getSettings().voiceEnabled,true);
  audio.setSettings({musicEnabled:true,voiceEnabled:false});assert.ok(audio.getDiagnostics().activeMusicNodes>0);assert.equal(audio.getDiagnostics().ducking,false);
  audio.dispose();assert.equal(mock.calls.contexts[0].state,'closed');assert.equal(mock.listeners.size,0);
});

test('voiceschanged selects late Chinese speech, and unavailable speech is explicit without losing captions',async()=>{
  const mock=browserMock([{name:'English',lang:'en-US'}]),captions=[],statuses=[];
  const audio=createCourseAudio({environment:mock.environment,onCue:c=>captions.push(c),onStatus:s=>statuses.push(s)});
  await audio.unlock();audio.update(dance(0));assert.equal(mock.calls.utterances.length,0);assert.equal(captions[0].spoken,false);assert.match(audio.getDiagnostics().voiceMessage,/沒有可用的中文/);
  mock.synth.voices=[{name:'Taiwan',lang:'zh-TW',localService:true}];mock.refresh();assert.equal(audio.getDiagnostics().voiceAvailable,true);
  assert.equal(mock.calls.utterances.length,0,'late voices must not replay missed cues');
  audio.update(dance(66));audio.update(dance(67));assert.equal(mock.calls.utterances.length,1);assert.match(mock.calls.utterances[0].text,/八秒後/);assert.ok(statuses.length>=2);audio.dispose();
});

test('pause, seek, speed changes and old speech callbacks cannot leave stale sound or ducking',async()=>{
  const mock=browserMock(),audio=createCourseAudio({environment:mock.environment});await audio.unlock();audio.update(dance(0));
  const old=mock.calls.utterances.at(-1);audio.update({...dance(.2),paused:true});assert.equal(audio.getDiagnostics().activeMusicNodes,0);assert.equal(audio.getDiagnostics().ducking,false);
  audio.update({...dance(600),paused:true,previewed:true});audio.update({...dance(600),previewed:true});assert.equal(mock.calls.utterances.length,1);
  audio.update({...dance(66),paused:true});audio.update(dance(66));audio.update(dance(67));assert.equal(mock.calls.utterances.length,2);
  old.onend();assert.equal(audio.getDiagnostics().ducking,true,'canceled old event must not unduck a new cue');
  mock.calls.utterances.at(-1).onend();assert.equal(audio.getDiagnostics().ducking,false);
  audio.update({...dance(67.1),speed:.4});assert.ok(audio.getDiagnostics().activeMusicNodes>0);
  audio.stop();assert.equal(audio.getDiagnostics().activeMusicNodes,0);assert.equal(audio.getDiagnostics().course,null);audio.dispose();
});

test('missing browser sound APIs remain usable and invalid settings are bounded',async()=>{
  const captions=[],audio=createCourseAudio({environment:{},onCue:c=>captions.push(c)});
  await audio.unlock();audio.update(dance(0));assert.equal(captions.length,1);assert.equal(captions[0].spoken,false);
  assert.match(audio.getDiagnostics().voiceMessage,/不支援/);assert.equal(audio.getDiagnostics().audioSupported,false);
  audio.setSettings({musicVolume:9,voiceVolume:-2});assert.equal(audio.getSettings().musicVolume,1);assert.equal(audio.getSettings().voiceVolume,0);
  audio.dispose();audio.update(dance(67));assert.equal(captions.length,1);
});

test('three-second runtime count-in speaks 3, 2, 1 once and starts the authored clock only in exercising',()=>{
  const s=createCourseCueScheduler(),f={id:'class-dance',kind:'dance',elapsed:0,stage:'counting-in'};
  assert.equal(s.update({...f,stage:'entering'}).cues.length,0);
  assert.equal(s.update({...f,countInRemaining:3}).cues[0].text,'三');
  assert.equal(s.update({...f,countInRemaining:3}).cues.length,0);
  assert.equal(s.update({...f,countInRemaining:2}).cues[0].text,'二');
  assert.equal(s.update({...f,countInRemaining:1,paused:true}).cues.length,0);
  assert.equal(s.update({...f,countInRemaining:1}).cues.length,0,'resume does not repeat a stale count');
  assert.equal(s.update({...f,countInRemaining:0}).cues.length,0);
  assert.equal(s.update({...f,stage:'exercising'}).cues[0].type,'course-start');
  assert.equal(s.update({...f,stage:'exercising'}).cues.length,0);
});

test('every original cue has a real mono 16 kHz 16-bit offline WAV and a matching manifest entry',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/audio/course-voice/manifest.json',import.meta.url)));
  const phrases=new Set([...Object.keys(coursePlans).flatMap(kind=>courseAudioCues(kind).map(c=>c.text)),...courseCountInCues.map(c=>c.text),'預覽到這裡結束。']);
  assert.equal(manifest.voice,'Microsoft Hanhan Desktop');assert.equal(new Set(manifest.phrases.map(p=>p.text)).size,manifest.phrases.length);
  for(const text of phrases){
    const entry=courseVoiceManifest[text];assert.ok(entry,text);const wav=readFileSync(new URL(`../public/audio/course-voice/${entry.file}`,import.meta.url));
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
    let format=null,dataBytes=0,peak=0;
    for(let offset=12;offset+8<=wav.length;){const kind=wav.toString('ascii',offset,offset+4),bytes=wav.readUInt32LE(offset+4);if(kind==='fmt ')format={encoding:wav.readUInt16LE(offset+8),channels:wav.readUInt16LE(offset+10),sampleRate:wav.readUInt32LE(offset+12),bits:wav.readUInt16LE(offset+22)};if(kind==='data'){dataBytes=bytes;for(let i=offset+8;i<offset+8+bytes;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));}offset+=8+bytes+(bytes%2);}
    assert.deepEqual(format,{encoding:1,channels:1,sampleRate:16000,bits:16});assert.ok(dataBytes>1000);assert.ok(peak>500,'recorded speech must have an audible non-silent waveform');assert.ok(entry.duration>0);assert.ok(Math.abs(entry.duration-dataBytes/32000)<.0001);
  }
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('bundled speech plays without system voices, loads only current and next cues, and cancels cleanly',async()=>{
  const mock=browserMock([]),requests=[];mock.environment.fetch=async url=>{requests.push(url);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
  mock.environment.AudioContext.prototype.decodeAudioData=async()=>({duration:.5});
  const audio=createCourseAudio({environment:mock.environment});await audio.unlock();
  audio.update({...dance(0),stage:'counting-in',countInRemaining:3});await settle();
  assert.equal(requests.length,2,'current three and upcoming two only');assert.equal(audio.getDiagnostics().recordedPlays,1);assert.equal(audio.getDiagnostics().voiceSource,'recorded');
  assert.equal(mock.calls.utterances.length,0);assert.equal(audio.getDiagnostics().ducking,true);assert.equal(audio.getDiagnostics().activeMusicNodes,0);
  audio.update({...dance(0),stage:'counting-in',countInRemaining:2});await settle();assert.equal(requests.length,3);assert.equal(audio.getDiagnostics().recordedPlays,2);
  audio.setSettings({voiceVolume:.3,musicVolume:.7});assert.deepEqual(audio.getSettings(),{musicEnabled:true,musicVolume:.7,voiceEnabled:true,voiceVolume:.3});
  audio.update({...dance(0),stage:'counting-in',countInRemaining:2,paused:true});assert.equal(audio.getDiagnostics().ducking,false);
  audio.dispose();
});

test('unavailable recordings use real system speech and paused pending downloads never speak later',async()=>{
  const mock=browserMock();mock.environment.fetch=async()=>({ok:false});mock.environment.AudioContext.prototype.decodeAudioData=async()=>({duration:.5});
  const audio=createCourseAudio({environment:mock.environment});await audio.unlock();audio.update(dance(0));await settle();assert.equal(mock.calls.utterances.length,1);audio.dispose();
  const pending=browserMock([]),responses=[];pending.environment.fetch=()=>new Promise(resolve=>responses.push(resolve));pending.environment.AudioContext.prototype.decodeAudioData=async()=>({duration:.5});
  const later=createCourseAudio({environment:pending.environment});await later.unlock();later.update(dance(0));await settle();later.update({...dance(.1),paused:true});
  for(const resolve of responses)resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await settle();assert.equal(later.getDiagnostics().recordedPlays,0);assert.equal(later.getDiagnostics().ducking,false);later.dispose();
});
