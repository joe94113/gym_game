import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,
 testMatch:['**/mobile-*-v016.spec.js','**/motion-review-v015.spec.js','**/social-gym.spec.js','**/class-ui.spec.js','**/player-lifecycle.spec.js','**/long-frame-v019.spec.js'],
 outputDir:'artifacts/release-v019/playwright-results',
 reporter:[['list'],['json',{outputFile:'artifacts/release-v019/playwright-native.json'}]],
 use:{...base.use,launchOptions:{...base.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[]}},
});
