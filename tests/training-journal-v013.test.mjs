import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeJournalEntry,normalizeSnapshot,mergeSyncSnapshots,journalSummary,journalExport,journalImport,journalCSV,validDate} from '../src/training-journal-data.js';
import {createAccountSync} from '../src/account-sync.js';

const entry=(id='log-a',overrides={})=>normalizeJournalEntry({id,date:'2026-10-29',exerciseId:'dumbbell-curl',weightBasis:'per-hand',sets:[{id:'set-a',weightKg:8,reps:10,durationSeconds:null,effort:6}],notes:'實際完成',createdAt:'2026-10-29T01:00:00Z',updatedAt:'2026-10-29T01:00:00Z',...overrides});
const memory=()=>{const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};

test('日誌要求實際次數或時間，日期與數值有明確界限',()=>{
 assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2024-02-29'),true);
 assert.throws(()=>entry('a',{date:'2026-02-31'}),/日期/);
 assert.throws(()=>entry('a',{sets:[{weightKg:5,reps:'',durationSeconds:''}]}),/次數或秒數/);
 assert.throws(()=>entry('a',{sets:[{reps:1.5}]}),/次數/);
 assert.throws(()=>entry('a',{sets:[{reps:10,weightKg:-1}]}),/重量/);
 assert.throws(()=>entry('a',{sets:[{reps:10,effort:11}]}),/吃力/);
 assert.equal(entry('timed',{sets:[{durationSeconds:90,weightKg:null,reps:null}]}).sets[0].durationSeconds,90);
 assert.equal(entry().weightBasis,'per-hand');
});
test('日／週摘要採週一至週日，刪除資料不計入',()=>{
 const items=[entry('mon',{date:'2026-10-26'}),entry('thu'),entry('sun',{date:'2026-11-01',sets:[{reps:null,durationSeconds:120}]}),entry('next',{date:'2026-11-02'}),entry('deleted',{deleted:true})];
 assert.equal(journalSummary(items,{date:'2026-10-29'}).entries,1);
 const week=journalSummary(items,{date:'2026-10-29',period:'week'});assert.equal(week.from,'2026-10-26');assert.equal(week.to,'2026-11-01');assert.equal(week.entries,3);assert.equal(week.days,3);assert.equal(week.reps,20);assert.equal(week.durationSeconds,120);
 assert.equal(journalSummary(items,{period:'all'}).entries,4);
});
test('三方合併保留兩邊新增紀錄及真正競爭的編輯，未變的一邊不另建複本',()=>{
 const original=entry(),base=normalizeSnapshot({entries:[original],learned:['a'],profile:{minutes:30}});
 const left=normalizeSnapshot({...base,entries:[entry('log-a',{sets:[{id:'set-a',reps:8}]})],learned:['a','b'],profile:{minutes:45}});
 const right=normalizeSnapshot({...base,entries:[entry('log-a',{sets:[{id:'set-a',reps:12}]}),entry('remote-new')],learned:['a','c'],profile:{minutes:15}});
 const result=mergeSyncSnapshots(left,right,{base,profileChoice:'remote'});assert.equal(result.conflicts.length,1);assert.equal(result.snapshot.entries.length,3);assert.deepEqual(result.snapshot.learned,['a','b','c']);assert.equal(result.snapshot.profile.minutes,15);
 assert.deepEqual(result.snapshot.entries.filter(item=>item.id.startsWith('log-a')).map(item=>item.sets[0].reps).sort((a,b)=>a-b),[8,12]);
 const oneSide=mergeSyncSnapshots(base,right,{base});assert.equal(oneSide.conflicts.length,0);assert.equal(oneSide.snapshot.entries.length,2);assert.equal(oneSide.snapshot.entries.find(item=>item.id==='log-a').sets[0].reps,12);
});
test('刪除對同時編輯會留下可核對的活紀錄，重新合併不重複擴增',()=>{
 const base=normalizeSnapshot({entries:[entry()]}),left=normalizeSnapshot({entries:[entry('log-a',{deleted:true})]}),right=normalizeSnapshot({entries:[entry('log-a',{notes:'另一台有新修改'})]});
 const merged=mergeSyncSnapshots(left,right,{base});assert.equal(merged.snapshot.entries.filter(item=>!item.deleted).length,1);
 const again=mergeSyncSnapshots(merged.snapshot,right,{base});assert.equal(again.snapshot.entries.length,2);
});
test('JSON 匯入合併保留本機學習進度與紀錄；CSV 防止試算表公式注入',()=>{
 const local=normalizeSnapshot({entries:[entry('local')],learned:['local-learned']}),remote=normalizeSnapshot({entries:[entry('remote',{notes:'=HYPERLINK("bad")'})],learned:['remote-learned']});
 const result=journalImport(journalExport(remote),local);assert.equal(result.snapshot.entries.length,2);assert.deepEqual(result.snapshot.learned,['local-learned','remote-learned']);
 assert.throws(()=>journalImport('{',local),/JSON/);assert.throws(()=>journalImport('{}',local),/匯出/);
 const csv=journalCSV(remote,{'dumbbell-curl':'啞鈴彎舉'});assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('啞鈴彎舉'));assert.ok(csv.includes('每手'));assert.ok(journalCSV({entries:[entry('space',{notes:'  =SUM(1,2)'})]}).includes("'  =SUM"));
});
test('不播放或觀看也不會新增紀錄，離線僅保存顯式修改',async()=>{
 const storage=memory(),client=createAccountSync({storage,fetcher:async()=>{throw Error('offline');},getProgress:()=>({learned:['dumbbell-curl'],knowledge:['dumbbell-station']}),getProfile:()=>({minutes:45}),eventTarget:null,autoSyncDelay:60000});
 await client.ready;assert.equal(client.getSnapshot().entries.length,0);assert.deepEqual(client.getSnapshot().learned,['dumbbell-curl']);assert.equal(client.getSnapshot().profile.minutes,45);
 client.updateSnapshot({...client.getSnapshot(),entries:[entry()]});assert.equal(client.getDiagnostics().entries,1);assert.equal((await client.sync()).status,'local');client.dispose();
 const reload=createAccountSync({storage,fetcher:async()=>{throw Error('offline');},getProgress:()=>({learned:['dumbbell-curl']}),getProfile:()=>({minutes:45}),eventTarget:null});await reload.ready;assert.equal(reload.getDiagnostics().entries,1);reload.dispose();
});
test('首次啟用在線服務先擷取原有 localStorage 進度，不套用空訪客資料',async()=>{
 const storage=memory();storage.setItem('form.exercise-progress.v1',JSON.stringify(['dumbbell-curl']));storage.setItem('form.learned',JSON.stringify(['station-a']));storage.setItem('form.training-profile.v1',JSON.stringify({minutes:45,experience:'regular'}));let applied=0;
 const client=createAccountSync({storage,fetcher:async()=>({ok:true,json:async()=>({user:null})}),getProgress:()=>({learned:JSON.parse(storage.getItem('form.exercise-progress.v1')),knowledge:JSON.parse(storage.getItem('form.learned'))}),getProfile:()=>JSON.parse(storage.getItem('form.training-profile.v1')),onApplyState:()=>{applied++;},eventTarget:null});await client.ready;
 assert.equal(applied,0);assert.deepEqual(client.getSnapshot().learned,['dumbbell-curl']);assert.deepEqual(client.getSnapshot().knowledge,['station-a']);assert.equal(client.getSnapshot().profile.minutes,45);assert.deepEqual(JSON.parse(storage.getItem('form.exercise-progress.v1')),['dumbbell-curl']);client.dispose();
});
test('同步途中再編輯會保留新版本，不被較早的回應覆蓋',async()=>{
 let serverVersion=0,serverSnapshot=normalizeSnapshot(),release=null,hold=false,rootState=normalizeSnapshot();
 const fetcher=async(url,options={})=>{
  const path=url.split('/').at(-1);let data,status=200;
  if(path==='session')data={user:null};
  else if(path==='register')data={user:{id:'user-one',username:'test-user',displayName:'測試'}};
  else if(path==='snapshot'&&options.method==='PUT'){const submitted=JSON.parse(options.body);serverVersion++;serverSnapshot=submitted.snapshot;data={version:serverVersion,snapshot:serverSnapshot,updatedAt:'2026-10-29T02:00:00Z'};if(hold)await new Promise(resolve=>{release=resolve;});}
  else data={version:serverVersion,snapshot:serverSnapshot,updatedAt:null};
  return{ok:true,status,json:async()=>clone(data)};
 };
 const clone=value=>JSON.parse(JSON.stringify(value)),client=createAccountSync({storage:memory(),fetcher,getProgress:()=>rootState,getProfile:()=>rootState.profile,onApplyState:value=>{rootState=value;},eventTarget:null,autoSyncDelay:60000});await client.ready;await client.register({});
 client.updateSnapshot({...client.getSnapshot(),entries:[entry('log-a',{notes:'第一版'})]});hold=true;const syncing=client.sync();while(!release)await new Promise(resolve=>setTimeout(resolve,0));
 client.updateSnapshot({...client.getSnapshot(),entries:[entry('log-a',{notes:'尚未送出的第二版'})]});release();await syncing;assert.equal(client.getSnapshot().entries[0].notes,'尚未送出的第二版');assert.equal(client.getDiagnostics().dirty,true);
 hold=false;await client.sync();assert.equal(serverSnapshot.entries[0].notes,'尚未送出的第二版');assert.equal(client.getDiagnostics().dirty,false);client.dispose();
});
