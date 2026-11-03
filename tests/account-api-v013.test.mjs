import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createAccountApi} from '../server/account-api.mjs';
import {createAccountSync} from '../src/account-sync.js';
import {normalizeSnapshot,normalizeJournalEntry} from '../src/training-journal-data.js';
import {isPrivateAccountPath} from '../server/private-paths.mjs';

const secret='correct horse sample password',entry=(notes='第一次實際訓練')=>normalizeJournalEntry({id:'entry-a',date:'2026-10-29',exerciseId:'dumbbell-curl',sets:[{id:'set-a',weightKg:8,reps:10}],notes,createdAt:'2026-10-29T01:00:00Z',updatedAt:'2026-10-29T01:00:00Z'});
const memory=()=>{const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
async function environment(t,{rateLimit=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'form-accounts-test-'));let server,api,origin;
 async function start(){api=await createAccountApi({dataDir:directory,rateLimit});server=createServer((req,res)=>{api.handler(req,res).catch(()=>{res.writeHead(500);res.end();});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;}
 await start();t.after(async()=>{await new Promise(resolve=>server.close(resolve));await api.flush();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'form-accounts-test-'));await rm(directory,{recursive:true,force:true});});
 const request=async(path,{method='GET',body,cookie,headers={}}={})=>{const response=await fetch(`${origin}/api/form/v1${path}`,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};};
 const browser=()=>{let cookie='';return async(path,options={})=>{const response=await fetch(`${origin}${path}`,{...options,headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})}});const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];return response;};};
 return{request,browser,get api(){return api;},async restart(){await new Promise(resolve=>server.close(resolve));await api.flush();await start();}};
}
test('真實註冊登入使用鹽值雜湊與 HttpOnly cookie；密碼不出現在回應或儲存明文',async t=>{
 const env=await environment(t),registered=await env.request('/register',{method:'POST',body:{username:'Member_01',password:secret,displayName:'測試會員'}});assert.equal(registered.status,201);assert.equal(registered.data.user.username,'member_01');assert.ok(registered.cookie);assert.match(registered.headers.get('set-cookie'),/HttpOnly/);assert.match(registered.headers.get('set-cookie'),/SameSite=Strict/);assert.ok(!JSON.stringify(registered.data).includes(secret));
 const file=await readFile(env.api.dataFile,'utf8');assert.ok(!file.includes(secret));assert.ok(!file.includes(registered.cookie.split('=')[1]));assert.equal(JSON.parse(file).users[0].passwordHash.length,128);
 assert.equal((await env.request('/session',{cookie:registered.cookie})).data.user.displayName,'測試會員');
 assert.equal((await env.request('/login',{method:'POST',body:{username:'member_01',password:'wrong-long-password'}})).status,401);
 assert.equal((await env.request('/login',{method:'POST',body:{username:'member_01',password:secret}})).status,200);
 assert.equal((await env.request('/register',{method:'POST',body:{username:'member_01',password:secret}})).status,409);
});
test('未登入及跨來源修改被拒絕，錯誤輸入不改寫資料',async t=>{
 const env=await environment(t);assert.equal((await env.request('/snapshot')).status,401);
 assert.equal((await env.request('/register',{method:'POST',headers:{Origin:'https://other.example'},body:{username:'test',password:secret}})).status,403);
 assert.equal((await env.request('/register',{method:'POST',body:{username:'aa',password:secret}})).status,400);
 assert.equal((await env.request('/register',{method:'POST',body:{username:'test',password:'short'}})).status,400);
 const auth=await env.request('/register',{method:'POST',body:{username:'test',password:secret}}),bad=await env.request('/snapshot',{method:'PUT',cookie:auth.cookie,body:{baseVersion:0,snapshot:{entries:[{date:'invalid'}]}}});assert.equal(bad.status,400);assert.equal((await env.request('/snapshot',{method:'PUT',cookie:auth.cookie,body:{baseVersion:0}})).status,400);assert.equal((await env.request('/snapshot',{cookie:auth.cookie})).data.version,0);
});
test('開發靜態路徑攔截保護帳號檔，包含大小寫、編碼、@fs 及父目錄形式',()=>{
 const options={root:process.cwd(),dataFile:join(process.cwd(),'server/data/accounts.json')};
 for(const url of ['/server/data/accounts.json','/server/DATA/accounts.json','/server%2fdata/accounts.json','/server/not-used/../data/accounts.json','/server/data/accounts.json?raw','/@fs/'+join(process.cwd(),'server/data/accounts.json').replaceAll('\\','/'),'/server/data/accounts.json.next'])assert.equal(isPrivateAccountPath(url,options),true,url);
 assert.equal(isPrivateAccountPath('/src/training-journal.js',options),false);assert.equal(isPrivateAccountPath('/api/form/v1/session',options),false);
});
test('兩個裝置競爭寫入回傳 409 及完整遠端版本，不會悄悄覆蓋',async t=>{
 const env=await environment(t),auth=await env.request('/register',{method:'POST',body:{username:'test',password:secret}}),login=await env.request('/login',{method:'POST',body:{username:'test',password:secret}});
 const first=await env.request('/snapshot',{method:'PUT',cookie:auth.cookie,body:{baseVersion:0,snapshot:normalizeSnapshot({entries:[entry()],learned:['dumbbell-curl']})}});assert.equal(first.status,200);assert.equal(first.data.version,1);
 const stale=await env.request('/snapshot',{method:'PUT',cookie:login.cookie,body:{baseVersion:0,snapshot:normalizeSnapshot({entries:[entry('另一台改動')]})}});assert.equal(stale.status,409);assert.equal(stale.data.code,'CONFLICT');assert.equal(stale.data.snapshot.entries[0].notes,'第一次實際訓練');assert.equal(stale.data.version,1);
 const simultaneous=await Promise.all(['a','b'].map(notes=>env.request('/snapshot',{method:'PUT',cookie:auth.cookie,body:{baseVersion:1,snapshot:normalizeSnapshot({entries:[entry(notes)]})}})));assert.deepEqual(simultaneous.map(item=>item.status).sort(),[200,409]);
});
test('伺服器重新啟動後保存帳號、cookie session 與日誌；登出使舊 cookie 失效',async t=>{
 const env=await environment(t),auth=await env.request('/register',{method:'POST',body:{username:'test',password:secret}});await env.request('/snapshot',{method:'PUT',cookie:auth.cookie,body:{baseVersion:0,snapshot:normalizeSnapshot({entries:[entry()]})}});await env.restart();assert.equal((await env.request('/snapshot',{cookie:auth.cookie})).data.snapshot.entries.length,1);assert.equal((await env.request('/logout',{method:'POST',body:{},cookie:auth.cookie})).status,200);assert.equal((await env.request('/snapshot',{cookie:auth.cookie})).status,401);
});
test('更改密碼撤銷其他裝置 session，舊密碼無法登入',async t=>{
 const env=await environment(t),a=await env.request('/register',{method:'POST',body:{username:'test',password:secret}}),b=await env.request('/login',{method:'POST',body:{username:'test',password:secret}}),next='a different long password';assert.equal((await env.request('/password',{method:'POST',cookie:a.cookie,body:{previousPassword:secret,password:next}})).status,200);assert.equal((await env.request('/snapshot',{cookie:b.cookie})).status,401);assert.equal((await env.request('/snapshot',{cookie:a.cookie})).status,200);assert.equal((await env.request('/login',{method:'POST',body:{username:'test',password:secret}})).status,401);assert.equal((await env.request('/login',{method:'POST',body:{username:'test',password:next}})).status,200);
});
test('認證請求有每來源限流',async t=>{
 const env=await environment(t,{rateLimit:true});for(let i=0;i<25;i++)await env.request('/login',{method:'POST',body:{username:'test',password:'short'}});assert.equal((await env.request('/login',{method:'POST',body:{username:'test',password:'short'}})).status,429);
});
test('兩個真正 HTTP client 合併競爭編輯，訪客資料與帳號隔離，離線修改保留',async t=>{
 const env=await environment(t),profileA={learned:['guest-learned'],knowledge:['guest-station'],profile:{minutes:45}},profileB={learned:[],knowledge:[],profile:{minutes:30}},options=(profile,storage)=>({storage,fetcher:env.browser(),getProgress:()=>profile,getProfile:()=>profile.profile,onApplyState:value=>Object.assign(profile,value),eventTarget:null,autoSyncDelay:60000});
 const storageA=memory(),a=createAccountSync(options(profileA,storageA)),b=createAccountSync(options(profileB,memory()));t.after(()=>{a.dispose();b.dispose();});await Promise.all([a.ready,b.ready]);a.updateSnapshot({...a.getSnapshot(),entries:[entry()]});await a.register({username:'test',password:secret});assert.equal(a.getSnapshot().entries.length,0);assert.equal(profileA.learned.length,0);
 a.importGuest();assert.equal(a.getSnapshot().entries.length,1);assert.deepEqual(profileA.learned,['guest-learned']);await a.sync();await b.login({username:'test',password:secret});assert.equal(b.getSnapshot().entries.length,1);assert.deepEqual(profileB.learned,['guest-learned']);
 a.updateSnapshot({...a.getSnapshot(),entries:[entry('A 修改')]});b.updateSnapshot({...b.getSnapshot(),entries:[entry('B 修改')]});assert.equal((await a.sync()).status,'synced');assert.equal((await b.sync()).status,'conflict');assert.equal(b.getSnapshot().entries[0].notes,'B 修改');const resolved=await b.resolveConflict('local');assert.equal(resolved.status,'synced');assert.equal(resolved.copies,1);assert.deepEqual(b.getSnapshot().entries.map(item=>item.notes).sort(),['A 修改','B 修改']);await a.sync();assert.equal(a.getSnapshot().entries.length,2);
 await a.logout();assert.equal(a.getSnapshot().entries.length,1);assert.deepEqual(profileA.learned,['guest-learned']);await a.login({username:'test',password:secret});assert.equal(a.getSnapshot().entries.length,2);
 const offline=createAccountSync({...options(profileA,storageA),fetcher:async()=>{throw Error('offline');}});t.after(()=>offline.dispose());await offline.ready;offline.updateSnapshot({...offline.getSnapshot(),entries:[...offline.getSnapshot().entries,normalizeJournalEntry({...entry('離線新增'),id:'offline-new'})]});assert.equal((await offline.sync()).status,'offline');assert.equal(offline.getSnapshot().entries.length,3);
});
