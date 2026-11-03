import { test, expect } from '@playwright/test';

const browserErrors = new WeakMap();
const position = page => page.evaluate(() => window.__FORM__.world.getPlayerPosition());
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__FORM__?.state.loaded === true);
  await expect(page.getByRole('button', { name: '開始今日探索' })).toBeEnabled();
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), '瀏覽器不應出現 JavaScript 或 console 錯誤').toEqual([]);
});

async function chooseGuided(page, id = 'chest') {
  await page.locator(`[data-goal="${id}"]`).click();
  await page.getByRole('button', { name: '開始今日探索' }).click();
  await expect(page.getByRole('main', { name: '健身房探索' })).toBeVisible();
}

// Drive the real keyboard controls and observe the resulting player position.
// No teleporting or openStation shortcut is used for the physical interaction test.
async function walkTo(page, destination) {
  const yaw = 0.3; // Initial follow-camera yaw; this journey never drags the camera.
  const path = [await position(page)];
  for (let pulse = 0; pulse < 180; pulse++) {
    const current = path[path.length - 1];
    // Each real key pulse can move about half a metre at desktop frame rates.
    // Waypoints keep us in the aisle; the final interaction still independently
    // requires the actual nearby-station detector and a real E key press.
    if (distance(current, destination) < 0.6) return path;
    const dx = destination.x - current.x;
    const dz = destination.z - current.z;
    const forward = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
    const sideways = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    const key = Math.abs(forward) >= Math.abs(sideways)
      ? (forward > 0 ? 'w' : 's')
      : (sideways > 0 ? 'd' : 'a');
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    await page.keyboard.up(key);
    path.push(await position(page));
    if (path.length > 14 && distance(path[path.length - 14], path[path.length - 1]) < 0.08) {
      throw new Error(`行走遭阻擋：${JSON.stringify({ destination, current, key })}`);
    }
  }
  throw new Error(`未能靠真實移動抵達：${JSON.stringify({ destination, last: path.at(-1) })}`);
}

async function animationDelta(page, updates = 12) {
  return page.evaluate(count => {
    const progress = document.querySelector('#pose-progress');
    // The HUD callback is throttled. Flush its pending frame before measuring;
    // pausing can leave the last displayed value one render behind the rig.
    for (let frame = 0; frame < 2; frame++) window.__FORM__.world.update(0.05);
    const start = progress.value;
    for (let frame = 0; frame < count; frame++) window.__FORM__.world.update(0.05);
    const end = progress.value;
    return (end - start + 1) % 1;
  }, updates);
}

test('選部位與開始引導，並能切換自由探索及重新選擇', async ({ page }) => {
  await page.locator('[data-goal="back"]').click();
  await expect(page.locator('[data-goal="back"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.route-preview')).toContainText('高位下拉機');
  await expect(page.locator('.route-preview')).toContainText('坐姿划船機');
  await page.getByRole('button', { name: '開始今日探索' }).click();
  await expect(page.locator('.mission-panel')).toContainText('背部探索日');
  await expect(page.locator('.navigation-pill')).toContainText('高位下拉機');
  await expect.poll(() => page.evaluate(() => window.__FORM__.state.targetId)).toBe('lat-pulldown');

  await page.getByRole('button', { name: '切換為自由探索' }).click();
  await expect(page.locator('.mission-panel')).toContainText('自由模式');
  expect(await page.evaluate(() => window.__FORM__.state.targetId)).toBeNull();
  await expect(page.locator('.navigation-pill')).toHaveCount(0);

  await page.getByRole('button', { name: '選擇今天的探索部位' }).click();
  await expect(page.getByRole('main', { name: '選擇今日探索模式' })).toBeVisible();
  await page.locator('[data-action="free"]').click();
  await expect(page.locator('.mission-panel')).toContainText('自由模式');
});

test('WASD 實際移動，地圖設目標且 Esc 關閉後可繼續走動', async ({ page }) => {
  await page.locator('[data-action="free"]').click();
  for (const key of ['w', 'a', 's', 'd']) {
    const before = await position(page);
    await page.keyboard.down(key);
    try {
      await expect.poll(async () => distance(before, await position(page)), {
        message: `${key.toUpperCase()} 應改變角色位置`,
      }).toBeGreaterThan(0.2);
    } finally {
      await page.keyboard.up(key);
    }
  }

  await page.keyboard.press('m');
  const map = page.getByRole('dialog', { name: '場館地圖' });
  await expect(map).toBeVisible();
  await expect(map.locator('[data-map-station]')).toHaveCount(24);
  const beforeModalMove = await position(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  expect(distance(beforeModalMove, await position(page)), '開地圖時角色應停止移動').toBeLessThan(0.01);

  await map.getByRole('button', { name: '導航至腿推機', exact: true }).click();
  await expect(map).toHaveCount(0);
  await expect(page.locator('.navigation-pill')).toContainText('腿推機');
  expect(await page.evaluate(() => window.__FORM__.state.targetId)).toBe('leg-press');

  await page.getByRole('button', { name: '場館地圖', exact: true }).click();
  await expect(map).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(map).toHaveCount(0);
  const beforeResume = await position(page);
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => distance(beforeResume, await position(page))).toBeGreaterThan(0.2);
  } finally {
    await page.keyboard.up('w');
  }
});

test('真實走近胸推機後互動：分頁、動畫控制、進度與重新載入', async ({ page }, testInfo) => {
  await chooseGuided(page);
  const start = await position(page);
  await page.keyboard.press('e');
  await expect(page.locator('.station-panel')).toHaveCount(0);
  expect(await page.evaluate(() => window.__FORM__.state.nearby)).toBeNull();

  const journey = [];
  // The added leg-curl station occupies (-7, 3), so walk through the aisle
  // beside it before approaching the original chest-press interaction spot.
  for (const destination of [{ x: 0, z: 7 }, { x: -4.4, z: 7 }, { x: -4.4, z: -1.45 }, { x: -7, z: -1.45 }]) {
    journey.push(...await walkTo(page, destination));
  }
  await testInfo.attach('real-keyboard-journey', {
    body: JSON.stringify({ start, end: await position(page), samples: journey }, null, 2),
    contentType: 'application/json',
  });
  expect(distance(start, await position(page))).toBeGreaterThan(10);
  await expect.poll(() => page.evaluate(() => window.__FORM__.state.nearby?.id)).toBe('chest-press');
  await expect(page.locator('.interaction-prompt')).toContainText('坐姿胸推機');
  await page.keyboard.press('e');
  const panel = page.getByRole('complementary', { name: '坐姿胸推機教學' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-content="muscles"]')).toBeVisible();
  await expect(panel.locator('[data-content="muscles"]')).toContainText('胸大肌');
  await panel.getByRole('tab', { name: '怎麼練' }).click();
  await expect(panel.locator('[data-content="technique"]')).toBeVisible();
  await expect(panel.locator('.teaching-steps li')).toHaveCount(3);
  await expect(panel.locator('[data-content="muscles"]')).toBeHidden();
  await panel.getByRole('tab', { name: '動作行程' }).click();
  await expect(panel.locator('[data-content="range"]')).toContainText('起始位置');
  await expect(panel.locator('[data-content="range"]')).toContainText('結束位置');
  await expect(panel.getByRole('tab', { name: '動作行程' })).toHaveAttribute('aria-selected', 'true');

  await panel.getByRole('button', { name: '暫停示範' }).click();
  expect(await animationDelta(page)).toBeCloseTo(0, 6);
  await panel.getByRole('button', { name: '0.5× 慢速', exact: true }).click();
  await expect(panel.locator('[data-speed="0.5"]')).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: '播放示範' }).click();
  const slowDelta = await animationDelta(page);
  expect(slowDelta).toBeGreaterThan(0.04);
  expect(slowDelta).toBeLessThan(0.095);
  await panel.getByRole('button', { name: '1× 正常', exact: true }).click();
  const normalDelta = await animationDelta(page);
  expect(normalDelta).toBeGreaterThan(slowDelta * 1.7);
  expect(normalDelta).toBeLessThan(slowDelta * 2.3);

  await panel.locator('[data-action="learned"]').click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.progress-caption')).toContainText('1 / 3');
  await expect(page.locator('[data-target="chest-press"]')).toHaveClass(/done/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('form.learned')))).toEqual(['chest-press']);
  expect(await page.evaluate(() => window.__FORM__.state.targetId)).toBe('cable-fly');

  await page.reload();
  await page.waitForFunction(() => window.__FORM__?.state.loaded);
  expect(await page.evaluate(() => [...window.__FORM__.state.completed])).toEqual(['chest-press']);
  await page.locator('[data-action="free"]').click();
  await expect(page.locator('.free-stat')).toContainText('1');
});

test('全部 24 台教學與示範 API 可執行且進度有限值；此測試不證明物理可達', async ({ page }, testInfo) => {
  await page.locator('[data-action="free"]').click();
  const stationIds = await page.evaluate(() => window.__FORM__.stations.map(station => station.id));
  expect(stationIds).toHaveLength(24);
  const results = [];
  for (const id of stationIds) {
    await page.evaluate(stationId => {
      const api = window.__FORM__;
      api.openStation(api.stations.find(station => station.id === stationId));
    }, id);
    await expect(page.locator('.station-panel')).toBeVisible();
    const delta = await animationDelta(page, 6);
    expect(delta, `${id} 的動畫應前進`).toBeGreaterThan(0.01);
    expect(Number.isFinite(delta)).toBe(true);
    const progress = await page.locator('#pose-progress').evaluate(element => element.value);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThan(1);
    await expect(page.locator('#pose-label')).not.toHaveText('準備動作');
    const current = await position(page);
    expect(Number.isFinite(current.x) && Number.isFinite(current.z)).toBe(true);
    results.push({ id, delta, progress });
    await page.keyboard.press('Escape');
    await expect(page.locator('.station-panel')).toHaveCount(0);
    expect(await page.evaluate(() => window.__FORM__.state.active)).toBeNull();
  }
  await testInfo.attach('animation-api-results', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});

test('胸推與腿推的主要紅色、輔助橘色和 3D 肌群同步；有氧沒有虛構主要肌群', async ({ page }) => {
  await page.locator('[data-action="free"]').click();
  const worldHighlights = () => page.evaluate(() => {
    const value = window.__FORM__.world.getMuscleHighlights();
    return { primary: [...value.primary].sort(), secondary: [...value.secondary].sort() };
  });
  const mapHighlights = () => page.locator('.muscle-map path[data-muscle]').evaluateAll(paths => {
    const group = activation => paths.filter(path => path.dataset.activation === activation);
    return {
      primary: [...new Set(group('primary').map(path => path.dataset.muscle))].sort(),
      secondary: [...new Set(group('secondary').map(path => path.dataset.muscle))].sort(),
      primaryColors: [...new Set(group('primary').map(path => getComputedStyle(path).fill))],
      secondaryColors: [...new Set(group('secondary').map(path => getComputedStyle(path).fill))],
    };
  });
  const open = id => page.evaluate(stationId => {
    const api = window.__FORM__;
    api.openStation(api.stations.find(station => station.id === stationId));
  }, id);
  const closeAndCheckCleared = async () => {
    await page.keyboard.press('Escape');
    await expect(page.locator('.station-panel')).toHaveCount(0);
    expect(await worldHighlights()).toEqual({ primary: [], secondary: [] });
  };

  await open('chest-press');
  await expect(page.locator('.muscle-map')).toBeVisible();
  expect(await mapHighlights()).toEqual({
    primary: ['chest'],
    secondary: ['shoulders', 'triceps'],
    primaryColors: ['rgb(220, 104, 85)'],
    secondaryColors: ['rgb(226, 162, 97)'],
  });
  expect(await worldHighlights()).toEqual({ primary: ['chest'], secondary: ['shoulders', 'triceps'] });
  await expect(page.locator('.station-panel .muscle-legend')).toContainText('主要肌群');
  await expect(page.locator('.station-panel .muscle-legend')).toContainText('輔助肌群');
  await closeAndCheckCleared();

  await open('leg-press');
  const legData = await page.evaluate(() => {
    const station = window.__FORM__.stations.find(station => station.id === 'leg-press');
    return { primary: [...station.muscleKeys].sort(), secondary: [...station.secondaryMuscleKeys].sort() };
  });
  expect(legData.primary).toEqual(['glutes', 'quads']);
  const legs = await mapHighlights();
  expect({ primary: legs.primary, secondary: legs.secondary }).toEqual(legData);
  expect(legs.primaryColors).toEqual(['rgb(220, 104, 85)']);
  expect(legs.secondaryColors).toEqual(['rgb(226, 162, 97)']);
  expect(await worldHighlights()).toEqual(legData);
  await closeAndCheckCleared();

  for (const id of ['treadmill', 'bike']) {
    await open(id);
    const cardio = await mapHighlights();
    expect(cardio.primary, `${id} 不應以局部主肌紅色表示有氧效果`).toEqual([]);
    expect(cardio.primaryColors).toEqual([]);
    await expect(page.locator('.cardio-note')).toContainText('不標示單一主要肌群');
    const world = await worldHighlights();
    expect(world.primary).toEqual([]);
    expect(world.secondary).toEqual(cardio.secondary);
    await closeAndCheckCleared();
  }
});
