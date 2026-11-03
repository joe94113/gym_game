import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {normalizeSnapshot} from '../src/training-journal-data.js';

const derive=promisify(scrypt),DAY=86400000,COOKIE='form_session',MAX_BODY=2*1024*1024;
const digest=token=>createHash('sha256').update(token).digest('hex');
const error=(status,message,code)=>Object.assign(new Error(message),{status,code});
const safeUser=user=>({id:user.id,username:user.username,displayName:user.displayName});
const username=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9._-]{3,32}$/.test(value))throw error(400,'帳號請使用 3～32 個英文字母、數字、點、底線或連字號。');return value.toLowerCase();};
const password=value=>{if(typeof value!=='string'||value.length<10||value.length>128)throw error(400,'密碼請使用 10～128 個字元。');return value;};
async function hashPassword(value,salt=randomBytes(16).toString('hex')){return{salt,hash:(await derive(value,salt,64)).toString('hex')};}
async function matches(value,user){const actual=await hashPassword(value,user?.passwordSalt||'form-unknown-account-salt');return user?timingSafeEqual(Buffer.from(actual.hash,'hex'),Buffer.from(user.passwordHash,'hex')):false;}
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));}
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw error(415,'請使用 JSON 格式送出資料。');
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw error(413,'資料超過 2 MB，請分批匯入。');chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw error(400,'資料格式不正確。');}
}
/** One-process self-hosted account service. Passwords and raw cookie tokens never appear in snapshots. */
export async function createAccountApi({dataDir=resolve(process.env.FORM_DATA_DIR||'server/data'),publicOrigin=process.env.FORM_PUBLIC_ORIGIN||'',clock=Date.now,secureCookies=publicOrigin.startsWith('https://'),rateLimit=true}={}){
 const file=resolve(dataDir,'accounts.json');let database={schema:1,users:[],sessions:[]},queue=Promise.resolve();const attempts=new Map();
 await mkdir(dataDir,{recursive:true});try{database=JSON.parse(await readFile(file,'utf8'));if(database.schema!==1||!Array.isArray(database.users)||!Array.isArray(database.sessions))throw Error('帳號資料版本不正確。');}catch(e){if(e.code!=='ENOENT')throw e;}
 const persist=async()=>{const temporary=`${file}.next`;await writeFile(temporary,JSON.stringify(database),{mode:0o600});await rename(temporary,file);};
 const exclusive=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 function limit(req,kind,name=''){
  if(!rateLimit)return;const ip=req.socket.remoteAddress||'unknown',now=clock(),key=`${kind}:${ip}:${name}`,window=kind==='auth'?15*60000:60000,max=kind==='auth'?25:240,entry=attempts.get(key);
  if(attempts.size>5000)for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
  if(!entry||entry.until<=now){attempts.set(key,{count:1,until:now+window});return;}
  if(++entry.count>max)throw error(429,'操作太頻繁，請稍後再試。','RATE_LIMIT');
 }
 function origin(req){
  const value=req.headers.origin,expected=publicOrigin||`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;
  if(value&&value!==expected)throw error(403,'請從同一個遊戲網址操作帳號。','ORIGIN');
  if(!value&&req.headers['sec-fetch-site']==='cross-site')throw error(403,'請從遊戲內操作帳號。','ORIGIN');
 }
 function session(req){const raw=(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);if(!raw||!/^[a-f0-9]{64}$/.test(raw))return null;const item=database.sessions.find(item=>item.tokenHash===digest(raw)&&item.expires>clock());if(!item)return null;const user=database.users.find(user=>user.id===item.userId);return user?{user,item}:null;}
 const cookie=(token,maxAge=30*86400)=>`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies?'; Secure':''}`;
 async function issue(user){const token=randomBytes(32).toString('hex'),now=clock();database.sessions=database.sessions.filter(item=>item.expires>now);const previous=database.sessions.filter(item=>item.userId===user.id).sort((a,b)=>b.expires-a.expires);if(previous.length>=10){const remove=new Set(previous.slice(9).map(item=>item.tokenHash));database.sessions=database.sessions.filter(item=>!remove.has(item.tokenHash));}database.sessions.push({userId:user.id,tokenHash:digest(token),expires:now+30*DAY});await persist();return cookie(token);}
 const handler=async(req,res,next)=>{
  const path=(req.url||'').split('?')[0];if(!path.startsWith('/api/form/v1/')){next?.();return false;}
  try{
   limit(req,'api');if(!['GET','HEAD'].includes(req.method))origin(req);
   if(req.method==='GET'&&path==='/api/form/v1/session'){const auth=session(req);json(res,200,{user:auth?safeUser(auth.user):null});return true;}
   if(req.method==='POST'&&['/api/form/v1/register','/api/form/v1/login'].includes(path)){
    const value=await body(req);limit(req,'auth');const name=username(value.username),secret=password(value.password);
    await exclusive(async()=>{
     const found=database.users.find(user=>user.username===name);
     if(path.endsWith('/register')){
      if(found)throw error(409,'這個帳號已有人使用，請換一個。');
      const hashed=await hashPassword(secret),user={id:randomBytes(16).toString('hex'),username:name,displayName:String(value.displayName||name).trim().slice(0,60)||name,passwordSalt:hashed.salt,passwordHash:hashed.hash,createdAt:new Date(clock()).toISOString(),version:0,snapshot:normalizeSnapshot(),updatedAt:null};database.users.push(user);const setCookie=await issue(user);json(res,201,{user:safeUser(user)},{'Set-Cookie':setCookie});
     }else{if(!await matches(secret,found))throw error(401,'帳號或密碼不正確。');const setCookie=await issue(found);json(res,200,{user:safeUser(found)},{'Set-Cookie':setCookie});}
    });return true;
   }
   const auth=session(req);if(!auth)throw error(401,'請先登入帳號。','AUTH');
   if(req.method==='POST'&&path==='/api/form/v1/logout'){await exclusive(async()=>{database.sessions=database.sessions.filter(item=>item.tokenHash!==auth.item.tokenHash);await persist();});json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});return true;}
   if(req.method==='GET'&&path==='/api/form/v1/snapshot'){json(res,200,{version:auth.user.version,snapshot:auth.user.snapshot,updatedAt:auth.user.updatedAt});return true;}
   if(req.method==='PUT'&&path==='/api/form/v1/snapshot'){
    const value=await body(req);if(!Number.isSafeInteger(value.baseVersion)||value.baseVersion<0)throw error(400,'同步版本不正確。');if(!value.snapshot||typeof value.snapshot!=='object'||Array.isArray(value.snapshot))throw error(400,'請提供完整的同步資料。');let snapshot;try{snapshot=normalizeSnapshot(value.snapshot);}catch(e){throw error(400,e.message);}
    await exclusive(async()=>{const user=database.users.find(user=>user.id===auth.user.id);if(value.baseVersion!==user.version){json(res,409,{code:'CONFLICT',message:'其他裝置也有新資料，請先合併。',version:user.version,snapshot:user.snapshot,updatedAt:user.updatedAt});return;}user.snapshot=snapshot;user.version++;user.updatedAt=new Date(clock()).toISOString();await persist();json(res,200,{version:user.version,snapshot:user.snapshot,updatedAt:user.updatedAt});});return true;
   }
   if(req.method==='POST'&&path==='/api/form/v1/password'){
    const value=await body(req);limit(req,'auth');const previous=password(value.previousPassword),nextPassword=password(value.password);
    await exclusive(async()=>{if(!await matches(previous,auth.user))throw error(401,'原密碼不正確。');const hashed=await hashPassword(nextPassword);auth.user.passwordSalt=hashed.salt;auth.user.passwordHash=hashed.hash;database.sessions=database.sessions.filter(item=>item.userId!==auth.user.id||item.tokenHash===auth.item.tokenHash);await persist();json(res,200,{ok:true});});return true;
   }
   throw error(404,'找不到這個帳號操作。');
  }catch(e){if(!res.headersSent)json(res,e.status||500,{message:e.status?e.message:'帳號服務暫時無法使用，紀錄仍留在這台裝置。',...(e.code?{code:e.code}:{})});else res.end();}return true;
 };
 return{handler,flush:()=>queue,dataFile:file};
}
