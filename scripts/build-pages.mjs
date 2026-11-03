import {spawnSync} from 'node:child_process';
import {loadEnv} from 'vite';
import {siteConfig} from '../site/config.mjs';
const env={...loadEnv('pages',process.cwd(),''),...process.env},site=siteConfig(env);
if(!site.url){console.error('請設定 VITE_SITE_URL 為實際 GitHub Pages 完整網址，例如 https://帳號.github.io/儲存庫/。正式網址未定時，可先用 npm run build 檢查本機版本。');process.exit(1);}
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','pages',...process.argv.slice(2)],{stdio:'inherit',env:{...env,VITE_ACCOUNT_MODE:'local'}});
process.exit(result.status??1);
