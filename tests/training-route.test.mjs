import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingPlan} from '../src/training-plan.js';
import {createTrainingRoute,currentTrainingRouteStep,trainingRouteProgress,selectTrainingRouteStep,acknowledgeTrainingRouteStep} from '../src/training-route.js';

const mobility=()=>createTrainingPlan({goal:'mobility',minutes:15});

test('warm-up and cooldown on the same bike remain separate exploration steps',()=>{
 const plan=mobility(),original=structuredClone(plan),route=createTrainingRoute(plan);
 assert.equal(route.steps.length,6);assert.equal(plan.ids.length,5);
 assert.equal(route.steps[0].id,'machine-bike');assert.equal(route.steps.at(-1).id,'machine-bike');
 assert.notEqual(route.steps[0].key,route.steps.at(-1).key);
 assert.equal(route.steps[0].stage,'warmup');assert.equal(route.steps.at(-1).stage,'cooldown');
 assert.equal(new Set(route.steps.map(s=>s.key)).size,6);assert.deepEqual(plan,original);
});

test('learning each planned step returns to the bike for cooldown before the route completes',()=>{
 let route=createTrainingRoute(mobility());const learned=new Set(),visited=[];
 while(currentTrainingRouteStep(route)){
  const step=currentTrainingRouteStep(route);visited.push(step.stage);learned.add(step.movementId);
  const result=acknowledgeTrainingRouteStep(route,step.id);assert.equal(result.acknowledged,true);route=result.route;
  assert.equal(result.complete,visited.length===6);
 }
 assert.deepEqual(visited,['warmup','main','main','main','main','cooldown']);
 assert.equal(learned.size,5);assert.deepEqual(trainingRouteProgress(route),{done:6,total:6,complete:true,current:null});
});

test('an unrelated activity or missing activity cannot advance the current step',()=>{
 const route=createTrainingRoute(mobility());
 for(const activity of ['dumbbell-curl',null,{id:'unknown'}]){
  const result=acknowledgeTrainingRouteStep(route,activity);assert.equal(result.acknowledged,false);assert.equal(result.route,route);
 }
 assert.equal(trainingRouteProgress(route).done,0);
});

test('selecting or reviewing steps does not mark unseen steps completed',()=>{
 const initial=createTrainingRoute(mobility()),cooldown=initial.steps.at(-1);
 const selected=selectTrainingRouteStep(initial,cooldown.key);assert.equal(trainingRouteProgress(selected).done,0);
 const result=acknowledgeTrainingRouteStep(selected,{id:'machine-bike',movementId:'machine-bike'});
 assert.equal(trainingRouteProgress(result.route).done,1);assert.equal(result.nextStep.stage,'warmup');
 const reviewing=selectTrainingRouteStep(result.route,cooldown.key),again=acknowledgeTrainingRouteStep(reviewing,'machine-bike');
 assert.equal(again.added,false);assert.equal(trainingRouteProgress(again.route).done,1);
 assert.equal(selectTrainingRouteStep(initial,'missing'),initial);assert.deepEqual(initial.completedKeys,[]);
});

test('a restarted or changed plan begins with its own empty step progress',()=>{
 const old=createTrainingRoute(mobility()),viewed=acknowledgeTrainingRouteStep(old,'machine-bike').route;
 assert.equal(trainingRouteProgress(viewed).done,1);
 for(const plan of [mobility(),createTrainingPlan({goal:'strength',focus:'legs'})]){
  const restarted=createTrainingRoute(plan);assert.equal(trainingRouteProgress(restarted).done,0);assert.equal(currentTrainingRouteStep(restarted).stage,'warmup');
 }
});
