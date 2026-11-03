import {catalogActivities} from '../src/activity-catalog.js';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
const items=catalogActivities.filter(e=>e.runtime!=='facility'||e.classKind||e.facilityKind==='groupClass');
if(!existsSync('docs/coach-review-checklist-v010.md'))writeFileSync('docs/coach-review-checklist-v010.md',readFileSync('docs/coach-review-checklist.md'));
const rows=items.map(e=>`| ${e.name}<br>\`${e.id}\` | ${e.source?.url?`[${e.source.label}](${e.source.url})`:'待補來源'} | ${e.classKind?'暖身、主訓、緩和、段界、離場':'接近、就位、拿起、行程、放回、離開'} | 待審 | ＿＿ | ＿＿ |`);
const text=`# 肌動基地：真人動作複核表\n\n版本 0.13.0，2026-10-29。依目前清單列出 ${items.length} 種動作／課程，不含一般浴室設施。所有真人審查欄位保持待審；沒有代填姓名、證照或簽名。\n\n在網頁先選動作，再從「操作說明 → 動作檢查與問題紀錄」擷取正、側、背畫面，記下段落、相位與具體問題，可匯出 JSON。工作台保存填表人實際輸入的意見，不會將數值通過或填寫姓名轉成專業認證。\n\n請核對固定骨長、手掌與握把、鞋底與支撐、肩肘髖膝踝方向、手腕、軀幹、動作節奏、呼吸提示與初學者的適用性。座墊、握距、滑輪或掛片改動後也需重看進出路徑；布面承重時要區分合理支撐與不該發生的穿插。\n\n本版程式證據見[準備動作](prep-ergonomics-v013.md)、[器材設定](equipment-settings-v013.md)與[動捕處理](captured-locomotion-v013.md)。這些是複核資料，並非已取得真人審核。歷史 0.10 表格保留於[原表](coach-review-checklist-v010.md)。\n\n| 動作／課程 | 參考來源 | 需要看的完整流程 | 狀態 | 審查人／日期 | 問題與結論 |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`;
writeFileSync('docs/coach-review-checklist.md',text);
mkdirSync('public/reviews',{recursive:true});writeFileSync('public/reviews/catalog-v013.json',JSON.stringify({version:'0.13.0',date:'2026-10-29',professionalSignoff:false,items:items.map(e=>({id:e.id,name:e.name,source:e.source,status:'pending',reviewer:null,reviewDate:null,notes:''}))},null,2));
console.log(JSON.stringify({items:items.length,professionalSignoff:false}));
