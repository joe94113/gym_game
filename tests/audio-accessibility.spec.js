import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

const errors=new WeakMap();
test.beforeEach(async({page})=>{
 const list=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));
 await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
 await page.locator('[data-action="free"]').click();await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));

test('Shift changes walking to a distinct running gait; quality and readable help are available',async({page},testInfo)=>{
 await page.keyboard.down('w');
 const walk=await page.evaluate(()=>{const w=window.__FORM__.world;for(let i=0;i<12;i++)w.update(.05,false);return{performance:w.getPerformanceDiagnostics(),body:w.getBodyWorldPoints()};});
 await page.keyboard.down('Shift');
 const run=await page.evaluate(()=>{const w=window.__FORM__.world;for(let i=0;i<12;i++)w.update(.05,false);w.update(0);return{performance:w.getPerformanceDiagnostics(),body:w.getBodyWorldPoints(),hands:w.getHandDiagnostics(),self:w.getSelfClearanceDiagnostics()};});
 expect(walk.performance.movingSpeed).toBeCloseTo(1.8);expect(run.performance.movingSpeed).toBeGreaterThan(4.1);expect(run.performance.running).toBe(true);expect(run.body.hands).not.toEqual(walk.body.hands);
 await page.keyboard.up('Shift');await page.evaluate(()=>{for(let i=0;i<15;i++)window.__FORM__.world.update(.05,false);});
 expect(await page.evaluate(()=>window.__FORM__.world.getPerformanceDiagnostics().movingSpeed)).toBeLessThan(1.81);
 await page.keyboard.up('w');await page.evaluate(()=>window.__FORM__.world.update(.2));
 await expect(page.locator('.controls-bar')).toContainText('Shift');
 await page.locator('.header-actions [data-action="help"]').click();await expect(page.getByRole('dialog')).toContainText('奔跑');
 const font=await page.locator('.help-grid p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));expect(font).toBeGreaterThanOrEqual(15);
 await page.getByLabel('畫質',{exact:true}).selectOption('flow');expect(await page.evaluate(()=>window.__FORM__.world.getPerformanceDiagnostics().shadows)).toBe(false);expect(await page.evaluate(()=>localStorage.getItem('form.graphics-quality.v1'))).toBe('flow');
 await page.getByLabel('畫質',{exact:true}).selectOption('clear');expect(await page.evaluate(()=>window.__FORM__.world.getPerformanceDiagnostics().shadows)).toBe(true);
 await page.getByLabel('畫質',{exact:true}).selectOption('auto');
 await testInfo.attach('run-and-quality',{body:JSON.stringify({walk,run,font}),contentType:'application/json'});
});

test('real Chinese recordings and music play; independent volumes, mute and pause work',async({page},testInfo)=>{
 test.setTimeout(240000);await page.setViewportSize({width:1280,height:800});
 await page.locator('.header-actions [data-action="classes"]').click();await page.locator('[data-demo="class-dance"]').click();
 expect(await page.evaluate(()=>{const w=window.__FORM__.world;for(let i=0;i<3600&&w.getActivityState().stage!=='counting-in';i++)w.update(.05,false);w.update(0);return w.getActivityState().stage;})).toBe('counting-in');
 await expect(page.locator('#class-segment-title')).toContainText('準備開始');
 await expect.poll(()=>page.evaluate(()=>window.__FORM__.audio.getDiagnostics().recordedPlays),{timeout:15000}).toBeGreaterThan(0);
 await page.evaluate(()=>{window.__FORM__.world.advanceUntilReady(10,false);window.__FORM__.world.update(.1);});
 await expect.poll(()=>page.evaluate(()=>window.__FORM__.audio.getDiagnostics().musicNotes)).toBeGreaterThan(0);
 const playing=await page.evaluate(()=>window.__FORM__.audio.getDiagnostics());expect(playing.voiceSource).toBe('recorded');expect(playing.voiceLang).toBe('zh-TW');expect(playing.audioState).toBe('running');expect(playing.audioError).toBe('');
 await page.locator('.course-audio-settings summary').click();
 await page.getByLabel('背景音樂音量',{exact:true}).fill('22');await page.getByLabel('教練口令音量',{exact:true}).fill('76');
 await page.getByLabel('播放背景音樂',{exact:true}).uncheck();
 let settings=await page.evaluate(()=>window.__FORM__.audio.getDiagnostics());expect(settings.settings.musicVolume).toBe(.22);expect(settings.settings.voiceVolume).toBe(.76);expect(settings.settings.musicEnabled).toBe(false);expect(settings.settings.voiceEnabled).toBe(true);expect(settings.activeMusicNodes).toBe(0);
 await page.getByLabel('播放背景音樂',{exact:true}).check();await page.getByLabel('播放教練口令',{exact:true}).uncheck();settings=await page.evaluate(()=>window.__FORM__.audio.getDiagnostics());expect(settings.settings.musicEnabled).toBe(true);expect(settings.settings.voiceEnabled).toBe(false);
 await page.locator('[data-action="pause"]').click();await page.evaluate(()=>window.__FORM__.world.update(0));expect(await page.evaluate(()=>window.__FORM__.audio.getDiagnostics().activeMusicNodes)).toBe(0);
 expect(await page.locator('.class-description').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
 await page.screenshot({path:'artifacts/performance/audio-readable-ui.png'});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('form.course-audio.v1')));expect(saved.musicVolume).toBe(.22);expect(saved.voiceEnabled).toBe(false);
 await testInfo.attach('real-audio',{body:JSON.stringify({playing,settings,saved}),contentType:'application/json'});
 await page.locator('[aria-label="離開課程"]').click();await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle(180,false));expect(await page.evaluate(()=>window.__FORM__.audio.getDiagnostics().course)).toBeNull();
});
