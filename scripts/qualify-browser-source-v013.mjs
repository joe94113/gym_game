// Run after the fresh complete report finishes. A failed full report also
// needs its actual exact-ID retest; a clean full report ignores old retests.
// This does not launch a browser, alter either report, or invent clean stats.
import {readFileSync,writeFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {hashPerformanceSources} from './performance-source-v013.mjs';
import {NATIVE_BROWSER_PATHS_V013,browserSpecsV013,reviewedCorrectionV013,nativeBrowserReportPairV013,nativeBrowserSourceIssuesV013} from './native-browser-evidence-v013.mjs';

if(process.env.FORM_TEST_RENDERER!=='native')throw Error('Run the source receipt under FORM_TEST_RENDERER=native, matching the actual root invocations.');
const root=process.cwd(),paths=NATIVE_BROWSER_PATHS_V013,hash=path=>createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex'),read=path=>JSON.parse(readFileSync(resolve(root,path),'utf8').replace(/^\uFEFF/,'')),missing=[paths.full,paths.freeze].filter(path=>!existsSync(path));
if(missing.length){console.log(JSON.stringify({pass:false,status:'missing',missing,sourceReceiptWritten:false}));process.exitCode=2;}
else{
 const full=read(paths.full),mode=nativeBrowserReportPairV013(full,null,{expectedCases:53}).mode;
 if(mode==='failed-id-retest'&&!existsSync(paths.retest)){console.log(JSON.stringify({pass:false,status:'missing',missing:[paths.retest],sourceReceiptWritten:false}));process.exitCode=2;}
 else{
 const config=(await import(pathToFileURL(resolve('playwright.config.js')).href)).default,launchArgs=config.use?.launchOptions?.args;
 if(!Array.isArray(launchArgs)||launchArgs.some(argument=>/swiftshader|llvmpipe|software/i.test(argument)))throw Error('Current native runner configuration is unavailable or forces software rendering.');
 const retest=mode==='failed-id-retest'?read(paths.retest):null,freeze=read(paths.freeze),sourceHashes=hashPerformanceSources(root),keys=new Set([...Object.keys(freeze.sourceHashes||{}),...Object.keys(sourceHashes)]),changedSources=[...keys].filter(path=>sourceHashes[path]!==freeze.sourceHashes?.[path]);
 const failed=mode==='clean-full'?[]:browserSpecsV013(full).filter(spec=>spec.tests?.some(test=>test.status!=='expected'||test.results?.some(result=>result.status!=='passed'))),testCorrections=failed.map(spec=>{const reviewed=reviewedCorrectionV013(spec),file=reviewed?.file||`tests/${String(spec.file).replaceAll('\\','/').split('/').at(-1)}`;return{file,title:spec.title,specId:spec.id,reasonCode:reviewed?.reasonCode||'unreviewed-failure',reason:reviewed?.reason||'No root review authorizes this failure.',afterSha256:existsSync(file)?hash(file):null};});
 const run=(report,path)=>({path,sha256:hash(path),startTime:report.stats.startTime,durationMs:report.stats.duration,endTime:new Date(Date.parse(report.stats.startTime)+report.stats.duration).toISOString(),rendererMode:'native',environment:{FORM_TEST_RENDERER:'native'},launchArgs:[...launchArgs]});
 const validatorPaths=['scripts/qualify-browser-source-v013.mjs','scripts/native-browser-evidence-v013.mjs','scripts/performance-source-v013.mjs'];
 const proof={schemaVersion:1,mode,pass:false,recordedAt:new Date().toISOString(),sourceFreeze:{path:paths.freeze,sha256:hash(paths.freeze),recordedAt:statSync(paths.freeze).mtime.toISOString()},sourceHashes,changedSources,runnerConfig:{path:'playwright.config.js',sha256:hash('playwright.config.js'),recordedAt:statSync('playwright.config.js').mtime.toISOString()},runs:{full:run(full,paths.full),retest:retest?run(retest,paths.retest):null},testCorrections,validatorSourceHashes:Object.fromEntries(validatorPaths.map(path=>[path,hash(path)])),scope:'The pre-run application source comes from the actual unit/build freeze and its file timestamp. A fresh shipped-source map is compared after the real complete browser run. Clean-full mode ignores historical retests entirely; failed-ID mode separately retains the original failures and requires their actual exact-ID retest on unchanged app sources. Native metadata is declared by the root from its known actual invocations and evaluated native runner config. Actual GPU identity is independently qualified by the formal benchmark. Original raw reports and error records are never rewritten.'};
 const result=nativeBrowserSourceIssuesV013(proof,{root,full,retest,freeze,paths,expectedCases:53,requirePass:false});proof.issues=result.issues;proof.pass=!result.issues.length;
 mkdirSync(dirname(paths.source),{recursive:true});writeFileSync(paths.source,JSON.stringify(proof,null,2));console.log(JSON.stringify({path:paths.source,mode,pass:proof.pass,initialStats:full.stats,retestStats:retest?.stats||null,uniqueCases:result.pair.details.finalUniqueCases,issues:proof.issues}));if(!proof.pass)process.exitCode=1;
 }
}
