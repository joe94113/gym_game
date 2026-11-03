import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogActivities} from '../src/activity-catalog.js';
import {REVIEW_SOURCE_VERSION,createReviewPackage,importReviewPackage,mergeReviewRecords,reviewChecklist,reviewHTML,reviewCSV,validateReviewPNG} from '../src/motion-review-data-v015.js';

const catalog=catalogActivities.filter(item=>item.runtime!=='facility'||item.classKind);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9kAAAAASUVORK5CYII=';
const note=()=>({id:'dumbbell-curl',stage:'拿起與握持',status:'needs-fix',reviewer:'測試填表人',qualification:'自填玩家',notes:'右手腕的位置需要再看。',view:'side',phase:.35,lifecyclePhase:null,inspection:{direction:'enter',phase:.35},image:png,createdAt:'2026-10-29T07:00:00.000Z',contact:{maxReachError:.001,hands:[{error:.001}]},source:'manually-entered',sourceVersion:REVIEW_SOURCE_VERSION,professionalSignoff:false});
const shot=()=>({id:'dumbbell-curl',direction:'enter',view:'side',phase:.35,capturedAt:'2026-10-29T07:00:00.000Z',sourceVersion:REVIEW_SOURCE_VERSION,image:png,contact:{maxReachError:.001}});
const pack=()=>createReviewPackage({catalog,records:[note()],evidence:[shot()],now:'2026-10-29T07:10:00.000Z'});

test('pre-retarget review opinions are retained as old-version notes, never approval of the new motion',()=>{
 const old={...note(),id:'dumbbell-shoulder-press',sourceVersion:'0.15.0',status:'acceptable'};
 const row=reviewChecklist(catalog,[old]).find(item=>item.id===old.id);
 assert.equal(REVIEW_SOURCE_VERSION,JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version);assert.equal(row.status,'pending');assert.equal(row.currentVersion,false);assert.equal(row.latest.sourceVersion,'0.15.0');
});

test('審查包有效往返保留實際圖、相位、來源及意見，清單共65項',()=>{
 const exported=pack(),imported=importReviewPackage(JSON.stringify(exported),catalog);assert.equal(exported.checklist.length,65);assert.deepEqual(imported.records,[note()]);assert.deepEqual(imported.evidence,[shot()]);assert.equal(exported.professionalSignoff,false);assert.equal(exported.checklist.filter(item=>item.status==='pending').length,64);assert.equal(imported.warnings.length,0);
});
test('匯入對不支援的版本、未知動作、偽造認證和無效相位指出欄位',()=>{
 const checks=[['sourceVersion','0.99.0',/sourceVersion/],['id','made-up-machine',/records\[0\]\.id/],['professionalSignoff',true,/professionalSignoff/],['phase',1.01,/records\[0\]\.phase/],['lifecyclePhase',-1,/lifecyclePhase/],['view','underneath',/\.view/],['stage','已由教練認證',/\.stage/],['status','certified',/\.status/]];
 for(const [key,value,error]of checks){const payload=pack();if(key==='sourceVersion')payload.sourceVersion=value;else payload.records[0][key]=value;assert.throws(()=>importReviewPackage(JSON.stringify(payload),catalog),error);}
 const payload=pack();payload.records[0].inspection.phase='0.3';assert.throws(()=>importReviewPackage(JSON.stringify(payload),catalog),/inspection\.phase/);
});
test('PNG需真實結構，拒絕SVG、假檔頭、截斷及過大圖',()=>{
 assert.equal(validateReviewPNG(png),png);assert.throws(()=>validateReviewPNG('data:image/svg+xml,<svg onload=alert(1)>'),/PNG/);assert.throws(()=>validateReviewPNG('data:image/png;base64,SGVsbG8='),/PNG/);assert.throws(()=>validateReviewPNG(png.slice(0,-12)),/PNG/);assert.throws(()=>validateReviewPNG('data:image/png;base64,'+'A'.repeat(1024*1024)),/1 MB/);
 const payload=pack();payload.evidence[0].image=null;assert.throws(()=>importReviewPackage(JSON.stringify(payload),catalog),/evidence\[0\]\.image/);
});
test('舊版v2可匯入且不會把舊複核或舊版可接受當成本版已審查',()=>{
 const legacy=note();delete legacy.sourceVersion;legacy.status='reviewed';const imported=importReviewPackage(JSON.stringify({version:2,brand:'肌動基地',records:[legacy]}),catalog);assert.equal(imported.records[0].sourceVersion,'legacy-v013-unversioned');assert.equal(imported.warnings.length,1);assert.ok(reviewChecklist(catalog,imported.records).every(item=>item.status==='pending'));
 const older={...note(),sourceVersion:'0.14.0',status:'acceptable'};assert.equal(reviewChecklist(catalog,[older]).find(item=>item.id===older.id).status,'pending');
});
test('合併去重、不覆蓋原資料，較舊紀錄不會掩蓋較新意見',()=>{
 const original=[note()],duplicate=structuredClone(original[0]),other={...note(),createdAt:'2026-10-28T07:00:00.000Z',status:'acceptable'};const merged=mergeReviewRecords(original,[duplicate,other]);assert.equal(merged.added,1);assert.equal(merged.records.length,2);assert.equal(original.length,1);assert.equal(reviewChecklist(catalog,merged.records).find(item=>item.id==='dumbbell-curl').status,'needs-fix');
});
test('無效批次整包拒絕，不會部分套用到既有資料',()=>{
 const original=[note()],payload=pack();payload.records.push({...note(),id:'unknown'});assert.throws(()=>importReviewPackage(JSON.stringify(payload),catalog),/records\[1\]\.id/);assert.deepEqual(original,[note()]);
});
test('離線HTML清楚標示意見與缺圖、跳脫輸入，沒有可執行script或私人額外欄位',()=>{
 const payload=pack();payload.records[0].notes='<script>secretAttack()</script> <img src=x onerror=bad()>';payload.records[0].accountToken='private-token-never-export';const html=reviewHTML(payload,catalog);assert.match(html,/填表人意見，不代表資格認證/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|<img src=x|private-token-never-export/);assert.match(html,/尚無填表人意見/);assert.match(html,/data:image\/png;base64,/);
 const imported=importReviewPackage(JSON.stringify(payload),catalog);assert.equal(Object.hasOwn(imported.records[0],'accountToken'),false);
});
test('CSV可離線讀並防公式開頭，資格始終是自填而非專業簽核',()=>{
 const payload=pack();payload.records[0].reviewer='=HYPERLINK("bad")';const csv=reviewCSV(payload,catalog);assert.match(csv,/"'=HYPERLINK/);assert.match(csv,/未認證/);assert.match(csv,/來源版本/);assert.match(csv,/需要修正/);
});
test('過量紀錄、深層資料及偽造接點會拒絕，匯出不自動建立審查或圖片',()=>{
 const payload=pack();payload.records=Array.from({length:501},()=>note());assert.throws(()=>importReviewPackage(JSON.stringify(payload),catalog),/records/);
 const bad=pack();bad.records[0].contact=JSON.parse('{"__proto__":{"polluted":true}}');assert.throws(()=>importReviewPackage(JSON.stringify(bad),catalog),/contact/);assert.equal({}.polluted,undefined);
 const empty=createReviewPackage({catalog,records:[],evidence:[]});assert.equal(empty.records.length,0);assert.equal(empty.evidence.length,0);assert.ok(empty.checklist.every(item=>item.status==='pending'));
});
