import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createAccountApi} from './account-api.mjs';

const root=resolve('dist'),host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||5173),api=await createAccountApi();
const types={'.webmanifest':'application/manifest+json','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg'};
const server=createServer(async(req,res)=>{
 if(await api.handler(req,res))return;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try{
  const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname),file=resolve(root,`.${name==='/'?'/index.html':name}`);
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  let target=file;try{const entry=await stat(target);if(entry.isDirectory())target=resolve(target,'index.html');if(!(await stat(target)).isFile())throw Error();}catch{const notFound=await readFile(resolve(root,'404.html')).catch(()=>Buffer.from('找不到這一頁。'));res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:notFound);return;}
  const data=await readFile(target),headers={'Content-Type':types[extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':target.endsWith('index.html')?'no-cache':'public, max-age=3600','Accept-Ranges':'bytes'};
  const range=req.headers.range;if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});res.end();return;}const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),data.length-1):data.length-1;if(start>end||start>=data.length){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});res.end();return;}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(req.method==='HEAD'?undefined:data.subarray(start,end+1));return;}
  res.writeHead(200,{...headers,'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(500);res.end('網頁暫時無法載入。');}
});
server.listen(port,host,()=>console.log(`肌動基地: http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await api.flush();process.exit(0);}));
