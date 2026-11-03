import {activityById} from './activity-catalog.js';
export const trainingGoals=[['strength','增肌與基礎肌力'],['cardio','心肺入門'],['mobility','伸展與活動度']];
export const trainingFocuses=[['fullbody','全身'],['chest','胸部'],['back','背部'],['legs','腿與臀部'],['shoulders','肩部'],['arms','手臂']];
export const defaultTrainingProfile=Object.freeze({goal:'strength',focus:'fullbody',experience:'new',minutes:30,volumeStep:0});
export function normalizeTrainingProfile(value={}){
 const v=value&&typeof value==='object'?value:{};
 return{goal:trainingGoals.some(([id])=>id===v.goal)?v.goal:'strength',focus:trainingFocuses.some(([id])=>id===v.focus)?v.focus:'fullbody',experience:v.experience==='regular'?'regular':'new',minutes:[15,30,45].includes(Number(v.minutes))?Number(v.minutes):30,volumeStep:Math.max(-1,Math.min(1,Math.round(Number(v.volumeStep)||0)))};
}
const routines={
 fullbody:{new:['machine-chest-press','machine-lat-pulldown','machine-leg-press','machine-seated-row','machine-shoulder-press'],regular:['dumbbell-bench-press','single-arm-cable-row','dumbbell-goblet-squat','dumbbell-romanian-deadlift','dumbbell-shoulder-press']},
 chest:{new:['machine-chest-press','machine-plate-incline-press','machine-seated-row','machine-pec-deck'],regular:['dumbbell-bench-press','machine-plate-incline-press','single-arm-cable-row','machine-pec-deck']},
 back:{new:['machine-lat-pulldown','machine-seated-row','machine-plate-high-row','machine-chest-press'],regular:['single-arm-cable-row','dumbbell-single-arm-row','machine-lat-pulldown','machine-chest-press']},
 legs:{new:['machine-leg-press','machine-leg-curl','machine-hip-thrust','machine-calf-raise','machine-leg-extension'],regular:['dumbbell-goblet-squat','dumbbell-romanian-deadlift','machine-leg-press','machine-hip-thrust','machine-calf-raise']},
 shoulders:{new:['machine-shoulder-press','machine-lateral-raise','machine-seated-row'],regular:['dumbbell-shoulder-press','dumbbell-lateral-raise','single-arm-cable-row']},
 arms:{new:['machine-preacher-curl','rope-pushdown','machine-seated-row'],regular:['dumbbell-hammer-curl','rope-pushdown','cable-straight-bar-curl','machine-seated-row']},
};
const stretches=['kneeling-hip-flexor-stretch','standing-hamstring-stretch','seated-glute-stretch','standing-chest-shoulder-stretch','standing-calf-stretch','standing-thoracic-rotation'];
const named=id=>activityById(id)?.name||id;
const goalName=id=>trainingGoals.find(([key])=>key===id)?.[1];
const focusName=id=>trainingFocuses.find(([key])=>key===id)?.[1];
/** A transparent single-session suggestion. Watching animation never upgrades
 * this profile or records a real exercise repetition. */
export function createTrainingPlan(value){
 const profile=normalizeTrainingProfile(value),{goal,focus,experience,minutes,volumeStep}=profile;
 const warmup=minutes===15?3:5,cooldown=minutes===15?3:5,budget=minutes-warmup-cooldown;
 const steps=[{id:'machine-bike',stage:'warmup',label:'暖身',minutes:warmup,prescription:`輕鬆踩 ${warmup} 分鐘`,cue:'先用能輕鬆交談的速度，慢慢準備好身體。'}];
 let used=0;
 if(goal==='strength'){
  const desiredSets=Math.max(1,Math.min(3,(experience==='new'?1:2)+volumeStep)),restSeconds=experience==='new'?75:60,repetitions=volumeStep<0?'8～10':'8～12';
  const base=routines[focus][experience].filter(activityById),maxMoves=minutes===15?3:minutes===30?4:5,duration=s=>Math.ceil((s*10*4+Math.max(0,s-1)*restSeconds+60)/60*2)/2;
  const selected=base.slice(0,Math.min(maxMoves,Math.floor(budget/duration(1)))).map(id=>({id,sets:1}));let allocation=selected.length*duration(1);
  for(let set=2;set<=desiredSets;set++)for(const item of selected){const extra=duration(set)-duration(item.sets);if(allocation+extra<=budget){item.sets=set;allocation+=extra;}}
  for(const {id,sets}of selected){
   const estimate=duration(sets);
   steps.push({id,stage:'main',label:'主要訓練',minutes:estimate,sets,repetitions,restSeconds,prescription:`${sets} 組 × ${repetitions} 下${sets>1?`，組間休息 ${restSeconds} 秒`:''}`,cue:'選能穩定控制、保留餘裕的重量；遊戲不會替你估算公斤數。'});used+=estimate;
  }
 }else if(goal==='cardio'){
  // One continuous station avoids inventing intensity changes from a demo loop.
  const id=experience==='new'?'machine-treadmill':'machine-elliptical';used=budget;
  steps.push({id,stage:'main',label:'心肺活動',minutes:budget,prescription:volumeStep<0?`分段進行，共 ${budget} 分鐘，放慢速度`:volumeStep>0?`${budget} 分鐘，稍加快節奏，仍能完整說話`:`${budget} 分鐘，能說話、不勉強追速度`,cue:volumeStep<0?'覺得吃力就先放慢，必要時分成幾段。':'依自己的感受調整速度；人物動畫的節奏不是你的體能量測。'});
 }else{
  const selected=stretches.slice(0,minutes===15?4:6),each=Math.min(volumeStep<0?1:volumeStep>0?2.5:2,Math.floor(budget/selected.length*2)/2);
  for(const id of selected){steps.push({id,stage:'main',label:'伸展與活動',minutes:each,prescription:volumeStep<0?'每側停留約 20 秒，做 1 趟':volumeStep>0?'每側停留 20～30 秒，做 2 趟，不加深拉伸':'每側停留 20～30 秒，做 1～2 趟',cue:'有拉伸感即可，保持呼吸，不彈震。紅色表示伸展目標。'});used+=each;}
 }
 const coolId=goal==='mobility'?'machine-bike':'standing-calf-stretch';
 steps.push({id:coolId,stage:'cooldown',label:'緩和',minutes:cooldown,prescription:goal==='mobility'?`輕鬆踩 ${cooldown} 分鐘`:`慢慢走動、調整呼吸約 ${cooldown} 分鐘，可再看小腿伸展`,cue:'慢慢把節奏降下來。'});
 const totalMinutes=warmup+used+cooldown,ids=[...new Set(steps.map(s=>s.id))],title=goal==='strength'?`${focusName(focus)}・肌力安排`:goalName(goal);
 const baseSets=goal==='strength'&&volumeStep>0?createTrainingPlan({...profile,volumeStep:0}).steps.reduce((n,s)=>n+(s.sets||0),0):0,currentSets=steps.reduce((n,s)=>n+(s.sets||0),0),timeLimited=goal==='strength'&&volumeStep>0&&currentSets<=baseSets;
 const volumeLabel=volumeStep===0?'基本安排':goal==='strength'?(volumeStep<0?'減量':timeLimited?'時間已滿，維持組數':'增加一組（以時間為限）'):goal==='cardio'?(volumeStep<0?'放慢或分段':'稍微加快節奏'):(volumeStep<0?'減少趟數':'增加趟數，不加深拉伸');
 return{profile,title,goalName:goalName(goal),steps:steps.map(s=>({...s,name:named(s.id)})),ids,totalMinutes,budgetMinutes:minutes,bufferMinutes:Math.max(0,minutes-totalMinutes),volumeLabel,reason:goal==='strength'?`${experience==='new'?'先以較容易調整的器材熟悉動作':'加入啞鈴與滑輪動作'}；依${minutes}分鐘預算安排組數與休息。`:goal==='cardio'?'以可交談的節奏安排時間，不替你推算心率或阻力。':'安排不同部位的活動與伸展，不把伸展標色當成出力強度。'};
}
export function adjustTrainingProfile(profile,feedback){
 const next=normalizeTrainingProfile(profile);if(feedback==='easier')next.volumeStep=Math.max(-1,next.volumeStep-1);else if(feedback==='more')next.volumeStep=Math.min(1,next.volumeStep+1);else if(feedback!=='keep')return next;return next;
}
export function loadTrainingProfile(storage){try{storage=storage||globalThis.localStorage;return normalizeTrainingProfile(JSON.parse(storage?.getItem('form.training-profile.v1')||'null'));}catch{return normalizeTrainingProfile();}}
export function saveTrainingProfile(profile,storage){const result=normalizeTrainingProfile(profile);try{storage=storage||globalThis.localStorage;storage?.setItem('form.training-profile.v1',JSON.stringify(result));}catch{}return result;}
