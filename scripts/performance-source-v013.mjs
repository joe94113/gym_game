import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export function hashPerformanceSources(root=''){
 const files=[];
 const collect=(directory,filter)=>{if(!existsSync(join(root,directory)))return;for(const entry of readdirSync(join(root,directory),{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())collect(path,filter);else if(entry.isFile()&&filter(path))files.push(path);}};
 collect('src',path=>/\.(?:js|css|svg)$/.test(path));collect('server',path=>/\.(?:js|mjs|cjs)$/.test(path));collect('public',()=>true);
 for(const path of ['package.json','package-lock.json','vite.config.js','index.html'])if(existsSync(join(root,path)))files.push(path);
 return Object.fromEntries(files.sort().map(path=>[path,createHash('sha256').update(readFileSync(join(root,path))).digest('hex')]));
}
