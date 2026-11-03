import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {frameStatistics} from './perf-stats-v013.mjs';
const directory='artifacts/performance-v015/auto',names=['before-1','after-1','after-2','before-2'],paths=names.map(name=>`${directory}/play/${name}-off.json`),read=path=>JSON.parse(readFileSync(path,'utf8')),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),reports=paths.map(read),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
for(let i=0;i<reports.length;i++){
 const report=reports[i];assert.equal(report.pass,true);assert.equal(report.name,names[i]);assert.equal(report.seconds,12);assert.equal(report.warmupSeconds,3);assert.equal(report.hooks,'off');assert.equal(report.rendererKind,'native');assert.deepEqual(report.profiles,['auto']);assert.deepEqual(report.scenarios,['walking','equipment']);assert.equal(report.results.length,2);assert.deepEqual(report.changedSources,[]);assert.deepEqual(report.changedValidators,[]);assert.deepEqual(report.errors,[]);
 if(i)assert.ok(Date.parse(report.startedAt)>=Date.parse(reports[i-1].completedAt));
 for(const [path,value]of Object.entries(report.validatorSourceHashes))assert.equal(sha(path),value,'validator '+path);
 const before=report.name.startsWith('before');for(const [path,value]of Object.entries(report.sourceHashes))assert.equal(sha((before?'.local-tools/v015-before/':'')+path),value,'source '+path);
 for(const row of report.results){
  assert.equal(row.pass,true);assert.equal(row.setup.quality.preference,'auto');assert.equal(row.setup.renderer,reports[0].results[0].setup.renderer);assert.ok(row.raw.frames.length>3&&row.raw.elapsedMs>=11999);assert.equal(row.raw.visibility,'visible');assert.equal(row.raw.gl,null);
  for(const frame of row.raw.frames){assert.ok(frame.intervalMs>0&&Number.isFinite(frame.intervalMs));assert.ok(same(frame.framebuffer,[1280,800])||same(frame.framebuffer,[1088,680]));}
  for(const sample of row.raw.telemetry){assert.ok(['balanced','flow'].includes(sample.activeProfile));assert.equal(sample.shadows,sample.activeProfile==='balanced');assert.equal(sample.pixelRatio,sample.activeProfile==='balanced'?1:.85);}
  const actual=frameStatistics(row.raw.frames.map(frame=>frame.intervalMs));assert.ok(Math.abs(actual.meanMs-row.cadence.meanMs)<1e-7);
  if(row.scenario==='walking'){assert.ok(row.movement.sampledDistance>.2);assert.deepEqual(row.movement.route,['w','s','w','s']);assert.ok(row.raw.keys.some(event=>event.type==='keydown'&&event.key==='w'));}else assert.equal(row.after.activity.exerciseId,'dumbbell-bench-press');
 }
}
const rows=[];
for(const scenario of ['walking','equipment']){
 const selected=reports.map(report=>report.results.find(result=>result.scenario===scenario));assert.ok(selected.every(row=>same(row.setup.position,selected[0].setup.position)&&row.setup.heading===selected[0].setup.heading));
 const stats=indices=>frameStatistics(indices.flatMap(i=>selected[i].raw.frames.map(frame=>frame.intervalMs))),profiles=indices=>indices.map(i=>[...new Set(selected[i].raw.telemetry.map(frame=>frame.activeProfile))]),framebuffers=indices=>[...new Set(indices.flatMap(i=>selected[i].raw.frames.map(frame=>frame.framebuffer.join('×'))))];
 rows.push({scenario,before:stats([0,3]),after:stats([1,2]),beforeProfiles:profiles([0,3]),afterProfiles:profiles([1,2]),beforeFramebuffers:framebuffers([0,3]),afterFramebuffers:framebuffers([1,2])});
}
const result={pass:true,version:'0.15.0',reports:paths,dependencies:Object.fromEntries(paths.map(path=>[path,sha(path)])),sourceHashes:reports[1].sourceHashes,baselineSourceHashes:reports[0].sourceHashes,rows,scope:'Automatic-quality user-experience comparison, not equal rendering budgets. Same initial auto preference, viewport, native GPU and scripted path; each run has3s warmup and12s actual RAF. New policy can select lower resolution and disable shadows; actual profiles/framebuffers are retained explicitly.',limits:['Manual flow/clear same-budget results are a separate archived candidate comparison.','Warmup and first loading/quality-selection delays are excluded.','One physical Intel UHD630; not a claim about other GPUs or actual display presentation.']};
writeFileSync(directory+'/comparison.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:true,rows}));
