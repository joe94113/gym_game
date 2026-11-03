import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';

// Set BASE_URL to the complete deployed app directory, including a Pages
// subpath when applicable. External builds do not start the Vite dev server.
export default defineConfig({
  ...base,
  testMatch:['**/public-teaching-v020.spec.js'],
  timeout:240_000,
  outputDir:process.env.FORM_TEST_OUTPUT||'artifacts/public-teaching-v020/playwright-results',
  reporter:[['list'],['json',{outputFile:process.env.FORM_TEST_REPORT||'artifacts/public-teaching-v020/browser-local.json'}]],
  use:{...base.use,baseURL:process.env.BASE_URL||base.use.baseURL},
  webServer:process.env.BASE_URL?undefined:base.webServer,
});
