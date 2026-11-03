import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogActivities} from '../src/activity-catalog.js';
import {REVIEW_SOURCE_VERSION,createReviewPackage,importReviewPackage,reviewHTML,reviewCSV} from '../src/motion-review-data-v015.js';
import {hashMobileSources,changedHashes} from './mobile-performance-common-v016.mjs';

const input='artifacts/mocap-v018/browser-final/report.json',report=JSON.parse(readFileSync(input)),directory='artifacts/coach-review-v018/ready-pack',catalog=catalogActivities.filter(item=>item.runtime!=='facility'||item.classKind);
if(!report.pass||report.images.length!==162||changedHashes(report.sourceHashes,hashMobileSources()).length)throw Error('A complete source-stable native capture report is required.');
mkdirSync(directory,{recursive:true});
const ids=[...new Set(report.images.map(image=>image.id))],packs=[],sha=value=>createHash('sha256').update(value).digest('hex');
for(let start=0;start<ids.length;start+=9){
 const selected=ids.slice(start,start+9),images=report.images.filter(image=>selected.includes(image.id)),evidence=images.map(item=>{const png=readFileSync(item.path);if(sha(png)!==item.sha256)throw Error('Capture bytes changed: '+item.path);return{id:item.id,direction:item.direction,view:item.view,phase:item.phase,capturedAt:statSync(item.path).mtime.toISOString(),sourceVersion:REVIEW_SOURCE_VERSION,image:'data:image/png;base64,'+png.toString('base64'),contact:item.contact};});
 const payload=createReviewPackage({catalog,records:[],evidence}),json=JSON.stringify(payload,null,2);
 if(Buffer.byteLength(json)>16*1024*1024||payload.professionalSignoff!==false||payload.checklist.some(item=>item.status!=='pending'))throw Error('Invalid pending review package.');
 const imported=importReviewPackage(json,catalog);if(imported.evidence.length!==images.length||imported.records.length)throw Error('Actual evidence did not survive import.');
 const stem=`review-${packs.length+1}`,files={};for(const [extension,content]of [['json',json],['html',reviewHTML(payload,catalog)],['csv',reviewCSV(payload,catalog)]]){const path=`${directory}/${stem}.${extension}`;writeFileSync(path,content);files[extension]={path,sha256:sha(content),bytes:Buffer.byteLength(content)};}
 packs.push({ids:selected,evidence:images.length,pending:payload.checklist.length,files});
}
const result={pass:true,sourceVersion:REVIEW_SOURCE_VERSION,createdAt:new Date().toISOString(),captureReport:input,captureReportSHA256:sha(readFileSync(input)),actualImages:report.images.length,uniqueImageHashes:new Set(report.images.map(image=>image.sha256)).size,packs,professionalSignoff:false,records:0,scope:'Actual source-stable native GPU stills, 18 activities x 3 lifecycle stages x 3 views. Each pack contains the full 65-item pending checklist and 81 images, below the import limit. No reviewer, opinion or approval is invented. Stills do not constitute continuous-motion or trainer review.'};
writeFileSync(directory+'/assembly.json',JSON.stringify(result,null,2));console.log(JSON.stringify({pass:true,packs:packs.length,images:result.actualImages,pending:catalog.length}));
