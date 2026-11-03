import {createCourseAudio,defaultCourseAudioSettings} from './classes/course-audio.js';

export function createCourseAudioUI({app}){
  const storageKey='form.course-audio.v1';let settings={...defaultCourseAudioSettings},status=null,cue=null,lastClassId=null;
  try{Object.assign(settings,JSON.parse(localStorage.getItem(storageKey)||'{}'));}catch{}
  const text=(id,value)=>{const e=document.getElementById(id);if(e&&e.textContent!==value)e.textContent=value;};
  function paint(){
    text('course-audio-status',status?.audioError||status?.voiceError?'聲音暫時無法播放，可先查看口令字幕。':status?.unlocked?'音量與開關會自動保存。':'選課或按「開啟聲音」後開始播放。');
    text('course-cue-caption',cue?.text||'就位後，跟著倒數一起開始。');
    for(const kind of ['music','voice']){text(`course-${kind}-value`,`${Math.round(settings[`${kind}Volume`]*100)}%`);}
  }
  const savedSettings={...settings};
  const engine=createCourseAudio({onStatus:s=>{status=s;settings={...s.settings};paint();},onCue:c=>{cue=c;paint();}});
  settings=engine.setSettings(savedSettings);
  const unlock=()=>engine.unlock().catch(()=>{});
  function onClick(event){
    if(event.target.closest('[data-demo],[data-action="start"],[data-action="free"],[data-action="interact"],[data-action="audio-unlock"],[data-action="pause"],[data-action="course-restart"],[data-action="restart"]'))unlock();
  }
  function change(event){
    const e=event.target,channel=e.dataset.courseAudio;if(!channel)return;unlock();
    const key=`${channel}${e.type==='checkbox'?'Enabled':'Volume'}`;settings=engine.setSettings({[key]:e.type==='checkbox'?e.checked:Number(e.value)/100});
    try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}paint();
  }
  const onKey=e=>{if(e.key.toLowerCase()==='e'&&!e.repeat)unlock();};
  app.addEventListener('click',onClick);app.addEventListener('input',change);window.addEventListener('keydown',onKey);
  return{
    markup(){return `<div class="coach-cue" role="status" aria-live="polite"><small>教練口令</small><strong id="course-cue-caption">${cue?.text||'就位後，跟著倒數一起開始。'}</strong></div><details class="course-audio-settings"><summary>音樂與教練口令</summary>${[['music','背景音樂'],['voice','教練口令']].map(([kind,label])=>`<div class="audio-channel"><label class="audio-switch"><input type="checkbox" data-course-audio="${kind}" aria-label="播放${label}" ${settings[`${kind}Enabled`]?'checked':''}><span>${label}</span></label><div class="audio-volume"><input type="range" data-course-audio="${kind}" aria-label="${label}音量" min="0" max="100" step="1" value="${Math.round(settings[`${kind}Volume`]*100)}"><output id="course-${kind}-value">${Math.round(settings[`${kind}Volume`]*100)}%</output></div></div>`).join('')}<button class="secondary-button" data-action="audio-unlock">開啟聲音</button><p id="course-audio-status">音量與開關會自動保存。</p></details>`;},
    update(frame){if(!frame||!['counting-in','exercising','completed'].includes(frame.stage)){if(lastClassId){engine.stop();cue=null;lastClassId=null;paint();}return;}if(lastClassId!==frame.id){cue=null;lastClassId=frame.id;}engine.update({...frame,activityStage:frame.stage,paused:frame.stage==='completed'?false:frame.paused});},
    repaint:paint,unlock,
    stop(){engine.stop();lastClassId=null;cue=null;paint();},getDiagnostics:()=>engine.getDiagnostics(),
    dispose(){engine.dispose();app.removeEventListener('click',onClick);app.removeEventListener('input',change);window.removeEventListener('keydown',onKey);},
  };
}
