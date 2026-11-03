import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {viteClientShim} from './vite-client-shim.js';
test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

const output=(process.env.FORM_TEST_ARTIFACT_ROOT||'artifacts/mobile-v016')+'/layout';mkdirSync(output,{recursive:true});
async function boot(page){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{polling:100,timeout:120000});return errors;
}
async function menu(page,action){await page.locator('[data-mobile-menu-toggle]').tap();await page.locator(`.header-actions [data-action="${action}"]`).tap();}
async function bounds(page,selector){return page.locator(selector).evaluate(element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};});}

test('手機與平板的直橫向版面可收合教學，操作按鈕留在視窗內',async({page})=>{
  const errors=await boot(page),receipts=[];await page.locator('[data-action=free]').tap();
  await page.evaluate(()=>{const a=window.__FORM__;a.openExercise('machine-chest-press');if(!a.world.advanceUntilReady(180,false))throw Error('Cannot enter chest press');a.world.setAnimationPaused(true);});
  for(const [width,height]of [[360,780],[390,780],[390,844],[430,780],[844,390],[932,430],[768,1024],[1024,1366]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(120);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(()=>window.__FORM__.world.getPerformanceDiagnostics().deviceTier)).toBe('mobile');
    for(const selector of ['[data-mobile-menu-toggle]','[data-mobile-panel-toggle]','[data-mobile-exit]','[data-action=pause]']){
      const r=await bounds(page,selector);expect(r.height,selector).toBeGreaterThanOrEqual(43.5);expect(r.width,selector).toBeGreaterThanOrEqual(43.5);expect(r.x).toBeGreaterThanOrEqual(0);expect(r.right).toBeLessThanOrEqual(width+1);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.bottom).toBeLessThanOrEqual(height+1);
    }
    await page.locator('[data-mobile-panel-toggle]').tap();
    const expanded=await bounds(page,'.station-panel');expect(expanded.y).toBeGreaterThanOrEqual(55);expect(expanded.bottom).toBeLessThan(height);await expect(page.locator('.station-scroll')).toBeVisible();
    await page.screenshot({path:`${output}/teaching-${width}x${height}.png`});
    receipts.push({viewport:[width,height],expanded,quality:await page.evaluate(()=>window.__FORM__.world.getPerformanceDiagnostics())});
    await page.locator('[data-mobile-panel-toggle]').tap();
  }
  writeFileSync(`${output}/viewports.json`,JSON.stringify({scope:'Chromium native desktop GPU with coarse-touch emulation; not physical phone evidence',receipts,errors},null,2));expect(errors).toEqual([]);
});

test('手機可點地圖文字導航、填日誌及使用團課音訊設定',async({page})=>{
  const errors=await boot(page);await page.locator('[data-action=free]').tap();
  await menu(page,'map');const map=page.locator('.mobile-map-list');await expect(map).toBeVisible();const first=map.locator('[data-map-station]').first(),id=await first.getAttribute('data-map-station');await first.tap();expect(await page.evaluate(()=>window.__FORM__.state.targetId)).toBe(id);
  await menu(page,'journal');const journal=page.locator('.training-journal-dialog');await expect(journal).toBeVisible();await expect(page.locator('.mobile-controls')).not.toBeVisible();
  await journal.locator('select[name=exerciseId]').selectOption('dumbbell-curl');await journal.locator('[data-set-field=weightKg]').fill('8');await journal.locator('[data-set-field=reps]').fill('10');await journal.locator('textarea[name=notes]').fill('手機版輸入測試');
  expect(await journal.locator('textarea[name=notes]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await journal.getByRole('button',{name:'儲存這次訓練',exact:true}).tap();await expect(journal.locator('.journal-record')).toHaveCount(1);await page.screenshot({path:`${output}/journal-mobile.png`});
  await journal.locator('[data-journal-action=close]').tap();await menu(page,'classes');await expect(page.locator('.class-course-card')).toHaveCount(7);await page.locator('[data-demo=class-dance]').tap();
  await page.evaluate(()=>{if(!window.__FORM__.world.advanceUntilReady(180,false))throw Error('Cannot join class');window.__FORM__.world.setAnimationPaused(true);});await page.locator('[data-mobile-panel-toggle]').tap();
  await expect(page.locator('.teaching-note')).toContainText(/按「返回探索」\s*會先收好器材/);
  await expect(page.locator('.class-plan-item')).toHaveCount(23);await page.locator('.course-audio-settings summary').tap();
  await page.locator('input[type=range][data-course-audio=music]').fill('25');await page.locator('input[type=range][data-course-audio=voice]').fill('65');
  const audio=await page.evaluate(()=>window.__FORM__.audio.getDiagnostics().settings);expect(audio.musicVolume).toBe(.25);expect(audio.voiceVolume).toBe(.65);
  await page.screenshot({path:`${output}/class-mobile.png`});expect(errors).toEqual([]);
});

test.describe('桌面滑鼠回歸',()=>{
  test.use({viewport:{width:1280,height:800},deviceScaleFactor:1,isMobile:false,hasTouch:false});
  test('桌面不顯示手機控制，WASD 與 Shift 可正常行走奔跑',async({page})=>{
    const errors=await boot(page);await page.locator('[data-action=free]').click();await expect(page.locator('[data-mobile-menu-toggle]')).not.toBeVisible();await expect(page.locator('.mobile-controls')).not.toBeVisible();
    await page.keyboard.down('w');await page.keyboard.down('Shift');await page.waitForTimeout(500);const d=await page.evaluate(()=>window.__FORM__.world.getPerformanceDiagnostics());await page.keyboard.up('w');await page.keyboard.up('Shift');expect(d.running).toBe(true);expect(d.movingSpeed).toBeGreaterThan(4);expect(d.deviceTier).toBe('desktop');expect(errors).toEqual([]);
  });
});
