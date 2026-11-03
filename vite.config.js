import {defineConfig,loadEnv} from 'vite';
import {createAccountApi} from './server/account-api.mjs';
import {isPrivateAccountPath} from './server/private-paths.mjs';
import {siteConfig} from './site/config.mjs';
import {seoPlugin} from './site/vite-plugin.mjs';

const attach=async server=>{const api=await createAccountApi();server.middlewares.use((req,res,next)=>{if(isPrivateAccountPath(req.url,{root:server.config.root,dataFile:api.dataFile})){res.statusCode=403;res.end('Forbidden');return;}api.handler(req,res,next).catch(next);});};
export default defineConfig(({mode})=>{
 const env={...loadEnv(mode,process.cwd(),''),...process.env},site=siteConfig(env);
 const accountMode=env.VITE_ACCOUNT_MODE||(mode==='pages'?'local':'server');
 return{base:site.base,define:{'import.meta.env.VITE_ACCOUNT_MODE':JSON.stringify(accountMode)},server:{fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/server/data/**']}},plugins:[seoPlugin(site,{accountMode}),...(accountMode==='local'?[]:[{
  name:'form-local-account-api',configureServer:attach,configurePreviewServer:attach,
 }])]};
});
