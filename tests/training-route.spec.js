import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

test.beforeEach(async({page})=>{
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
 await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
});

async function startMobility(page){
 await page.locator('.header-actions [data-action="training-plan"]').click();
 await page.getByLabel('今天的訓練目標',{exact:true}).selectOption('mobility');
 await page.getByLabel('可用時間',{exact:true}).selectOption('15');
 await page.locator('[data-action="start-training-plan"]').click();
 expect(await page.evaluate(()=>window.__FORM__.world.advanceUntilReady(180,false))).toBe(true);
}

test('伸展路線回到同一台腳踏車緩和，六個探索步驟與五個動作學習分開',async({page},testInfo)=>{
 test.setTimeout(300000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await startMobility(page);const seen=[];
 for(let index=0;index<6;index++){
  const step=await page.evaluate(()=>{const r=window.__FORM__.state.trainingRoute;return r.steps[r.cursor];});seen.push(step);
  await expect(page.locator('.training-step-context')).toContainText(step.label);
  await expect(page.locator('.training-step-context')).toContainText(step.prescription);
  if(index===5)expect(step.stage).toBe('cooldown');
  await page.locator('[data-action="learned"]').click();
  expect(await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false))).toBe(true);
  await expect(page.locator('.personal-route-panel .progress-caption b')).toHaveText(`${index+1} / 6`);
  if(index<5){await page.locator('.personal-route-panel [data-demo]').click();expect(await page.evaluate(()=>window.__FORM__.world.advanceUntilReady(180,false))).toBe(true);}
 }
 expect(seen[0].id).toBe('machine-bike');expect(seen[5].id).toBe('machine-bike');expect(seen[0].key).not.toBe(seen[5].key);
 expect(await page.evaluate(()=>window.__FORM__.state.learned.size)).toBe(5);
 await expect(page.locator('[data-action="restart-training-route"]')).toBeVisible();
 await page.locator('[data-action="restart-training-route"]').click();
 expect(await page.evaluate(()=>window.__FORM__.state.trainingRoute.completedKeys.length)).toBe(0);
 expect(await page.evaluate(()=>window.__FORM__.state.learned.size)).toBe(5);
 expect(errors).toEqual([]);await testInfo.attach('mobility-route',{body:JSON.stringify(seen),contentType:'application/json'});
});

test('取消與無關動作不推進路線，選緩和不會順便完成暖身',async({page})=>{
 test.setTimeout(240000);await startMobility(page);
 await page.locator('[data-action="close-teaching"]').click();await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false));
 expect(await page.evaluate(()=>window.__FORM__.state.trainingRoute.completedKeys.length)).toBe(0);
 await page.evaluate(()=>{window.__FORM__.openExercise('dumbbell-curl');window.__FORM__.world.advanceUntilReady(180,false);});
 await page.locator('[data-action="learned"]').click();await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false));
 expect(await page.evaluate(()=>window.__FORM__.state.trainingRoute.completedKeys.length)).toBe(0);
 await page.locator('.mission-list [data-route-step]').last().click();
 await page.locator('.personal-route-panel [data-demo]').click();await page.evaluate(()=>window.__FORM__.world.advanceUntilReady(180,false));
 await expect(page.locator('.training-step-context')).toContainText('緩和');
 await page.locator('[data-action="learned"]').click();await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false));
 const result=await page.evaluate(()=>{const r=window.__FORM__.state.trainingRoute;return {completed:r.completedKeys,current:r.steps[r.cursor]};});
 expect(result.completed).toHaveLength(1);expect(result.current.stage).toBe('warmup');
});
