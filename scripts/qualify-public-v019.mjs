import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Read-only HTTP qualification. This does not create a WebGL context or prove playability.
const options=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const base=new URL(options.base||'https://joe94113.github.io/gym_game/');
if(!['http:','https:'].includes(base.protocol)||base.search||base.hash)throw new Error('--base must be an HTTP(S) directory URL without a query or fragment');
if(!base.pathname.endsWith('/'))base.pathname+='/';
const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
const canonical=options.canonical?new URL(options.canonical):local?null:base;
if(canonical&&!canonical.pathname.endsWith('/'))canonical.pathname+='/';
const name=(options.name||`${new Date().toISOString().replace(/[:.]/g,'-')}-${base.hostname}`).replace(/[^\w.-]/g,'_');
const out=resolve(options.out||'artifacts/public-v019',name);
const report={schemaVersion:1,startedAt:new Date().toISOString(),base:base.href,canonicalBase:canonical?.href||null,scope:'Read-only HTTP, generated HTML, metadata and asset delivery. No browser/WebGL/audio playback, real-phone, trainer or continuous-animation acceptance is claimed.',checks:[],responses:[],errors:[],github:null};
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const check=(name,pass,details)=>{report.checks.push({name,pass:!!pass,...(details===undefined?{}:{details})});if(!pass)report.errors.push(name);};
const seen=new Map();
async function request(path,{method='GET',required=true}={}){
  const url=path instanceof URL?path:new URL(path,base),key=`${method} ${url.href}`;
  if(seen.has(key))return seen.get(key);
  const promise=(async()=>{try{const response=await fetch(url,{method,redirect:'follow',signal:AbortSignal.timeout(45000),headers:{'User-Agent':'MuscleBase-public-qualification/0.19','Accept':'*/*'}}),buffer=method==='HEAD'?Buffer.alloc(0):Buffer.from(await response.arrayBuffer());
    const item={method,url:url.href,finalURL:response.url,status:response.status,contentType:response.headers.get('content-type'),contentLength:response.headers.get('content-length'),bytes:buffer.length,etag:response.headers.get('etag'),...(method==='GET'?{sha256:hash(buffer)}:{})};report.responses.push(item);
    if(required)check(`HTTP ${method} ${url.pathname}${url.search}`,response.ok,item.status);
    return {item,buffer,text:buffer.toString('utf8'),ok:response.ok};
  }catch(error){const item={method,url:url.href,error:String(error)};report.responses.push(item);if(required)check(`HTTP ${method} ${url.pathname}`,false,item.error);return {item,buffer:Buffer.alloc(0),text:'',ok:false};}})();
  seen.set(key,promise);return promise;
}
async function parallel(items,fn,concurrency=6){let next=0;await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length)await fn(items[next++]);}));}
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(match=>[match[1].toLowerCase(),match[3]]));
const tags=(html,name)=>[...html.matchAll(new RegExp(`<${name}\\b[^>]*>`,'gi'))].map(match=>attrs(match[0]));
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
const paths=['','about/','guide/','guide/dumbbells/','guide/cables/','guide/machines/','guide/cardio/','guide/stretching/','guide/classes/'];
const htmlPages=new Map(),assetURLs=new Set(),titles=new Set(),exerciseLinks=new Map();
await mkdir(out,{recursive:true});
for(const path of paths){
  const response=await request(path);if(!response.ok)continue;const html=response.text,url=new URL(path,base),title=html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'';htmlPages.set(path,html);
  check(`HTML MIME ${path||'home'}`,/text\/html/i.test(response.item.contentType||''));
  check(`Unique title ${path||'home'}`,title.length>4&&!titles.has(title));titles.add(title);
  check(`One h1 ${path||'home'}`,(html.match(/<h1\b/gi)||[]).length===1);
  check(`Traditional Chinese lang ${path||'home'}`,/<html\b[^>]*lang=["']zh-Hant-TW["']/i.test(html));
  const metas=tags(html,'meta'),links=tags(html,'link');
  check(`Description ${path||'home'}`,!!metas.find(x=>x.name==='description'&&x.content?.length>20));
  check(`Viewport ${path||'home'}`,!!metas.find(x=>x.name==='viewport'&&x.content?.includes('width=device-width')));
  const canonicalLink=links.find(x=>x.rel==='canonical')?.href;
  if(canonical)check(`Canonical ${path||'home'}`,canonicalLink===new URL(path,canonical).href,{actual:canonicalLink,expected:new URL(path,canonical).href});
  if(!local)check(`Indexable ${path||'home'}`,!metas.some(x=>x.name==='robots'&&/noindex/i.test(x.content||'')));
  for(const property of ['og:title','og:description','og:image','og:url'])check(`${property} ${path||'home'}`,!!metas.find(x=>x.property===property&&x.content));
  for(const meta of metas.filter(x=>x.property==='og:image')){const asset=new URL(decode(meta.content),url);if(asset.origin===base.origin&&asset.pathname.startsWith(base.pathname))assetURLs.add(asset.href);}
  for(const schema of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const data=JSON.parse(schema[1]);check(`JSON-LD parses ${path||'home'}`,data['@context']==='https://schema.org');check(`No invented review/medical schema ${path||'home'}`,!/(aggregateRating|reviewRating|MedicalWebPage)/.test(schema[1]));}catch(error){check(`JSON-LD parses ${path||'home'}`,false,String(error));}
  }
  for(const tag of [...tags(html,'link'),...tags(html,'script'),...tags(html,'img'),...tags(html,'a')]){
    const value=tag.src||tag.href;if(!value||value.startsWith('#')||/^(mailto:|tel:|data:|javascript:)/i.test(value))continue;
    const asset=new URL(decode(value),url);if(asset.origin!==base.origin)continue;
    check(`Project prefix ${path||'home'} → ${asset.pathname}`,asset.pathname.startsWith(base.pathname));
    if(asset.searchParams.has('exercise'))exerciseLinks.set(asset.searchParams.get('exercise'),asset.href);
    if(tag.src||tag.rel?.split(/\s+/).some(rel=>['stylesheet','icon','apple-touch-icon','manifest','modulepreload'].includes(rel)))assetURLs.add(asset.href);
  }
}
check('Nine static pages delivered',htmlPages.size===9,htmlPages.size);
check('All 65 exercise/course deep links present',exerciseLinks.size===65,{count:exerciseLinks.size,ids:[...exerciseLinks.keys()]});
for(const id of ['dumbbell-curl','dumbbell-lateral-raise','class-dance']){const link=exerciseLinks.get(id);check(`Guide links ${id}`,!!link);if(link)await request(new URL(link));}
const main=htmlPages.get('')||'';
check('Production module entry exists',tags(main,'script').some(tag=>tag.type==='module'&&tag.src));
check('No Vite client in page',!/@vite\/client|localhost:5173|127\.0\.0\.1:5173/.test(main));

const manifestResponse=await request('site.webmanifest');let manifest;
try{manifest=JSON.parse(manifestResponse.text);check('Manifest Chinese identity',manifest.name?.includes('肌動基地')&&manifest.lang==='zh-Hant-TW');
  check('Manifest scope/start stay in project',new URL(manifest.scope,base).href===base.href&&new URL(manifest.start_url,base).href===base.href);
  check('Install icons include any and maskable 192/512',['192x192','512x512'].every(size=>manifest.icons?.some(icon=>icon.sizes===size&&icon.purpose==='any')&&manifest.icons?.some(icon=>icon.sizes===size&&icon.purpose==='maskable')));
  for(const icon of manifest.icons||[])assetURLs.add(new URL(icon.src,base).href);
}catch(error){check('Manifest valid JSON',false,String(error));}
await parallel([...assetURLs],async value=>{const response=await request(new URL(value));if(!response.ok)return;const url=new URL(value);
  if(/\.png$/i.test(url.pathname)){const png=response.buffer;check(`PNG signature ${url.pathname}`,png.length>=24&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));const declared=manifest?.icons?.find(icon=>new URL(icon.src,base).href===value);if(declared&&/^\d+x\d+$/.test(declared.sizes))check(`PNG dimensions ${url.pathname}`,`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`===declared.sizes);}
});
const jsPending=[...assetURLs].filter(value=>/\.m?js(?:\?|$)/.test(value)),jsSeen=new Set();let bundleText='';
while(jsPending.length){const value=jsPending.shift();if(jsSeen.has(value))continue;jsSeen.add(value);const response=await request(new URL(value));if(!response.ok)continue;bundleText+='\n'+response.text;check(`JavaScript MIME ${new URL(value).pathname}`,/javascript|ecmascript/i.test(response.item.contentType||''));
  for(const match of response.text.matchAll(/["'`]((?:\.\.?\/|\/)[^"'`\s]+\.m?js)["'`]/g)){const next=new URL(match[1],value);if(next.origin===base.origin){check(`Chunk project prefix ${next.pathname}`,next.pathname.startsWith(base.pathname));jsPending.push(next.href);}}
}
check('Production JS was inspected',jsSeen.size>0,jsSeen.size);
check('No development bridge in shipped JS',!/__FORM__|@vite\/client|__VITE|D:[\\/]gym_game/.test(bundleText));
check('Local Pages bundle has no account API routes',!/(\/api\/form\/v1|["'`]\/api(?:\/|["'`]))/.test(bundleText));
if(options['expected-version']){
  report.expectedVersion=options['expected-version'];
  check('Delivered release version matches',bundleText.includes(report.expectedVersion),report.expectedVersion);
  if(report.expectedVersion==='0.19.0'){
    check('Delivered release includes catch-up and NPC matrix fixes',bundleText.includes('deferAmbient')&&bundleText.includes('getWorldMatrixCacheDiagnostics'));
    check('Delivered release includes physical trainer actors',bundleText.includes('floor-coach-'));
  }
  if(report.expectedVersion==='0.20.0'){
    check('Delivered release includes dated public teaching metadata',bundleText.includes('公開教學對照')&&bundleText.includes('2026-11-03')&&bundleText.includes('corrected-checked'));
    const panels=[...htmlPages.values()].flatMap(html=>[...html.matchAll(/data-teaching-reference="([^"]+)"/g)].map(match=>match[1]));
    check('All 65 source panels delivered once in static guides',panels.length===65&&new Set(panels).size===65,{panels:panels.length,unique:new Set(panels).size});
    check('Guide preserves unresolved mechanism gaps',htmlPages.get('guide/machines/')?.includes('動畫待修')&&htmlPages.get('guide/cardio/')?.includes('固定扶手'));
  }
}
const robots=await request('robots.txt'),sitemap=await request('sitemap.xml');
if(canonical){check('Robots publishes canonical sitemap',robots.text.includes(new URL('sitemap.xml',canonical).href)&&!/^Disallow:\s*\/\s*$/m.test(robots.text));
  const locations=[...sitemap.text.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>decode(x[1]));check('Sitemap lists exactly nine public pages',locations.length===9&&new Set(locations).size===9&&paths.every(path=>locations.includes(new URL(path,canonical).href)),locations);
}else check('Local robots has explicit crawl policy',/User-agent:/i.test(robots.text));

for(const path of ['models/athlete/athlete.glb','models/athlete/lod-v010/indices.bin','images/coaches/coach-roster-atlas.png']){const response=await request(path,{method:'HEAD'});check(`Nonempty model/image asset ${path}`,response.ok&&Number(response.item.contentLength)>0,response.item.contentLength);}
for(const path of ['models/athlete/rig.json','models/athlete/credits.json','models/athlete/lod-v010/manifest.json']){const response=await request(path);try{JSON.parse(response.text);check(`Model JSON ${path}`,true);}catch(error){check(`Model JSON ${path}`,false,String(error));}}
for(const path of ['cmu-v013.json','cmu-exercise-v015.json','cmu-squat-v015.json','cmu-fullbody-v017.json','cmu-transitions-v018.json','same-limb-v018.json','ui-prmd-v018.json','uci-curl-v018.json']){const response=await request(`motions/${path}`);try{const data=JSON.parse(response.text);check(`Source manifest ${path}`,typeof data==='object'&&data!==null);}catch(error){check(`Source manifest ${path}`,false,String(error));}}
for(const path of ['motions/ui-prmd-v018-ATTRIBUTION.txt','motions/same-limb-v018-LICENSE.txt'])await request(path);
const audio=await request('audio/course-voice/manifest.json');
try{const data=JSON.parse(audio.text),phrases=Array.isArray(data.phrases)?data.phrases:Object.values(data.phrases||{});check('Recorded course cue manifest has phrases',phrases.length>=100,phrases.length);await parallel(phrases,async phrase=>{const file=typeof phrase==='string'?phrase:phrase.file;check('Cue has a safe relative WAV path',typeof file==='string'&&!file.includes('..')&&/\.wav$/i.test(file),file);if(file)await request(new URL(file,new URL('audio/course-voice/',base)),{method:'HEAD'});});}catch(error){check('Audio manifest parses',false,String(error));}
if(base.hostname==='joe94113.github.io'){
  const response=await request(new URL('https://api.github.com/repos/joe94113/gym_game/actions/runs?per_page=5'),{required:false});
  if(response.ok)try{const data=JSON.parse(response.text);report.github=(data.workflow_runs||[]).map(run=>({id:run.id,name:run.name,status:run.status,conclusion:run.conclusion,headSHA:run.head_sha,createdAt:run.created_at,url:run.html_url}));}catch(error){report.github={error:String(error)};}
}
report.finishedAt=new Date().toISOString();report.passed=report.errors.length===0;report.deepLinks=[...exerciseLinks].map(([id,url])=>({id,url}));report.javascriptFiles=[...jsSeen];report.counts={checks:report.checks.length,failed:report.errors.length,responses:report.responses.length,staticPages:htmlPages.size,exerciseLinks:exerciseLinks.size};
await writeFile(resolve(out,'qualification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,base:base.href,report:resolve(out,'qualification.json'),...report.counts,failedChecks:report.errors},null,2));
if(!report.passed)process.exitCode=1;
