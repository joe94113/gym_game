import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hashSourcesV019,changedHashesV019,compareRunsV019,performanceProtocolV019} from './performance-common-v019.mjs';

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const readJSON=path=>JSON.parse(readFileSync(path,'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fingerprint=/^[a-f0-9]{64}$/i;
export const defaultEvidenceV019={node:'artifacts/release-v019/node-final.txt',native:'artifacts/release-v019/playwright-native.json',cpu1:'artifacts/release-v019/performance-cpu1-r4/comparison.json',cpu4:'artifacts/release-v019/performance-cpu4-r3/comparison.json',trainer:'artifacts/release-v019/trainer-qualification-final.json',natural:'artifacts/release-v019/preparation-naturalness-qualification.json',naturalSummary:'artifacts/release-v019/preparation-naturalness-final-summary.json',rack:'artifacts/release-v019/squat-rack-lifecycle-qualification.json',curl:'artifacts/release-v019/inertial-curl-qualification-final.json',scrub:'artifacts/release-v019/scrub/summary.json',backgroundCPU:'artifacts/release-v019/background-material-qualification.json',backgroundPixels:'artifacts/release-v019/background-phone-coalesced-final/qualification.json',matrixCache:'artifacts/release-v019/npc-world-matrix-cache-qualification.json',coalescing:'artifacts/release-v019/npc-pose-coalescing-qualification.json',builds:'artifacts/release-v019/builds-final.json',http:'artifacts/public-v019/deployed-v019-after/qualification.json',smoke:'artifacts/public-v019/deployed-v019-after-play/play-qualification.json',extended:'artifacts/public-v019/deployed-v019-after-extended/play-qualification.json',deployment:'artifacts/release-v019/deployment-final.json'};

/** Flatten only documented hash groups. A before/after group is never a path. */
export function hashEntriesV019(map,{flatRoot='',beforeRoot='.local-tools/v019-before',afterRoot='',scope='hashes'}={}){
  assert(map&&typeof map==='object'&&!Array.isArray(map),`${scope}: expected a hash map.`);
  const result=[];
  for(const [path,value]of Object.entries(map)){
    if(typeof value==='string'){assert(fingerprint.test(value),`${scope}/${path}: not a SHA-256.`);result.push({path,hash:value,root:flatRoot,scope});}
    else if(['before','after'].includes(path)){assert(value&&typeof value==='object'&&!Array.isArray(value),`${scope}/${path}: expected a version hash map.`);result.push(...hashEntriesV019(value,{flatRoot:path==='before'?beforeRoot:afterRoot,beforeRoot,afterRoot,scope:`${scope}/${path}`}));}
    else throw new Error(`${scope}/${path}: unsupported nested hash schema.`);
  }
  return result;
}
export function nodeLogSummaryV019(text){
  const clean=text.replace(/\u001b\[[0-9;]*m/g,''),number=name=>Number(clean.match(new RegExp(`^(?:[#ℹ]\\s*)?${name}\\s+(\\d+)\\s*$`,'m'))?.[1]??NaN);
  const result={tests:number('tests'),passed:number('pass'),failed:number('fail'),skipped:number('skipped'),cancelled:number('cancelled')};
  assert(Number.isInteger(result.tests)&&result.tests>0&&result.passed===result.tests&&result.failed===0&&result.skipped===0&&(result.cancelled===0||Number.isNaN(result.cancelled)),'Final Node log is incomplete, skipped, cancelled or failing.');return result;
}
export function nativeSummaryV019(report){
  const stats=report.stats;assert(stats?.expected>0&&stats.unexpected===0&&stats.skipped===0&&(stats.flaky??0)===0&&!report.errors?.length,'Native Playwright run is incomplete, flaky, skipped or failing.');
  const projects=report.config?.filteredProjects;assert(Array.isArray(projects)&&projects.length>0&&projects.every(project=>project.use?.launchOptions&&!/swiftshader|llvmpipe|lavapipe|software/i.test(JSON.stringify(project.use.launchOptions.args||[]))),'Native Playwright configuration is absent or selects a software renderer.');
  const tests=[],attachments=[];function walk(suite){for(const spec of suite.specs||[])for(const test of spec.tests||[]){tests.push(test);for(const result of test.results||[])for(const attachment of result.attachments||[])if(attachment.path)attachments.push(attachment.path);}for(const child of suite.suites||[])walk(child);}for(const suite of report.suites||[])walk(suite);
  assert(tests.length===stats.expected&&tests.every(test=>test.status==='expected'&&test.results?.length&&test.results.every(result=>result.status==='passed'&&!result.error&&!result.errors?.length)),'Native per-test results do not match successful final stats.');
  return{tests:stats.expected,skipped:stats.skipped,unexpected:stats.unexpected,durationMs:stats.duration,configuredRendererArguments:projects.map(project=>project.use.launchOptions.args||[]),attachments};
}
export function publicHTTPSummaryV019(report){
  assert(report.passed===true&&!report.errors?.length&&Array.isArray(report.checks)&&report.checks.every(check=>check.pass===true),'Public HTTP evidence has failed checks.');
  assert(report.expectedVersion==='0.19.0'&&['Delivered release version matches','Delivered release includes catch-up and NPC matrix fixes','Delivered release includes physical trainer actors'].every(name=>report.checks.some(check=>check.name===name&&check.pass===true)),'Public HTTP evidence has not confirmed the actual delivered 0.19.0 bundle and release features.');
  assert(report.checks.length>=778&&report.responses?.length>=229,'Public HTTP evidence lacks the complete asset/SEO protocol.');
  assert(report.counts?.checks===report.checks.length&&report.counts.responses===report.responses.length&&report.counts.failed===0&&report.counts.staticPages===9&&report.counts.exerciseLinks===65,'Public HTTP counts do not match raw checks/responses.');
  assert(new Set(report.deepLinks?.map(link=>link.id)).size===65,'Public HTTP evidence must include 65 distinct exercise links.');
  const home=report.responses.find(response=>response.method==='GET'&&response.url===report.base);assert(home?.status===200&&fingerprint.test(home.sha256),'Public HTTP homepage proof missing.');
  return{base:report.base,expectedVersion:report.expectedVersion,checks:report.checks.length,responses:report.responses.length,staticPages:9,exerciseLinks:65,homeSHA256:home.sha256,startedAt:report.startedAt,finishedAt:report.finishedAt};
}
export function publicPlaySummaryV019(report,{extended=false}={}){
  assert(report.passed===true&&report.devices?.length>0,'Public normal-play report did not pass.');
  if(!extended)assert(['desktop','phone'].every(name=>report.devices.some(device=>device.name===name)),'Core public play requires desktop and phone emulation.');
  const checks=[];for(const device of report.devices){
    assert(device.passed===true&&!device.error&&device.checks?.length>=22&&device.checks.every(check=>check.pass===true),`${device.name}: normal-play checks are incomplete or failed.`);
    for(const key of ['pageErrors','consoleErrors','failedRequests','badResponses','accountAPIRequests'])assert(Array.isArray(device[key])&&device[key].length===0,`${device.name}: ${key} are not empty.`);
    assert(device.checks.some(check=>check.label==='Production has no development bridge'&&check.pass),`${device.name}: production-bridge check missing.`);
    assert(device.activityFlows?.some(flow=>flow.kind==='normal-RAF-loop'&&flow.samples?.length>5)&&device.activityFlows.some(flow=>flow.kind==='natural-put-back-and-exit'),`${device.name}: natural playback/exit evidence missing.`);
    assert(device.checks.some(check=>check.label==='Journal survives an ordinary page reload'&&check.pass),`${device.name}: local journal reload check missing.`);
    if(device.name==='phone')assert(device.emulation?.isMobile===true&&device.emulation.hasTouch===true&&device.emulation.deviceScaleFactor===3, 'Phone evidence must be DPR3 mobile/touch emulation.');
    if(extended){assert(device.classPlayback&&['three-phase-UI-preview-not-full-attendance','natural-complete-course'].includes(device.classPlayback.kind),`${device.name}: class scope missing.`);assert(device.audioSettings&&device.facilityScope&&device.activityFlows.some(flow=>flow.id==='guide-linked-lateral-raise'),`${device.name}: audio/facility/guide deep-link evidence missing.`);assert(device.checks.some(check=>check.label==='Ordinary machine E/use starts the actual exercise directly'&&check.pass),`${device.name}: ordinary-machine E/use check missing.`);}
    checks.push({name:device.name,checks:device.checks.length,screenshots:device.screenshots?.length||0,...(device.classPlayback?{classPlayback:device.classPlayback}:{}),...(device.audioSettings?{audioSettings:device.audioSettings}:{})});
  }
  return{base:report.base,suite:report.suite,devices:checks,checks:checks.reduce((sum,device)=>sum+device.checks,0),scope:report.scope};
}
export function deploymentSummaryV019(receipt,{head,base='https://joe94113.github.io/gym_game/'}={}){
  const commit=receipt.commit||receipt.sourceCommit,workflow=receipt.workflow||{},workflowHead=workflow.headSHA||workflow.head_sha,workflowURL=workflow.html_url||workflow.htmlURL||workflow.url;
  assert(receipt.pass===true&&/^[a-f0-9]{40}$/i.test(commit||''),'Deployment receipt needs a successful real commit.');assert(commit===head,'Deployment commit is not the current git HEAD.');
  assert(receipt.url===base&&receipt.http?.url===base&&receipt.http.status===200,'Deployment receipt URL/HTTP200 proof differs from the public base.');
  assert(workflowHead===commit&&workflow.status==='completed'&&workflow.conclusion==='success'&&/^https:\/\/github\.com\/joe94113\/gym_game\/actions\/runs\/\d+/.test(workflowURL||''),'Successful Pages workflow does not match the deployed commit.');
  return{commit,url:base,workflowURL,workflowId:String(workflow.id||(workflowURL.match(/\/runs\/(\d+)/)||[])[1]),httpStatus:200};
}
export function verifySummaryOutputV019(output,publishedReady){
  const canonical=['artifacts/verification-summary-v0.19.json','artifacts/verification-summary.json'].map(path=>resolve(path));
  assert(publishedReady||!canonical.includes(resolve(output)),'An incomplete/local release cannot overwrite a canonical release summary.');
  return output;
}
export function backgroundCPUSummaryV019(report){
  assert(report.cpuPass===true&&report.tests?.failed===0&&report.tests.total===report.tests.material+report.tests.trainerRegression&&report.tests.total>0,'Background-material CPU qualification failed or is incomplete.');
  assert(report.scope&&report.verified?.length>0&&report.baselineShaderSource?.path&&fingerprint.test(report.baselineShaderSource.sha256),'Background-material CPU source/scope proof missing.');
  return{proofKind:'cpu-only',tests:report.tests,verified:report.verified,eligibleActorSelection:report.defaultSelection,scope:report.scope,limits:'cpuPass is not promoted to pixel/performance acceptance; separate pixel and ABBA evidence is required.'};
}
export function scrubSummaryV019(report){
  assert(report.pass===true&&report.testCount===2&&report.rows?.length===2&&['desktop','touch'].every(project=>report.rows.some(row=>row.project===project)),'Desktop/touch scrub final tests are incomplete.');
  for(const row of report.rows)assert(row.allTrusted===true&&row.nativeTrustedInputs>0&&!row.errors?.length&&row.observations?.length>0&&row.observations.every(sample=>sample.connected===true&&sample.same===true&&sample.previewed===true&&sample.paused===true),'Scrub native input or retained DOM/preview proof failed.');
  return{tests:report.testCount,renderer:report.renderer,trustedInputCounts:report.rows.map(row=>({project:row.project,count:row.nativeTrustedInputs})),coverage:report.coverage,limits:report.limits};
}
export function backgroundPixelSummaryV019(report){
  assert(report.pass===true&&report.phone===true&&report.control===false&&!report.errors?.length&&report.cases?.length===3,'Mobile background-material pixel proof is incomplete.');
  assert(['reception','free-weights','cardio'].every(name=>report.cases.some(row=>row.name===name)),'All three fixed pixel cameras are required.');
  for(const row of report.cases)assert(row.pass===true&&row.bodyUnchanged===true&&row.maxDifference===0&&row.changedPixels===0&&fingerprint.test(row.full?.sha256)&&row.full.sha256===row.background?.sha256,'Mobile pixel/geometry proof is not exact.');
  return{proofKind:'mobile-no-AA-fixed-camera-pixels',cases:report.cases.map(row=>({name:row.name,width:row.width,height:row.height,changedPixels:row.changedPixels,maxDifference:row.maxDifference,bodyUnchanged:row.bodyUnchanged,renderer:row.renderer})),scope:report.scope,limits:'No-AA mobile mode only. Desktop AA showed sparse differences and retains the full shader; pixel equality is not a performance result.'};
}
export function matrixCacheSummaryV019(report){
  assert(report.gpu===false&&report.poseSamples>=211&&report.surfaceVertices>0&&report.renderLikePasses>=878&&report.maxDifference===0&&report.cases?.length>=4&&report.cases.every(row=>row.pass===true),'Actual GLB matrix-cache CPU qualification is incomplete or differs from the baseline.');
  assert(typeof report.baseline==='string'&&report.baseline.includes('v019-before-matrix')&&report.sourceHashes?.['src/npc-world-matrices-v019.js'],'Matrix-cache frozen baseline/helper provenance missing.');
  return{proofKind:'actual-GLB-CPU-only',baseline:report.baseline,poseSamples:report.poseSamples,surfaceVertices:report.surfaceVertices,renderLikePasses:report.renderLikePasses,maxDifference:report.maxDifference,cases:report.cases,limits:'CPU matrix/palette/bind-inverse/surface equivalence. It is separate from native pixel comparisons, app RAF performance and physical-phone acceptance.'};
}
export function coalescingSummaryV019(report){
  assert(report.pass===true&&report.gpu===false&&report.baseline?.includes('v019-before-coalescing')&&report.frames>=234&&report.actorComparisons>=3645&&report.skinVertices>=98362&&report.cases?.length>=3&&report.cases.every(row=>row.pass===true),'NPC pose-coalescing CPU qualification is incomplete or failing.');
  const gym=report.cases.find(row=>row.name==='gym-clock-gear-contact-and-handoff'),social=report.cases.find(row=>row.name==='social-original-new-course-and-tablet');
  assert(report.cases.some(row=>row.name==='default-exact-before-coalescing')&&gym?.current?.pendingPoses===0&&social?.current?.pendingPoses===0,'Default equivalence or final-pose flush proof is missing.');
  assert(['exercise','return','release','stand','walk','idle'].every(stage=>gym.stages?.includes(stage)),'NPC ownership/leave/return stage coverage is incomplete.');
  return{proofKind:'actual-GLB-CPU-only',baseline:report.baseline,frames:report.frames,actorComparisons:report.actorComparisons,skinVertices:report.skinVertices,cases:report.cases.map(row=>({name:row.name,pass:row.pass,frames:row.frames,stages:row.stages,currentPoseUpdates:row.current?.poseUpdates,baselinePoseUpdates:row.baseline?.poseUpdates,pendingPoses:row.current?.pendingPoses})),limits:'CPU equivalence of normal/default execution and final poses after logical substeps. Native hitch/playback and full app RAF performance are verified separately.'};
}

export async function verifyReleaseV019(options={}){
  const phase=options.phase||'local';assert(['local','published'].includes(phase),'--phase must be local or published.');
  const cwd=resolve('.'),version=readJSON('package.json').version,paths={...defaultEvidenceV019,...Object.fromEntries(Object.keys(defaultEvidenceV019).filter(key=>options[key]).map(key=>[key,options[key]]))};
  const startedAt=new Date().toISOString(),checks={},missing=[],failures=[],changedProofs=[],evidence={},details={},sourceHashes=hashSourcesV019(),verificationHarnessHashes={'scripts/verify-release-v019.mjs':sha('scripts/verify-release-v019.mjs')},filesHashed=new Map();
  const record=(name,pass,detail)=>{checks[name]={status:pass?'passed':'failed',...(detail===undefined?{}:{detail})};if(!pass)failures.push({name,detail});};
  function safePath(path,root=''){assert(typeof path==='string'&&!!path,'Evidence path must be a string.');const absolute=resolve(root,path),rel=relative(cwd,absolute).replaceAll('\\','/');assert(rel&&!rel.startsWith('../')&&!isAbsolute(rel),`Evidence/source path escapes the workspace: ${path}`);assert(!/(?:^|\/)server\/data(?:\/|$)/i.test(rel),`Server data is outside this verification: ${path}`);return absolute;}
  function fileHash(path){const absolute=safePath(path),stat=statSync(absolute),key=`${absolute}:${stat.size}:${stat.mtimeMs}`;if(!filesHashed.has(key))filesHashed.set(key,sha(absolute));return filesHashed.get(key);}
  function verifyMap(name,map,settings={}){for(const entry of hashEntriesV019(map,{...settings,scope:name})){const path=safePath(entry.path,entry.root);if(!existsSync(path)||fileHash(path)!==entry.hash)changedProofs.push({proof:name,path:relative(cwd,path).replaceAll('\\','/'),expected:entry.hash,...(existsSync(path)?{actual:fileHash(path)}:{reason:'missing file'})});}}
  function proofHashes(name,report,{baselineRoot}={}){
    const beforeRoot=baselineRoot||report.beforeRoot||report.baselineRoot||(typeof report.baseline==='string'?report.baseline:null)||report.sourceRoots?.before||'.local-tools/v019-before',afterRoot=report.afterRoot||report.sourceRoots?.after||'',flatRoot=report.sourceRoot||'';
    for(const key of ['sourceHashes','sourceHashesEnd','hashes'])if(report[key])verifyMap(`${name}.${key}`,report[key],{flatRoot,beforeRoot,afterRoot});
    for(const key of ['harnessHashes','harnessHashesEnd','evidenceHashes','rawProofHashes'])if(report[key])verifyMap(`${name}.${key}`,report[key]);
    if(report.sources?.before||report.sources?.after)verifyMap(`${name}.sources`,report.sources,{beforeRoot,afterRoot});
    if(report.baselineSourceHashes)verifyMap(`${name}.baselineSourceHashes`,report.baselineSourceHashes,{flatRoot:beforeRoot});
    if(report.modelSHA256){const file='public/models/athlete/athlete.glb';assert(report.modelSHA256===fileHash(file),`${name}: model SHA differs from current GLB.`);}
    for(const key of ['changedSources','changedBaselineSources','changedProofs','changedSinceProof'])if(Array.isArray(report[key]))assert(report[key].length===0,`${name}: ${key} is nonempty.`);
  }
  async function load(name,validator,{published=false,baselineRoot}={}){
    const path=paths[name];if(published&&phase==='local'){checks[name]={status:'pending',detail:'Requires the final public deployment; local validation cannot substitute for it.'};return null;}
    if(!existsSync(path)){checks[name]={status:'pending',detail:`Missing final evidence: ${path}`};missing.push({name,path});return null;}
    try{const data=name==='node'?readFileSync(path,'utf8'):readJSON(path);if(typeof data==='object'){if('pass'in data)assert(data.pass===true,`${name}: report.pass is false.`);if('passed'in data)assert(data.passed===true,`${name}: report.passed is false.`);proofHashes(name,data,{baselineRoot});}details[name]=await validator(data,path);evidence[name]={path,sha256:fileHash(path),...(typeof data==='object'&&data.scope?{scope:data.scope}:{})};
      if(Array.isArray(data.devices))for(const device of data.devices){for(const [index,file]of (device.screenshots||[]).entries()){safePath(file);assert(existsSync(file),`${name}: actual screenshot missing: ${file}`);evidence[`${name}.${device.name}.image${index+1}`]={path:file,sha256:fileHash(file)};}for(const check of device.checks||[])if(check.label==='Journal backup contains the manually entered record'&&check.details?.file){const file=check.details.file;assert(existsSync(safePath(file)),`${name}: actual journal backup missing.`);evidence[`${name}.${device.name}.journalBackup`]={path:file,sha256:fileHash(file)};}}
      record(name,true);return data;}
    catch(error){record(name,false,String(error.stack||error));return null;}
  }
  record('version',version==='0.19.0',version);
  try{const {catalogActivities}=await import('../src/activity-catalog.js'),{motionCoverage}=await import('../src/motion-sources-v018.js'),rows=motionCoverage(catalogActivities),sourceBackedLoops=rows.filter(row=>row.loop.status!=='authored').length,authoredLoops=rows.filter(row=>row.loop.status==='authored').length,professionalPending=rows.filter(row=>row.professionalApproval==='pending').length;details.coverage={exerciseAndCourseCount:rows.length,sourceBackedLoops,authoredLoops,professionalApproved:rows.length-professionalPending,professionalPending,partiallyTimedLifecycles:18,transitionCountBasis:'Retained previously qualified lifecycle coverage; not inferred from the number of downloaded clips.'};record('coverage',rows.length===65&&sourceBackedLoops===17&&authoredLoops===48&&professionalPending===65,details.coverage);}catch(error){record('coverage',false,String(error));}
  await load('node',text=>{const summary=nodeLogSummaryV019(text);if(options['node-count'])assert(summary.tests===Number(options['node-count']),'Node count differs from the expected final count.');return summary;});
  await load('native',report=>{const summary=nativeSummaryV019(report),expectedCount=Number(options['native-count']||20);assert(summary.tests===expectedCount,`Native test count ${summary.tests} differs from the expected final count ${expectedCount}.`);for(const path of summary.attachments){safePath(path);assert(existsSync(path),`Native attachment missing: ${path}`);}return summary;});
  for(const name of ['cpu1','cpu4'])await load(name,(report,path)=>{
    const directory=dirname(path),sessionPath=resolve(directory,'measurement-session.json');assert(existsSync(sessionPath),`${name}: complete measurement session missing.`);const session=readJSON(sessionPath);assert(session.pass===true,`${name}: measurement session failed.`);proofHashes(`${name}.session`,session);evidence[`${name}Session`]={path:sessionPath,sha256:fileHash(sessionPath)};
    const runs=performanceProtocolV019.order.map(label=>{const runPath=resolve(directory,`${label}.json`);assert(existsSync(runPath),`${name}: raw ${label} missing.`);const run=readJSON(runPath);proofHashes(`${name}.${label}`,run);evidence[`${name}.${label}`]={path:runPath,sha256:fileHash(runPath)};return run;}),recomputed=compareRunsV019(runs),expectedRate=name==='cpu1'?1:4;
    assert(report.pass===true&&report.cpuRate===expectedRate&&recomputed.cpuRate===expectedRate,`${name}: wrong CPU rate or failed comparison.`);assert(same(report.rows,recomputed.rows),`${name}: comparison differs from all retained raw frames.`);assert(same(session.order,performanceProtocolV019.order)&&same(session.completedRuns,performanceProtocolV019.order),`${name}: ABBA session incomplete.`);
    return{cpuRate:expectedRate,stressSimulation:expectedRate===4,renderer:report.renderer,scenarios:report.rows.map(row=>({scenario:row.scenario,before:row.before.cadence,after:row.after.cadence,callback:{before:row.before.callback,after:row.after.callback},changePercent:row.changePercent,contentTradeoff:row.contentTradeoff,observedRegression:row.observedRegression})),limits:report.limits};
  });
  await load('trainer',report=>{assert(report.pass===true&&!report.failures?.length&&report.roster?.length===16&&new Set(report.roster.map(actor=>actor.coachId)).size===16,'Trainer roster/final qualifications failed.');assert(report.actors?.length===20&&report.actors.every(actor=>actor.poses>0&&!actor.selfCollisions?.length&&!actor.fixtureCollisions?.length&&!actor.surfaceCollisions?.length),'Trainer GLB actor rows are incomplete or colliding.');assert(report.regression?.originalActorCount===7&&report.regression.maxBodyDifference===0,'Original actor regression differs.');assert(report.layout?.interactionGates?.length===56&&report.layout.rigGates?.length===50,'Trainer station/entry gate coverage differs.');return{coaches:16,socialActors:20,totalNPC:31,poses:report.actors.reduce((sum,actor)=>sum+actor.poses,0),originalActorRegression:report.regression,stationGates:56,rigGates:50,scope:report.scope};});
  await load('natural',report=>{assert(report.pass===true,'Final natural-preparation report failed.');const rows=report.rows||report.results;assert(Array.isArray(rows)&&rows.length>0&&rows.every(row=>row.pass!==false),'Natural-preparation rows are missing or failing.');return{rows:rows.length,samples:rows.reduce((sum,row)=>sum+(row.frames??row.poses??row.phases??0),0),scope:report.scope||'See the final source-qualified report for the tested geometry and tolerance.',...(['count','phaseCount','totalPoses'].reduce((result,key)=>report[key]===undefined?result:{...result,[key]:report[key]},{}))};});
  await load('naturalSummary',report=>{assert(report.pass===true&&report.cases===13&&report.frames===6057&&report.collisionFlags===0&&report.liftWithoutClosedGrip===0,'Natural final summary is incomplete or failing.');assert(report.rack?.pass===true&&report.rack.frames===1206,'Strict rack proof is missing from the natural summary.');for(const path of report.reports||[]){assert(existsSync(safePath(path)),`Natural summary references missing evidence: ${path}`);evidence[`naturalSummary.reference.${path}`]={path,sha256:fileHash(path)};if(path.endsWith('.json')){const nested=readJSON(path);if('pass'in nested)assert(nested.pass===true,`Natural summary references a failed final proof: ${path}`);proofHashes(`naturalSummary.reference.${path}`,nested);}}return{cases:report.cases,frames:report.frames,handVertices:report.handVertices,footVertices:report.footVertices,maxHandMetalDepth:report.maxHandMetalDepth,maxGridLegSettle:report.maxGridLegSettle,gridFrames:report.gridFrames,rack:report.rack,legacyFootRailBug:report.legacyFootRailBug,scope:report.sourceScope};});
  await load('rack',report=>{assert(report.pass===true&&report.phaseCount>=201&&report.results?.length>0,'Rack/Smith final report missing or failed.');for(const row of report.results)for(const key of ['proxy','skin','self','strictShoe'])assert(!row[key]?.length,`Rack ${row.type}/${row.mode}: ${key} failures.`);return{rows:report.results.length,phaseCount:report.phaseCount,scope:report.scope};});
  await load('curl',report=>{assert(report.pass===true&&report.totalPoses===3996&&report.ids?.length===6&&!report.failures?.length,'Fresh six-mapping IMU qualification is missing or failing.');assert(report.rows?.length===6&&report.rows.every(row=>!row.errors?.length&&!row.collisions?.length&&row.muscleHighlightsRetained===true),'Fresh IMU rows contain errors or lost highlights.');return{samples:report.totalPoses,ids:report.ids,baselineSourceRoot:'.local-tools/v018-before',scope:report.scope};},{baselineRoot:'.local-tools/v018-before'});
  await load('scrub',scrubSummaryV019);
  await load('backgroundCPU',report=>{const summary=backgroundCPUSummaryV019(report);assert(fileHash(report.baselineShaderSource.path)===report.baselineShaderSource.sha256,'Frozen full shader source differs from CPU material proof.');assert(report.tests.evidence&&fileHash(report.tests.evidence)===report.tests.evidenceSHA256,'Material unit-test text proof differs.');return summary;});
  await load('backgroundPixels',report=>{const summary=backgroundPixelSummaryV019(report);for(const row of report.cases)for(const kind of ['full','background']){const image=row[kind];assert(fileHash(image.path)===image.sha256,`Pixel image changed: ${image.path}`);evidence[`backgroundPixels.${row.name}.${kind}`]={path:image.path,sha256:image.sha256};}return summary;});
  await load('matrixCache',matrixCacheSummaryV019,{baselineRoot:'.local-tools/v019-before-matrix'});
  await load('coalescing',coalescingSummaryV019,{baselineRoot:'.local-tools/v019-before-coalescing'});
  await load('builds',report=>{assert(report.pass===true,'Final build receipt failed.');const builds=report.builds||report.results;assert(Array.isArray(builds)&&builds.length>=2&&builds.every(build=>build.exitCode===0||build.pass===true),'Both production and Pages build exits must be present.');assert(builds.some(build=>/pages/i.test(`${build.name||''} ${build.command||''}`)),'Pages production build is missing.');return{builds};});
  const http=await load('http',publicHTTPSummaryV019,{published:true}),smoke=await load('smoke',report=>publicPlaySummaryV019(report),{published:true}),extended=await load('extended',report=>publicPlaySummaryV019(report,{extended:true}),{published:true});
  await load('deployment',async report=>{
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),summary=deploymentSummaryV019(report,{head}),dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal','--','src','public','site','package.json','package-lock.json','vite.config.js','index.html'],{encoding:'utf8'}).trim();assert(!dirty,'Published app/source assets differ from the committed source.');
    for(const [name,data]of [['http',http],['smoke',smoke],['extended',extended]])assert(data?.base===summary.url,`${name}: public evidence is absent or has another base.`);
    const response=await fetch(summary.url,{signal:AbortSignal.timeout(30000)}),html=Buffer.from(await response.arrayBuffer());assert(response.status===200,'Live published home no longer returns HTTP200.');assert(createHash('sha256').update(html).digest('hex')===details.http.homeSHA256,'Live home differs from the qualified public HTML.');
    const workflow=await fetch(`https://api.github.com/repos/joe94113/gym_game/actions/runs/${summary.workflowId}`,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'MuscleBase-release-verification/0.19'}});assert(workflow.ok,'Cannot verify the real public deployment workflow.');const run=await workflow.json();assert(run.head_sha===summary.commit&&run.status==='completed'&&run.conclusion==='success','Live Pages workflow does not confirm the deployed commit.');
    return{...summary,verifiedLiveAt:new Date().toISOString(),homeSHA256:details.http.homeSHA256};
  },{published:true});
  for(const [index,path]of (options.extra||'').split(',').filter(Boolean).entries()){const name=`extra${index+1}`;paths[name]=path;await load(name,report=>{assert(report.pass===true||report.passed===true,'Additional final proof did not pass.');return{scope:report.scope||null};});}
  const sourceHashesEnd=hashSourcesV019(),verificationHarnessHashesEnd={'scripts/verify-release-v019.mjs':sha('scripts/verify-release-v019.mjs')};record('sourceConsistency',changedProofs.length===0&&changedHashesV019(sourceHashes,sourceHashesEnd).length===0&&changedHashesV019(verificationHarnessHashes,verificationHarnessHashesEnd).length===0,{changedProofs,changedDuringAggregation:changedHashesV019(sourceHashes,sourceHashesEnd),verificationHarnessChanges:changedHashesV019(verificationHarnessHashes,verificationHarnessHashesEnd)});
  const localKeys=['version','coverage','node','native','cpu1','cpu4','trainer','natural','naturalSummary','rack','curl','scrub','backgroundCPU','backgroundPixels','matrixCache','coalescing','builds','sourceConsistency',...Object.keys(checks).filter(key=>key.startsWith('extra'))],localReady=localKeys.every(key=>checks[key]?.status==='passed'),publishedReady=phase==='published'&&localReady&&['http','smoke','extended','deployment'].every(key=>checks[key]?.status==='passed');
  const result={version,phase,pass:publishedReady,localReady,releaseStatus:publishedReady?'published-verified':localReady?'local-verified-publication-pending':'incomplete',startedAt,recordedAt:new Date().toISOString(),checks,missing,failures,changedProofs,details,evidence,sourceHashes,sourceHashesEnd,verificationHarnessHashes,verificationHarnessHashesEnd,coverage:details.coverage||null,limits:['A local phase never establishes a complete published release and cannot replace the canonical published summary.','Native mobile emulation and CPU4 stress are not physical-phone or multiple-GPU measurements.','Numeric pose sampling, public UI playback and normal HTTP delivery do not provide clinical approval or continuous collision-free guarantees.','The 17 loops include partial pose and timing references; 48 loops remain authored and all65 professional reviews are pending.']};
  const output=verifySummaryOutputV019(options.output||`artifacts/release-v019/verification-${phase}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,publishedReady);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  if(publishedReady){for(const path of ['artifacts/verification-summary-v0.19.json','artifacts/verification-summary.json'])writeFileSync(path,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify({pass:result.pass,localReady,phase,releaseStatus:result.releaseStatus,output,checks:Object.fromEntries(Object.entries(checks).map(([key,value])=>[key,value.status])),missing,failures,changedProofs},null,2));
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const allowed=new Set(['phase','output','node-count','native-count','extra',...Object.keys(defaultEvidenceV019)]),options={};for(const arg of process.argv.slice(2)){const match=arg.match(/^--([^=]+)=(.*)$/s);assert(match&&allowed.has(match[1]),`Unknown option: ${arg}`);options[match[1]]=match[2];}
  try{const result=await verifyReleaseV019(options);if(options.phase==='published'?!result.pass:!result.localReady)process.exitCode=1;}catch(error){console.error(error.stack||String(error));process.exitCode=1;}
}
