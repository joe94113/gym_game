import {chromium,expect} from '@playwright/test';
import config from '../playwright.config.js';
import {writeFileSync} from 'node:fs';

const base='http://127.0.0.1:5175',errors=[],apiRequests=[];
const browser=await chromium.launch({...config.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[]});
let report;
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url());});
  const response=await page.goto(base);expect(response.status()).toBe(200);
  await expect(page.locator('[data-action=free]')).toBeEnabled({timeout:120000});await page.locator('[data-action=free]').tap();
  await expect(page.locator('[data-mobile-stick]')).toBeVisible();
  await page.locator('[data-mobile-menu-toggle]').tap();await page.locator('.header-actions [data-action=journal]').tap();
  await expect(page.locator('.training-journal-dialog')).toBeVisible();expect(await page.getByRole('button',{name:'帳號與同步',exact:true}).count()).toBe(0);
  await page.locator('[data-journal-action=close]').tap();await page.locator('[data-mobile-menu-toggle]').tap();await page.locator('.header-actions [data-action=help]').tap();
  await expect(page.locator('.mobile-help')).toContainText('左下搖桿');expect(await page.locator('#graphics-quality').inputValue()).toBe('auto');
  const info=await page.evaluate(()=>{const canvas=document.querySelector('#gym-canvas'),gl=canvas.getContext('webgl2'),extension=gl.getExtension('WEBGL_debug_renderer_info');return{framebuffer:[canvas.width,canvas.height],renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),context:gl.getContextAttributes(),devApiPresent:!!window.__FORM__,noindex:document.querySelector('meta[name=robots]')?.content};});
  expect(info.framebuffer[0]*info.framebuffer[1]).toBeLessThanOrEqual(700000);expect(info.context.antialias).toBe(false);expect(info.devApiPresent).toBe(false);expect(info.noindex).toContain('noindex');expect(apiRequests).toEqual([]);expect(errors).toEqual([]);
  await page.screenshot({path:'artifacts/mobile-v016/visuals/static-preview-help.png'});
  report={pass:true,base,info,apiRequests,errors,scope:'Native desktop GPU with mobile Chromium emulation against the actual static LAN build. No physical phone or Safari test is claimed.'};
}catch(error){report={pass:false,base,errors:[...errors,String(error.stack||error)],apiRequests};process.exitCode=1;}
finally{await browser.close();writeFileSync('artifacts/mobile-v016/static-preview-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
