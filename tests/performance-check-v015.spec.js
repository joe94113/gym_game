import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {viteClientShim} from './vite-client-shim.js';

test('效能檢測記錄真實遊玩，完成後可下載顯卡與幀間隔',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000});await page.locator('[data-action=free]').click();
 await page.locator('.header-actions [data-action=help]').click();await page.locator('[data-performance-action=start]').click();await expect(page.locator('.modal-overlay')).toHaveCount(0);
 await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');
 await page.waitForFunction(()=>window.__FORM__.world.getPerformanceCheckStatus().status==='complete',null,{timeout:35000});
 await page.locator('.header-actions [data-action=help]').click();const ready=page.waitForEvent('download');await page.locator('[data-performance-action=download]').click();const download=await ready,report=JSON.parse(readFileSync(await download.path(),'utf8'));
 expect(report.status).toBe('complete');expect(report.kind).toBe('muscle-base-manual-raf');expect(report.frames.length).toBeGreaterThan(20);expect(report.initial.quality.renderer).toBeTruthy();expect(report.summary.samples).toBe(report.frames.length);expect(report.frames.every(frame=>frame.intervalMs>0)).toBe(true);expect(report.elapsedMs).toBeGreaterThanOrEqual(20000);expect(errors).toEqual([]);
});
