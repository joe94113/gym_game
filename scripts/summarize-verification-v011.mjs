// Version-specific, fail-closed evidence summary. This file NEVER writes the
// canonical artifacts/verification-summary.json. Final native schemas and the
// frozen whole-suite counts must be supplied before an overall PASS is possible.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const FINAL_V011={
  finalized:true,
  freezeFile:'artifacts/source-freeze-v011.json',
  expectedNodeTests:93,
  expectedBrowserTests:44,
  expectedBrowserRetests:3,
  // Paths will be confirmed by the owners after the final source freeze. Pilot,
  // interim and renderer-detection-only reports are deliberately not selected.
  files:{
    node:'artifacts/unit-v011.tap',
    browser:'artifacts/playwright-v011-native.json',
    build:'artifacts/build-v011.json',
    roomCpu:'artifacts/room-gpu-resources-v011/cpu-qualification.json',
    benchAngles:'artifacts/v011-bench-angles-all-final.json',
    benchEdges:'artifacts/v011-bench-angles-edges-final.json',
    benchSupport:'artifacts/v011-bench-support-all-final.json',
    benchSeat:'artifacts/v011-bench-seat-contact-all-final.json',
    benchContinuity:'artifacts/v011-bench-continuity-after.json',
    benchThigh:'artifacts/v011-bench-thigh-contact.json',
    benchAggregate:'artifacts/v011-bench-validation-summary.json',
    benchPreservation:'artifacts/v011-bench-preservation.json',
    cable:'artifacts/v011-cable-qualification-release.json',
    roomNative:'artifacts/room-gpu-resources-v011/native-cycle.json',
    nativePerformance:'artifacts/performance-v011/comparison.json',
    visual:'artifacts/equipment-review-v011/visual-review.json',
    softwareSmoke:'artifacts/playwright-v011-software-smoke.json',
  },
  nativeValidators:{roomNative:validateNativeRoom,nativePerformance:validateNativePerformance,visual:validateVisual},
};
const OUTPUT='artifacts/verification-summary-v0.11.json',SNAPSHOT='.local-tools/v011-before/';
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const passFlag=proof=>(proof.pass??proof.passed)===true;
const sameValues=(a,b)=>JSON.stringify([...a].sort((x,y)=>String(x).localeCompare(String(y))))===JSON.stringify([...b].sort((x,y)=>String(x).localeCompare(String(y))));

function rendererIssues(renderer){
  const label=typeof renderer==='string'?renderer:renderer?.renderer||renderer?.unmaskedRenderer||renderer?.name;
  if(typeof label!=='string'||!label.trim())return['missing real renderer identification'];
  return renderer?.software===true||/swiftshader|llvmpipe|softpipe|software|basic render/i.test(label)?['software renderer cannot certify native hardware results']:[];
}
function validateNativeRoom(proof,{recordDetails}){
  const issues=rendererIssues(proof.renderer),r=proof.report;
  if(!r)return[...issues,'missing actual GL cycle report'];
  if(!(r.coldGl?.buffersDeleted>r.before?.buffersDeleted))issues.push('no positive actual deleteBuffer delta');
  if(!(r.cold?.rendererMemory?.geometries<r.warm?.rendererMemory?.geometries))issues.push('cold renderer geometry allocation count did not decrease');
  if(r.cold?.lastError!==null)issues.push('room inventory/disposal error');
  for(const id of ['classroom','bathroom'])if(r.cold?.rooms?.[id]?.gpuEvictionRequested!==true||!(r.cold.rooms[id].releaseCount>0))issues.push(`${id} did not request cold GPU eviction`);
  for(const[id,key]of [['classroom','classroomReturn'],['bathroom','bathroomReturn']]){
    if(r[key]?.rooms?.[id]?.gpuEvictionRequested!==false)issues.push(`${id} did not wake before return render`);
    if(!(r[key]?.rendererMemory?.geometries>r.cold?.rendererMemory?.geometries))issues.push(`${id} return did not rebuild geometry allocations`);
  }
  for(const key of ['activeEvictionRejected','classReady','classExit','showerReady','showerExit'])if(r[key]!==true)issues.push(`post-wake functionality failed: ${key}`);
  if(r.navigationBefore&&JSON.stringify(r.navigationBefore)!==JSON.stringify(r.navigationAfter))issues.push('navigation changed after eviction');
  recordDetails({renderer:proof.renderer,actualGlDeleteDelta:Object.fromEntries(['buffersDeleted','texturesDeleted','programsDeleted'].map(key=>[key,r.coldGl?.[key]-r.before?.[key]])),rendererMemory:{warm:r.warm?.rendererMemory,cold:r.cold?.rendererMemory,classroomReturn:r.classroomReturn?.rendererMemory,bathroomReturn:r.bathroomReturn?.rendererMemory},cpuModelsResident:true,fullModelUnloading:false});
  return issues;
}
function validateNativePerformance(proof,{full,addDependency,sourceIssues,recordDetails}){
  const issues=[...rendererIssues(proof.renderer),...sourceIssues({baselineHashes:proof.baselineSourceHashes},{baseline:true})],views=['main-floor','classroom','bathroom'];
  if(!sameValues((proof.rows||[]).map(row=>row.id),views))issues.push('expected all three native performance views');
  for(const row of proof.rows||[])for(const key of ['beforeFrameMedianMs','afterFrameMedianMs','beforeP95Ms','afterP95Ms'])if(!Number.isFinite(row[key])||row[key]<=0)issues.push(`invalid ${row.id} timing: ${key}`);
  if(!Array.isArray(proof.reports)||proof.reports.length!==4||new Set(proof.reports).size!==4)return[...issues,'expected four distinct interleaved before/after reports'];
  const byView=new Map(views.map(id=>[id,[]]));let before=0,after=0;
  for(const file of proof.reports){
    try{
      const leaf=read(full(file)),isBefore=leaf.name?.startsWith('before');if(isBefore)before++;else after++;
      if(!passFlag(leaf)||leaf.changedSources?.length||leaf.errors?.length)issues.push(`performance leaf failed: ${file}`);
      issues.push(...sourceIssues(isBefore?{baselineHashes:leaf.sourceHashes}:leaf,{baseline:isBefore}));
      if(!sameValues((leaf.results||[]).map(view=>view.id),views)||leaf.rendererKind!=='native'||leaf.profile!=='flow'||leaf.deviceScaleFactor!==1||JSON.stringify(leaf.viewport)!=='[1280,800]')issues.push(`performance settings/coverage mismatch: ${file}`);
      for(const view of leaf.results||[]){issues.push(...rendererIssues(view.renderer));if(view.cpuUpdate?.samples!==64||view.renderedFrame?.samples!==64)issues.push(`expected 64 timed samples: ${file}/${view.id}`);byView.get(view.id)?.push({camera:view.camera,framebuffer:view.framebuffer});}
      // Record each leaf content checksum via the shared cache for consistency.
      addDependency(file);
    }catch(error){issues.push(`invalid performance leaf ${file}: ${error.message}`);}
  }
  if(before!==2||after!==2)issues.push('expected two before and two after native runs');
  for(const[id,frames]of byView)if(frames.length!==4||frames.some(frame=>JSON.stringify(frame)!==JSON.stringify(frames[0])))issues.push(`camera/framebuffer mismatch across runs: ${id}`);
  recordDetails({renderer:proof.renderer,rows:proof.rows,scope:'Two native before and two native after runs, 64 timed frames per view and mode. Rendered timing includes CPU update and gl.finish; this is not displayed FPS or isolated GPU time. Evidence validity does not require acceleration in every view.'});
  // Evidence validity is independent of whether every view becomes faster.
  return issues;
}
function validateVisual(proof,{full,sourceIssues,addDependency,recordDetails}){
  const issues=[];
  if(!Array.isArray(proof.examined)||!proof.examined.length)issues.push('no examined image paths');
  for(const file of proof.examined||[])if(typeof file!=='string'||!existsSync(full(file)))issues.push(`examined image missing: ${file}`);else addDependency(file);
  if(!proof.scope||!proof.findings||!proof.limits)issues.push('visual scope/findings/limits missing');
  const file='artifacts/equipment-review-v011/capture.json';
  try{
    const capture=read(full(file));issues.push(...sourceIssues(capture));addDependency(file);
    if(!passFlag(capture)||capture.errors?.length||capture.frames?.length!==72)issues.push('expected 72 passing front/side/back capture frames');
    const combinations=new Set();for(const frame of capture.frames||[]){
      combinations.add(`${frame.config?.id}:${frame.config?.angle??''}:${frame.moment}:${frame.view}`);
      if(!existsSync(full(frame.path)))issues.push(`captured image missing: ${frame.path}`);
      if(!(frame.contact?.maxReachError<.015)||frame.clearance?.collisions?.length||frame.self?.collisions?.length||!frame.highlights?.primary?.length)issues.push(`capture contact/collision/muscle failure: ${frame.path}`);
    }
    if(combinations.size!==72)issues.push('duplicate or missing capture combinations');
    if(capture.layouts?.length!==2||!sameValues(capture.layouts.map(layout=>JSON.stringify(layout.viewport)),['[1280,800]','[1440,1000]'])||capture.layouts.some(layout=>layout.horizontalOverflow!==false||layout.withinSettings!==true||!Number.isFinite(layout.font)||layout.font<14||layout.options!==46))issues.push('bench control layouts failed');
    recordDetails({examinedImages:proof.examined,frames:capture.frames?.length,layouts:capture.layouts,scope:proof.scope,findings:proof.findings,limits:proof.limits,layoutNote:'The range control UA margin may extend 2px inside details padding; panel overflow must remain false and every control must remain within settings.'});
  }catch(error){issues.push(`invalid visual capture ${file}: ${error.message}`);}
  return issues;
}
function browserCases(report){
  const cases=[];
  function visit(suite,parents=[]){
    const titles=[...parents,...(suite.title?[suite.title]:[])];
    for(const spec of suite.specs||[])for(const test of spec.tests||[]){
      const fullTitle=[...titles,spec.title].join(' › '),key=JSON.stringify([fullTitle,test.projectName||'',test.repeatEachIndex||0]);
      cases.push({key,title:spec.title,fullTitle,test,passed:test.status==='expected'&&test.expectedStatus==='passed'&&test.results?.at(-1)?.status==='passed'});
    }
    for(const child of suite.suites||[])visit(child,titles);
  }
  visit(report);return cases;
}
function validateBrowser(proof,{full,addDependency,recordDetails},expected,retestCount){
  const issues=[],stats=proof.stats,cases=browserCases(proof);
  if(!Number.isInteger(expected)||expected<=0)issues.push('final whole-suite browser count not configured');
  if(!stats||stats.expected!==expected||stats.unexpected||stats.skipped||stats.flaky)issues.push('browser whole-suite stats do not match');
  if(cases.length!==expected||new Set(cases.map(c=>c.key)).size!==expected||cases.some(c=>!c.passed))issues.push('expected unique cases with final passed results');
  // v0.11 retains the original native run with three test-assumption failures,
  // then replaces only those cases using a three-case targeted retest. This must
  // never be presented as a single clean 44-case execution.
  if(!Array.isArray(proof.mergedFrom)||proof.mergedFrom.length!==2||!Array.isArray(proof.retestedTitles)||proof.retestedTitles.length!==retestCount)return[...issues,'missing full-run/targeted-retest browser merge provenance'];
  try{
    const files=proof.mergedFrom.map(value=>typeof value==='string'?value:value.file||value.path);
    if(new Set(files).size!==2)issues.push('browser merge requires distinct full and retest reports');
    const original=read(full(files[0])),retest=read(full(files[1])),originalCases=browserCases(original),retestCases=browserCases(retest),failed=originalCases.filter(c=>!c.passed),passed=originalCases.filter(c=>c.passed);
    files.forEach(addDependency);
    if(original.stats?.expected!==expected-retestCount||original.stats.unexpected!==retestCount||original.stats.skipped||original.stats.flaky||originalCases.length!==expected||failed.length!==retestCount||passed.length!==expected-retestCount)issues.push(`original full report must retain ${expected-retestCount} passed and ${retestCount} failed cases`);
    if(retest.stats?.expected!==retestCount||retest.stats.unexpected||retest.stats.skipped||retest.stats.flaky||retestCases.length!==retestCount||retestCases.some(c=>!c.passed)||!sameValues(retestCases.map(c=>c.key),failed.map(c=>c.key)))issues.push(`targeted retest must pass exactly the ${retestCount} original failed cases`);
    if(!sameValues(cases.map(c=>c.key),originalCases.map(c=>c.key)))issues.push('merged browser case identities differ from the original full run');
    const byKey=new Map(cases.map(c=>[c.key,c]));
    for(const c of [...passed,...retestCases])if(JSON.stringify(byKey.get(c.key)?.test.results)!==JSON.stringify(c.test.results))issues.push(`merged case results are not preserved from provenance: ${c.fullTitle}`);
    const titleMatches=(title,c)=>title===c.title||title===c.fullTitle||typeof title==='string'&&title.endsWith(c.title);
    if(failed.some(c=>!proof.retestedTitles.some(title=>titleMatches(title,c)))||proof.retestedTitles.some(title=>!failed.some(c=>titleMatches(title,c))))issues.push(`retestedTitles do not identify the ${retestCount} original failures`);
    recordDetails({execution:'merged-full-and-targeted-retest',uniqueCases:cases.length,originalFull:original.stats,targetedRetest:retest.stats,retestedTitles:proof.retestedTitles});
  }catch(error){issues.push(`invalid browser merge provenance: ${error.message}`);}
  return issues;
}

export function summarizeVerificationV011({root=process.cwd(),config=FINAL_V011}={}){
  const evidence={},sourceCache=new Map(),full=path=>resolve(root,path),sha=path=>{const p=full(path);if(!sourceCache.has(p))sourceCache.set(p,hash(p));return sourceCache.get(p);};
  function sourceIssues(proof,{baseline=false,required=true}={}){
    const issues=[],maps=baseline?[proof.baselineHashes]:[proof.sourceHashes,proof.hashes,proof.currentSourceHashes,proof.currentHashes],entries=maps.filter(Boolean).flatMap(map=>Object.entries(map));
    if(required&&!entries.length)issues.push('missing source hashes');
    for(const[path,expected]of entries){
      if(typeof expected!=='string'||!/^[a-f\d]{64}$/i.test(expected)){issues.push(`invalid SHA-256: ${path}`);continue;}
      const target=baseline?SNAPSHOT+path:path;
      try{if(sha(target)!==expected.toLowerCase())issues.push(`source changed: ${target}`);}catch{issues.push(`source missing: ${target}`);}
    }
    if(!baseline)for(const key of ['changedSources','staleSources'])if(proof[key]?.length)issues.push(`${key}: ${proof[key].join(', ')}`);
    return issues;
  }
  function item(key,validate,{requireHashes=true,requirePass=true}={}){
    const file=config.files[key];
    if(!file){evidence[key]={status:'pending',reason:'final report path/schema not configured'};return;}
    if(!existsSync(full(file))){evidence[key]={file,status:'missing'};return;}
    let proof;try{proof=read(full(file));}catch(error){evidence[key]={file,status:'failed',reason:String(error.message)};return;}
    const stale=sourceIssues(proof,{required:requireHashes}),issues=[],dependencies=[];let details=null;
    if(requirePass&&!passFlag(proof))issues.push('report does not pass');
    try{issues.push(...(validate?.(proof,{root,full,sha,sourceIssues,addDependency:file=>dependencies.push({file,sha256:sha(file)}),recordDetails:value=>{details=value;}})||[]));}catch(error){issues.push(`schema error: ${error.message}`);}
    evidence[key]={file,sha256:sha(file),status:stale.length?'stale':issues.length?'failed':'passed',sourceIssues:stale,issues,...(dependencies.length?{dependencies}:{}),...(details?{details}:{})};
  }
  function completeAngles(proof,expected=Array.from({length:46},(_,i)=>i),minimumCount=101){
    const issues=[];
    if(!sameValues(proof.angles||[],expected)||!sameValues((proof.results||[]).map(result=>result.angle),expected))issues.push(`expected exact configured coverage (${expected.length} angles)`);
    if(!(proof.count>=minimumCount))issues.push(`expected at least ${minimumCount} phase samples per mode`);
    if(!proof.results?.length||proof.results.some(result=>result.pass!==true))issues.push('one or more angle results failed');
    return issues;
  }
  item('roomCpu',proof=>{
    const issues=[];
    if(proof.failures?.length||proof.protectedDisposeEvents?.length)issues.push('CPU/protected-resource invariance failed');
    if(proof.counts?.cachedClassPrograms!==28||proof.courseIds?.length!==7||proof.appearanceVariants?.length!==4)issues.push('missing late-program or appearance coverage');
    if(proof.scope?.includes('No GPU calls')!==true)issues.push('CPU evidence must not be represented as real GL deletion evidence');
    return issues;
  });
  item('benchAngles',proof=>{
    const issues=completeAngles(proof);
    if(proof.results?.some(result=>result.frames<proof.count*3))issues.push('loop/entry/exit frame coverage incomplete');
    return issues;
  });
  item('benchEdges',proof=>completeAngles(proof,[0,1,3,29,30,31,44,45],301));
  item('benchSupport',proof=>completeAngles(proof));
  item('benchSeat',proof=>{
    const issues=[];if(!sameValues((proof.results||[]).map(result=>result.angle),Array.from({length:46},(_,i)=>i)))issues.push('seat contact must cover all 46 angles');
    if(proof.results?.some(result=>result.pass!==true||result.samples?.length!==4||!Number.isFinite(result.deepestGap)||!Number.isFinite(result.maxSeatedSupportGap)||result.deepestGap<-.006||!(result.maxSeatedSupportGap<.006)))issues.push('actual rounded-pad seated skin gap failed');return issues;
  });
  item('benchContinuity',proof=>{
    const issues=sourceIssues(proof,{baseline:true});
    if(proof.count!==1001||!sameValues((proof.results||[]).map(result=>result.settings?.benchAngle),Array.from({length:46},(_,i)=>i)))issues.push('continuity must cover 46 angles with 1001 samples');
    if(proof.results?.some(result=>!result.numericPass||result.isolatedJumps?.length)||proof.comparisons?.length!==46||proof.comparisons.some(result=>!result.pass))issues.push('continuity or frozen-baseline comparison failed');return issues;
  });
  item('benchThigh',(proof,{recordDetails})=>{
    const issues=[],results=proof.results||[];
    if(!sameValues(results.map(result=>result.angle),Array.from({length:46},(_,i)=>i)))issues.push('full thigh skin contact must cover all 46 seated angles');
    if(results.some(result=>result.pass!==true||!(result.skinSamples>0)||!Number.isFinite(result.maxActualMetalDepth)||result.maxActualMetalDepth<0||result.maxActualMetalDepth>.004||result.capGaps?.length!==2||result.capGaps.some(gap=>!Number.isFinite(gap))))issues.push('actual thigh/weight-plate contact exceeded the existing 4mm non-hand tolerance');
    recordDetails({maxActualMetalDepth:Math.max(...results.map(result=>result.maxActualMetalDepth)),minCapGap:Math.min(...results.flatMap(result=>result.capGaps||[])),penetratingAngles:results.filter(result=>result.maxActualMetalDepth>0).map(result=>result.angle),nonHandToleranceMetres:.004,handToleranceMetres:.001,scope:'All logical thigh skin vertices at supported seated stages. A 0-degree clothing/thigh contact allowance is retained; sparse stride-24 zero depth is not a claim of zero full-surface penetration.'});return issues;
  });
  item('benchPreservation',proof=>{
    const issues=sourceIssues(proof,{baseline:true});
    if(proof.differences?.length||proof.unexpected?.length)issues.push('unexpected baseline preservation differences');
    if(proof.count!==2046||proof.protectedCount!==1324||proof.protectedMatchingCount!==proof.protectedCount)issues.push('incomplete protected baseline preservation coverage');return issues;
  });
  item('benchAggregate',(proof,{sha,sourceIssues,full,addDependency,recordDetails})=>{
    const issues=[],records=Object.values(proof.evidence||{}),expected=['benchAngles','benchEdges','benchSupport','benchContinuity','benchSeat','benchThigh','benchPreservation'].map(key=>config.files[key]);
    if(!sameValues(records.map(record=>record.path),expected))issues.push('bench aggregate does not reference the seven final proofs');
    for(const record of records){if(record.pass!==true||record.staleSources?.length||sha(record.path)!==record.sha256)issues.push(`bench leaf stale/failed: ${record.path}`);issues.push(...sourceIssues(read(full(record.path))));addDependency(record.path);}
    recordDetails({coverage:proof.coverage,limits:proof.limits,preservation:proof.preservation,scope:proof.scope});return issues;
  },{requireHashes:false});
  item('cable',proof=>{
    const expected=['cable-rope-hammer-curl','cable-straight-arm-pulldown','cable-rope-crunch'],issues=[];
    if(!sameValues((proof.results||[]).map(result=>result.id),expected))issues.push('missing or duplicated new cable movement');
    if(!(proof.count>=121))issues.push('expected at least 121 phase samples per mode');
    if(proof.results?.some(result=>result.pass!==true||result.frames<proof.count*3))issues.push('cable result failed or loop/entry/exit coverage incomplete');
    return issues;
  });
  for(const key of ['roomNative','nativePerformance','visual']){
    const validator=config.nativeValidators[key];
    if(typeof validator!=='function')evidence[key]={file:config.files[key],status:'pending',reason:'final native/visual schema has not been approved'};
    else item(key,validator);
  }
  item('build',proof=>proof.command==='npm run build'?[]:['build receipt must identify npm run build']);
  item('browser',(proof,context)=>validateBrowser(proof,context,config.expectedBrowserTests,config.expectedBrowserRetests),{requireHashes:false,requirePass:false});
  item('softwareSmoke',(proof,{recordDetails})=>{
    const issues=[],cases=browserCases(proof);
    if(proof.stats?.expected!==1||proof.stats.unexpected||proof.stats.skipped||proof.stats.flaky||cases.length!==1||cases.some(test=>!test.passed))issues.push('single software resource-wake smoke case failed');
    recordDetails({cases:1,scope:'Supplemental software-renderer room resource-wake smoke only; this does not certify the full 44-case suite on software rendering.'});return issues;
  },{requireHashes:false,requirePass:false});
  const nodeFile=config.files.node;
  if(!nodeFile||!existsSync(full(nodeFile)))evidence.node={file:nodeFile,status:'missing'};
  else{
    const tap=readFileSync(full(nodeFile),'utf8'),numbers=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,Number(tap.match(new RegExp(`^# ${key} (\\d+)\\r?$`,'m'))?.[1]??NaN)])),expected=config.expectedNodeTests;
    const configured=Number.isInteger(expected)&&expected>0,valid=configured&&numbers.tests===expected&&numbers.pass===expected&&numbers.fail===0&&numbers.cancelled===0&&numbers.skipped===0&&numbers.todo===0;
    evidence.node={file:nodeFile,sha256:sha(nodeFile),status:!configured?'pending':valid?'passed':'failed',expected,counts:numbers};
  }
  let freeze=null;
  if(!config.freezeFile||!existsSync(full(config.freezeFile)))evidence.sourceFreeze={file:config.freezeFile,status:'missing'};
  else{
    try{freeze=read(full(config.freezeFile));const issues=sourceIssues(freeze);evidence.sourceFreeze={file:config.freezeFile,sha256:sha(config.freezeFile),status:issues.length?'stale':'passed',issues};}
    catch(error){evidence.sourceFreeze={file:config.freezeFile,status:'failed',reason:error.message};}
  }
  const sourceHashes={};
  function visit(dir){for(const entry of readdirSync(full(dir),{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())visit(path);else sourceHashes[path]=sha(path);}}
  visit('src');visit('public/models/athlete/lod-v010');
  for(const path of ['package.json','package-lock.json','public/models/athlete/athlete.glb','public/models/athlete/rig.json'])sourceHashes[path]=sha(path);
  const preserved=['src/gym-layout.js','src/locomotion.js','public/models/athlete/athlete.glb','public/models/athlete/rig.json','public/models/athlete/lod-v010/indices.bin'];
  const preservationIssues=[];for(const path of preserved)try{if(sourceHashes[path]!==sha(SNAPSHOT+path))preservationIssues.push(path);}catch{preservationIssues.push(path);}
  evidence.layoutModelPreservation={status:preservationIssues.length?'failed':'passed',snapshot:SNAPSHOT,files:preserved,issues:preservationIssues};
  // A freeze receipt must cover the entire current runtime and static LOD data,
  // so a passing subset proof cannot accidentally certify unrelated new code.
  if(freeze&&evidence.sourceFreeze.status==='passed'){
    const missing=Object.keys(sourceHashes).filter(path=>freeze.sourceHashes?.[path]!==sourceHashes[path]);
    if(missing.length){evidence.sourceFreeze.status='stale';evidence.sourceFreeze.issues.push(...missing.map(path=>`not covered by freeze: ${path}`));}
  }
  const changedWhileSummarizing=Object.entries(sourceHashes).filter(([path,expected])=>hash(full(path))!==expected).map(([path])=>path);
  evidence.sourceStability={status:changedWhileSummarizing.length?'stale':'passed',changedWhileSummarizing};
  const blockers=Object.entries(evidence).filter(([,proof])=>proof.status!=='passed').map(([key,proof])=>({key,status:proof.status}));
  if(!config.finalized)blockers.push({key:'finalIntegration',status:'pending'});
  const status=blockers.some(item=>item.status==='failed')?'failed':blockers.length?'incomplete':'passed';
  return {version:'0.11.0',date:new Date().toISOString(),status,pass:status==='passed',canonicalSummaryWritten:false,sourceHashes,evidence,blockers,benchSkinContact:evidence.benchThigh?.details||null,benchCoverage:evidence.benchAggregate?.details||null,
    evidenceLimits:{gpuEviction:'Partial exclusive GPU eviction; shared human/LOD resources and CPU model arrays remain resident.',nativeProbe:'artifacts/performance-v011/native-probe.json is renderer detection only and is excluded as gameplay performance or GL resource evidence.',motionReview:'Finite programmatic samples and rendered review do not constitute human motion capture, trainer review or clinical approval.'},
    previous:'artifacts/verification-summary-v0.10.json'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=summarizeVerificationV011();writeFileSync(OUTPUT,JSON.stringify(report,null,2));
  console.log(JSON.stringify({file:OUTPUT,status:report.status,pass:report.pass,blockers:report.blockers}));
  if(report.status!=='passed')process.exitCode=2;
}
