import {readdirSync,readFileSync,writeFileSync,copyFileSync,existsSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const folder='artifacts/release-v019/',names={natural:'preparation-naturalness-qualification',grid:'preparation-contact-grid',rack:'squat-rack-lifecycle-qualification',summary:'preparation-naturalness-final-summary'};
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
for(const name of Object.values(names))for(const extension of ['json','txt']){
 const source=folder+name+'.'+extension,retained=folder+name+'-before-coalescing.'+extension;
 if(existsSync(source)&&!existsSync(retained))copyFileSync(source,retained);
}
function jsPaths(root){return readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?jsPaths(root+'/'+entry.name):/\.[cm]?js$/.test(entry.name)?[root+'/'+entry.name]:[]);}
const files=[...jsPaths('src'),'public/models/athlete/athlete.glb','public/models/athlete/rig.json','scripts/mocap-fixture-v017.mjs','scripts/check-preparation-contact-grid-v019.mjs','scripts/qualify-preparation-naturalness-v019.mjs','scripts/qualify-squat-rack-lifecycles.mjs','scripts/refresh-preparation-proofs-v019.mjs'].sort(),sourceHashes=Object.fromEntries(files.map(path=>[path,sha(path)])),startedAt=new Date().toISOString();
function run(script,log,env={}){
 return new Promise(resolve=>{
  const fd=openSync(folder+log+'.txt','w'),child=spawn(process.execPath,[script],{stdio:['ignore',fd,fd],env:{...process.env,...env}});
  child.once('error',error=>{closeSync(fd);resolve({script,code:-1,error:String(error)});});child.once('exit',(code,signal)=>{closeSync(fd);resolve({script,code,signal});});
 });
}
const runs=await Promise.all([
 run('scripts/qualify-preparation-naturalness-v019.mjs',names.natural),
 run('scripts/check-preparation-contact-grid-v019.mjs',names.grid),
 run('scripts/qualify-squat-rack-lifecycles.mjs',names.rack,{FORM_PHASE_COUNT:'201',FORM_REPORT_NAME:'release-v019/'+names.rack+'.json'}),
]);
const sourceHashesEnd=Object.fromEntries(files.map(path=>[path,sha(path)])),changedSources=files.filter(path=>sourceHashes[path]!==sourceHashesEnd[path]);
const read=key=>JSON.parse(readFileSync(folder+names[key]+'.json')),natural=read('natural'),grid=read('grid'),rack=read('rack');
grid.sourceHashes={...grid.sourceHashes,...sourceHashes};grid.sourceHashesEnd=sourceHashesEnd;grid.changedSources=[...new Set([...(grid.changedSources||[]),...changedSources])];grid.pass=grid.pass&&!grid.changedSources.length&&runs[1].code===0;writeFileSync(folder+names.grid+'.json',JSON.stringify(grid,null,2)+'\n');
const sourceChecks=[],changedSinceProof=[];
for(const [report,value,maps]of [['natural',natural,['hashes']],['grid',grid,['sourceHashes','sourceHashesEnd']],['rack',rack,['sourceHashes']]])for(const map of maps){
 const hashes=value[map]||{},changed=Object.entries(hashes).filter(([path,hash])=>!existsSync(path)||sha(path)!==hash).map(([path])=>path);sourceChecks.push({report,map,files:Object.keys(hashes).length,changedSinceProof:changed});changedSinceProof.push(...changed);
}
const sum=(rows,key)=>rows.reduce((total,row)=>total+(row[key]||0),0),max=(rows,key)=>Math.max(0,...rows.map(row=>row[key]||0)),cases=natural.rows.length,frames=sum(natural.rows,'frames'),gridFrames=sum(grid.rows,'frames'),rackFrames=sum(rack.results,'phases');
const previous=read('summary'),summary={...previous,pass:natural.pass&&grid.pass&&rack.pass&&runs.every(run=>run.code===0)&&!changedSinceProof.length&&!changedSources.length&&cases===13&&frames===6057&&gridFrames===6736&&rackFrames===1206,startedAt,refreshedAt:new Date().toISOString(),runs,changedSinceProof:[...new Set(changedSinceProof)],changedDuringRun:{natural:natural.changedSources||[],grid:grid.changedSources,rack:rack.changedSources||[]},sourceHashes:{...natural.hashes,...grid.sourceHashes,...rack.sourceHashes},sourceChecks,cases,frames,handVertices:sum(natural.rows,'handVertices'),footVertices:sum(natural.rows,'footVertices'),maxReach:max(natural.rows,'maxReach'),maxFootTargetError:max(natural.rows,'maxFootTargetError'),maxBoneError:max(natural.rows,'maxBoneError'),maxHandDifference:max(natural.rows,'maxHandDifference'),maxWeightDifference:max(natural.rows,'maxWeightDifference'),maxHandMetalDepth:max(natural.rows,'maxHandMetalDepth'),collisionFlags:natural.rows.reduce((total,row)=>total+row.collisions.length,0),liftWithoutClosedGrip:natural.rows.reduce((total,row)=>total+row.liftWithoutClosedGrip.length,0),maxGridLegSettle:max(grid.rows,'maxLegSettle'),gridFrames,rack:{pass:rack.pass,modes:rack.results.length,frames:rackFrames,maxHandDepth:max(rack.results,'maxHandDepth'),maxHeadDepth:max(rack.results,'maxHeadDepth'),maxTorsoDepth:max(rack.results,'maxTorsoDepth')},legacyFootRailBug:natural.rows.filter(row=>['leg-extension','leg-curl'].includes(row.id)).map(row=>({id:row.id,beforeMaxDepth:max(row.beforeFootCollisions,'depth'),afterCollisions:row.collisions.length})),sourceScope:'Final frozen v019 default natural preparation, after managed-background matrix cache and ambient substep pose coalescing. Actual foreground GLB lifecycle CPU qualifications below; separate NPC cache/coalescing receipts verify those background optimizations. The contact-grid receipt additionally binds every current src JS file as release context; it does not execute the complete world controller. No human coach approval, force/load simulation or continuous triangle collision claim.',historicalProofCopies:[...new Set([...(previous.historicalProofCopies||[]),...Object.values(names).map(name=>folder+name+'-before-coalescing.json')])]};
writeFileSync(folder+names.summary+'.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({pass:summary.pass,cases,frames,gridFrames,rackFrames,sourceFiles:Object.keys(summary.sourceHashes).length,changedSinceProof:summary.changedSinceProof,changedDuringRun:summary.changedDuringRun,runs},null,2));if(!summary.pass)process.exitCode=1;
