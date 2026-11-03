import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';

// Keep phone DPR and real touch in the spec. No reduced desktop framebuffer
// or software renderer may stand in for the mobile-play checks.
export default defineConfig({
  ...base,
  testMatch:['**/mobile-*-v016.spec.js'],
  outputDir:'artifacts/mobile-v016/playwright-results',
  workers:1,
  reporter:[['list'],['json',{outputFile:process.env.FORM_TEST_REPORT||'artifacts/mobile-v016/playwright-native.json'}]],
  use:{...base.use,launchOptions:{...base.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[]}},
});
