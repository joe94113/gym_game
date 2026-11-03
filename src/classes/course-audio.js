import {createCourseCueScheduler,courseAudioCues,courseCountInCues} from './course-audio-cues.js';
import {courseVoiceManifest} from './course-voice-manifest.js';
import {publicAssetUrl} from '../asset-url.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));
export const defaultCourseAudioSettings=Object.freeze({musicEnabled:true,musicVolume:.45,voiceEnabled:true,voiceVolume:.85});
const arrangements={
  warmup:{bpm:92,roots:[50,55,57,53],ambient:false,dense:false},
  dance:{bpm:120,roots:[50,58,53,57],ambient:false,dense:true},
  cycle:{bpm:116,roots:[45,48,43,50],ambient:false,dense:true},
  trx:{bpm:100,roots:[45,50,48,43],ambient:false,dense:false},
  barbell:{bpm:100,roots:[40,43,45,47],ambient:false,dense:false},
  aerial:{bpm:64,roots:[50,57,55,53],ambient:true,dense:false},
  pilates:{bpm:72,roots:[48,55,53,57],ambient:true,dense:false},
};
export function courseMusicProfile(kind,stage='main'){
  kind=kind==='group-class'?'warmup':String(kind||'warmup').replace(/^class-/,'');
  const source=arrangements[kind]||arrangements.warmup;
  return{...source,roots:[...source.roots],kind,stage,bpm:source.bpm*(stage==='warmup'?.82:stage==='cooldown'?.64:1),energy:stage==='main'?1:stage==='warmup'?.65:.32};
}
export function chooseChineseVoice(voices=[]){
  return voices.filter(v=>/^(?:zh|cmn)(?:-|_|$)/i.test(v.lang||'')).map((voice,index)=>({voice,index,score:/^(?:zh|cmn)[-_](?:TW|Hant)(?:[-_]|$)/i.test(voice.lang)?100:/Hant|HK/i.test(voice.lang)?80:60})).sort((a,b)=>b.score-a.score||Number(!!b.voice.localService)-Number(!!a.voice.localService)||a.index-b.index)[0]?.voice||null;
}

/** Browser sound engine. Call unlock directly from a click/key handler. */
export function createCourseAudio({onCue=()=>{},onStatus=()=>{},environment=globalThis}={}){
  const scheduler=createCourseCueScheduler(),synth=environment.speechSynthesis;
  const Utterance=environment.SpeechSynthesisUtterance,Context=environment.AudioContext||environment.webkitAudioContext;
  let settings={...defaultCourseAudioSettings},context=null,master=null,duck=null,noise=null;
  let unlocked=false,disposed=false,voice=null,voices=[],currentSpeech=null,currentRecorded=null,pendingVoice=false,speechGeneration=0;
  let frame=null,profile=null,musicKey='',nextTime=0,step=0,ducking=false,lastCue=null,lastStatus='',voiceError='',audioError='';
  const activeNodes=new Set(),buffers=new Map(),loading=new Map();
  const recordedSupported=!!(Context&&environment.fetch);
  const stats={musicSteps:0,musicNotes:0,utterances:0,recordedPlays:0,assetRequests:0,cancellations:0,cues:0};
  function diagnostics(){return{
    unlocked,disposed,audioSupported:!!Context,audioState:context?.state||'locked',audioError,
    voiceSupported:recordedSupported||!!(synth&&Utterance),voiceAvailable:recordedSupported||!!voice,voiceName:recordedSupported?'中文教練':voice?.name||'',voiceLang:recordedSupported?'zh-TW':voice?.lang||'',voiceLocal:recordedSupported?true:voice?.localService??null,voiceError,
    voiceSource:recordedSupported?'recorded':voice?'speech':'unavailable',systemVoiceName:voice?.name||'',cachedVoiceClips:buffers.size,pendingVoiceClips:loading.size,
    voiceMessage:voiceError?'語音暫時無法播放，口令會顯示在畫面上。':recordedSupported?'中文教練口令已備妥。':!synth||!Utterance?'這個瀏覽器不支援中文語音，口令會顯示在畫面上。':!voice?'目前沒有可用的中文聲音，口令會顯示在畫面上。':`教練語音：${voice.name}`,
    musicMessage:!Context?'這個瀏覽器不支援背景音樂。':audioError?'背景音樂暫時無法播放。':!unlocked||context?.state!=='running'?'點一下音效按鈕，開啟課程聲音。':'原創課程音樂',
    voices:voices.map(v=>({name:v.name,lang:v.lang,localService:v.localService})),settings:{...settings},ducking,
    musicProfile:profile?{kind:profile.kind,stage:profile.stage,bpm:profile.bpm}:null,
    activeMusicNodes:activeNodes.size,lastCue,course:frame?{id:frame.id,kind:frame.kind,elapsed:frame.elapsed,paused:frame.paused,previewed:frame.previewed}:null,...stats,
  };}
  function report(){
    const d=diagnostics(),key=JSON.stringify([d.unlocked,d.audioState,d.audioError,d.voiceAvailable,d.voiceName,d.voiceError,d.voiceMessage,d.settings]);
    if(key!==lastStatus){lastStatus=key;onStatus(d);}
  }
  function refreshVoices(){try{voices=synth?.getVoices?.()||[];voice=chooseChineseVoice(voices);}catch{voices=[];voice=null;}report();}
  function setParam(param,value,time=context?.currentTime||0,fade=.05){
    if(!param)return;param.cancelScheduledValues(time);param.setTargetAtTime(value,time,fade);
  }
  function setDucking(value){ducking=value;setParam(duck?.gain,value?.25:1,undefined,.055);}
  function cancelSpeech(){
    if(!currentSpeech&&!currentRecorded&&!pendingVoice)return;
    const recorded=currentRecorded,hadSpeech=!!currentSpeech;
    currentSpeech=null;currentRecorded=null;pendingVoice=false;speechGeneration++;stats.cancellations++;
    if(hadSpeech)try{synth?.cancel();}catch{}
    if(recorded){try{recorded.stop();}catch{}try{recorded.disconnect();}catch{}}
    setDucking(false);
  }
  function stopMusic(){
    for(const source of activeNodes){try{source.stop();}catch{}try{source.disconnect();}catch{}}
    activeNodes.clear();musicKey='';nextTime=0;
  }
  function remember(source,gain,filter){
    activeNodes.add(source);source.onended=()=>{activeNodes.delete(source);source.disconnect();gain.disconnect();filter?.disconnect();};stats.musicNotes++;
  }
  function tone(frequency,time,duration,level,type='triangle',slide=0){
    const osc=context.createOscillator(),gain=context.createGain();osc.type=type;
    osc.frequency.setValueAtTime(frequency,time);if(slide)osc.frequency.exponentialRampToValueAtTime(slide,time+duration*.8);
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level),time+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,time+duration);osc.connect(gain);gain.connect(master);remember(osc,gain);osc.start(time);osc.stop(time+duration+.02);
  }
  function percussion(time,duration,level,frequency){
    const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();source.buffer=noise;
    filter.type='highpass';filter.frequency.value=frequency;gain.gain.setValueAtTime(level,time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    source.connect(filter);filter.connect(gain);gain.connect(master);remember(source,gain,filter);source.start(time);source.stop(time+duration+.01);
  }
  const hz=midi=>440*2**((midi-69)/12);
  function playStep(p,time,duration,index){
    const beat=index%8,bar=Math.floor(index/8),root=p.roots[Math.floor(bar/2)%4],energy=p.energy;
    if(p.ambient){
      if(beat===0)for(const interval of [0,7,12,15])tone(hz(root+interval),time,Math.min(4,duration*15),.035*energy,'sine');
      if(beat===2||beat===6)tone(hz(root+24+(bar%2?7:3)),time,duration*3,.04*energy,'triangle');
      return;
    }
    if(beat%2===0){tone(96,time,.16,.28*energy,'sine',42);tone(hz(root+(beat===4?7:0)),time,duration*1.3,.12*energy,'triangle');}
    if(beat===2||beat===6)percussion(time,.11,.10*energy,1300);
    if(p.dense||beat%2===0)percussion(time,.035,.035*energy,6500);
    if(beat===0)for(const interval of [12,15,19])tone(hz(root+interval),time,duration*5,.042*energy);
    if(p.dense&&beat%2===1)tone(hz(root+24+[0,3,7,10][Math.floor(beat/2)]),time,duration*.7,.04*energy,'sine');
  }
  function scheduleMusic(force=false){
    if(!context||context.state!=='running'||!frame||frame.paused||['counting-in','entering','returning','exiting','preparing'].includes(frame.activityStage)||frame.elapsed>=frame.duration||!settings.musicEnabled||settings.musicVolume<=0)return;
    const p=courseMusicProfile(frame.kind,frame.stage),speed=clamp(frame.speed||1,.25,2),key=`${frame.id}/${p.kind}/${p.stage}/${speed}`;
    if(force||key!==musicKey){stopMusic();musicKey=key;nextTime=context.currentTime+.025;step=Math.floor(frame.elapsed*p.bpm/30);}
    profile=p;const duration=30/p.bpm/speed;
    if(nextTime<context.currentTime-.05){nextTime=context.currentTime+.025;step=Math.floor(frame.elapsed*p.bpm/30);}
    let scheduled=0;
    while(nextTime<context.currentTime+.16&&scheduled++<8){playStep(p,nextTime,duration,step++);nextTime+=duration;stats.musicSteps++;}
  }
  function loadClip(text){
    const entry=courseVoiceManifest[text];
    if(!entry||!context||!environment.fetch)return Promise.reject(new Error('No recorded cue'));
    if(buffers.has(entry.file)){const buffer=buffers.get(entry.file);buffers.delete(entry.file);buffers.set(entry.file,buffer);return Promise.resolve(buffer);}
    if(loading.has(entry.file))return loading.get(entry.file);
    stats.assetRequests++;
    const promise=Promise.resolve().then(()=>environment.fetch(publicAssetUrl(`audio/course-voice/${entry.file}`))).then(response=>{if(!response.ok)throw new Error('Voice clip could not load');return response.arrayBuffer();}).then(data=>context.decodeAudioData(data)).then(buffer=>{
      if(disposed)return buffer;buffers.set(entry.file,buffer);while(buffers.size>4)buffers.delete(buffers.keys().next().value);return buffer;
    }).finally(()=>loading.delete(entry.file));
    loading.set(entry.file,promise);return promise;
  }
  function prefetchNext(){
    if(!recordedSupported||!context||!frame||!settings.voiceEnabled)return;
    const next=frame.activityStage==='counting-in'?courseCountInCues.find(c=>c.remaining===Math.ceil(frame.countInRemaining)-1)||courseAudioCues(frame.kind)[0]:courseAudioCues(frame.kind).find(c=>c.at>frame.elapsed);
    if(next)loadClip(next.text).catch(()=>{});
  }
  function speakWithSystem(cue,generation){
    if(generation!==speechGeneration||!voice||!synth||!Utterance)return false;
    pendingVoice=false;const utterance=new Utterance(cue.text);currentSpeech=utterance;
    utterance.voice=voice;utterance.lang=voice.lang||'zh-TW';utterance.volume=settings.voiceVolume;utterance.rate=cue.type==='countdown'?1.2:1.04;utterance.pitch=1;
    utterance.onstart=()=>{if(currentSpeech===utterance&&generation===speechGeneration)setDucking(true);};
    const finish=event=>{if(currentSpeech!==utterance||generation!==speechGeneration)return;currentSpeech=null;setDucking(false);if(event?.error&&!['canceled','interrupted'].includes(event.error)){voiceError=event.error;report();}};
    utterance.onend=finish;utterance.onerror=finish;
    try{synth.cancel();synth.speak(utterance);stats.utterances++;voiceError='';setDucking(true);return true;}
    catch(error){currentSpeech=null;setDucking(false);voiceError=String(error?.message||error);report();return false;}
  }
  function speak(cue){
    if(!unlocked||!settings.voiceEnabled||settings.voiceVolume<=0)return false;
    cancelSpeech();const generation=++speechGeneration;
    if(recordedSupported&&context?.state==='running'&&courseVoiceManifest[cue.text]){
      pendingVoice=true;
      loadClip(cue.text).then(buffer=>{
        if(generation!==speechGeneration||disposed||frame?.paused)return;
        const maxLate=cue.type==='countdown'?.65:2;
        if(cue.type!=='count-in'&&frame&&frame.elapsed-cue.at>maxLate){pendingVoice=false;return;}
        const source=context.createBufferSource();source.buffer=buffer;source.connect(voiceGain);currentRecorded=source;pendingVoice=false;
        source.onended=()=>{source.disconnect();if(currentRecorded!==source)return;currentRecorded=null;setDucking(false);};
        source.start();stats.recordedPlays++;voiceError='';setDucking(true);report();
      }).catch(error=>{
        if(generation!==speechGeneration||disposed)return;
        pendingVoice=false;if(!speakWithSystem(cue,generation)){voiceError=String(error?.message||error);report();}
      });
      return true;
    }
    return speakWithSystem(cue,generation);
  }
  let voiceGain=null;
  async function unlock(){
    if(disposed)return diagnostics();unlocked=true;refreshVoices();
    try{
      if(!context&&Context){context=new Context();master=context.createGain();duck=context.createGain();voiceGain=context.createGain();master.connect(duck);duck.connect(context.destination);voiceGain.connect(context.destination);master.gain.value=settings.musicVolume*.23;duck.gain.value=1;voiceGain.gain.value=settings.voiceVolume;
        noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const samples=noise.getChannelData(0);let seed=9137;for(let i=0;i<samples.length;i++){seed=(seed*16807)%2147483647;samples[i]=(seed/2147483647)*2-1;}
      }
      if(context?.state==='suspended')await context.resume();
      if(context&&context.state!=='running')audioError='AudioContext is not running';else audioError='';
      scheduleMusic();
    }catch(error){audioError=String(error?.message||error);}
    report();return diagnostics();
  }
  function update(input){
    if(disposed)return;
    if(!input||!input.id){stop();return;}
    const previous=frame;frame={...input,kind:input.kind||(input.id==='group-class'?'warmup':input.id.replace(/^class-/,'')),activityStage:input.stage,stage:input.segment?.stage||(['warmup','main','cooldown'].includes(input.stage)?input.stage:'warmup')};
    const result=scheduler.update(frame);
    if(result.discontinuity){cancelSpeech();if(result.reason!=='resume')stopMusic();}
    if(frame.paused||['counting-in','entering','returning','exiting','preparing'].includes(frame.activityStage)||frame.elapsed>=frame.duration)stopMusic();else scheduleMusic();
    for(const cue of result.cues){const spoken=speak(cue);lastCue={...cue,spoken};stats.cues++;onCue(lastCue);}
    prefetchNext();
    if(previous?.paused!==frame.paused)report();
  }
  function setSettings(next={}){
    for(const key of ['musicEnabled','voiceEnabled'])if(key in next)settings[key]=!!next[key];
    for(const key of ['musicVolume','voiceVolume'])if(key in next)settings[key]=clamp(next[key]);
    if(!settings.voiceEnabled||settings.voiceVolume<=0)cancelSpeech();
    else if(currentSpeech)currentSpeech.volume=settings.voiceVolume;
    setParam(master?.gain,settings.musicVolume*.23);
    setParam(voiceGain?.gain,settings.voiceVolume);
    if(!settings.musicEnabled||settings.musicVolume<=0)stopMusic();else scheduleMusic();report();return{...settings};
  }
  function stop(){cancelSpeech();stopMusic();scheduler.reset();frame=null;profile=null;lastCue=null;report();}
  function dispose(){if(disposed)return;stop();disposed=true;buffers.clear();synth?.removeEventListener?.('voiceschanged',refreshVoices);try{context?.close()?.catch?.(()=>{});}catch{}report();}
  synth?.addEventListener?.('voiceschanged',refreshVoices);refreshVoices();
  return{unlock,update,setSettings,getSettings:()=>({...settings}),getDiagnostics:diagnostics,stop,dispose};
}
