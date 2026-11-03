import {test,expect} from '@playwright/test';

// Every approach and exit below runs on the application's ordinary RAF.
// __FORM__, when present on a development build, is read only. The production
// run still performs every UI assertion and explicitly records that model
// diagnostics are unavailable; UI success is not reported as angle evidence.
const errors=new WeakMap();
const chestSource='https://kb.cybexintl.com/Owners_Manuals/Strength/Life_Fitness_Insignia_Series_Owners_Manual_9481201_Rev_BE.pdf';
const straightSource='https://www.catalystathletics.com/exercise/907/Straight-Arm-Pulldown/';

test.beforeEach(async({page})=>{
  const list=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));
  await page.addInitScript(()=>{
    // Observe the visible lifecycle labels without modifying clocks, RAF,
    // model transforms, the navigation route, or the player's position.
    const trace=[];window.__PUBLIC_TEACHING_UI_TRACE_V020__=trace;
    new MutationObserver(()=>{
      const label=document.querySelector('#activity-flow-status')?.textContent;
      const control=document.querySelector('.station-panel [data-action="pause"]');
      const item={label:label||null,enabled:control?!control.disabled:false};
      const previous=trace.at(-1);
      if((!previous||item.label!==previous.label||item.enabled!==previous.enabled)&&trace.length<2000)trace.push({...item,time:performance.now()});
    }).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled']});
  });
});
test.afterEach(async({page},testInfo)=>{
  expect(errors.get(page),'不得出現未處理的模型、骨架或頁面錯誤').toEqual([]);
  const gpu=await page.locator('#gym-canvas').evaluate(canvas=>{
    const gl=canvas.getContext('webgl2'),extension=gl?.getExtension('WEBGL_debug_renderer_info');
    return {renderer:gl?String(extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)):null,contextAttributes:gl?.getContextAttributes(),viewport:[innerWidth,innerHeight],framebuffer:[canvas.width,canvas.height]};
  });
  expect(gpu.renderer).toBeTruthy();expect(gpu.renderer).not.toMatch(/swiftshader|llvmpipe|lavapipe|software|basic render/i);
  await attachJSON(testInfo,'actual-webgl-renderer',gpu);
});

function appUrl(baseURL,id){
  const base=new URL(baseURL||'http://127.0.0.1:5173/');
  if(!base.pathname.endsWith('/'))base.pathname+='/';
  base.search='';base.hash='';base.searchParams.set('exercise',id);return base.href;
}
async function enterFromPublicLink(page,baseURL,id,title){
  await page.goto(appUrl(baseURL,id));
  await expect(page.locator('.station-title h2')).toHaveText(title,{timeout:120_000});
  await expect(page.locator('.station-panel [data-action="pause"]')).toBeEnabled({timeout:150_000});
}
async function sourceDetails(page,id){
  const details=page.locator(`.station-panel [data-teaching-reference="${id}"]`);
  await expect(details).toBeVisible();await expect(details).not.toHaveAttribute('open','');
  await details.locator('summary').click();await expect(details).toHaveAttribute('open','');return details;
}
async function linkIsExternal(details,url){
  const link=details.locator('a');
  const match=details.locator(`a[href="${url}"]`);
  await expect(match).toBeVisible();await expect(match).toHaveAttribute('target','_blank');
  await expect(match).toHaveAttribute('rel',/noopener/);await expect(match).toHaveAttribute('rel',/noreferrer/);
  expect(await link.count()).toBeGreaterThan(0);
}
async function openReview(page){
  await page.locator('.header-actions [data-action="help"]').click();
  await page.locator('[data-action="motion-review"]').click();
  const dialog=page.getByRole('dialog',{name:'動作檢查工作台',exact:true});await expect(dialog).toBeVisible();return dialog;
}
async function attachJSON(testInfo,name,value){await testInfo.attach(name,{body:JSON.stringify(value,null,2),contentType:'application/json'});}
async function attachImage(testInfo,name,locator){
  const src=await locator.getAttribute('src');expect(src).toMatch(/^data:image\/png;base64,/);
  const body=Buffer.from(src.split(',')[1],'base64');
  await testInfo.attach(name,{body,contentType:'image/png'});return body;
}

test('普通器材顯示公開教學、核對範圍與原廠連結，工作台保留資料分類和未審查限制',async({page,baseURL},testInfo)=>{
  await enterFromPublicLink(page,baseURL,'machine-chest-press','坐姿胸推機');
  await page.locator('.station-panel [data-action="pause"]').click();
  const details=await sourceDetails(page,'machine-chest-press');
  await expect(details.locator('summary')).toHaveText('公開教學對照 · 同類器材動作教學');
  await expect(details).toContainText('這次核對：');await expect(details).toContainText('控制回程');
  await expect(details).toContainText('未涵蓋：');await expect(details).toContainText('離開程序尚未涵蓋');
  await expect(details).toContainText('2026-11-03');await expect(details).toContainText('來源核對與動畫檢查分開記錄');
  await linkIsExternal(details,chestSource);
  await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).not.toHaveAttribute('open','');
  await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open','');

  const dialog=await openReview(page);
  await expect(dialog.locator('.review-public-teaching')).toContainText('先用公開教學對照');
  await expect(dialog.locator('.review-public-teaching')).toContainText('來源核對不表示整段動畫已驗收');
  const reviewSource=dialog.locator('[data-teaching-reference="machine-chest-press"]');
  await reviewSource.locator('summary').click();await linkIsExternal(reviewSource,chestSource);
  await expect(reviewSource).toContainText('離開程序尚未涵蓋');
  await expect(dialog).toContainText('不會自動產生真人教練簽核');
  await dialog.locator('.review-checklist summary').click();
  await expect(dialog.locator('.review-checklist li').filter({hasText:'槓片式腿推機'})).toContainText('器材資料');
  await expect(dialog.locator('.review-checklist li').filter({hasText:'槓片式下斜胸推機'})).toContainText('相關變式參考');
  await testInfo.attach('ordinary-machine-source-and-review-ui',{body:await page.screenshot(),contentType:'image/png'});
  await dialog.locator('[data-review-close]').click();await expect(dialog).not.toBeVisible();
  await expect(page.locator('.station-panel [data-action="pause"]')).toHaveAttribute('aria-label','播放示範');
});

test('直臂下拉正常進出、紅橘標色與來源保留，另存三相位三向姿勢預覽',async({page,baseURL},testInfo)=>{
  await enterFromPublicLink(page,baseURL,'cable-straight-arm-pulldown','直桿直臂下拉');
  const details=await sourceDetails(page,'cable-straight-arm-pulldown');
  await linkIsExternal(details,straightSource);await expect(details).toContainText('動畫校正：');
  await expect(details).toContainText('不是人體通用角度處方');
  const colors=await page.locator('.station-panel .muscle-map').evaluate(svg=>({
    primary:[...new Set([...svg.querySelectorAll('[data-activation="primary"]')].map(node=>getComputedStyle(node).fill))],
    secondary:[...new Set([...svg.querySelectorAll('[data-activation="secondary"]')].map(node=>getComputedStyle(node).fill))],
  }));
  expect(colors).toEqual({primary:['rgb(220, 104, 85)'],secondary:['rgb(226, 162, 97)']});
  await expect(page.locator('.header-actions [data-action="overlay"]')).toHaveAttribute('aria-pressed','true');

  const diagnosticsAvailable=await page.evaluate(()=>typeof window.__FORM__?.world?.getContactDiagnostics==='function');
  const samples=[];
  if(diagnosticsAvailable){
    for(let i=0;i<5;i++){
      samples.push(await page.evaluate(()=>{
        const w=window.__FORM__.world;return{state:w.getActivityState(),model:w.getModelInfo(),contact:w.getContactDiagnostics(),hands:w.getHandDiagnostics(),highlights:w.getMuscleHighlights(),clearance:w.getClearanceDiagnostics(),self:w.getSelfClearanceDiagnostics()};
      }));
      // Real RAF progress; this wait does not advance or replace the game clock.
      if(i<4)await page.waitForTimeout(220);
    }
    const angle=(a,b,c)=>{const x=a.map((v,i)=>v-b[i]),y=c.map((v,i)=>v-b[i]);return Math.acos(Math.max(-1,Math.min(1,x.reduce((sum,v,i)=>sum+v*y[i],0)/(Math.hypot(...x)*Math.hypot(...y)))))*180/Math.PI;};
    for(const sample of samples){
      expect(sample.state.stage).toBe('exercising');expect(sample.model.kind).toBe('skinned-human');expect(sample.model.skinnedMeshCount).toBeGreaterThan(0);
      expect(sample.contact.maxContactError).toBeLessThan(.015);expect(sample.contact.maxReachError).toBeLessThan(.015);
      expect(sample.contact.gearHands).toHaveLength(2);expect(sample.contact.gearFeet).toHaveLength(2);
      for(const contact of [...sample.contact.gearHands,...sample.contact.gearFeet])expect(contact.error).toBeLessThan(.015);
      for(let side=0;side<2;side++){
        const b=sample.contact.body;expect(Math.abs(angle(b.shoulders[side],b.elbows[side],b.wrists[side])-165),'正式蒙皮模型的肩—肘—腕夾角，非人體建議角度').toBeLessThan(.1);
        expect(sample.hands[side].wristBendRadians*180/Math.PI).toBeLessThan(22);
      }
      expect(sample.highlights.primary).toEqual(['back']);expect([...sample.highlights.secondary].sort()).toEqual(['core','triceps']);
      expect(sample.clearance.collisions).toEqual([]);expect(sample.self.collisions).toEqual([]);
    }
    expect(new Set(samples.map(sample=>sample.state.phase.toFixed(4))).size,'原生 RAF 必須持續播放，不能凍結模型取樣').toBeGreaterThan(1);
  }else{
    testInfo.annotations.push({type:'scope',description:'Production 未開放 DEV 模型診斷 API；本次仍驗 UI 與真實進出，不宣稱本次已量到 165° 或 3D 接點誤差。'});
  }
  await attachJSON(testInfo,'straight-arm-native-raf-model-diagnostics',{diagnosticsAvailable,samples,scope:'Only reads actual frames. No update, teleport, seek helper, RAF override or external clock control. The 165 degree angle is a fixed-model design value.'});

  await page.locator('.station-panel [data-action="pause"]').click();
  const dialog=await openReview(page),previews=[],previewImages=new Map();
  await expect(dialog.locator('[data-review-direction]')).toHaveValue('loop');
  // These are explicit workbench pose previews, separate from the real-time
  // approach/use/exit above. Browser keys/pointer operate the public slider.
  for(const phase of [0,.5,1]){
    const slider=dialog.locator('[data-review-phase]');await slider.scrollIntoViewIfNeeded();
    if(phase===0)await slider.press('Home');else if(phase===1)await slider.press('End');else{
      const bounds=await slider.boundingBox();expect(bounds).not.toBeNull();await slider.click({position:{x:bounds.width/2,y:bounds.height/2}});
    }
    await expect(dialog.locator('.review-inspection-controls output')).toHaveText(`${phase*100}%`);
    for(const view of ['front','side','back']){
      await dialog.locator(`[data-review-view="${view}"]`).click();
      const image=dialog.locator('.motion-review-image');await expect(image).toBeVisible();
      const body=await attachImage(testInfo,`straight-arm-explicit-preview-${phase*100}pct-${view}`,image);
      previewImages.set(`${phase}:${view}`,body);
      previews.push({phase,view,meaning:'User-operated workbench pose preview; not a normal RAF lifecycle sample.'});
    }
  }
  for(const view of ['front','side','back'])expect(previewImages.get(`0:${view}`).equals(previewImages.get(`0.5:${view}`)),`${view} 的 0% 與 50% 實際 PNG 必須不同，不能只更新行程數字`).toBe(false);
  await attachJSON(testInfo,'straight-arm-preview-index',previews);
  await dialog.locator('[data-review-close]').click();await expect(dialog).not.toBeVisible();
  const helpClose=page.locator('[data-action="close-modal"]');
  if(await helpClose.isVisible())await helpClose.click();
  await page.locator('.station-panel [data-action="close-teaching"]').click();
  await expect(page.locator('.station-panel')).toHaveCount(0,{timeout:90_000});
  const trace=await page.evaluate(()=>window.__PUBLIC_TEACHING_UI_TRACE_V020__);
  expect(trace.some(item=>item.enabled),'正常進入運動階段後控制才可用').toBe(true);
  expect(trace.map(item=>item.label).join(' ')).toMatch(/控制重量回位/);
  const exitLabels=trace.map(item=>item.label);
  for(const label of ['慢慢把直桿放回掛位','鬆手並抬離握把','離開龍門架'])expect(exitLabels,`龍門架退場應顯示「${label}」`).toContain(label);
  const completed=diagnosticsAvailable?await page.evaluate(()=>window.__FORM__.world.getLastCompletedActivity()):null;
  if(completed){expect(completed.id).toBe('cable-straight-arm-pulldown');for(const stage of ['approaching','entering','exercising','returning','exiting','finished'])expect(completed.history).toContain(stage);}
  await attachJSON(testInfo,'straight-arm-normal-lifecycle-ui-trace',{trace,completed,meaning:'Lifecycle advances only by normal RAF; the UI preview sequence is separately labelled in its image index.'});
});

test.describe('手機公開教學閱讀與觸控',()=>{
  test.use({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  test('教學摘要可點開和收合，文字至少 16px 且不橫向溢出',async({page,baseURL},testInfo)=>{
    await enterFromPublicLink(page,baseURL,'machine-chest-press','坐姿胸推機');
    await page.locator('[data-mobile-panel-toggle]').tap();
    const details=page.locator('.station-panel [data-teaching-reference="machine-chest-press"]'),summary=details.locator('summary');
    await summary.scrollIntoViewIfNeeded();await expect(details).not.toHaveAttribute('open','');
    const before=await summary.evaluate(element=>({fontSize:parseFloat(getComputedStyle(element).fontSize),height:element.getBoundingClientRect().height}));
    expect(before.fontSize).toBeGreaterThanOrEqual(16);expect(before.height).toBeGreaterThanOrEqual(44);
    await summary.tap();await expect(details).toHaveAttribute('open','');await linkIsExternal(details,chestSource);
    const layout=await details.evaluate(element=>({
      viewport:[innerWidth,innerHeight],documentOverflow:document.documentElement.scrollWidth-innerWidth,
      ownOverflow:element.scrollWidth-element.clientWidth,
      paragraphSizes:[...element.querySelectorAll('p,li')].map(node=>parseFloat(getComputedStyle(node).fontSize)),
      summary:element.querySelector('summary').getBoundingClientRect().toJSON(),
    }));
    expect(layout.documentOverflow).toBeLessThanOrEqual(1);expect(layout.ownOverflow).toBeLessThanOrEqual(1);
    expect(layout.paragraphSizes.length).toBeGreaterThan(0);for(const size of layout.paragraphSizes)expect(size).toBeGreaterThanOrEqual(16);
    await testInfo.attach('mobile-source-details',{body:await page.screenshot(),contentType:'image/png'});
    await attachJSON(testInfo,'mobile-source-readability',{before,layout,scope:'Chromium touch viewport; this is not physical phone performance evidence.'});
    await summary.scrollIntoViewIfNeeded();await summary.tap();await expect(details).not.toHaveAttribute('open','');
    await page.locator('[data-mobile-panel-toggle]').tap();await expect(page.locator('[data-mobile-panel-toggle]')).toHaveAttribute('aria-expanded','false');
  });
});
