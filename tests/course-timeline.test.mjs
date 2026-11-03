import test from 'node:test';
import assert from 'node:assert/strict';
import {coursePlans} from '../src/classes/course-plans.js';
import {coursePlanFor,courseTimelineAt} from '../src/classes/class-timeline.js';

test('all seven lessons have a complete, contiguous warm-up, main session and cool-down',()=>{
  assert.equal(Object.keys(coursePlans).length,7);
  for(const kind of Object.keys(coursePlans)){
    const p=coursePlanFor(kind);assert.equal(p.duration,kind==='warmup'?900:1800);
    assert.deepEqual(p.stageDurations,{warmup:300,main:kind==='warmup'?300:1200,cooldown:300});
    assert.ok(p.blocks.length>=18);assert.equal(new Set(p.blocks.map(b=>b.id)).size,p.blocks.length);
    const order={warmup:0,main:1,cooldown:2};
    for(let i=0;i<p.blocks.length;i++){const b=p.blocks[i];assert.equal(b.startSeconds,i?p.blocks[i-1].endSeconds:0);if(i)assert.ok(order[b.stage]>=order[p.blocks[i-1].stage]);}
    assert.ok(new Set(p.blocks.filter(b=>b.stage==='main').map(b=>b.motionId)).size>=3,kind);
    for(const t of [p.duration,p.duration+1,p.duration*3]){const f=courseTimelineAt(kind,t);assert.equal(f.complete,true);assert.equal(f.phase,1);assert.equal(f.remaining,0);assert.equal(f.envelope,0);assert.equal(f.nextBlock,null);}
  }
});

test('section boundaries ease through the shared ready pose and expose the next real activity',()=>{
  for(const kind of Object.keys(coursePlans))for(const b of coursePlanFor(kind).blocks){
    const first=courseTimelineAt(kind,b.startSeconds);assert.equal(first.envelope,0);assert.equal(first.motionId,b.motionId);assert.equal(first.repPhase,0);
    const before=courseTimelineAt(kind,b.endSeconds-1e-5);assert.ok(before.envelope<1e-9);
    const mid=courseTimelineAt(kind,(b.startSeconds+b.endSeconds)/2);assert.ok(mid.envelope>.99);assert.ok(mid.repetition>=1);
    if(first.nextBlock)assert.equal(first.nextBlock.startSeconds,b.endSeconds);
  }
  // Changing between a deadlift grip and a curl grip happens while the bar is
  // on the floor, rather than twisting both loaded wrists between exercises.
  for(const b of coursePlanFor('barbell').blocks.filter(b=>b.motionId==='biceps-curl')){
    const f=courseTimelineAt('barbell',b.startSeconds+1);assert.equal(f.previousBlock.motionId,'put-down-rest');assert.equal(f.nextBlock.motionId,'put-down-rest');assert.ok(f.previousBlock.seconds>8.5);assert.ok(f.nextBlock.seconds>8.5);
  }
});

test('cycling integrates cadence across every boundary and stops at the calibrated dismount angle',()=>{
  const p=coursePlanFor('cycle');let previous=-1;
  for(let t=0;t<=p.duration;t+=.25){const f=courseTimelineAt('cycle',t);assert.ok(f.cycleTurns>=previous);assert.ok(f.cadenceRPM>=0&&f.cadenceRPM<=91);previous=f.cycleTurns;}
  for(const b of p.blocks.slice(1)){
    const a=courseTimelineAt('cycle',b.startSeconds-1e-5),z=courseTimelineAt('cycle',b.startSeconds+1e-5);
    assert.ok(Math.abs(z.cycleTurns-a.cycleTurns)<.00004,'crank must not reset');assert.ok(Math.abs(z.cadenceRPM-a.cadenceRPM)<.2,'cadence must not jump');
  }
  const end=courseTimelineAt('cycle',p.duration);assert.ok(Math.abs(end.cycleTurns-Math.round(end.cycleTurns))<1e-9);assert.equal(end.cadenceRPM,0);
});
