import {chromium} from '@playwright/test';
import config from '../playwright.config.js';
const browser=await chromium.launch({...config.use.launchOptions,args:['--use-gl=angle','--use-angle=d3d11'],headless:true});
try{for(const size of [192,512]){const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});await page.goto('http://127.0.0.1:5173/brand-mark.svg');await page.screenshot({path:`public/icon-${size}.png`,omitBackground:true});await page.close();}}finally{await browser.close();}
