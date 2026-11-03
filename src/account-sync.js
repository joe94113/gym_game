import {normalizeSnapshot,mergeSyncSnapshots} from './training-journal-data.js';

const META='form.account-session.v1',PREFIX='form.account-data.v1:',clone=value=>JSON.parse(JSON.stringify(value)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const memoryStorage=()=>{const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
/** Offline-first, account-scoped state. Cookie authentication stays on the server. */
export function createAccountSync({storage=globalThis.localStorage,fetcher=(...args)=>globalThis.fetch(...args),getProgress=()=>({}),getProfile=()=>({}),onApplyState=()=>{},onChange=()=>{},baseURL='/api/form/v1',eventTarget=globalThis.window,autoSyncDelay=1200}={}){
 let persistent=true;try{const key=`${PREFIX}probe`;storage.setItem(key,'1');storage.removeItem(key);}catch{storage=memoryStorage();persistent=false;}
 const read=(key,fallback)=>{try{return JSON.parse(storage.getItem(key)||'null')||fallback;}catch{return fallback;}},write=(key,value)=>{try{storage.setItem(key,JSON.stringify(value));}catch{persistent=false;}};
 const starting=read(META,null),guest=()=>normalizeSnapshot(read(`${PREFIX}guest`,{}).snapshot||{});
 const load=(id)=>{const value=read(`${PREFIX}${id||'guest'}`,{});try{return{snapshot:normalizeSnapshot(value.snapshot||{}),baseSnapshot:normalizeSnapshot(value.baseSnapshot||{}),version:Number.isSafeInteger(value.version)?value.version:0,dirty:value.dirty===true,lastSyncedAt:value.lastSyncedAt||null};}catch{return{snapshot:normalizeSnapshot(),baseSnapshot:normalizeSnapshot(),version:0,dirty:false,lastSyncedAt:null};}};
 let state={...load(starting?.id),user:starting,available:false,status:starting?'checking':'local',error:'',conflict:null,persistent},disposed=false,applying=false,timer=null,syncPromise=null,accountBusy=false;
 const publicState=()=>({...state,snapshot:clone(state.snapshot),baseSnapshot:clone(state.baseSnapshot),user:state.user?{...state.user}:null,conflict:state.conflict?clone(state.conflict):null,persistent});
 const emit=()=>{if(!disposed)onChange(publicState());};
 const stash=()=>write(`${PREFIX}${state.user?.id||'guest'}`,{snapshot:state.snapshot,baseSnapshot:state.baseSnapshot,version:state.version,dirty:state.dirty,lastSyncedAt:state.lastSyncedAt});
 const apply=()=>{applying=true;try{onApplyState(clone(state.snapshot));}finally{applying=false;}};
 const schedule=()=>{clearTimeout(timer);if(state.user&&!state.conflict&&!disposed)timer=setTimeout(()=>{sync().catch(()=>{});},autoSyncDelay);};
 const mark=()=>{state.dirty=true;state.status=state.user?'pending':'local';state.error='';stash();emit();schedule();};
 function captureLearningState({scheduleSync=true}={}){
  if(applying||disposed)return false;
  const progress=getProgress()||{},next=normalizeSnapshot({...state.snapshot,learned:progress.learned??state.snapshot.learned,knowledge:progress.knowledge??state.snapshot.knowledge,profile:getProfile()||state.snapshot.profile});
  if(equal(next,state.snapshot))return false;state.snapshot=next;state.dirty=true;state.status=state.user?'pending':'local';stash();if(scheduleSync)schedule();emit();return true;
 }
 async function request(path,{method='GET',body}={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);let response;
  try{response=await fetcher(`${baseURL}${path}`,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});}catch{state.available=false;throw Object.assign(new Error('暫時連不上帳號服務，資料仍保留在這台裝置。'),{offline:true});}finally{clearTimeout(timeout);}
  let value;try{value=await response.json();}catch{throw new Error('帳號服務尚未就緒，請確認遊戲伺服器已啟動。');}
  state.available=true;if(!response.ok)throw Object.assign(new Error(value.message||'操作未完成，請稍後再試。'),{status:response.status,code:value.code,data:value});return value;
 }
 const conflict=result=>{state.conflict={version:result.version,snapshot:normalizeSnapshot(result.snapshot),updatedAt:result.updatedAt};state.status='conflict';state.error='其他裝置有新資料，請選擇合併方式。';stash();emit();return{status:'conflict'};};
 function sync(){
  if(syncPromise)return syncPromise;
  syncPromise=(async()=>{
   if(disposed||accountBusy)return{status:state.status};captureLearningState({scheduleSync:false});
   if(!state.user)return{status:'local'};if(state.conflict)return{status:'conflict'};
   state.status='syncing';state.error='';emit();
   try{
    if(state.dirty){
     const submitted=clone(state.snapshot);let result;try{result=await request('/snapshot',{method:'PUT',body:{baseVersion:state.version,snapshot:submitted}});}catch(e){if(e.code==='CONFLICT')return conflict(e.data);throw e;}
     state.version=result.version;state.baseSnapshot=normalizeSnapshot(result.snapshot);state.lastSyncedAt=result.updatedAt;state.dirty=!equal(state.snapshot,submitted);if(!state.dirty){state.snapshot=state.baseSnapshot;apply();}
    }else{
     const result=await request('/snapshot');
     if(state.dirty&&result.version!==state.version)return conflict(result);
     if(!state.dirty){state.snapshot=normalizeSnapshot(result.snapshot);state.baseSnapshot=clone(state.snapshot);state.version=result.version;state.lastSyncedAt=result.updatedAt;apply();}
    }
    state.status=state.dirty?'pending':'synced';state.error='';stash();emit();if(state.dirty)schedule();return{status:state.status};
   }catch(e){state.status=e.status===401?'login-needed':'offline';state.error=e.message;stash();emit();return{status:state.status,error:e.message};}
  })().finally(()=>{syncPromise=null;});return syncPromise;
 }
 async function activate(user,remote){
  state={...state,...load(user.id),user,available:true,error:'',conflict:null};write(META,user);
  if(!state.dirty){state.snapshot=normalizeSnapshot(remote.snapshot);state.baseSnapshot=clone(state.snapshot);state.version=remote.version;state.lastSyncedAt=remote.updatedAt;state.status='synced';}
  else state.status='pending';stash();apply();emit();if(state.dirty)schedule();
 }
 const ready=(async()=>{
  try{
   const {user}=await request('/session');
   if(user){const remote=await request('/snapshot');await activate(user,remote);}
   else{state={...state,...load(null),user:null,status:'local',available:true,error:'',conflict:null};write(META,null);if(starting)apply();else captureLearningState({scheduleSync:false});emit();}
  }catch(e){state.status=state.user?'offline':'local';state.error=e.message;if(!state.user)captureLearningState({scheduleSync:false});emit();}
 })();
 async function authenticate(kind,credentials){
  await ready;if(accountBusy)throw new Error('帳號操作進行中，請稍候。');if(syncPromise)await syncPromise;clearTimeout(timer);captureLearningState({scheduleSync:false});accountBusy=true;
  try{const {user}=await request(`/${kind}`,{method:'POST',body:credentials}),remote=await request('/snapshot');await activate(user,remote);return publicState();}catch(e){state.error=e.message;emit();throw e;}finally{accountBusy=false;}
 }
 async function logout(){
  await ready;if(syncPromise)await syncPromise;clearTimeout(timer);await request('/logout',{method:'POST',body:{}});stash();state={...state,...load(null),user:null,status:'local',error:'',conflict:null};write(META,null);apply();emit();
 }
 async function resolveConflict(profileChoice){
  if(!['local','remote'].includes(profileChoice)||!state.conflict)return{status:state.status};
  const current=state.conflict,{snapshot,conflicts}=mergeSyncSnapshots(state.snapshot,current.snapshot,{base:state.baseSnapshot,profileChoice});state.snapshot=snapshot;state.baseSnapshot=current.snapshot;state.version=current.version;state.conflict=null;state.dirty=true;stash();apply();emit();const result=await sync();return{...result,copies:conflicts.length};
 }
 function updateSnapshot(snapshot){state.snapshot=normalizeSnapshot(snapshot);mark();}
 function importGuest(){if(!state.user)throw new Error('請先登入，再匯入離線紀錄。');const result=mergeSyncSnapshots(state.snapshot,guest(),{base:normalizeSnapshot(),profileChoice:'local'});state.snapshot=result.snapshot;apply();mark();return result;}
 const online=()=>{if(state.user)sync();},focus=()=>{if(state.user&&!state.conflict)sync();};eventTarget?.addEventListener?.('online',online);eventTarget?.addEventListener?.('focus',focus);
 return{ready,getState:publicState,getSnapshot:()=>clone(state.snapshot),updateSnapshot,captureLearningState,sync,login:credentials=>authenticate('login',credentials),register:credentials=>authenticate('register',credentials),logout,resolveConflict,importGuest,
  async changePassword(previousPassword,password){await request('/password',{method:'POST',body:{previousPassword,password}});},
  getDiagnostics:()=>({user:state.user?.username||null,available:state.available,status:state.status,version:state.version,entries:state.snapshot.entries.filter(entry=>!entry.deleted).length,dirty:state.dirty,conflict:!!state.conflict,persistent,lastSyncedAt:state.lastSyncedAt}),
  dispose(){disposed=true;clearTimeout(timer);eventTarget?.removeEventListener?.('online',online);eventTarget?.removeEventListener?.('focus',focus);},
 };
}
