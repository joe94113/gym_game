import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performanceProtocolV019 as protocol,compareRunsV019,hashHarnessV019,hashSourcesV019,changedHashesV019} from './performance-common-v019.mjs';

export function compareDirectoryV019(directory='artifacts/release-v019/performance-cpu1'){
  const session=JSON.parse(readFileSync(join(directory,'measurement-session.json'),'utf8'));
  if(!session.pass||JSON.stringify(session.order)!==JSON.stringify(protocol.order))throw new Error('Complete successful sequential ABBA session required; incomplete evidence is diagnostic only.');
  const reports=protocol.order.map(name=>JSON.parse(readFileSync(join(directory,`${name}.json`),'utf8'))),harness=hashHarnessV019();
  if(changedHashesV019(session.harnessHashes,harness).length||changedHashesV019(session.harnessHashes,session.harnessHashesEnd).length)throw new Error('Measured/analysis harness differs from the current scripts.');
  for(const report of reports){if(changedHashesV019(report.sourceHashes,hashSourcesV019(report.sourceRoot)).length)throw new Error(`${report.name}: frozen measured sources changed.`);if(changedHashesV019(report.harnessHashes,harness).length)throw new Error(`${report.name}: measured harness changed.`);}
  const comparison={...compareRunsV019(reports),startedAt:session.startedAt,completedAt:session.completedAt,comparedAt:new Date().toISOString(),host:session.host,baselineVersion:'0.18.0',candidateVersion:'0.19.0',runFiles:protocol.order.map(name=>`${name}.json`),sources:{before:reports[0].sourceHashes,after:reports[1].sourceHashes},harnessHashes:harness,npcCounterScope:'Before/after NPC counters are labelled world-direct-npcPose or crowd-actor-sum and checked against actual actors. The heavy before epoch precedes another 2s real RAF settling; its delta to after includes settling. MeasurementStart/raw telemetry describe measured work without forcing body/skin diagnostics. Missing baseline per-telemetry NPC/frustum counters remain absent.',improvementClaim:'Read individual cadence, callback, quality and actor-load results. Passing means a valid matched measurement session, not that every scenario improved.'};
  writeFileSync(join(directory,'comparison.json'),JSON.stringify(comparison,null,2)+'\n');return comparison;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const result=compareDirectoryV019(process.argv[2]);console.log(JSON.stringify({pass:result.pass,cpuRate:result.cpuRate,renderer:result.renderer,rows:result.rows.map(row=>({scenario:row.scenario,beforeP95:row.before.cadence.p95Ms,afterP95:row.after.cadence.p95Ms,changePercent:row.changePercent,contentTradeoff:row.contentTradeoff}))},null,2));}catch(error){console.error(error.stack||String(error));process.exitCode=1;}}
