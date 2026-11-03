import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hashMobileSources,changedHashes} from './mobile-performance-common-v016.mjs';
import {compareMobileDirectory} from './compare-mobile-v016.mjs';

const read=path=>JSON.parse(readFileSync(path,'utf8'));
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const directory='artifacts/mobile-v016/',freeze=read(directory+'source-freeze.json'),sourceHashes=hashMobileSources();
const node=read(directory+'node-tests-final.json'),browser=read(directory+'report-native-v016.json');
const preview=read(directory+'static-preview-browser.json'),http=read(directory+'preview-http.json');
const motion=read(directory+'motion-preservation.json'),quality=read(directory+'render-quality/qualification.json');
const comparison=compareMobileDirectory(directory+'performance-final');
const changedSources=changedHashes(freeze.sourceHashes,sourceHashes);
const qualitySourceChanges=Object.entries(quality.sourceHashes).filter(([path,hash])=>sha(path)!==hash).map(([path])=>path);
const buildLogs=['build-default.txt','build-pages.txt','build-mobile-preview.txt'];
const checks={
  currentVersion:read('package.json').version==='0.16.0',
  applicationSourceStable:changedSources.length===0,
  node:node.pass&&node.exitCode===0&&node.tests===213&&node.passed===213&&node.failed===0&&node.skipped===0,
  browser:browser.stats.expected===6&&browser.stats.unexpected===0&&browser.stats.skipped===0&&browser.stats.flaky===0,
  staticPreview:preview.pass&&preview.apiRequests.length===0&&http.results.every(item=>['/','/about/','/site.webmanifest'].includes(item.path)?item.status===200:item.status===404),
  motionSources:motion.pass&&Object.entries(motion.preserved).every(([path,hash])=>sourceHashes[path]===hash),
  desktopQuality:quality.pass&&quality.desktopComparedFrames===7200&&qualitySourceChanges.length===0,
  builds:buildLogs.every(path=>/built in/.test(readFileSync(directory+path,'utf8'))),
  mobilePerformance:comparison.pass,
};
const evidenceFiles=['node-tests-final.json','report-native-v016.json','static-preview-browser.json','preview-http.json','motion-preservation.json','render-quality/qualification.json','performance-final/measurement-session.json','performance-final/comparison.json',...buildLogs];
const report={version:'0.16.0',pass:Object.values(checks).every(Boolean),recordedAt:new Date().toISOString(),checks,sourceHashes,changedSources,qualitySourceChanges,
  evidenceHashes:Object.fromEntries(evidenceFiles.map(path=>[directory+path,sha(directory+path)])),
  validation:{node:node.tests,nativeBrowserCases:6,staticPreviewChecks:1,desktopQualityComparedFrames:7200},
  performance:{renderer:comparison.renderer,rows:comparison.rows.map(row=>({scenario:row.scenario,before:row.before.cadence,after:row.after.cadence,changePercent:row.changePercent})),scope:comparison.scope},
  livePreview:{desktop:'http://127.0.0.1:5173/',phoneLAN:'http://192.168.114.55:5175/',phoneRequiresReachableLAN:true,accountMode:'local',apiMounted:false},
  limits:['Native Chromium runs use one Intel desktop GPU with mobile capabilities and viewport emulation. No physical phone, iOS Safari, Android GPU, battery or thermal measurement was performed.','Six current browser cases cover multi-touch, layout, desktop keyboard, map, journal, class volumes and one ordinary machine lifecycle. They do not requalify every exercise or provide trainer approval.','Performance uses matched keyboard routes because v0.15 has no mobile controls. Default auto resolution, shadows and MSAA differ and are recorded; this is not equal-quality acceleration.','The static preview is available on the development LAN. GitHub Pages project-path build was validated with a fixture URL; no public deployment is claimed.'],
  retainedAttempts:{earlyBrowserReports:['artifacts/mobile-v016/report-play-native.json','artifacts/mobile-v016/layout/report-native-initial.json'],preMenuFixPassingRun:'artifacts/mobile-v016/report-native-final.json',firstBenchmark:'artifacts/mobile-v016/performance/measurement-session.json',notes:'Early test assumptions and the first benchmark timing origin were corrected, then complete new runs were performed. An earlier station-ID failure report was overwritten by the child; available raw reports and original tool history remain. No failed attempt is counted as a passing final run.'},
};
// Old versioned releases remain untouched. Only a fully passing scoped mobile
// release may replace the latest summary.
writeFileSync('artifacts/verification-summary-v0.16.json',JSON.stringify(report,null,2));
if(report.pass)writeFileSync('artifacts/verification-summary.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,checks,validation:report.validation,changedSources,qualitySourceChanges}));if(!report.pass)process.exitCode=1;
