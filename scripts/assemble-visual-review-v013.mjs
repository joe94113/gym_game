import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>JSON.parse(readFileSync(path,'utf8')),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),issues=[],dependencies={},examined=new Set(),imageHashes={},findings=[];
const references=['artifacts/preparation-v013/visual/after-lift-review-link.json','artifacts/grip-v013/after/root-review.json','artifacts/release-v013/visual/root-observation.json','artifacts/release-v013/visual/aerial-agent-observation.json'];
for(const path of references){
 const proof=read(path);dependencies[path]=sha(path);if(proof.pass!==true)issues.push('review not accepted '+path);
 for(const [source,value]of Object.entries(proof.sourceHashes||{}))if(sha(source)!==value)issues.push('stale observation source '+source);
 for(const [source,value]of Object.entries(proof.dependencies||{})){dependencies[source]=sha(source);if(dependencies[source]!==value)issues.push('stale review dependency '+source);}
 for(const image of proof.examined||[]){examined.add(image);imageHashes[image]=sha(image);if(imageHashes[image]!==proof.imageHashes?.[image])issues.push('review image changed '+image);}
 findings.push({reference:path,scope:proof.scope,findings:proof.findings,limits:proof.limits});
}
const gearPath='artifacts/grip-v013/after/equipment-agent-observation.json',gear=read(gearPath);dependencies[gearPath]=sha(gearPath);if(!gear.method?.startsWith('Actual tools.view_image')||gear.records?.length!==8)issues.push('eight actual gear observations missing');
for(const record of gear.records||[]){examined.add(record.image);imageHashes[record.image]=sha(record.image);if(record.sha256!==imageHashes[record.image]||!record.findings||!record.occlusion)issues.push('gear observation changed/incomplete '+record.image);}
findings.push({reference:gearPath,scope:gear.method,findings:gear.records});
const capturePath='artifacts/release-v013/visual/capture.json',capture=read(capturePath),gripCapturePath='artifacts/grip-v013/after/capture.json',gripCapture=read(gripCapturePath);for(const path of [capturePath,gripCapturePath])dependencies[path]=sha(path);
if(capture.pass!==true||capture.changedSources.length||capture.images.length!==15||gripCapture.pass!==true||gripCapture.records.length!==16)issues.push('complete current native capture set missing');
for(const path of [...capture.images,...gripCapture.records.map(record=>record.path)])if(!examined.has(path))issues.push('actual visual observation missing '+path);
const freezePath='artifacts/release-v013/source-freeze.json',freeze=read(freezePath);dependencies[freezePath]=sha(freezePath);for(const [path,value]of Object.entries(freeze.sourceHashes))if(sha(path)!==value)issues.push('source freeze changed '+path);
const report={pass:!issues.length,professionalSignoff:false,sourceHashes:freeze.sourceHashes,dependencies,examined:[...examined],imageHashes,findings,issues,scope:'Actual native current UI, aerial body/cloth and entry/exit views,16 dumbbell hand macros, plus20 recaptured preparation sheets whose bytes exactly match the prior actually viewed sheets. Component observation files record each observer and explicit occlusion limits. The brand icon was also actually viewed.',limits:['AI screenshot observations and finite actual-GLB tests are separate evidence. They do not imply professional trainer review or continuous all-pose collision certification.','The preparation lift link explicitly retains prior observations through20 byte-identical fresh captures; no second view session is invented. Bike/hack velocity windows have separate dense numerical qualification.','Isolated images omit the surrounding crowd; aerial classroom images and the complete native suite cover the shared player/instructor/student scene.']};
writeFileSync('artifacts/release-v013/visual-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,images:examined.size,issues}));if(!report.pass)process.exitCode=1;
