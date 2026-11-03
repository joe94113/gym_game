// Evidence-only, fail-closed release summary. Never writes the canonical file.
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hashPerformanceSources} from './performance-source-v013.mjs';
import {frameStatistics,hardwareRenderer,fixedProfileSettings} from './perf-stats-v013.mjs';
import {preparationLoopIssuesV013} from './preparation-loop-contract-v013.mjs';
import {dumbbellFingerEvidenceIssuesV013} from './validate-dumbbell-finger-evidence-v013.mjs';
import {nativeBrowserEvidenceV013} from './native-browser-evidence-v013.mjs';

export const RELEASE_V013={
 finalized:true,expectedNodeTests:153,expectedBrowserTests:53,baseline:'.local-tools/v013-before/',
 files:{freeze:'artifacts/release-v013/source-freeze.json',build:'artifacts/release-v013/build.json',node:'artifacts/release-v013/unit.tap',browser:'artifacts/playwright-v013-native.json',browserRetest:'artifacts/playwright-v013-native-retest.json',browserSourceEvidence:'artifacts/release-v013/browser-source-stability.json',
  preparation:'artifacts/preparation-v013/comparison.json',loops:'artifacts/preparation-v013/loop-preservation.json',settings:'artifacts/equipment-settings-v013/qualification.json',settingsLifecycle:'artifacts/equipment-settings-v013/lifecycles-qualification.json',
  mocap:'artifacts/v013/captured-locomotion.json',journal:'artifacts/journal-v013/qualification.json',aerial:'artifacts/aerial-v013/qualification.json',
  performance:'artifacts/performance-v013/comparison.json',transitions:'artifacts/performance-v013/transitions-comparison-flow.json',beforeCapture:'artifacts/preparation-v013/visual/before-capture.json',afterCapture:'artifacts/preparation-v013/visual/after-capture.json',visual:'artifacts/release-v013/visual-review.json'},
};
const output='artifacts/verification-summary-v0.13.json',same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),validSHA=value=>typeof value==='string'&&/^[a-f\d]{64}$/i.test(value),close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1e-7,Math.abs(b)*1e-9),specs=function*(report){for(const suite of report.suites||[]){yield* suite.specs||[];yield* specs(suite);}},key=result=>`${result.profile}:${result.scenario}`;
export function summarizeReleaseV013({root=process.cwd(),config=RELEASE_V013}={}){
 const full=path=>resolve(root,path),cache=new Map(),sha=path=>{if(!cache.has(path))cache.set(path,createHash('sha256').update(readFileSync(full(path))).digest('hex'));return cache.get(path);},read=path=>JSON.parse(readFileSync(full(path),'utf8').replace(/^\uFEFF/,'')),evidence={},actualPerformance=[];
 function sources(proof,{baseline=false,required=true}={}){
  const map=baseline?(proof.baselineSourceHashes||proof.sourceHashes):proof.sourceHashes,issues=[];
  if(required&&(!map||!Object.keys(map).length))issues.push('missing declared source SHA map');
  for(const [path,value]of Object.entries(map||{})){const target=(baseline?config.baseline:'')+path;try{if(!validSHA(value)||sha(target)!==value.toLowerCase())issues.push('stale/malformed source '+target);}catch{issues.push('missing source '+target);}}
  for(const [path,value]of Object.entries(proof.validatorSourceHashes||{}))try{if(!validSHA(value)||sha(path)!==value.toLowerCase())issues.push('stale/malformed common validator '+path);}catch{issues.push('missing common validator '+path);}
  if(proof.changedSources?.length||proof.sourceChanges?.length||proof.changedBaselineSources?.length||proof.changedValidators?.length)issues.push('proof source changed');if(proof.failures?.length)issues.push('proof contains failures');return issues;
 }
 function item(name,validate,{requirePass=true,requireSources=true,baseline=false}={}){
  const file=config.files[name];if(!file||!existsSync(full(file))){evidence[name]={file,status:'missing'};return null;}
  try{
   const proof=read(file),issues=requireSources?sources(proof,{baseline}):[],details={},dependencies={},context={issues,details,dependencies,pending:false,depend(path){dependencies[path]=sha(path);}};
   if(requirePass&&proof.pass!==true)issues.push('proof not passing');validate?.(proof,context);
   evidence[name]={file,sha256:sha(file),status:issues.length?'failed':context.pending?'pending':'passed',issues,...(Object.keys(details).length?{details}:{}),...(Object.keys(dependencies).length?{dependencies}:{})};return proof;
  }catch(error){evidence[name]={file,status:'failed',issues:[error.message]};return null;}
 }
 function tap(path,expected){
  const text=readFileSync(full(path),'utf8'),counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name=>[name,Number(text.match(new RegExp(`^# ${name} (\\d+)\\r?$`,'m'))?.[1]??NaN)]));
  return{counts,pass:Number.isInteger(expected)&&counts.tests===expected&&counts.pass===expected&&['fail','cancelled','skipped','todo'].every(name=>counts[name]===0)};
 }
 const freeze=item('freeze',(proof,{issues,details})=>{
  if(proof.version!=='0.13.0')issues.push('wrong source freeze version');const runtime=hashPerformanceSources(root),covered=proof.sourceHashes||{};
  for(const [path,value]of Object.entries(runtime))if(covered[path]!==value)issues.push('freeze missing/current runtime '+path);
  details.files=Object.keys(covered).length;details.scope='All shipped src/server/public/package/Vite/index sources; mutable private account data is excluded.';
 },{requirePass:false});
 item('preparation',(proof,{issues,details,depend})=>{
  issues.push(...sources(proof,{baseline:true}));if(proof.cases!==40||proof.posesPerVersion!==80080||proof.rows?.length!==40||new Set(proof.rows.map(row=>row.id)).size!==40||proof.afterPass!==true||proof.issues?.length)issues.push('full default preparation coverage missing');
  for(const [path,value]of Object.entries(proof.dependencies||{})){depend(path);if(sha(path)!==value)issues.push('preparation dependency changed '+path);}
  if(proof.rows?.some(row=>row.after.pass!==true||!(row.after.maxReachError<.015)||!(row.after.maxBoneError<1e-5)||row.afterCollisions!==0))issues.push('preparation limits failed');
  Object.assign(details,{cases:proof.cases,posesPerVersion:proof.posesPerVersion,beforePass:proof.beforePass,afterPass:proof.afterPass,scope:proof.scope,speedIncreases:proof.speedIncreases,notHumanTrainerApproval:true});
 });
 item('loops',(proof,{issues,details,depend})=>{
  issues.push(...sources(proof,{baseline:true}),...preparationLoopIssuesV013(proof));
  for(const [path,value]of Object.entries(proof.dependencies||{})){depend(path);if(sha(path)!==value)issues.push('loop dependency changed '+path);}
  if(proof.gripEvidence?.path&&existsSync(full(proof.gripEvidence.path))){const grip=read(proof.gripEvidence.path);depend(proof.gripEvidence.path);if(sha(proof.gripEvidence.path)!==proof.gripEvidence.sha256)issues.push('dense grip evidence changed');issues.push(...sources(grip),...dumbbellFingerEvidenceIssuesV013(grip,{root}));if(grip.pass!==true)issues.push('dense grip evidence not passing');for(const leaf of grip.additionalBenchReports||[])depend(leaf.path);}
  else issues.push('dense grip evidence file missing');
  Object.assign(details,{poses:proof.poses,skinSamplesCompared:proof.samples,exactActorCases:proof.results?.filter(item=>item.mode==='exact').length,scopedGripCases:proof.results?.filter(item=>item.mode==='scoped-grip').length,protectedSkinSamples:proof.results?.reduce((sum,item)=>sum+(item.protectedSkinSamples||0),0),excludedArmHandSamples:proof.results?.reduce((sum,item)=>sum+(item.excludedArmHandSamples||0),0),extendedPlatePegs:proof.results?.flatMap(item=>(item.equipmentChanges||[]).map(change=>({id:item.id,...change}))),gripEvidence:proof.gripEvidence,equipmentEvidence:proof.equipmentEvidence,scope:proof.scope});
 });
 for(const name of ['settings','settingsLifecycle'])item(name,(proof,{issues,details})=>{
  if(proof.pilot!==false||proof.phases!==101||proof.results?.length!==152||proof.results.some(result=>result.pass!==true||!(result.maxReachError<.015)||!(result.maxContactError<.015)||['collisions','self','surface'].some(key=>!Array.isArray(result[key])||result[key].length)))issues.push('full 152-setting/101-phase production coverage failed or missing');
  Object.assign(details,{settings:proof.results?.length,phases:proof.phases,poses:proof.results?.reduce((count,result)=>count+(typeof result.poses==='number'?result.poses:name==='settings'?101:202),0),scope:proof.scope});
 });
 item('mocap',(proof,{issues,details,depend})=>{
  if(proof.samples<6025||!(proof.maxReachError<.015)||!Number.isFinite(proof.maxHandStepAt120Hz))issues.push('full captured locomotion samples missing');
  const metadata=read('public/motions/cmu-v013.json');depend('public/motions/cmu-v013.json');
  const expected={walk:['07','07_01',114],run:['09','09_01',81]};
  for(const [name,[subject,id,count]]of Object.entries(expected)){
   const clip=metadata.clips?.[name];if(clip?.id!==id||clip.fps!==120||clip.frames!==count||clip.samples?.length!==count||clip.samples.some(frame=>['upper','lower'].some(key=>frame[key]?.length!==2||frame[key].some(vector=>vector.length!==3||vector.some(value=>!Number.isFinite(value))||Math.abs(Math.hypot(...vector)-1)>1e-5))))issues.push('captured CMU clip shape invalid '+name);
   for(const [kind,path]of [['asf',`.local-tools/cmu-v013/${subject}.asf`],['amc',`.local-tools/cmu-v013/${id}.amc`]]){depend(path);if(sha(path)!==clip?.sha256?.[kind])issues.push('captured source provenance mismatch '+path);}
  }
  Object.assign(details,{samples:proof.samples,source:metadata.source,attribution:metadata.attribution,scope:proof.scope,limits:'Captured locomotion arm directions retimed onto existing IK/ground contacts. No all-exercise mocap claim.'});
 });
 item('journal',(proof,{issues,details,depend})=>{
  if(proof.tests!==16||proof.failed!==0||!proof.unitTap?.path)issues.push('16 account/journal tests missing');else{depend(proof.unitTap.path);if(sha(proof.unitTap.path)!==proof.unitTap.sha256||!tap(proof.unitTap.path,16).pass)issues.push('journal TAP mismatch');}
  Object.assign(details,{tests:proof.tests,scope:proof.scope,limits:proof.limits,browserCoveredByFullNativeSuite:true});
 });
 item('aerial',(proof,{issues,details})=>{
  if(!Array.isArray(proof.changedSources)||proof.changedSources.length)issues.push('aerial start-to-end source stability missing or failed');
  if(proof.sourceHashes?.['scripts/qualify-aerial-suspension-v013.mjs']!==sha('scripts/qualify-aerial-suspension-v013.mjs'))issues.push('aerial qualification implementation was not hashed');
  if(proof.quick!==false||proof.count!==101||proof.results?.length!==8||proof.results.some(result=>result.samples!==101||!(result.maxReach<.015)||!(result.maxAnchorError<1e-6)||['proxy','self','surface','clothTriangles'].some(key=>!Array.isArray(result[key])||result[key].length)))issues.push('full aerial body/skin/cloth qualification missing');
  if(!(proof.results?.find(result=>result.motionId==='aerial-supported-inversion')?.invertedSamples>0)||!proof.results?.some(result=>result.airborneSamples>0))issues.push('suspended/inverted poses were not actually sampled');
  const extraIds=['lifecycle-enter','lifecycle-exit',...['aerial-supported-seat','aerial-supported-inversion'].flatMap(id=>[.15,.35,.5,.85].map(phase=>`return:${id}:${phase}`)),...['aerial-supported-seat','aerial-supported-inversion'].flatMap(id=>[.35,.5].map(phase=>`join:${id}:${phase}`))];
  if(proof.totalPoses!==2222||proof.extraResults?.length!==14||extraIds.some(id=>!proof.extraResults?.some(result=>result.id===id))||proof.extraResults?.some(result=>result.samples!==101||!(result.maxReach<.015)||!(result.maxAnchorError<1e-6)||!(result.surfaceSamples>0)||['proxy','self','surface'].some(key=>!Array.isArray(result[key])||result[key].length)))issues.push('full aerial lifecycle/return/join qualification missing');
  const allAerial=[...(proof.results||[]),...(proof.extraResults||[])];
  if(allAerial.some(result=>!Array.isArray(result.outerSkin)||result.outerSkin.length||!Number.isFinite(result.maxPouchSkinDepth)||result.maxPouchSkinDepth>.0005||!(result.maxPouchContactError<1e-6)||!(result.minUpperRegionLowerBodyGap>.15)||!(result.maxStretch<.04)))issues.push('aerial actual outer-skin/support/cloth qualification failed or missing');
  if(['aerial-supported-seat','aerial-supported-inversion'].some(id=>!(proof.results?.find(result=>result.motionId===id)?.pouchSkinVertices>0)))issues.push('actual stride-1 air pouch skin was not sampled');
  if(proof.materialRegions?.pouchAndLowerSeamNodes!==35||proof.materialRegions?.upperRailNodes!==10||proof.materialRegions?.upperTriangles!==16)issues.push('aerial cloth material contact region changed or missing');
  if(proof.branchPreservation?.exact!==true||!validSHA(proof.branchPreservation.beforeSha256)||proof.branchPreservation.beforeSha256!==proof.branchPreservation.afterSha256)issues.push('unchanged cycle/TRX branch preservation missing');
  Object.assign(details,{motions:proof.results?.length,extraPaths:proof.extraResults?.length,totalPoses:proof.totalPoses,count:proof.count,sourceHashStability:{checkedAtStartAndEnd:true,changedSources:proof.changedSources||null,sourceFiles:Object.keys(proof.sourceHashes||{}).length},limits:proof.limits});
 });
 item('build',(proof,{issues,details})=>{if(!/^npm(?:\.cmd)? run build$/.test(proof.command||''))issues.push('actual build command receipt missing');details.scope=proof.scope||'Build completion at the recorded source hashes.';});
 const nodeFile=config.files.node;
 if(!nodeFile||!existsSync(full(nodeFile)))evidence.node={file:nodeFile,status:'missing'};
 else{const proof=tap(nodeFile,config.expectedNodeTests),pending=!Number.isInteger(config.expectedNodeTests);evidence.node={file:nodeFile,sha256:sha(nodeFile),status:pending?'pending':proof.pass?'passed':'failed',expected:config.expectedNodeTests,...proof};}
 evidence.browser=nativeBrowserEvidenceV013({root,expectedCases:config.expectedBrowserTests,paths:{full:config.files.browser,retest:config.files.browserRetest,source:config.files.browserSourceEvidence,freeze:config.files.freeze}});
 item('performance',(proof,{issues,details,depend})=>{
  issues.push(...sources(proof,{baseline:true}));const names=['before-1','after-1','after-2','before-2'],keys=['flow','clear'].flatMap(profile=>['walking','sprint','guided','equipment'].map(scenario=>`${profile}:${scenario}`));
  if(proof.reports?.length!==4||new Set(proof.reports).size!==4||proof.rows?.length!==8||new Set(proof.rows.map(key)).size!==8||keys.some(value=>!proof.rows.some(row=>key(row)===value))){issues.push('four real-play leaves/eight rows missing');return;}
  const leaves=proof.reports.map((file,index)=>{depend(file);if(proof.dependencies?.[file]!==sha(file))issues.push('performance leaf changed '+file);const leaf=read(file),baseline=names[index].startsWith('before');issues.push(...sources(leaf,{baseline}));
   if(!leaf.pass||leaf.name!==names[index]||leaf.hooks!=='off'||leaf.rendererKind!=='native'||leaf.seconds!==8||leaf.deviceScaleFactor!==1||!same(leaf.viewport,{width:1280,height:800})||leaf.errors?.length||leaf.changedSources?.length||leaf.results?.length!==8||new Set(leaf.results.map(key)).size!==8||keys.some(value=>!leaf.results.some(result=>key(result)===value)))issues.push('invalid official real-play leaf '+file);
   for(const result of leaf.results||[]){const setting=fixedProfileSettings(result.setup,result.profile),raw=result.raw;
    if(result.pass!==true||raw?.gl!==null||raw.visibility!=='visible'||!raw.detected?.proof||!(raw.elapsedMs>=7999)||raw.frames?.length<3||raw.frames.some(frame=>!Number.isFinite(frame.intervalMs)||frame.intervalMs<=0||!Number.isFinite(frame.callbackMs)||frame.callbackMs<0||!Object.hasOwn(frame,'phase')||!same(frame.framebuffer,setting.framebuffer)))issues.push('unwrapped actual game RAF missing '+file+'/'+key(result));
    const measured=frameStatistics(raw.frames.map(frame=>frame.intervalMs));for(const field of Object.keys(measured))if(!close(result.cadence?.[field],measured[field]))issues.push('leaf cadence/raw mismatch '+file+'/'+key(result)+'.'+field);
    if(!raw.telemetry?.length||raw.telemetry.some(frame=>frame.activeProfile!==setting.active||frame.pixelRatio!==setting.pixelRatio||frame.shadows!==setting.shadows||!same(frame.framebuffer,setting.framebuffer)))issues.push('quality changed during timing');
    const moving=result.scenario!=='equipment';if(moving&&(!same(result.movement?.route,['w','s','w','s'])||result.movement.shift!==(result.scenario==='sprint')||!result.movement.minimumCoverageMet||result.movement.sampledDistance<=.2||!raw.keys?.some(event=>event.type==='keydown'&&['w','s'].includes(event.key.toLowerCase()))))issues.push('real keyboard travel missing');
    if(result.scenario==='sprint'&&!raw.keys?.some(event=>event.key==='Shift'||event.shiftKey))issues.push('Shift event missing');if(!moving&&result.after?.activity?.exerciseId!=='dumbbell-bench-press')issues.push('equipment demo not running');
   }return leaf;});
  for(const row of proof.rows){const selected=leaves.map(leaf=>leaf.results.find(result=>key(result)===key(row))),settings=selected.map(result=>({...fixedProfileSettings(result.setup,row.profile),position:result.setup.position,heading:result.setup.heading}));if(settings.some(value=>!same(value,settings[0])))issues.push('matched starting scene/quality missing '+key(row));
   for(const [version,indices]of [['before',[0,3]],['after',[1,2]]]){const measured=frameStatistics(indices.flatMap(index=>selected[index].raw.frames.map(frame=>frame.intervalMs)));for(const field of Object.keys(measured))if(!close(row[version]?.[field],measured[field]))issues.push('pooled raw statistic mismatch '+key(row)+' '+version+'.'+field);}
   actualPerformance.push({...row,p95ApproximatelyUnchanged:Math.abs(row.before.p95Ms-row.after.p95Ms)<=.25,late50Worsened:row.after.over50Percent>row.before.over50Percent});
  }
  Object.assign(details,{rows:actualPerformance,scope:proof.scope,limits:proof.limits,interpretation:'Measurement validity does not mean every scenario improves. RAF cadence is not isolated GPU time or guaranteed display FPS.'});
 });
 item('transitions',(proof,{issues,details,depend})=>{
  issues.push(...sources(proof,{baseline:true}));if(!Array.isArray(proof.reports)||proof.reports.length<2){issues.push('before/after transition leaves missing');return;}
  const versions=new Set(),rows=[],scenarios=['load','mount','exit','classroom-wake','bathroom-wake'];
  if(new Set(proof.reports).size!==proof.reports.length)issues.push('duplicate transition leaf');
  for(const file of proof.reports){depend(file);if(proof.dependencies?.[file]!==sha(file))issues.push('transition leaf changed '+file);const leaf=read(file),baseline=leaf.name?.startsWith('before');versions.add(baseline?'before':'after');issues.push(...sources(leaf,{baseline}));
   if(!/^(before|after)(?:-\d+)?$/.test(leaf.name||'')||!leaf.pass||leaf.rendererKind!=='native'||!Number.isInteger(leaf.repeats)||leaf.repeats<1||leaf.repeats>4||leaf.deviceScaleFactor!==1||!same(leaf.viewport,{width:1280,height:800})||leaf.results?.length!==leaf.repeats*5||leaf.errors?.length||leaf.changedSources?.length)issues.push('native full transition leaf missing');
   for(let repeat=1;repeat<=leaf.repeats;repeat++)for(const scenario of scenarios)if(leaf.results.filter(result=>result.repeat===repeat&&result.scenario===scenario).length!==1)issues.push('transition scenario/repeat missing');
   for(const result of leaf.results||[]){const setting=fixedProfileSettings(result.setup,leaf.quality),raw=result.raw;if(result.pass!==true||!raw?.detected?.proof||raw.visibility!=='visible'||raw.frames?.length<3||raw.frames.some(frame=>!Number.isFinite(frame.intervalMs)||frame.intervalMs<=0||!Number.isFinite(frame.callbackMs)||frame.callbackMs<0||frame.activeProfile!==setting.active||frame.pixelRatio!==setting.pixelRatio||frame.shadows!==setting.shadows||!same(frame.framebuffer,setting.framebuffer)))issues.push('invalid transition actual RAF');
    const statistics=frameStatistics(raw.frames.map(frame=>frame.intervalMs));for(const field of Object.keys(statistics))if(!close(result.cadence?.[field],statistics[field]))issues.push('transition cadence/raw mismatch');
    if(result.scenario==='load'&&(!(raw.loadedAtMs>=0)||!result.loading?.navigation?.length||!result.loading?.resources?.length))issues.push('loading resource/ready times missing');
    if(['mount','exit'].includes(result.scenario)&&(!(raw.completedAtMs>=0)||!raw.stages?.length||raw.final?.stage!==(result.scenario==='mount'?'exercising':'idle')))issues.push('actual mount/exit lifecycle completion missing');
    if(result.scenario.endsWith('-wake')&&(!result.beforeRoom?.resources?.gpuEvictionRequested||result.afterRoom?.resources?.gpuEvictionRequested||!result.afterRoom?.room?.visible||!raw.events?.some(event=>event.type==='pointermove')))issues.push('actual room disposal-request/return/input missing');
    rows.push({version:baseline?'before':'after',leaf:file,profile:leaf.quality,repeat:result.repeat,scenario:result.scenario,cadence:statistics,completedAtMs:raw.completedAtMs,loadedAtMs:raw.loadedAtMs});
   }
  }
  if(!versions.has('before')||!versions.has('after'))issues.push('both versions required for transitions');
  for(const version of ['before','after'])for(const scenario of scenarios)if(rows.filter(row=>row.version===version&&row.scenario===scenario).length<2)issues.push('two independent transition repetitions missing '+version+'/'+scenario);
  Object.assign(details,{rows,scope:proof.scope,limits:proof.limits});
 });
 for(const name of ['beforeCapture','afterCapture'])item(name,(proof,{issues,details,depend})=>{
  const before=name==='beforeCapture',count=before?8:10,records=proof.records||[];if(records.length!==count||new Set(records.map(record=>record.key)).size!==count||records.reduce((n,record)=>n+(record.sheets?.length||0),0)!==count*2||proof.errors?.length)issues.push('full preparation visual capture set missing');
  for(const record of records){if(!record.expectedHighlights)issues.push('record expected muscle arrays missing');for(const sheet of record.sheets||[]){depend(sheet.path);if(sheet.panels?.length!==12)issues.push('four phases/three views missing');for(const panel of sheet.panels||[])if(!(panel.contact?.maxReachError<.015)||panel.clearance?.collisions?.length||!same(panel.highlights,record.expectedHighlights))issues.push('capture contact/clearance/expected muscle mismatch '+record.key);}}
  if(!before){
   const path='artifacts/preparation-v013/visual/after-lift-review-link.json';
   if(!existsSync(full(path)))issues.push('post-lift preparation visual observation link missing');
   else{
    depend(path);const link=read(path),expected=records.flatMap(record=>record.sheets.map(sheet=>sheet.path)),priorPaths=['artifacts/preparation-v013/visual/pre-lift-review/root-after-review.json','artifacts/preparation-v013/visual/pre-lift-review/agent-review.json'];
    issues.push(...sources(link));if(link.pass!==true||!same(link.sourceHashes,proof.sourceHashes)||link.comparisons?.length!==20||link.examined?.length!==20||new Set(link.examined).size!==20||expected.some(image=>!link.examined.includes(image)))issues.push('full current-capture / previously observed image link missing');
    const prior=priorPaths.map(file=>{depend(file);return read(file);});if(prior.some(review=>review.pass!==true)||new Set(prior.flatMap(review=>review.examined||[])).size!==20)issues.push('original 20-image actual observation records missing');
    for(const [file,value]of Object.entries(link.dependencies||{})){depend(file);if(sha(file)!==value)issues.push('visual-link dependency changed '+file);}
    for(const row of link.comparisons||[]){depend(row.path);depend(row.archived);if(!expected.includes(row.path)||row.identical!==true||sha(row.path)!==row.sha256||sha(row.archived)!==row.sha256||link.imageHashes?.[row.path]!==row.sha256||!prior.some(review=>review.examined?.includes(row.path)&&review.imageHashes?.[row.path]===row.sha256))issues.push('observed/current/archived PNG bytes differ '+row.path);}
    details.observationLink={file:path,images:link.comparisons?.length,scope:link.scope,limits:link.limits};
   }
  }
  Object.assign(details,{records:records.length,sheets:count*2,scope:proof.scope});
 },{baseline:name==='beforeCapture'});
 item('visual',(proof,{issues,details,depend})=>{
  if(!proof.examined?.length||!proof.scope||!proof.findings||!proof.limits)issues.push('actual visual observation record missing');
  for(const [path,value]of Object.entries(proof.dependencies||{})){depend(path);if(sha(path)!==value)issues.push('visual observation dependency changed '+path);}
  for(const path of proof.examined||[]){depend(path);if(proof.imageHashes?.[path]!==sha(path))issues.push('visual image missing/changed '+path);}
  Object.assign(details,{examined:proof.examined,scope:proof.scope,findings:proof.findings,limits:proof.limits,reviewerScope:'AI screenshot observation, not human trainer review.'});
 });
 const preserved=['public/models/athlete/athlete.glb','public/models/athlete/rig.json'],assetIssues=[];
 for(const path of preserved)if(sha(path)!==sha(config.baseline+path))assetIssues.push(path);
 evidence.originalActorPreservation={status:assetIssues.length?'failed':'passed',issues:assetIssues,files:preserved,scope:'Original actor binary and rig metadata remain exact. New motion, equipment detail, setup and aerial sources intentionally differ and are qualified separately.'};
 const drift=Object.entries(freeze?.sourceHashes||{}).filter(([path,value])=>createHash('sha256').update(readFileSync(full(path))).digest('hex')!==value).map(([path])=>path);evidence.sourceStability={status:drift.length?'failed':'passed',changedWhileSummarizing:drift};
 const blockers=Object.entries(evidence).filter(([,item])=>item.status!=='passed').map(([key,item])=>({key,status:item.status,issues:item.issues}));if(!config.finalized)blockers.push({key:'finalIntegration',status:'pending'});
 const status=blockers.some(item=>item.status==='failed')?'failed':blockers.length?'incomplete':'passed';
 return{version:'0.13.0',date:new Date().toISOString(),status,pass:status==='passed',canonicalSummaryWritten:false,sourceHashes:freeze?.sourceHashes||{},evidence,blockers,actualPerformance,evidenceLimits:{motion:'Numerical/finite skin and screenshot checks are not professional biomechanics or all-pose collision certification.',mocap:'Only captured locomotion arm directions are integrated; exercise preparations remain authored IK paths.',accounts:'Self-hosted account synchronization on the same running server; public cloud hosting, email recovery and distributed databases are not claimed.',aerial:'Constrained body trajectories and cloth samples; not a real-world aerial safety certification.',performance:'Native headless actual game RAF on the measured machine, not guaranteed displayed FPS or isolated GPU time.',coachReview:'Review workspace and source material can be completed without fabricating a qualified human signature. Human approval is reported separately and does not block this implementation summary.'},previous:'artifacts/verification-summary-v0.12.json'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const report=summarizeReleaseV013();writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({file:output,status:report.status,pass:report.pass,blockers:report.blockers}));if(!report.pass)process.exitCode=2;}
