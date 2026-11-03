import {resolve,dirname,posix} from 'node:path';

/** Vite exposes source files, so its development server must protect account files too. */
export function isPrivateAccountPath(requestUrl,{root=process.cwd(),dataFile=resolve('server/data/accounts.json')}={}){
 let path;try{path=posix.normalize(decodeURIComponent(String(requestUrl).split('?')[0]).replaceAll('\\','/'));}catch{return true;}
 if(/\/server\/data(?:\/|$)/i.test(path))return true;
 const requested=path.startsWith('/@fs/')?resolve(path.slice(5)):resolve(root,`.${path}`),privateDirectory=dirname(resolve(dataFile));
 const key=value=>value.replaceAll('\\','/').toLowerCase();
 return key(requested)===key(privateDirectory)||key(requested).startsWith(key(privateDirectory)+'/');
}
