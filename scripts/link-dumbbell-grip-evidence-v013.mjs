import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dumbbellFingerEvidenceIssuesV013} from './validate-dumbbell-finger-evidence-v013.mjs';

// Aggregate receipts only. This does not run, repair, or bless any sample.
// Each actual run must already pass its full raw/source validation.
const path='artifacts/dumbbell-fingers-v013/qualification.json',proof=JSON.parse(readFileSync(path,'utf8')),hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const ownIssues=dumbbellFingerEvidenceIssuesV013(proof,{withBenches:false});
if(ownIssues.length)throw Error(ownIssues.join('\n'));
proof.additionalBenchReports=[30,45].map(angle=>{
 const path=`artifacts/dumbbell-fingers-v013/qualification-bench${angle}.json`,report=JSON.parse(readFileSync(path,'utf8')),issues=dumbbellFingerEvidenceIssuesV013(report,{angle,ids:['dumbbell-bench-press'],withBenches:false});
 if(issues.length)throw Error(issues.join('\n'));
 return{path,sha256:hash(path)};
});
const issues=dumbbellFingerEvidenceIssuesV013(proof);if(issues.length)throw Error(issues.join('\n'));
writeFileSync(path,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({linked:path,additional:proof.additionalBenchReports,issues:[]}));
