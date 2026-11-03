import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalJournalClient} from '../src/local-journal-client.js';
import {normalizeJournalEntry,journalExport,journalImport,journalCSV} from '../src/training-journal-data.js';

const memory=()=>{const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
const entry=()=>normalizeJournalEntry({id:'static-log',date:'2026-10-29',exerciseId:'dumbbell-curl',weightBasis:'per-hand',sets:[{id:'set-a',weightKg:8,reps:10,effort:6}],notes:'實際完成',createdAt:'2026-10-29T01:00:00Z',updatedAt:'2026-10-29T01:00:00Z'});

test('靜態模式完全不使用帳號服務，保留既有帳號資料而只讀寫訪客紀錄',async()=>{
 const storage=memory(),account={id:'old-account',username:'saved-user'};storage.setItem('form.account-session.v1',JSON.stringify(account));storage.setItem('form.account-data.v1:old-account','private-account-backup');let requests=0,listeners=0;
 const client=createLocalJournalClient({storage,fetcher:()=>{requests++;throw Error('must not request');},eventTarget:{addEventListener(){listeners++;}},getProgress:()=>({learned:['dumbbell-curl'],knowledge:['dumbbell-station']}),getProfile:()=>({minutes:30})});
 await client.ready;assert.equal(requests,0);assert.equal(listeners,0);assert.equal(client.getState().user,null);assert.equal(client.getState().error,'');assert.equal((await client.sync()).status,'local');assert.equal(requests,0);assert.equal(storage.getItem('form.account-session.v1'),JSON.stringify(account));assert.equal(storage.getItem('form.account-data.v1:old-account'),'private-account-backup');client.dispose();
});
test('本機日誌及明確擷取的學習安排可重載，觀看示範不會建立紀錄',async()=>{
 const storage=memory(),options={storage,getProgress:()=>({learned:['dumbbell-curl'],knowledge:['dumbbell-station']}),getProfile:()=>({minutes:45,experience:'regular'})},first=createLocalJournalClient(options);await first.ready;
 assert.equal(first.getDiagnostics().entries,0);first.updateSnapshot({...first.getSnapshot(),entries:[entry()]});first.dispose();
 const reload=createLocalJournalClient(options);await reload.ready;assert.equal(reload.getSnapshot().entries[0].sets[0].weightKg,8);assert.deepEqual(reload.getSnapshot().learned,['dumbbell-curl']);assert.equal(reload.getSnapshot().profile.minutes,45);const copy=reload.getSnapshot();copy.entries.length=0;assert.equal(reload.getDiagnostics().entries,1);reload.dispose();
});
test('靜態版 JSON 可合併轉移到另一個瀏覽器，CSV 仍可匯出',async()=>{
 const first=createLocalJournalClient({storage:memory(),getProgress:()=>({learned:['dumbbell-curl']}),getProfile:()=>({minutes:45})}),second=createLocalJournalClient({storage:memory(),getProgress:()=>({learned:['leg-press']}),getProfile:()=>({minutes:15})});await Promise.all([first.ready,second.ready]);first.updateSnapshot({...first.getSnapshot(),entries:[entry()]});
 const transferred=journalImport(journalExport(first.getSnapshot()),second.getSnapshot());second.updateSnapshot(transferred.snapshot);assert.equal(second.getDiagnostics().entries,1);assert.deepEqual(second.getSnapshot().learned,['dumbbell-curl','leg-press']);assert.ok(journalCSV(second.getSnapshot(),{'dumbbell-curl':'啞鈴彎舉'}).includes('啞鈴彎舉'));first.dispose();second.dispose();
});
test('無法持久保存時保留當次資料供匯出，關閉後不再寫入或通知',async()=>{
 let changes=0;const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){}},client=createLocalJournalClient({storage,onChange(){changes++;}});await client.ready;assert.equal(client.getState().persistent,false);client.updateSnapshot({...client.getSnapshot(),entries:[entry()]});assert.equal(client.getDiagnostics().entries,1);assert.equal(journalImport(journalExport(client.getSnapshot()),{}).snapshot.entries.length,1);client.dispose();const count=changes;client.updateSnapshot({});assert.equal(changes,count);assert.equal(client.getDiagnostics().entries,1);
});
