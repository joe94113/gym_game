import test from 'node:test';import assert from 'node:assert/strict';
import {createTrainingPlan,normalizeTrainingProfile,adjustTrainingProfile,loadTrainingProfile,saveTrainingProfile} from '../src/training-plan.js';
import {activityById} from '../src/activity-catalog.js';
test('every goal/focus/experience/time/volume produces real reachable catalog actions within time with warmup/main/cooldown',()=>{
 for(const goal of ['strength','cardio','mobility'])for(const focus of ['fullbody','chest','back','legs','shoulders','arms'])for(const experience of ['new','regular'])for(const minutes of [15,30,45])for(const volumeStep of [-1,0,1]){
  const p=createTrainingPlan({goal,focus,experience,minutes,volumeStep});assert.ok(p.totalMinutes<=minutes);assert.ok(p.steps.some(s=>s.stage==='main'));assert.equal(p.steps[0].stage,'warmup');assert.equal(p.steps.at(-1).stage,'cooldown');assert.equal(p.steps.reduce((n,s)=>n+s.minutes,0),p.totalMinutes);for(const s of p.steps){assert.ok(activityById(s.id),s.id);assert.ok(s.minutes>0);if(s.sets)assert.ok(s.sets>=1&&s.sets<=3);}
 }
});
test('experience, focus and available time change the actual recommendations rather than only a label',()=>{
 const basic=createTrainingPlan({goal:'strength',focus:'fullbody',minutes:30}),experienced=createTrainingPlan({goal:'strength',focus:'fullbody',experience:'regular',minutes:30});assert.notDeepEqual(basic.ids,experienced.ids);assert.ok(basic.ids.includes('machine-chest-press'));assert.ok(experienced.ids.includes('dumbbell-bench-press'));assert.notDeepEqual(basic.ids,createTrainingPlan({focus:'legs'}).ids);assert.ok(createTrainingPlan({minutes:15}).totalMinutes<createTrainingPlan({minutes:45}).totalMinutes);
});
test('progression requires explicit feedback and stays bounded; reading or playing a suggestion does not mutate the profile',()=>{
 const p=normalizeTrainingProfile({experience:'regular'}),before=structuredClone(p);createTrainingPlan(p);assert.deepEqual(p,before);assert.equal(adjustTrainingProfile(p,'more').volumeStep,1);assert.equal(adjustTrainingProfile({volumeStep:1},'more').volumeStep,1);assert.equal(adjustTrainingProfile(p,'easier').volumeStep,-1);assert.deepEqual(adjustTrainingProfile(p,'keep'),p);
});
test('profile persistence and invalid or unavailable storage remain usable',()=>{
 const m=new Map(),storage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};const p={goal:'cardio',experience:'regular',minutes:45};saveTrainingProfile(p,storage);assert.deepEqual(loadTrainingProfile(storage),normalizeTrainingProfile(p));m.set('form.training-profile.v1','broken');assert.equal(loadTrainingProfile(storage).minutes,30);assert.equal(normalizeTrainingProfile({minutes:-1,volumeStep:100}).volumeStep,1);assert.equal(loadTrainingProfile({getItem(){throw Error();}}).goal,'strength');
});
test('a short full-body session reserves leg work and does not claim a set increase when the time budget is already full',()=>{
 const p=createTrainingPlan({focus:'fullbody',experience:'regular',minutes:15,volumeStep:1});assert.ok(p.ids.includes('dumbbell-goblet-squat'));assert.equal(p.volumeLabel,'時間已滿，維持組數');assert.equal(createTrainingPlan({experience:'regular',minutes:30,volumeStep:1}).volumeLabel,'增加一組（以時間為限）');
});
