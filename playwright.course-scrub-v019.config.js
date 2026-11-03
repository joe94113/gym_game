import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
 ...base,testMatch:['**/course-scrub-v019.spec.js'],workers:1,fullyParallel:false,
 outputDir:'artifacts/release-v019/scrub/results',
 reporter:[['list'],['json',{outputFile:'artifacts/release-v019/scrub/playwright-native.json'}]],
 use:{...base.use,deviceScaleFactor:1,launchOptions:{...base.use.launchOptions,args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[]}},
 projects:[{name:'desktop',use:{viewport:{width:1280,height:900},deviceScaleFactor:1}},{name:'touch',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1.25}}],
});
