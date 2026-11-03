import {coursePlanFor} from './class-timeline.js';

const cache=new Map();
const numbers={1:'一',2:'二',3:'三'};
const isRest=motion=>/(?:^|-)(?:recovery|recover|rest)$/.test(motion||'');
export const courseCountInCues=[3,2,1].map(value=>({id:`count-in:${value}`,at:0,type:'count-in',text:numbers[value],remaining:value,priority:80}));
export const cleanCourseCueLabel=label=>String(label||'').replace(/^第\s*\d+\s*輪[・．·：:\s]*/,'');

/** Original short coaching cues; the authored course clock is the only timer. */
export function courseAudioCues(kind){
  const plan=coursePlanFor(kind);if(!plan)return [];
  if(cache.get(plan.kind)?.plan===plan)return cache.get(plan.kind).cues;
  const cues=[];
  const add=(at,type,text,block,priority=20)=>cues.push({id:`${plan.kind}:${block?.id||'end'}:${type}:${at}`,at,type,text,blockId:block?.id||null,stage:block?.stage||'completed',priority});
  for(const block of plan.blocks){
    const label=cleanCourseCueLabel(block.label);
    if(block.index===0)add(0,'course-start',`開始。先暖身，${label}。`,block,70);
    else if(isRest(block.motionId))add(block.startSeconds,'rest-start',`${label}。放慢動作，調整呼吸。`,block,50);
    else add(block.startSeconds,'block-start',`${block.stageLabel}，${label}。`,block,50);
    const next=plan.blocks[block.index+1];
    if(next)add(block.endSeconds-8,'prepare-next',`八秒後，${cleanCourseCueLabel(next.label)}。`,block,30);
    else add(block.endSeconds-8,'prepare-finish','還有八秒，慢慢收好動作。',block,30);
    for(const value of [3,2,1])add(block.endSeconds-value,'countdown',numbers[value],block,60);
  }
  add(plan.duration,'course-complete','這堂課到這裡，慢慢回到準備姿勢。',null,100);
  cues.sort((a,b)=>a.at-b.at||b.priority-a.priority);cache.set(plan.kind,{plan,cues});return cues;
}

/** No wall timers and no backlog: jumps establish a new cursor, never catch up. */
export function createCourseCueScheduler({maxStepSeconds=2.5}={}){
  let previous=null,started=false,delivered=0,resets=0;
  const reset=()=>{previous=null;started=false;resets++;};
  function update(input={}){
    const plan=coursePlanFor(input.kind||input.id);
    if(!plan){if(previous)reset();return{cues:[],discontinuity:true,reason:'inactive'};}
    const elapsed=Math.max(0,Math.min(plan.duration,Number(input.elapsed)||0));
    const activityStage=input.activityStage||input.stage;
    const frame={id:input.id||plan.kind,kind:plan.kind,elapsed,paused:!!input.paused,previewed:!!input.previewed,activityStage,countInRemaining:Math.ceil(Number(input.countInRemaining)||0)};
    const changed=!previous||previous.id!==frame.id||previous.kind!==frame.kind;
    const backwards=!!previous&&elapsed<previous.elapsed-.00001;
    const jump=!!previous&&elapsed-previous.elapsed>maxStepSeconds;
    const previewJump=!!previous&&frame.previewed&&!previous.previewed;
    const reason=changed?'course':backwards?'rewind':jump||previewJump?'seek':frame.paused?'pause':previous?.paused?'resume':null;
    if(changed||backwards){started=false;resets++;}
    let cues=[];
    const blocked=['preparing','entering','returning','exiting','idle'].includes(activityStage);
    if(activityStage==='counting-in'){
      if(!frame.paused&&frame.countInRemaining>=1&&frame.countInRemaining<=3&&(changed||previous?.countInRemaining!==frame.countInRemaining))cues=[{...courseCountInCues.find(c=>c.remaining===frame.countInRemaining),stage:'warmup'}];
    }else if(!frame.paused&&!blocked){
      if(!started&&elapsed<.5&&!frame.previewed){cues=[courseAudioCues(plan.kind)[0]];started=true;}
      else if(previous&&!reason){
        const crossed=courseAudioCues(plan.kind).filter(c=>c.at>previous.elapsed&&c.at<=elapsed);
        // A slow frame may cross multiple thresholds. Speak only the newest.
        if(crossed.length)cues=[crossed.at(-1)];
      }
    }
    if(cues[0]?.type==='course-complete'&&frame.previewed)cues=[{...cues[0],text:'預覽到這裡結束。'}];
    previous=frame;delivered+=cues.length;
    return{cues,discontinuity:!!reason,reason};
  }
  return{update,reset,getDiagnostics:()=>({previous:previous?{...previous}:null,started,delivered,resets})};
}
