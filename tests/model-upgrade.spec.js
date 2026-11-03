import { test, expect } from '@playwright/test';

const errorsByPage = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.__FORM__?.state.loaded === true);
});
test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page), '升級後不應出現瀏覽器執行錯誤').toEqual([]);
});

const openStation = (page, id) => page.evaluate(stationId => {
  const api = window.__FORM__;
  api.openStation(api.stations.find(station => station.id === stationId));
}, id);

test('24 台器材圖鑑可篩選槓片式、搜尋臀推並從歡迎頁設定自由探索導航', async ({ page }) => {
  await page.locator('[data-action="catalog"]').click();
  const catalog = page.getByRole('dialog', { name: '器材圖鑑' });
  await expect(catalog).toBeVisible();
  await expect(catalog.locator('.catalog-item')).toHaveCount(24);
  await catalog.locator('[data-catalog-category="plate-loaded"]').click();
  await expect(catalog.locator('.catalog-item')).toHaveCount(8);
  await expect(catalog.locator('.catalog-result-caption')).toContainText('8 種器材');
  await expect(catalog.locator('[data-catalog-category="plate-loaded"]')).toHaveAttribute('aria-pressed', 'true');
  await catalog.getByRole('searchbox', { name: '搜尋器材或肌群' }).fill('臀推');
  await expect(catalog.locator('.catalog-item')).toHaveCount(1);
  await expect(catalog.locator('.catalog-item')).toContainText('槓片式臀推機');
  await catalog.locator('[data-catalog-target="hip-thrust"]').click();
  await expect(catalog).toHaveCount(0);
  await expect(page.getByRole('main', { name: '健身房探索' })).toBeVisible();
  await expect(page.locator('.mission-panel')).toContainText('自由模式');
  await expect(page.locator('.navigation-pill')).toContainText('槓片式臀推機');
  expect(await page.evaluate(() => window.__FORM__.state.targetId)).toBe('hip-thrust');
  await page.locator('[data-action="catalog"]').click();
  await expect(catalog).toBeVisible();
  await catalog.getByRole('searchbox', { name: '搜尋器材或肌群' }).focus();
  await page.keyboard.press('Escape');
  await expect(catalog).toHaveCount(0);
});

test('槓片外觀設定會改變對稱片數，離開再開教學仍保留每側裝片設定', async ({ page }, testInfo) => {
  await page.locator('[data-action="free"]').click();
  await openStation(page, 'plate-incline-press');
  const control = page.getByRole('region', { name: '槓片外觀設定' });
  await expect(control).toBeVisible();
  const states = [];
  for (const kg of [5, 10, 20]) {
    await control.locator(`[data-plate-load="${kg}"]`).click();
    await expect(control.locator(`[data-plate-load="${kg}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(control.locator('#plate-load-label')).toHaveText(`${kg} kg／側`);
    const state = await page.evaluate(id => ({
      load: window.__FORM__.world.getPlateLoad(id),
      appearance: window.__FORM__.world.getPlateState(id),
    }), 'plate-incline-press');
    expect(state.load).toBe(kg);
    expect(state.appearance.kgPerSide).toBe(kg);
    expect(state.appearance.visiblePlates.left).toBeGreaterThan(0);
    expect(state.appearance.visiblePlates.left).toBe(state.appearance.visiblePlates.right);
    states.push(state);
  }
  expect(states[2].appearance.visiblePlates.left, '較多掛片必須實際顯示更多槓片').toBeGreaterThan(states[0].appearance.visiblePlates.left);
  await page.keyboard.press('Escape');
  await openStation(page, 'plate-incline-press');
  await expect(page.locator('[data-plate-load="20"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__FORM__.world.getPlateLoad('plate-incline-press'))).toBe(20);
  await testInfo.attach('symmetric-plate-appearance', { body: JSON.stringify(states, null, 2), contentType: 'application/json' });
});

test('舊器材與新槓片器材切換後，紅色主肌及橘色輔助肌群仍與 3D 人物一致', async ({ page }) => {
  await page.locator('[data-action="free"]').click();
  for (const id of ['chest-press', 'plate-incline-press', 'plate-high-row', 'hack-squat', 'hip-thrust', 'calf-raise', 'leg-curl']) {
    await openStation(page, id);
    const result = await page.evaluate(stationId => {
      const api = window.__FORM__, station = api.stations.find(item => item.id === stationId);
      const paths = [...document.querySelectorAll('.muscle-map path[data-muscle]')];
      const keys = activation => [...new Set(paths.filter(path => path.dataset.activation === activation).map(path => path.dataset.muscle))].sort();
      const colors = activation => [...new Set(paths.filter(path => path.dataset.activation === activation).map(path => getComputedStyle(path).fill))];
      const world = api.world.getMuscleHighlights();
      return {
        expected: { primary: [...station.muscleKeys].sort(), secondary: [...station.secondaryMuscleKeys].sort() },
        actual: { primary: keys('primary'), secondary: keys('secondary') },
        world: { primary: [...world.primary].sort(), secondary: [...world.secondary].sort() },
        primaryColors: colors('primary'), secondaryColors: colors('secondary'),
      };
    }, id);
    expect(result.actual, `${id} 的人體圖肌群`).toEqual(result.expected);
    expect(result.world, `${id} 的人物肌群`).toEqual(result.expected);
    expect(result.primaryColors).toEqual(['rgb(220, 104, 85)']);
    expect(result.secondaryColors).toEqual(result.expected.secondary.length ? ['rgb(226, 162, 97)'] : []);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__FORM__.world.getMuscleHighlights())).toEqual({ primary: [], secondary: [] });
  }
});

test('24 台五個行程位置：掌心與鞋底對準接點，固定肢長且沒有 NaN', async ({ page }, testInfo) => {
  await page.locator('[data-action="free"]').click();
  const samples = await page.evaluate(() => {
    const api = window.__FORM__, samples = [];
    for (const station of api.stations) {
      api.openStation(station);
      api.world.setAnimationPaused(true);
      for (const movement of [0, .25, .5, .75, 1]) {
        const diagnostics = api.world.inspectExercise(movement, movement);
        samples.push({ id: station.id, movement, diagnostics });
      }
    }
    return samples;
  });
  expect(samples).toHaveLength(120);
  const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
  const finite = value => typeof value === 'number' ? Number.isFinite(value) : Array.isArray(value) ? value.every(finite) : value && typeof value === 'object' ? Object.values(value).every(finite) : true;
  for (const { id, movement, diagnostics: d } of samples) {
    const label = `${id} 在行程 ${movement}`;
    expect(d, `${label} 應回傳接觸診斷`).toBeTruthy();
    expect(d.stationId).toBe(id);
    expect(finite(d), `${label} 不應出現 NaN 或 Infinity`).toBe(true);
    expect(d.hands).toHaveLength(2);
    expect(d.feet).toHaveLength(2);
    for (const point of [...d.hands, ...d.feet]) {
      expect(point.expected).toHaveLength(3);
      expect(point.actual).toHaveLength(3);
      expect(distance(point.expected, point.actual), `${label} 的實際接點偏差`).toBeLessThanOrEqual(.025);
      expect(point.error, `${label} 的回報接點偏差`).toBeCloseTo(distance(point.expected, point.actual), 6);
    }
    expect(d.maxContactError, `${label} 最大接觸誤差`).toBeLessThanOrEqual(.025);
    expect(d.maxReachError, `${label} 不可靠拉長肢體貼合器材`).toBeLessThanOrEqual(.025);
    for (let side = 0; side < 2; side++) {
      const body = d.body;
      expect(distance(body.shoulders[side], body.elbows[side]), `${label} 上臂長`).toBeCloseTo(.29, 4);
      expect(distance(body.elbows[side], body.wrists[side]), `${label} 前臂長`).toBeCloseTo(.27, 4);
      expect(distance(body.wrists[side], body.hands[side]), `${label} 手腕至掌心`).toBeCloseTo(.06, 4);
      expect(distance(body.hips[side], body.knees[side]), `${label} 大腿長`).toBeCloseTo(.43, 4);
      expect(distance(body.knees[side], body.ankles[side]), `${label} 小腿長`).toBeCloseTo(.43, 4);
    }
  }
  await testInfo.attach('all-equipment-contact-samples', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});

test('24 台器材的互動入口均未被碰撞箱擋住，且從入口可規劃導航路徑', async ({ page }, testInfo) => {
  await page.locator('[data-action="free"]').click();
  const navigation = await page.evaluate(() => window.__FORM__.world.getNavigationDiagnostics());
  await testInfo.attach('navigation-reachability', { body: JSON.stringify(navigation, null, 2), contentType: 'application/json' });
  expect(navigation).toHaveLength(24);
  expect(new Set(navigation.map(item => item.id)).size).toBe(24);
  for (const item of navigation) {
    expect(Number.isFinite(item.interaction.x) && Number.isFinite(item.interaction.z), `${item.id} 互動點座標`).toBe(true);
    expect(item.blocked, `${item.id} 互動點不能落在碰撞箱內`).toBe(false);
    expect(item.reachable, `${item.id} 應能從入口規劃可走通的路徑`).toBe(true);
  }
});
