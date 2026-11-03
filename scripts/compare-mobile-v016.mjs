import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mobileProtocol,compareMobileRuns,hashMobileSources,hashMobileHarness,changedHashes} from './mobile-performance-common-v016.mjs';

export function compareMobileDirectory(directory='artifacts/mobile-v016/performance'){
 const session=JSON.parse(readFileSync(join(directory,'measurement-session.json'),'utf8'));
 if(!session.pass||JSON.stringify(session.order)!==JSON.stringify(mobileProtocol.order))throw Error('Complete successful ABBA session required.');
 const reports=mobileProtocol.order.map(name=>JSON.parse(readFileSync(join(directory,`${name}.json`),'utf8'))),comparison=compareMobileRuns(reports);
 const currentHarness=hashMobileHarness();if(changedHashes(session.harnessHashes,currentHarness).length||changedHashes(session.harnessHashes,session.harnessHashesEnd||{}).length)throw Error('Harness differs from measured session.');
 for(const report of reports){if(changedHashes(report.sourceHashes,hashMobileSources(report.sourceRoot)).length)throw Error(`${report.name}: measured source files have changed.`);if(changedHashes(report.harnessHashes,currentHarness).length)throw Error(`${report.name}: measured harness differs.`);}
 const result={...comparison,startedAt:session.startedAt,completedAt:session.completedAt,comparedAt:new Date().toISOString(),host:session.host,runFiles:mobileProtocol.order.map(name=>`${name}.json`),sources:{before:reports[0].sourceHashes,after:reports[1].sourceHashes},harnessHashes:currentHarness};
 writeFileSync(join(directory,'comparison.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=compareMobileDirectory(process.argv[2]);console.log(JSON.stringify({pass:result.pass,renderer:result.renderer,rows:result.rows.map(row=>({scenario:row.scenario,beforeP95:row.before.cadence.p95Ms,afterP95:row.after.cadence.p95Ms,changePercent:row.changePercent}))}));}catch(error){console.error(error.stack||String(error));process.exitCode=1;}
}
