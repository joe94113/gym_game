import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {viteClientShim} from './vite-client-shim.js';

const dir='artifacts/release-v019/scrub';
test('continuous native scrubbing keeps the class range, completion controls, focus, colors and audio in sync',async({page},testInfo)=>{
 test.setTimeout(180000);mkdirSync(dir,{recursive:true});const touch=!!testInfo.project.use.hasTouch,errors=[],observations=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/@vite/client',r=>r.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});
 await page.locator('[data-action=free]').click();
 await page.evaluate(()=>{const a=window.__FORM__;a.openExercise('class-dance');if(!a.world.advanceUntilReady(180,false))throw Error('class not ready');a.world.update(0);});
 if(touch)await page.locator('[data-mobile-panel-toggle]').click();
 await page.locator('[data-action=pause]').click();
 expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().course.previewed)).toBe(false);
 const range=page.locator('#pose-scrub');await range.scrollIntoViewIfNeeded();
 await range.evaluate(node=>{window.__scrubNode=node;window.__scrubEvents=[];node.addEventListener('input',event=>window.__scrubEvents.push({trusted:event.isTrusted,value:Number(node.value)}));});
 const cdp=touch?await page.context().newCDPSession(page):null;
 const state=()=>page.evaluate(()=>{const a=window.__FORM__,s=a.world.getActivityState();return{phase:s.phase,stage:s.stage,paused:s.paused,previewed:s.course?.previewed,connected:window.__scrubNode.isConnected,same:document.querySelector('#pose-scrub')===window.__scrubNode};});
 async function drag(points,direction){
  await range.scrollIntoViewIfNeeded();const box=await range.boundingBox();expect(box).toBeTruthy();const start=await range.inputValue(),left=box.x+8,width=box.width-16,y=box.y+box.height/2,startX=left+width*Number(start);
  if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y,id:1,radiusX:3,radiusY:3,force:1}]});else{await page.mouse.move(startX,y);await page.mouse.down();}
  let previous=Number(start),x=startX;
  try{for(const phase of points){const target=left+width*phase;if(touch){for(let step=1;step<=12;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(target-x)*step/12,y,id:1,radiusX:3,radiusY:3,force:1}]});}else await page.mouse.move(target,y,{steps:12});x=target;
    const current=await state();observations.push({kind:touch?'touch-drag':'mouse-drag',direction,target:phase,...current});expect(current.connected).toBe(true);expect(current.same).toBe(true);expect(current.paused).toBe(true);expect(current.previewed).toBe(true);if(direction==='forward')expect(current.phase).toBeGreaterThan(previous+.08);else expect(current.phase).toBeLessThan(previous-.08);previous=current.phase;
   }}finally{if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();}
 }
 await drag([.22,.42,.62,.82],'forward');
 await expect(page.locator('#class-preview-note')).toContainText('預覽模式');
 expect(await page.evaluate(()=>window.__FORM__.audio.getDiagnostics().activeMusicNodes)).toBe(0);
 const muscles=await page.evaluate(()=>{const a=window.__FORM__,block=a.state.classSegment.block;return{expectedPrimary:[...block.primaryMuscles].sort(),expectedSecondary:[...block.secondaryMuscles].sort(),actual:a.world.getMuscleHighlights(),primary:getComputedStyle(document.querySelector('.class-muscles .primary-swatch')).backgroundColor,secondary:getComputedStyle(document.querySelector('.class-muscles .secondary-swatch')).backgroundColor};});
 expect([...muscles.actual.primary].sort()).toEqual(muscles.expectedPrimary);expect([...muscles.actual.secondary].sort()).toEqual(muscles.expectedSecondary);expect(muscles.primary).toBe('rgb(220, 104, 85)');expect(muscles.secondary).toBe('rgb(226, 162, 97)');
 await range.evaluate(node=>node.blur());await page.evaluate(()=>{const w=window.__FORM__.world;w.seekExercise(1);w.update(0);});
 await expect(page.locator('.class-panel')).toHaveClass(/class-completed/);await expect(page.locator('#class-completion')).toBeVisible();await expect(page.locator('#class-completion-title')).toHaveText('預覽已到課程結尾');await expect(page.locator('#class-time-remaining')).toHaveText('0:00');
 await expect(page.locator('[data-action=pause]')).toBeDisabled();await expect(page.locator('[data-speed="0.5"]')).toBeDisabled();await expect(page.locator('[data-action=learned]')).toBeEnabled();await expect(page.locator('[data-action=restart]')).toBeEnabled();await expect(range).toBeEnabled();
 // Focusing the range blurs this prior button during pointerdown; that element
 // blur must not be mistaken for the browser window losing the gesture.
 await page.locator('[data-action=learned]').focus();await drag([.78,.58,.38,.18],'backward');
 await expect(page.locator('.class-panel')).not.toHaveClass(/class-completed/);await expect(page.locator('#class-completion')).toBeHidden();await expect(page.locator('[data-action=pause]')).toBeEnabled();await expect(page.locator('[data-speed="0.5"]')).toBeEnabled();
 await range.evaluate(node=>node.blur());await page.evaluate(()=>window.__FORM__.world.seekExercise(1));await range.focus();await page.keyboard.press('ArrowLeft');const first=await state();await expect(range).toBeFocused();expect(first.connected&&first.same).toBe(true);expect(first.stage).toBe('exercising');
 for(let i=0;i<8;i++)await page.keyboard.press('ArrowLeft');const keyboard=await state();observations.push({kind:'keyboard',first,...keyboard});await expect(range).toBeFocused();expect(keyboard.phase).toBeLessThan(first.phase-.003);expect(keyboard.connected&&keyboard.same).toBe(true);
 // A real play click resumes the same preview and lets the audio scheduler run.
 await range.evaluate(node=>node.blur());await page.evaluate(()=>window.__FORM__.world.seekExercise(.3));const notes=await page.evaluate(()=>window.__FORM__.audio.getDiagnostics().musicNotes);await page.locator('[data-action=pause]').click();
 await expect.poll(()=>page.evaluate(()=>window.__FORM__.world.getActivityState().paused)).toBe(false);await expect.poll(()=>page.evaluate(()=>window.__FORM__.audio.getDiagnostics().musicNotes),{timeout:15000}).toBeGreaterThan(notes);
 await page.locator('[data-action=pause]').click();await expect.poll(()=>page.evaluate(()=>window.__FORM__.audio.getDiagnostics().activeMusicNodes)).toBe(0);
 const trusted=await page.evaluate(()=>window.__scrubEvents);expect(trusted.length).toBeGreaterThan(10);expect(trusted.every(e=>e.trusted)).toBe(true);
 await page.screenshot({path:`${dir}/${testInfo.project.name}.png`});
 // Leaving and switching activities remain immediate structural renders.
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>window.__scrubNode.isConnected)).toBe(false);
 await page.evaluate(()=>{const a=window.__FORM__;if(!a.world.advanceUntilIdle(180,false))throw Error('class did not leave');a.openExercise('dumbbell-curl');});await expect(page.locator('.class-panel')).toHaveCount(0);await expect(page.locator('.station-panel')).toContainText('站姿啞鈴彎舉');
 const renderer=await page.evaluate(()=>{const gl=document.querySelector('#gym-canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});expect(renderer).not.toMatch(/swiftshader|software/i);expect(errors).toEqual([]);
 const report={project:testInfo.project.name,renderer,observations,trustedInputs:trusted,errors,muscles};writeFileSync(`${dir}/${testInfo.project.name}.json`,JSON.stringify(report,null,2));await testInfo.attach('continuous-scrub',{body:JSON.stringify(report),contentType:'application/json'});await cdp?.detach();
});
