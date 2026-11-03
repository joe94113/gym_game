// Fail-closed evidence summary for the real-play performance work. This script
// reads evidence only and never writes the canonical verification-summary.json.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const FINAL_V012={
 finalized:true,
 expectedNodeTests:110,
 expectedBrowserTests:46,
 snapshot:'.local-tools/v012-before/',
 files:{
  freeze:'artifacts/performance-v012/source-freeze.json',
  skeletons:'artifacts/skeletons-v012/qualification.json',
  canvas:'artifacts/canvas-updates-v012/cpu-qualification.json',
  navigation:'artifacts/navigation-v012/qualification.json',
  node:'artifacts/performance-v012/unit.tap',
  browser:'artifacts/playwright-v012-native.json',
  build:'artifacts/performance-v012/build.json',
  performance:'artifacts/performance-v012/comparison.json',
  capture:'artifacts/performance-v012/visual/capture.json',
  visual:'artifacts/performance-v012/visual/manual-review.json',
 },
};
const OUTPUT='artifacts/verification-summary-v0.12.json';
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const passFlag=proof=>(proof.pass??proof.passed)===true;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameSet=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&a.every(value=>b.includes(value));
const expectedProfiles=['flow','clear'],expectedScenarios=['walking','sprint','guided','equipment'];
const keys=expectedProfiles.flatMap(profile=>expectedScenarios.map(scenario=>`${profile}:${scenario}`));
const key=result=>`${result.profile}:${result.scenario}`;
const rendererIssues=renderer=>typeof renderer!=='string'||!renderer.trim()?['missing hardware renderer']: /swiftshader|llvmpipe|lavapipe|software|basic render/i.test(renderer)?['software renderer cannot certify native results']:[];
const quantile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
const statistics=values=>({samples:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p50Ms:quantile(values,.5),p95Ms:quantile(values,.95),p99Ms:quantile(values,.99),over25Percent:values.filter(value=>value>25).length/values.length*100,over50Percent:values.filter(value=>value>50).length/values.length*100});
const numbersMatch=(actual,expected)=>Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=Math.max(1e-7,Math.abs(expected)*1e-9);
function* specs(report){for(const suite of report.suites||[]){yield* suite.specs||[];yield* specs(suite);}}

export function summarizePerformanceV012({root=process.cwd(),config=FINAL_V012}={}){
 const full=path=>resolve(root,path),sourceCache=new Map(),evidence={},performanceFindings=[];
 const sha=path=>{if(!sourceCache.has(path))sourceCache.set(path,hash(full(path)));return sourceCache.get(path);};
 const filesUnder=dir=>{const files=[];for(const entry of readdirSync(full(dir),{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())files.push(...filesUnder(path));else files.push(path);}return files;};
 function sourceIssues(proof,{baseline=false,required=true}={}){
  const maps=baseline?[proof.baselineSourceHashes,proof.baselineHashes]:[proof.sourceHashes,proof.hashes,proof.currentSourceHashes,proof.currentHashes],entries=maps.filter(Boolean).flatMap(map=>Object.entries(map)),issues=[];
  if(required&&!entries.length)issues.push('missing source hashes');
  for(const [path,expected]of entries){const target=baseline?config.snapshot+path:path;
   if(typeof expected!=='string'||!/^[a-f\d]{64}$/i.test(expected)){issues.push(`invalid SHA: ${target}`);continue;}
   try{if(sha(target)!==expected.toLowerCase())issues.push(`stale source: ${target}`);}catch{issues.push(`missing source: ${target}`);}
  }
  if(proof.changedSources?.length)issues.push('source changed during proof');if(proof.failures?.length)issues.push('proof reports failures');return issues;
 }
 function item(name,validate,{requirePass=true,requireHashes=true}={}){
  const file=config.files[name];if(!file||!existsSync(full(file))){evidence[name]={file,status:'missing'};return null;}
  try{
   const proof=read(full(file)),dependencies={},details={},issues=requireHashes?sourceIssues(proof):[];
   if(requirePass&&!passFlag(proof))issues.push('proof does not pass');
   const addDependency=path=>{dependencies[path]=sha(path);};
   validate?.(proof,{issues,details,addDependency});
   evidence[name]={file,sha256:sha(file),status:issues.length?'failed':'passed',issues,...(Object.keys(dependencies).length?{dependencies}:{}),...(Object.keys(details).length?{details}:{})};return proof;
  }catch(error){evidence[name]={file,status:'failed',issues:[error.message]};return null;}
 }

 const freeze=item('freeze',(proof,{issues,details})=>{
  const required=[...filesUnder('src'),...filesUnder('public/models/athlete/lod-v010'),'public/models/athlete/athlete.glb','public/models/athlete/credits.json','public/models/athlete/rig.json','package.json','package-lock.json'];
  for(const path of required)if(!proof.sourceHashes?.[path])issues.push(`runtime not covered by freeze: ${path}`);
  if(proof.version!=='0.12.0')issues.push('wrong freeze version');details.files=Object.keys(proof.sourceHashes||{}).length;
 },{requirePass:false});

 item('skeletons',(proof,{issues,details})=>{
  issues.push(...sourceIssues(proof,{baseline:true}));
  if(proof.quick!==false||proof.maxVertexError!==0||proof.poseChecks<2736||proof.boneChecks<145008||proof.sampleChecks<708624||proof.vertexChecks<395952)issues.push('full production deformation coverage missing or changed');
  if(proof.results?.length!==4||proof.results.some(result=>result.skeletons?.before!==8||result.skeletons?.after!==1||result.boneTextures?.before!==8||result.boneTextures?.after!==1||result.updateCalls?.before!==8||result.updateCalls?.after!==1||!sameSet(result.levels||[],[0,1,2])))issues.push('four full/LOD actor variants do not retain expected equivalent-skeleton results');
  Object.assign(details,{scope:proof.scope,variants:proof.variants,poseChecks:proof.poseChecks,boneChecks:proof.boneChecks,sampleChecks:proof.sampleChecks,vertexChecks:proof.vertexChecks,maxVertexError:proof.maxVertexError,skeletonsPerActor:'8 → 1',separateActorsRemainIndependent:true});
 });
 item('canvas',(proof,{issues,details})=>{
  issues.push(...sourceIssues(proof,{baseline:true}));
  if(!same(proof.afterHiddenTenSecondTextureRequests,[0,0,0])||proof.beforeHiddenTenSecondTextureRequests?.length!==3||proof.beforeHiddenTenSecondTextureRequests.some(value=>!(value>0)))issues.push('hidden-TV request comparison missing');
  if(!proof.visibleDiagnostics?.screens?.some(screen=>screen.visible&&screen.lastDrawTime===20))issues.push('visible TV current-time recovery missing');
  Object.assign(details,{scope:proof.scope,beforeHiddenRequests:proof.beforeHiddenTenSecondTextureRequests,afterHiddenRequests:proof.afterHiddenTenSecondTextureRequests,limits:'Canvas drawing/needsUpdate request counts are not actual GL uploads, GPU bytes or FPS. Visible TV content and exact measurement-bar drawing commands were compared separately.'});
 });
 item('navigation',(proof,{issues,details})=>{
  if(proof.originalControllerSha256!==sha(config.snapshot+'src/world-controller.js'))issues.push('navigation oracle is not the sealed controller');
  if(proof.counts?.realInteractions!==56||proof.counts?.doorEquipmentVariations!==35||proof.counts?.exactRoutes!==91||proof.results?.length!==91||proof.results.some(result=>result.exact!==true))issues.push('missing exact installed/door variation waypoint comparison');
  if(proof.work?.afterDynamicReads!==91||!(proof.work.beforeDynamicReads>proof.work.afterDynamicReads))issues.push('one dynamic snapshot per search was not retained');
  Object.assign(details,{scope:proof.scope,counts:proof.counts,work:proof.work,limits:'CPU waypoint equality and collision-read work counts, not a measured FPS result.'});
 });
 item('build',(proof,{issues})=>{if(proof.command!=='npm run build')issues.push('build command receipt missing');});
 item('browser',(proof,{issues,details})=>{
  const stats=proof.stats,cases=[...specs(proof)];
  if(stats?.expected!==config.expectedBrowserTests||stats?.unexpected!==0||stats?.skipped!==0||stats?.flaky!==0||proof.errors?.length)issues.push('browser whole-suite result is incomplete or failed');
  if(cases.length!==config.expectedBrowserTests||new Set(cases.map(spec=>spec.id||`${spec.file}:${spec.title}`)).size!==cases.length||cases.some(spec=>spec.ok!==true||!spec.tests?.length||spec.tests.some(test=>test.status!=='expected'||test.results?.at(-1)?.status!=='passed')))issues.push('expected unique passing browser cases missing');
  const args=proof.config?.projects?.[0]?.use?.launchOptions?.args||proof.config?.filteredProjects?.[0]?.use?.launchOptions?.args||[];
  if(args.some(argument=>/swiftshader|llvmpipe|software/i.test(argument)))issues.push('browser run used forced software rendering');
  Object.assign(details,{expected:config.expectedBrowserTests,stats,cases:cases.map(spec=>({file:spec.file,title:spec.title})),scope:'Whole native browser suite; actual renderer is additionally recorded by the real-play leaves.'});
 },{requireHashes:false,requirePass:false});
 const nodePath=config.files.node;
 if(!nodePath||!existsSync(full(nodePath)))evidence.node={file:nodePath,status:'missing'};
 else{
  const tap=readFileSync(full(nodePath),'utf8'),counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name=>[name,Number(tap.match(new RegExp(`^# ${name} (\\d+)\\r?$`,'m'))?.[1]??NaN)])),valid=counts.tests===config.expectedNodeTests&&counts.pass===config.expectedNodeTests&&['fail','cancelled','skipped','todo'].every(name=>counts[name]===0);
  evidence.node={file:nodePath,sha256:sha(nodePath),status:valid?'passed':'failed',expected:config.expectedNodeTests,counts};
 }

 item('performance',(proof,{issues,details,addDependency})=>{
  issues.push(...sourceIssues(proof,{baseline:true}));
  if(!sameSet((proof.rows||[]).map(key),keys))issues.push('expected eight fixed-profile/scenario comparison rows');
  if(!Array.isArray(proof.reports)||proof.reports.length!==4||new Set(proof.reports).size!==4){issues.push('expected four distinct interleaved real-play reports');return;}
  const leaves=[];
  for(const file of proof.reports){
   const leaf=read(full(file));addDependency(file);const baseline=leaf.name?.startsWith('before');
   issues.push(...sourceIssues(baseline?{baselineSourceHashes:leaf.sourceHashes}:leaf,{baseline}));
   if(!passFlag(leaf)||leaf.changedSources?.length||leaf.errors?.length||leaf.hooks!=='off'||leaf.seconds!==8||leaf.rendererKind!=='native'||leaf.deviceScaleFactor!==1||!same(leaf.viewport,{width:1280,height:800})||!sameSet(leaf.profiles||[],expectedProfiles)||!sameSet(leaf.scenarios||[],expectedScenarios)||!sameSet((leaf.results||[]).map(key),keys))issues.push(`invalid fixed-budget eight-second real-RAF leaf: ${file}`);
   if(proof.dependencies?.[file]&&proof.dependencies[file]!==sha(file))issues.push(`performance dependency changed: ${file}`);
   for(const result of leaf.results||[]){
    issues.push(...rendererIssues(result.setup?.renderer));const raw=result.raw,frames=raw?.frames||[],quality=result.setup?.quality;
    if(result.pass!==true||result.hooks!=='off'||result.errors?.length||raw?.visibility!=='visible'||!raw.detected?.proof||!(raw.elapsedMs>=7999)||frames.length<3||raw.gl!==null||frames.some(frame=>!(Number.isFinite(frame.intervalMs)&&frame.intervalMs>0&&Number.isFinite(frame.callbackMs)&&frame.callbackMs>=0)||frame.gl!==undefined))issues.push(`missing actual unwrapped game-RAF coverage: ${file}/${key(result)}`);
    if(result.cadence?.samples!==frames.length||!numbersMatch(result.cadence?.meanMs,statistics(frames.map(frame=>frame.intervalMs)).meanMs))issues.push(`reported cadence does not match raw game RAF: ${file}/${key(result)}`);
    if(quality?.active!==result.profile||!raw.telemetry?.length||raw.telemetry.some(sample=>sample.activeProfile!==quality.active||sample.pixelRatio!==quality.pixelRatio||sample.shadows!==quality.shadows||!same(sample.framebuffer,result.setup.framebuffer)))issues.push(`quality/framebuffer adapted during fixed-budget measurement: ${file}/${key(result)}`);
    const moving=result.scenario!=='equipment';
    if(moving&&(!same(result.movement?.route,['w','s','w','s'])||result.movement.minimumCoverageMet!==true||!(result.movement.sampledDistance>.2)))issues.push(`real keyboard travel missing: ${file}/${key(result)}`);
    if(result.movement?.shift!==(result.scenario==='sprint'))issues.push(`Shift policy differs: ${file}/${key(result)}`);
    if(moving&&!raw.keys?.some(event=>event.type==='keydown'&&['w','s'].includes(event.key.toLowerCase())))issues.push(`keyboard events missing: ${file}/${key(result)}`);
    if(result.scenario==='sprint'&&!raw.keys?.some(event=>event.key==='Shift'||event.shiftKey))issues.push(`sprint Shift event missing: ${file}/${key(result)}`);
    if(!moving&&result.after?.activity?.exerciseId!=='dumbbell-bench-press')issues.push(`equipment demonstration not running: ${file}/${key(result)}`);
   }
   leaves.push(leaf);
  }
  if(!same(leaves.map(leaf=>leaf.name),['before-1','after-1','after-2','before-2']))issues.push('benchmark order is not before/after/after/before');
  if(leaves.some(leaf=>leaf.startingStation!==leaves[0].startingStation||leaf.warmupSeconds!==leaves[0].warmupSeconds||leaf.setupSimulationSeconds!==leaves[0].setupSimulationSeconds))issues.push('initial route/warmup/cache setup differs');
  for(const row of proof.rows||[]){
   const results=leaves.map(leaf=>leaf.results.find(result=>key(result)===key(row)));if(results.some(result=>!result)){issues.push(`missing repeated scenario ${key(row)}`);continue;}
   const settings=results.map(result=>({renderer:result.setup.renderer,framebuffer:result.setup.framebuffer,active:result.setup.quality.active,pixelRatio:result.setup.quality.pixelRatio,shadows:result.setup.quality.shadows,heading:result.setup.heading,position:result.setup.position}));
   if(settings.some(setting=>!same(setting,settings[0])))issues.push(`starting scene/view/quality differs across repeats: ${key(row)}`);
   for(const [version,indices]of [['before',[0,3]],['after',[1,2]]]){
    const raw=statistics(indices.flatMap(index=>results[index].raw.frames.map(frame=>frame.intervalMs)));
    for(const name of Object.keys(raw))if(!numbersMatch(row[version]?.[name],raw[name]))issues.push(`comparison ${key(row)} ${version}.${name} does not match raw frames`);
   }
   performanceFindings.push({profile:row.profile,scenario:row.scenario,beforeMeanMs:row.before?.meanMs,afterMeanMs:row.after?.meanMs,beforeP95Ms:row.before?.p95Ms,afterP95Ms:row.after?.p95Ms,beforeLate25Percent:row.before?.over25Percent,afterLate25Percent:row.after?.over25Percent,beforeLate50Percent:row.before?.over50Percent,afterLate50Percent:row.after?.over50Percent,meanImproved:row.after?.meanMs<row.before?.meanMs,p95NumericallyLower:row.after?.p95Ms<row.before?.p95Ms,p95Improved:row.before?.p95Ms-row.after?.p95Ms>.25,p95ApproximatelyUnchanged:Math.abs(row.before?.p95Ms-row.after?.p95Ms)<=.25,p95Interpretation:Math.abs(row.before?.p95Ms-row.after?.p95Ms)<=.25?'approximately unchanged at a declared 0.25 ms reporting tolerance':row.after?.p95Ms<row.before?.p95Ms?'lower':'higher',late25Improved:row.after?.over25Percent<row.before?.over25Percent,late50Improved:row.after?.over50Percent<row.before?.over50Percent,late25ChangePercentagePoints:row.after?.over25Percent-row.before?.over25Percent,late50ChangePercentagePoints:row.after?.over50Percent-row.before?.over50Percent,meanReductionPercent:row.meanReductionPercent,p95ReductionPercent:row.p95ReductionPercent,beforeTravel:row.beforeTravel,afterTravel:row.afterTravel});
  }
  Object.assign(details,{scope:proof.scope,limits:proof.limits,rows:performanceFindings,cameraScope:'Default in-game follow camera with matched initial heading/player position and identical W/S route controls. Full camera matrices and identical motion paths are not independently recorded; actual path distances/events remain in each leaf.',interpretation:'A validity PASS means measurements are reproducible and comparable, not that every row improved. RAF cadence is game-callback delivery, not isolated GPU time or proof of display presentation.'});
 });

 const capture=item('capture',(proof,{issues,details,addDependency})=>{
  const expected=[['sprint','front'],['sprint','side'],['sprint','back'],['dumbbell-bench-press','side'],['dumbbell-bench-press','right-hand-side'],['cable-rope-crunch','side'],['cable-straight-arm-pulldown','back'],['machine-leg-press','side'],['class-dance','front']].flatMap(([id,view])=>['before','after'].map(version=>`${version}:${id}:${view}`));
  if(proof.errors?.length||proof.records?.length!==18||!sameSet((proof.records||[]).map(record=>`${record.version}:${record.id}:${record.view}`),expected))issues.push('expected 18 matching before/after review images');
  for(const record of proof.records||[]){
   if(!existsSync(full(record.path)))issues.push(`review image missing: ${record.path}`);else addDependency(record.path);
   if(record.id!=='sprint'&&(!(record.contact?.maxReachError<.015)||record.clearance?.collisions?.length||record.self?.collisions?.length||!record.highlights?.primary?.length))issues.push(`review pose contact/collision/muscle failure: ${record.path}`);
  }
  Object.assign(details,{images:proof.records?.length,scope:proof.scope});
 });
 item('visual',(proof,{issues,details,addDependency})=>{
  if(!Array.isArray(proof.examined)||!proof.examined.length||!proof.scope||!proof.findings||!proof.limits)issues.push('manual visual review scope/findings/limits missing');
  for(const path of proof.examined||[]){if(!existsSync(full(path)))issues.push(`examined image missing: ${path}`);else{addDependency(path);if(!proof.imageHashes?.[path]||proof.imageHashes[path]!==sha(path))issues.push(`examined image hash missing or changed: ${path}`);}}
  if(capture?.records?.length&&proof.examined?.length<1)issues.push('captured images were not examined');
  Object.assign(details,{examined:proof.examined,scope:proof.scope,findings:proof.findings,limits:proof.limits});
 });

 const preservationIssues=[],publicFiles=filesUnder('public'),preservedSources=['src/locomotion.js','src/gym-layout.js','src/data.js','src/activity-catalog.js','src/exercises.js','src/extended-exercises.js','src/extended-rig.js','src/rig-lifecycle.js','src/muscle-map.js','src/render-quality.js'];
 const assetHashes={};
 for(const path of [...publicFiles,...preservedSources])try{const current=sha(path),previous=sha(config.snapshot+path);if(current!==previous)preservationIssues.push(path);if(path.startsWith('public/'))assetHashes[path]=current;}catch{preservationIssues.push(path);}
 evidence.assetAndMotionSourcePreservation={status:preservationIssues.length?'failed':'passed',issues:preservationIssues,publicAssetFiles:publicFiles.length,publicAssetHashes:assetHashes,preservedSources,scope:'Public assets and listed movement/catalog/layout/muscle/profile definitions exactly match the sealed v0.11 snapshot. Optimized factory/controller code is separately qualified.'};
 const currentSources=Object.fromEntries(filesUnder('src').map(path=>[path,sha(path)]));
 const missingFreeze=Object.entries(currentSources).filter(([path,value])=>freeze?.sourceHashes?.[path]!==value).map(([path])=>path);
 if(missingFreeze.length)evidence.sourceCoverage={status:'failed',issues:missingFreeze};
 else evidence.sourceCoverage={status:'passed',files:Object.keys(currentSources).length};
 const changedWhileSummarizing=Object.entries(freeze?.sourceHashes||{}).filter(([path,value])=>hash(full(path))!==value).map(([path])=>path);
 evidence.sourceStability={status:changedWhileSummarizing.length?'failed':'passed',changedWhileSummarizing};
 const blockers=Object.entries(evidence).filter(([,item])=>item.status!=='passed').map(([key,item])=>({key,status:item.status}));
 if(!config.finalized)blockers.push({key:'finalIntegration',status:'pending'});
 const status=blockers.some(item=>item.status==='failed')?'failed':blockers.length?'incomplete':'passed';
 return{version:'0.12.0',date:new Date().toISOString(),status,pass:status==='passed',canonicalSummaryWritten:false,sourceHashes:freeze?.sourceHashes||{},evidence,blockers,actualPerformance:{rows:performanceFindings,meanImprovedRows:performanceFindings.filter(row=>row.meanImproved).length,p95ImprovedRows:performanceFindings.filter(row=>row.p95Improved).length,p95NumericallyLowerRows:performanceFindings.filter(row=>row.p95NumericallyLower).length,p95ApproximatelyUnchangedRows:performanceFindings.filter(row=>row.p95ApproximatelyUnchanged).length,late50WorsenedRows:performanceFindings.filter(row=>row.afterLate50Percent>row.beforeLate50Percent).map(row=>({profile:row.profile,scenario:row.scenario,before:row.beforeLate50Percent,after:row.afterLate50Percent})),p95ReportingToleranceMs:.25,p95ToleranceMeaning:'Absolute changes of 0.25 ms or less are described as approximately unchanged. This is a transparent reporting tolerance, not a statistical significance test.',late25ImprovedRows:performanceFindings.filter(row=>row.late25Improved).length,totalRows:performanceFindings.length,interpretation:'Numbers above report each measured scenario. Requests, geometry counts and skeleton counts are not substituted for actual real-play frame cadence.'},evidenceLimits:{motion:'Original production GLB and finite deformed-pose/hand/feet/muscle equality do not constitute human motion capture, joint loading/clinical validation or trainer approval.',canvas:'Dirty/redraw requests are not true GL texture transfers or GPU bytes. The displayed content is retained; native real-play timings independently measure the result.',performance:'Eight-second native headless game-RAF intervals per case, two runs each before/after, fixed flow/clear quality and real keyboard controls. No loading/approach/mount performance claim, no universal hardware/FPS guarantee, and no physical-presentation or isolated-GPU timing claim.',visual:'Finite actual screenshots and manual comparison include occlusion and small-scale limits; no claim that every possible pose or fully hidden surface was visually examined.'},previous:'artifacts/verification-summary-v0.11.json'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=summarizePerformanceV012();writeFileSync(OUTPUT,JSON.stringify(report,null,2));console.log(JSON.stringify({file:OUTPUT,status:report.status,pass:report.pass,blockers:report.blockers,actualPerformance:report.actualPerformance}));if(!report.pass)process.exitCode=2;
}
