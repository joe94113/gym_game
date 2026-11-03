import {test,expect} from '@playwright/test';
import {viteClientShim} from './vite-client-shim.js';

const pageErrors=new WeakMap();
test.beforeEach(async({page})=>{
  const errors=[];pageErrors.set(page,errors);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
  await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});
  await page.locator('[data-action="free"]').click();
});
test.afterEach(async({page})=>expect(pageErrors.get(page)).toEqual([]));

test('團課入口提供七種課程，在教室按 E 也會先選課',async({page})=>{
  await page.locator('.header-actions [data-action="classes"]').click();
  await expect(page.getByRole('dialog',{name:'團體課程'})).toBeVisible();
  await expect(page.locator('.class-course-card')).toHaveCount(7);
  for(const [kind,id]of [['warmup','group-class'],['dance','class-dance'],['cycle','class-cycle'],['trx','class-trx'],['barbell','class-barbell'],['aerial','class-aerial'],['pilates','class-pilates']]){
    const card=page.locator(`[data-class-kind="${kind}"]`);await expect(card.locator(`[data-demo="${id}"]`)).toContainText('加入課程');await expect(card).toContainText(kind==='warmup'?'15 分鐘':'30 分鐘');await expect(card).toContainText('暖身 5 分');await expect(card).toContainText('緩和 5 分');
  }
  for(const label of ['離地坐姿','倒掛','回正落地'])await expect(page.locator('[data-class-kind="aerial"]')).toContainText(label);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{const w=window.__FORM__.world;w.placePlayerAtStation('group-class');w.update(.05,false);w.update(0);});
  await page.keyboard.press('e');await expect(page.getByRole('dialog',{name:'團體課程'})).toBeVisible();
  await expect(page.locator('.class-course-card')).toHaveCount(7);
  expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().exerciseId)).toBeNull();
  await page.keyboard.press('Escape');await page.locator('.header-actions [data-action="library"]').click();
  await page.locator('[data-catalog-group="classes"]').click();await expect(page.locator('.class-course-card')).toHaveCount(7);
  expect(await page.locator('.trial-exercise-card:not(.class-course-card)').count()).toBe(0);
});

test('課程顯示倒數與下一段，預覽結尾有摘要並可重新上課',async({page})=>{
  test.setTimeout(240000);
  await page.setViewportSize({width:1280,height:800});
  await page.locator('.header-actions [data-action="classes"]').click();await page.locator('[data-demo="class-dance"]').click();
  expect(await page.evaluate(()=>window.__FORM__.world.advanceUntilReady())).toBe(true);
  await expect(page.locator('.class-panel')).toContainText('有氧舞蹈');await expect(page.locator('.class-plan-item')).toHaveCount(23);
  await page.getByRole('button',{name:'預覽第 1 輪・踏併步',exact:true}).click();
  expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().phase)).toBeCloseTo(1/6,5);
  expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().paused)).toBe(true);
  await expect(page.locator('[data-class-block="4"] button')).toHaveAttribute('aria-current','step');await expect(page.locator('#class-segment-title')).toContainText('踏併步');
  await expect(page.locator('#class-time-elapsed')).toHaveText('5:00');await expect(page.locator('#class-time-remaining')).toHaveText('25:00');await expect(page.locator('#class-next-label')).toContainText('V 字踏步');await expect(page.locator('#class-preview-note')).toContainText('預覽模式');
  const before=await page.evaluate(()=>window.__FORM__.world.getContactDiagnostics().body.hands);
  await page.evaluate(()=>{for(let i=0;i<20;i++)window.__FORM__.world.update(.05,false);window.__FORM__.world.update(0);});
  expect(await page.evaluate(()=>window.__FORM__.world.getContactDiagnostics().body.hands)).toEqual(before);
  await page.locator('[data-speed="0.5"]').click();await expect(page.locator('[data-speed="0.5"]')).toHaveAttribute('aria-pressed','true');
  const colors=await page.evaluate(()=>({primary:getComputedStyle(document.querySelector('.class-muscles .primary-swatch')).backgroundColor,secondary:getComputedStyle(document.querySelector('.class-muscles .secondary-swatch')).backgroundColor,highlights:window.__FORM__.world.getMuscleHighlights()}));
  expect(colors.primary).toBe('rgb(220, 104, 85)');expect(colors.secondary).toBe('rgb(226, 162, 97)');expect(colors.highlights.primary).toContain('quads');
  await page.locator('#pose-scrub').evaluate(input=>{input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(page.locator('#class-completion')).toBeVisible();await expect(page.locator('#class-completion-title')).toHaveText('預覽已到課程結尾');await expect(page.locator('#class-time-remaining')).toHaveText('0:00');
  const completionLayouts=await page.locator('#class-completion').evaluate(card=>{
    const title=card.querySelector('h3'),description=card.querySelector('#class-completion-description'),original=[title.textContent,description.textContent],scroll=card.closest('.station-scroll'),controls=card.closest('.class-panel').querySelector('.station-controls');
    // Check both copy variants in the actual layout; this does not change the
    // runtime preview flag or pretend that a skipped lesson was attended.
    const layouts=[['預覽已到課程結尾',original[1]],['課程完成','已依序走完暖身、主要訓練與緩和。']].map(([heading,copy])=>{
      title.textContent=heading;description.textContent=copy;const bounds=scroll.getBoundingClientRect(),footer=controls.getBoundingClientRect();return{heading,top:bounds.top,bottom:Math.min(bounds.bottom,footer.top,innerHeight),width:innerWidth,actions:[...card.querySelectorAll('.class-completion-actions button')].map(button=>{const r=button.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};})};
    });title.textContent=original[0];description.textContent=original[1];return layouts;
  });
  for(const layout of completionLayouts){expect(layout.actions,layout.heading).toHaveLength(2);for(const action of layout.actions){expect(action.height,layout.heading).toBeGreaterThan(0);expect(action.top,layout.heading).toBeGreaterThanOrEqual(layout.top-1);expect(action.bottom,layout.heading).toBeLessThanOrEqual(layout.bottom+1);expect(action.left,layout.heading).toBeGreaterThanOrEqual(0);expect(action.right,layout.heading).toBeLessThanOrEqual(layout.width);}}
  expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().stage)).toBe('completed');
  await page.evaluate(()=>{for(let i=0;i<20;i++)window.__FORM__.world.update(.05,false);});expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().phase)).toBe(1);
  await page.locator('#class-completion [data-action="course-restart"]').click();
  await expect(page.locator('#class-completion')).toBeHidden();expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().course.previewed)).toBe(false);expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().course.remaining)).toBeGreaterThan(1790);
  await page.locator('[data-action="learned"]').click();expect(await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle())).toBe(true);
  const learned=await page.evaluate(()=>JSON.parse(localStorage.getItem('form.exercise-progress.v1')));expect(learned).toContain('class-dance');expect(learned).not.toContain('class-cycle');
  await page.locator('.header-actions [data-action="classes"]').click();await page.locator('[data-demo="group-class"]').click();
  expect(await page.evaluate(()=>window.__FORM__.world.advanceUntilReady())).toBe(true);await expect(page.locator('.class-panel')).toContainText('全身活動課');await expect(page.locator('.class-plan-item')).toHaveCount(18);expect(await page.evaluate(()=>window.__FORM__.world.getActivityState().course.duration)).toBe(900);
  await page.locator('[aria-label="離開課程"]').click();expect(await page.evaluate(()=>window.__FORM__.world.advanceUntilIdle())).toBe(true);expect(await page.evaluate(()=>window.__FORM__.state.active)).toBeNull();
});

test('七種團課有不同器材與動作，換課會等教練學員就位並保持接點',async({page},testInfo)=>{
  test.setTimeout(300000);
  const report=await page.evaluate(()=>{
    const a=window.__FORM__,w=a.world,ids=['group-class','class-dance','class-cycle','class-trx','class-barbell','class-aerial','class-pilates'],report=[];
    for(const id of ids){
      a.openExercise(id);const ready=w.advanceUntilReady(180,false);w.setAnimationPaused(true);const legend=selector=>[...document.querySelectorAll(`${selector} .muscle-legend > span`)].map(el=>el.textContent.trim());const result={id,ready,kind:w.getClassDiagnostics().selectedKind,duration:w.getActivityState().course.duration,badgeLegend:legend('.demo-badge'),panelLegend:legend('.class-muscles'),phases:[]};
      for(const phase of [0,.2,.5,.9,1]){
        w.seekExercise(phase);for(let i=0;i<4;i++)w.update(.05,false);
        const contact=w.getContactDiagnostics(),clearance=w.getClearanceDiagnostics(),self=w.getSelfClearanceDiagnostics(),surface=w.getSurfaceDiagnostics({stride:80}),social=w.getSocialDiagnostics({surfaceStride:80}),classes=w.getClassDiagnostics();
        result.phases.push({phase,contact:contact.maxContactError,reach:contact.maxReachError,gear:contact.gearHands,collisions:clearance.collisions,self:self.collisions,surface:surface.collisions,npcs:classes.npcs.map(n=>({kind:n.kind,status:n.status})),social:social.actors.filter(n=>n.role.startsWith('class-')).map(n=>({id:n.id,phase:n.classPhase,reach:n.contactError,collisions:n.collisions,self:n.selfCollisions,surface:n.surface.collisions}))});
      }
      result.ended=w.getActivityState();result.summary=document.querySelector('#class-completion-title')?.textContent;result.remaining=document.querySelector('#class-time-remaining')?.textContent;w.stopExercise();result.left=w.advanceUntilIdle(180,false);report.push(result);
    }
    w.update(0);return report;
  });
  await testInfo.attach('all-seven-class-programs',{body:JSON.stringify(report),contentType:'application/json'});
  expect(new Set(report.map(r=>r.kind)).size).toBe(7);
  for(const r of report){expect(r.badgeLegend,r.id).toEqual([['warmup','aerial'].includes(r.kind)?'活動與伸展目標':'課程主要參與','輔助與支撐']);expect(r.badgeLegend,r.id).toEqual(r.panelLegend);}
  for(const r of report){expect(r.duration,r.id).toBe(r.kind==='warmup'?900:1800);expect(r.ended.stage,r.id).toBe('completed');expect(r.ended.phase,r.id).toBe(1);expect(r.ended.course.previewed,r.id).toBe(true);expect(r.summary,r.id).toBe('預覽已到課程結尾');expect(r.remaining,r.id).toBe('0:00');}
  for(const r of report){expect(r.ready,r.id).toBe(true);expect(r.left,r.id).toBe(true);for(const p of r.phases){expect(p.contact,r.id).toBeLessThan(.015);expect(p.reach,r.id).toBeLessThan(.015);expect(p.collisions,r.id).toEqual([]);expect(p.self,r.id).toEqual([]);expect(p.surface,r.id).toEqual([]);for(const h of p.gear)expect(h.error,r.id).toBeLessThan(.015);for(const n of p.npcs){expect(n.kind,r.id).toBe(r.kind);expect(n.status,r.id).toBe('using');}for(const n of p.social){expect(n.reach,`${r.id}/${n.id}`).toBeLessThan(.015);expect(n.collisions,`${r.id}/${n.id}`).toEqual([]);expect(n.self,`${r.id}/${n.id}`).toEqual([]);expect(n.surface,`${r.id}/${n.id}`).toEqual([]);}}}
});
