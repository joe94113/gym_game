import { defineConfig, chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function browserExecutable() {
  const bundled = chromium.executablePath();
  if (existsSync(bundled)) return bundled;
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (process.platform !== 'win32') return undefined;
  const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright');
  if (!existsSync(cache)) return undefined;
  return readdirSync(cache)
    .filter(name => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map(name => join(cache, name, 'chrome-win64', 'chrome.exe'))
    .find(existsSync);
}

const nativeWebgl=process.env.FORM_TEST_RENDERER==='native';
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/trial.spec.js','**/expanded-gym.spec.js','**/social-gym.spec.js','**/collision-validation.spec.js','**/player-lifecycle.spec.js','**/class-ui.spec.js','**/audio-accessibility.spec.js','**/optimization-training.spec.js','**/training-route.spec.js','**/motion-lod-v010.spec.js','**/equipment-resources-v011.spec.js','**/frame-work-v012.spec.js','**/journal-ui-v013.spec.js','**/expansions-v013.spec.js','**/aerial-ui-v013.spec.js','**/motion-review-v015.spec.js','**/performance-check-v015.spec.js','**/adaptive-quality-v015.spec.js'],
  timeout: 150_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'],['json',{outputFile:process.env.FORM_TEST_REPORT||`artifacts/playwright-v013-${nativeWebgl?'native':'software'}.json`}]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    // Software WebGL in CI is expensive; layout stays desktop-sized while
    // the framebuffer is smaller. Visual QA runs separately at full scale.
    deviceScaleFactor: 0.5,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: browserExecutable(),
      args: nativeWebgl?(process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:[]):['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
