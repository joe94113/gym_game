import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {resolve,relative,extname,sep} from 'node:path';
import {networkInterfaces} from 'node:os';

// LAN preview serves only the static Pages build. The development account API
// and workspace files are never mounted on this listener.
const workspace=resolve('.'),output=resolve('.local-tools/mobile-v016-preview');
if(relative(workspace,output).startsWith('..')||!output.startsWith(workspace+sep))throw Error('Preview output must be inside the workspace.');
const port=Number(process.env.FORM_MOBILE_PORT||5175);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port.');
if(!process.argv.includes('--no-build')){
  const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','pages','--outDir',output],{stdio:'inherit',env:{...process.env,VITE_ACCOUNT_MODE:'local',VITE_BASE_PATH:'/',VITE_SITE_URL:''}});
  if(result.status!==0)process.exit(result.status??1);
}
if(!existsSync(resolve(output,'index.html')))throw Error('Build missing. Run npm run preview:mobile first.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const fail=code=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(code===404?'Not found':'Bad request');};
  if(!['GET','HEAD'].includes(req.method))return fail(405);
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://preview.local').pathname);}catch{return fail(400);}
  if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(part=>part.startsWith('.'))||pathname==='/api'||pathname.startsWith('/api/'))return fail(404);
  let file=resolve(output,'.'+pathname),within=relative(output,file);
  if(within.startsWith('..')||within.startsWith(sep))return fail(404);
  if(existsSync(file)&&statSync(file).isDirectory())file=resolve(file,'index.html');
  if(!existsSync(file)||!statSync(file).isFile())return fail(404);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':statSync(file).size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')return res.end();
  createReadStream(file).on('error',()=>res.destroy()).pipe(res);
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'0.0.0.0',()=>{
  console.log(`Mobile static preview: http://127.0.0.1:${port}/`);
  for(const entries of Object.values(networkInterfaces()))for(const item of entries||[])if(item.family==='IPv4'&&!item.internal)console.log(`Same LAN: http://${item.address}:${port}/`);
  console.log('Pages local storage mode; no account API. Ctrl+C stops this preview.');
});
