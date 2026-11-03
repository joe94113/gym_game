import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,
 testMatch:['**/mobile-*-v016.spec.js','**/motion-review-v015.spec.js'],
 outputDir:'artifacts/mocap-v018/playwright-results',
 reporter:[['list'],['json',{outputFile:'artifacts/mocap-v018/playwright-native.json'}]],
 use:{...base.use,launchOptions:{...base.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[]}},
});
