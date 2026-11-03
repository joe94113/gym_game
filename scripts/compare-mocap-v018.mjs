import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mobileProtocol,compareMobileRuns,hashMobileSources,changedHashes} from './mobile-performance-common-v016.mjs';
import {hashMocapHarness} from './mocap-performance-common-v018.mjs';
export function compareMobileDirectory(directory='artifacts/mocap-v018/performance-final'){
 const session=JSON.parse(readFileSync(join(directory,'measurement-session.json')));
 if(!session.pass||JSON.stringify(session.order)!==JSON.stringify(mobileProtocol.order))throw Error('Complete successful ABBA session required.');
 const reports=mobileProtocol.order.map(name=>JSON.parse(readFileSync(join(directory,`${name}.json`)))),comparison=compareMobileRuns(reports),currentHarness=hashMocapHarness();
 if(changedHashes(session.harnessHashes,currentHarness).length||changedHashes(session.harnessHashes,session.harnessHashesEnd||{}).length)throw Error('Harness differs from measured session.');
 for(const report of reports){if(changedHashes(report.sourceHashes,hashMobileSources(report.sourceRoot)).length)throw Error(`${report.name}: source changed.`);if(changedHashes(report.harnessHashes,currentHarness).length)throw Error(`${report.name}: harness changed.`);}
 const result={...comparison,startedAt:session.startedAt,completedAt:session.completedAt,comparedAt:new Date().toISOString(),host:session.host,baselineVersion:'0.17.0',candidateVersion:'0.18.0',runFiles:mobileProtocol.order.map(name=>`${name}.json`),sources:{before:reports[0].sourceHashes,after:reports[1].sourceHashes},harnessHashes:currentHarness,limits:['One Intel desktop GPU with mobile Chromium capabilities does not establish physical phone FPS, thermal behaviour, battery use or touch latency.','Actual app RAF cadence is not display presentation timing or isolated GPU execution time.','Both versions have touch controls; the matched W/S route is used for reproducibility. Touch behaviour is checked separately. Setup simulation and two-second real RAF warmup are excluded.'],scope:'Native Intel desktop GPU mobile emulation, matched W/S route and bench exercise, sequential ABBA runs. Raw RAF frames and callback timings are revalidated without dropping long frames. This does not measure physical phone hardware.'};
 writeFileSync(join(directory,'comparison.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const r=compareMobileDirectory(process.argv[2]);console.log(JSON.stringify({pass:r.pass,renderer:r.renderer,rows:r.rows.map(x=>({scenario:x.scenario,beforeP95:x.before.cadence.p95Ms,afterP95:x.after.cadence.p95Ms,changePercent:x.changePercent}))}));}catch(e){console.error(e.stack||String(e));process.exitCode=1;}}
