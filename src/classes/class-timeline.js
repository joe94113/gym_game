import {coursePlans} from './course-plans.js';

const clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const stageNames={warmup:'暖身',main:'主要訓練',cooldown:'緩和'};
const cache=new Map();
const kindOf=value=>value==='group-class'?'warmup':String(value||'').replace(/^class-/, '');
// Integral of smoothstep, used for continuous crank angle while cadence changes.
const easeIntegral=x=>x*x*x-.5*x*x*x*x;
function crankIntegral(block,seconds){
  const t=clamp(seconds,0,block.seconds),ramp=block.ramp,tail=block.tail;
  if(t<=ramp)return (block.fromRPM*t+(block.rpm-block.fromRPM)*ramp*easeIntegral(t/ramp))/60;
  const entry=(block.fromRPM+block.rpm)*ramp/120;
  if(t<=block.seconds-tail)return entry+(t-ramp)*block.rpm/60;
  const middle=(block.seconds-ramp-tail)*block.rpm/60,u=(t-block.seconds+tail)/tail;
  return entry+middle+block.rpm*tail*(u-easeIntegral(u))/60;
}

/** Pure, elapsed-time based scheduling. No modulo at the end of a lesson. */
export function coursePlanFor(value){
  const kind=kindOf(value),source=coursePlans[kind];if(!source)return null;
  if(cache.get(kind)?.source===source)return cache.get(kind).plan;
  let elapsed=0,turns=0,reps=0;
  const blocks=source.blocks.map((raw,index)=>{
    if(!(raw.seconds>0)||!stageNames[raw.stage]||!raw.motionId)throw new Error(`Invalid ${kind} course block ${index}`);
    const seconds=raw.seconds,startSeconds=elapsed,endSeconds=elapsed+seconds;elapsed=endSeconds;
    const repetitions=raw.repetitions??Math.max(1,Math.round(seconds/(raw.tempoSeconds||5)));
    const crank={seconds,rpm:raw.cadenceRPM||60,fromRPM:index?(source.blocks[index-1].cadenceRPM||60):0,ramp:Math.min(index?4:8,seconds/4),tail:index===source.blocks.length-1?Math.min(15,seconds/4):0};
    const block={...raw,index,seconds,durationSeconds:seconds,startSeconds,endSeconds,stageLabel:stageNames[raw.stage],repetitions,repOffset:reps,turnOffset:turns,crank};
    reps+=repetitions;turns+=crankIntegral(crank,seconds);return block;
  });
  if(Math.abs(elapsed-source.duration)>.001)throw new Error(`${kind} course duration does not match its blocks`);
  // The final recovery very slightly adjusts its cadence, so stopping leaves
  // the crank at the same calibrated angle used by the dismount animation.
  const last=blocks.at(-1),lastTurns=crankIntegral(last.crank,last.seconds),correction=Math.round(turns)-turns;
  last.crankScale=lastTurns?(lastTurns+correction)/lastTurns:1;
  const stageDurations=Object.fromEntries(Object.keys(stageNames).map(stage=>[stage,blocks.filter(b=>b.stage===stage).reduce((a,b)=>a+b.seconds,0)]));
  const plan={...source,kind,duration:elapsed,blocks,stageDurations};cache.set(kind,{source,plan});return plan;
}

export function courseTimelineAt(value,elapsedSeconds=0){
  const plan=coursePlanFor(value);if(!plan)return null;
  const elapsed=clamp(Number(elapsedSeconds)||0,0,plan.duration),complete=elapsed>=plan.duration;
  const index=complete?plan.blocks.length-1:plan.blocks.findIndex(block=>elapsed<block.endSeconds);
  const block=plan.blocks[index],localSeconds=clamp(elapsed-block.startSeconds,0,block.seconds),progress=localSeconds/block.seconds;
  const transition=Math.min(block.transitionSeconds??3,block.seconds/4),envelope=ease(localSeconds/transition)*ease((block.seconds-localSeconds)/transition);
  const repTurns=progress*block.repetitions,repPhase=complete||localSeconds===block.seconds?0:repTurns%1;
  const crankTurns=block.turnOffset+crankIntegral(block.crank,localSeconds)*(block.crankScale||1);
  const c=block.crank,cadenceRPM=(localSeconds<c.ramp?c.fromRPM+(c.rpm-c.fromRPM)*ease(localSeconds/c.ramp):c.tail&&localSeconds>block.seconds-c.tail?c.rpm*(1-ease((localSeconds-block.seconds+c.tail)/c.tail)):c.rpm)*(block.crankScale||1);
  const stageStart=plan.blocks.find(b=>b.stage===block.stage).startSeconds;
  return{
    elapsed,duration:plan.duration,remaining:plan.duration-elapsed,phase:elapsed/plan.duration,complete,
    block,index,total:plan.blocks.length,stage:block.stage,stageLabel:block.stageLabel,
    label:block.label,description:block.description,motionId:block.motionId,localSeconds,progress,
    repPhase,cycleTurns:plan.kind==='cycle'?crankTurns:block.repOffset+repTurns,cumulativeTurns:plan.kind==='cycle'?crankTurns:block.repOffset+repTurns,
    envelope,intensity:block.intensity??1,repetitions:block.repetitions,repetition:Math.min(block.repetitions,Math.floor(repTurns)+1),
    tempoSeconds:block.tempoSeconds||5,cadenceRPM:plan.kind==='cycle'?cadenceRPM:0,previousBlock:plan.blocks[index-1]||null,nextBlock:plan.blocks[index+1]||null,
    stageElapsed:elapsed-stageStart,stageDuration:plan.stageDurations[block.stage],
  };
}
