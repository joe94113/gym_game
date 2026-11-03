import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {hashPerformanceSources} from './performance-source-v013.mjs';

export const NATIVE_BROWSER_PATHS_V013=Object.freeze({full:'artifacts/playwright-v013-native.json',retest:'artifacts/playwright-v013-native-retest.json',source:'artifacts/release-v013/browser-source-stability.json',freeze:'artifacts/release-v013/source-freeze.json'});
export const REVIEWED_TEST_CORRECTIONS_V013=Object.freeze([
 {file:'tests/class-ui.spec.js',title:'七種團課有不同器材與動作，換課會等教練學員就位並保持接點',reasonCode:'direct-muscle-legend-children',reason:'The new label contains nested spans; inspect the two direct legend children.'},
 {file:'tests/expanded-gym.spec.js',title:'走近普通器材按 E 會直接使用，槓片設定與實際接點同步',reasonCode:'await-equipment-reentry',reason:'The setting applies after the complete return/exit, then the character re-enters.'},
]);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),shaPattern=/^[a-f\d]{64}$/i,fileName=value=>basename(String(value||'').replaceAll('\\','/')),milliseconds=value=>typeof value==='string'?Date.parse(value):NaN,nearTime=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1;
export function browserSpecsV013(report){return(report?.suites||[]).flatMap(suite=>[...(suite.specs||[]),...browserSpecsV013(suite)]);}
export const reviewedCorrectionV013=spec=>REVIEWED_TEST_CORRECTIONS_V013.find(item=>fileName(item.file)===fileName(spec.file)&&item.title===spec.title);

function inspectReport(report,label,{expectedCases,allowFailures}){
 const issues=[],specs=browserSpecsV013(report),start=milliseconds(report?.stats?.startTime),duration=report?.stats?.duration,end=start+duration,passed=[],failed=[];
 if(!Array.isArray(report?.errors)||report.errors.length)issues.push(label+' has global errors or lacks an error list');
 if(specs.length!==expectedCases||new Set(specs.map(spec=>spec.id)).size!==expectedCases||specs.some(spec=>!spec.id))issues.push(label+' unique case set is incomplete');
 if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0)issues.push(label+' actual start/duration missing');
 if(report?.stats?.skipped!==0||report?.stats?.flaky!==0)issues.push(label+' contains skipped/flaky cases');
 const projects=report?.config?.projects||[];
 if(projects.length!==1||projects.some(project=>project.retries!==0||project.repeatEach!==1)||report?.config?.metadata?.actualWorkers!==1)issues.push(label+' must be the actual single-worker, no-retry, single-project run');
 const args=[...(report?.config?.argv||[]),...projects.flatMap(project=>project.use?.launchOptions?.args||[])];
 if(args.some(value=>/swiftshader|llvmpipe|use-angle=software/i.test(String(value))))issues.push(label+' forced software rendering');
 for(const spec of specs){
  const test=spec.tests?.[0],result=test?.results?.[0],status=result?.status;
  if(spec.tests?.length!==1||test?.expectedStatus!=='passed'||test.results?.length!==1||result?.retry!==0||!Array.isArray(result?.errors))issues.push(label+' missing one unmodified expected-pass execution '+spec.id);
  if(!Number.isFinite(milliseconds(result?.startTime))||!Number.isFinite(result?.duration)||result.duration<0||milliseconds(result.startTime)<start-1000||milliseconds(result.startTime)+result.duration>end+1000)issues.push(label+' case timestamps outside the actual run '+spec.id);
  const record={id:spec.id,file:spec.file,title:spec.title,line:spec.line,status,projectId:test?.projectId};
  if(status==='passed'){
   if(spec.ok!==true||test.status!=='expected'||result.errors.length)issues.push(label+' inconsistent passing execution '+spec.id);passed.push(record);
  }else if(allowFailures&&['failed','timedOut'].includes(status)){
   if(spec.ok!==false||test.status!=='unexpected'||!result.errors.length)issues.push(label+' initial failure evidence incomplete '+spec.id);
   failed.push({...record,errorMessages:result.errors.map(error=>error.message||error.value||String(error))});
  }else issues.push(label+' unexpected/interrupted/non-pass result '+spec.id);
 }
 if(report?.stats?.expected!==passed.length||report?.stats?.unexpected!==failed.length||passed.length+failed.length!==specs.length)issues.push(label+' raw statistics disagree with its actual executions');
 return{issues,specs,passed,failed,start,end,duration};
}

export function nativeBrowserReportPairV013(full,retest,{expectedCases=53}={}){
 const first=inspectReport(full,'whole original suite',{expectedCases,allowFailures:true}),issues=[...first.issues];
 if((full?.config?.argv||[]).some(argument=>/^--(?:grep(?:-invert)?|last-failed|test-list|shard|list)(?:=|$)|^-g$/.test(String(argument))))issues.push('The original whole-suite report was a filtered run');
 if(!first.failed.length)return{issues,first,again:null,mode:'clean-full',details:{mode:'clean-full',originalUniqueCases:first.specs.length,initialStats:full?.stats,initialPassed:first.passed.length,initialFailures:[],retestStats:null,retestCases:[],finalUniqueCases:first.passed.length,executions:first.specs.length,wholeFirstRunAllPassed:!issues.length,scope:'This fresh complete 53-case raw run passes on its own application-source freeze. Historical retest files are neither read nor counted; older failed attempts belong to their separately archived source versions.'}};
 const again=inspectReport(retest,'targeted retest',{expectedCases:first.failed.length,allowFailures:false});issues.push(...again.issues);
 if(first.failed.length!==REVIEWED_TEST_CORRECTIONS_V013.length||first.failed.some(spec=>!reviewedCorrectionV013(spec)))issues.push('Initial failures are not exactly the two explicitly reviewed test-only assumptions');
 const failedIds=new Set(first.failed.map(spec=>spec.id)),retestedIds=new Set(again.passed.map(spec=>spec.id));
 if(failedIds.size!==retestedIds.size||[...failedIds].some(id=>!retestedIds.has(id))||again.specs.some(spec=>!failedIds.has(spec.id)))issues.push('Targeted retest must contain exactly the original failed spec IDs, each once');
 for(const spec of again.passed){const original=first.failed.find(item=>item.id===spec.id);if(!original||fileName(original.file)!==fileName(spec.file)||original.title!==spec.title||original.projectId!==spec.projectId)issues.push('Retest changed the original spec identity '+spec.id);}
 if(!(again.start>=first.end))issues.push('Targeted retest did not start after the entire original suite finished');
 return{issues,first,again,mode:'failed-id-retest',details:{mode:'failed-id-retest',originalUniqueCases:first.specs.length,initialStats:full?.stats,initialPassed:first.passed.length,initialFailures:first.failed,retestStats:retest?.stats,retestCases:again.passed,finalUniqueCases:first.passed.length+again.passed.length,executions:first.specs.length+again.specs.length,wholeFirstRunAllPassed:false,scope:'The original full 53-case raw report is retained, including its failures. Exactly those failed spec IDs have a separate successful execution after test-only corrections; this is not a fabricated clean first run.'}};
}

export function nativeBrowserSourceIssuesV013(proof,{root='.',full,retest,freeze,paths=NATIVE_BROWSER_PATHS_V013,expectedCases=53,requirePass=true}={}){
 const file=path=>resolve(root,path),hash=path=>createHash('sha256').update(readFileSync(file(path))).digest('hex'),issues=[],pair=nativeBrowserReportPairV013(full,retest,{expectedCases});issues.push(...pair.issues);
 if(proof?.schemaVersion!==1)return{issues:[...issues,'browser source evidence schema v1 missing'],pair};
 if(proof.mode!==pair.mode)issues.push('Browser source receipt does not match the actual clean/full-or-retest mode');
 if(requirePass&&proof.pass!==true)issues.push('browser source evidence is not passing');
 if(freeze?.version!=='0.13.0'||freeze.pass!==true||!Array.isArray(freeze.changedSources)||freeze.changedSources.length)issues.push('actual pre-browser source freeze missing/failed');
 const current=hashPerformanceSources(root),keys=new Set([...Object.keys(current),...Object.keys(freeze?.sourceHashes||{}),...Object.keys(proof.sourceHashes||{})]);
 if(!Object.keys(proof.sourceHashes||{}).length||[...keys].some(path=>!shaPattern.test(proof.sourceHashes?.[path]||'')||current[path]!==freeze?.sourceHashes?.[path]||current[path]!==proof.sourceHashes?.[path]))issues.push('Runtime/public/server/package source changed across the original suite and retest');
 if(!Array.isArray(proof.changedSources)||proof.changedSources.length)issues.push('browser source changes were not empty');
 const recorded=milliseconds(proof.recordedAt),frozen=milliseconds(proof.sourceFreeze?.recordedAt),actualFreezeTime=statSync(file(paths.freeze)).mtimeMs;
 if(resolve(root,proof.sourceFreeze?.path||'')!==file(paths.freeze)||proof.sourceFreeze?.sha256!==hash(paths.freeze)||!nearTime(frozen,actualFreezeTime)||!(frozen<=pair.first.start)||!Number.isFinite(recorded)||recorded<(pair.again||pair.first).end||recorded>Date.now()+5000)issues.push('Browser run timestamps do not bind the actual pre-run freeze and post-run source check');
 if(pair.mode==='clean-full'&&proof.runs?.retest!==null)issues.push('Clean full-suite evidence must not rely on a historical retest');
 for(const [kind,report,info]of [['full',full,pair.first],...(pair.again?[['retest',retest,pair.again]]:[])]){
  const receipt=proof.runs?.[kind],expectedPath=paths[kind];
  if(resolve(root,receipt?.path||'')!==file(expectedPath)||receipt?.sha256!==hash(expectedPath)||receipt.startTime!==report.stats.startTime||receipt.durationMs!==report.stats.duration||!nearTime(milliseconds(receipt.endTime),info.end)||recorded<statSync(file(expectedPath)).mtimeMs-1)issues.push('Actual raw browser report SHA/timestamps missing '+kind);
  if(receipt?.rendererMode!=='native'||receipt?.environment?.FORM_TEST_RENDERER!=='native'||!Array.isArray(receipt.launchArgs)||receipt.launchArgs.some(argument=>/swiftshader|llvmpipe|software/i.test(argument)))issues.push('Declared actual native invocation missing '+kind);
  if(process.platform==='win32'&&!same(receipt?.launchArgs,['--use-gl=angle','--use-angle=d3d11']))issues.push('Actual Windows native D3D11 invocation missing '+kind);
  const reporter=report.config?.reporter?.find(item=>item[0]==='json')?.[1];if(resolve(root,reporter?.outputFile||'')!==file(expectedPath))issues.push('raw JSON reporter output path does not match '+kind);
 }
 const config=proof.runnerConfig;
 if(!config||resolve(root,config.path||'')!==file('playwright.config.js')||config.sha256!==hash('playwright.config.js')||!nearTime(milliseconds(config.recordedAt),statSync(file('playwright.config.js')).mtimeMs)||milliseconds(config.recordedAt)>pair.first.start)issues.push('Native runner configuration changed or lacks its pre-run file witness');
 const corrections=proof.testCorrections||[];
 if(!Array.isArray(proof.testCorrections)||corrections.length!==pair.first.failed.length||new Set(corrections.map(item=>item.specId)).size!==corrections.length)issues.push('Exact reviewed test-only correction list missing');
 for(const failed of pair.first.failed){
  const approved=reviewedCorrectionV013(failed),correction=corrections.find(item=>item.specId===failed.id);
  if(!approved||!correction||correction.file!==approved.file||correction.title!==approved.title||correction.reasonCode!==approved.reasonCode||correction.afterSha256!==hash(approved.file))issues.push('Unreviewed or stale test-only correction '+failed.id);
  if(approved){const text=readFileSync(file(approved.file),'utf8');if(approved.reasonCode==='direct-muscle-legend-children'&&!text.includes('.muscle-legend > span')||approved.reasonCode==='await-equipment-reentry'&&(!text.includes('advanceUntilIdle(180,false)')||!text.includes('state.pendingEquipment')||!text.includes('advanceUntilReady(180,false)')))issues.push('Reviewed test-only correction not present '+failed.id);}
 }
 for(const [path,value]of Object.entries(proof.validatorSourceHashes||{}))if(!existsSync(file(path))||hash(path)!==value)issues.push('browser source validator changed '+path);
 if(!proof.validatorSourceHashes?.['scripts/qualify-browser-source-v013.mjs']||!proof.validatorSourceHashes?.['scripts/native-browser-evidence-v013.mjs'])issues.push('browser source producer/validator SHA missing');
 return{issues,pair};
}

export function nativeBrowserEvidenceV013({root='.',paths=NATIVE_BROWSER_PATHS_V013,expectedCases=53}={}){
 const file=path=>resolve(root,path),hash=path=>createHash('sha256').update(readFileSync(file(path))).digest('hex'),read=path=>JSON.parse(readFileSync(file(path),'utf8').replace(/^\uFEFF/,'')),missing=['full','source','freeze'].filter(key=>typeof paths[key]!=='string'||!paths[key]||!existsSync(file(paths[key]))).map(key=>paths[key]||key+' path');
 if(missing.length)return{file:paths.full,status:'missing',issues:missing.map(path=>'missing '+path),details:{expected:expectedCases,scope:'Waiting for the actual complete report, its pre-run freeze and post-run source receipt. Failed complete runs additionally require the exact failed-ID retest.'}};
 try{
  const full=read(paths.full),mode=nativeBrowserReportPairV013(full,null,{expectedCases}).mode;
  if(mode==='failed-id-retest'&&(typeof paths.retest!=='string'||!existsSync(file(paths.retest))))return{file:paths.full,status:'missing',issues:['missing '+(paths.retest||'retest path')],details:{initialStats:full.stats,scope:'The original failures remain; their actual exact-ID retest has not been produced.'}};
  const retest=mode==='failed-id-retest'?read(paths.retest):null,proof=read(paths.source),freeze=read(paths.freeze),result=nativeBrowserSourceIssuesV013(proof,{root,full,retest,freeze,paths,expectedCases}),dependencies=Object.fromEntries([paths.full,paths.source,paths.freeze,...(retest?[paths.retest]:[]),'playwright.config.js',...(proof.testCorrections||[]).map(item=>item.file)].map(path=>[path,hash(path)]));
  return{file:paths.full,sha256:hash(paths.full),status:result.issues.length?'failed':Number.isInteger(expectedCases)?'passed':'pending',issues:result.issues,dependencies,details:{...result.pair.details,sourceEvidence:paths.source,sourceCheckRecordedAt:proof.recordedAt,testOnlyCorrections:proof.testCorrections,rendererScope:'Native launch metadata is declared by the root from the known actual invocations and current runner config; actual GPU identity is independently qualified by the formal benchmark.'}};
 }catch(error){return{file:paths.full,status:'failed',issues:[error.message]};}
}
