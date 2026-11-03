import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const comparison=read('artifacts/performance-v015/comparison.json'),session=read('artifacts/performance-v015/measurement-session.json'),pose=read('artifacts/performance-v015/profile/pose-equivalence.json'),flat=read('artifacts/performance-v015/flat-planes/qualification.json');
const auto=read('artifacts/performance-v015/auto/comparison.json'),autoSession=read('artifacts/performance-v015/auto/measurement-session.json');
if(!comparison.pass||comparison.rows.length!==8||!session.pass||session.runs.length!==4||!pose.pass||!flat.pass)throw Error('Complete current performance evidence required');
for(const [path,value]of Object.entries(comparison.sourceHashes))if(sha('.local-tools/v015-fixed-candidate/'+path)!==value)throw Error('Fixed candidate source changed '+path);
for(const [path,value]of Object.entries(comparison.baselineSourceHashes))if(sha('.local-tools/v015-before/'+path)!==value)throw Error('Baseline changed '+path);
for(const [path,value]of Object.entries(comparison.dependencies))if(sha(path)!==value)throw Error('Timing leaf changed '+path);
if(!auto.pass||auto.rows.length!==2||!autoSession.pass)throw Error('Current automatic-quality measurements missing');
for(const [path,value]of Object.entries(auto.sourceHashes))if(sha(path)!==value)throw Error('Final adaptive source changed '+path);
for(const [path,value]of Object.entries(auto.dependencies))if(sha(path)!==value)throw Error('Automatic-quality leaf changed '+path);
const f=value=>value.toFixed(2),labels={walking:'走動',sprint:'Shift 奔跑',guided:'導航中走動',equipment:'啞鈴臥推'},rows=comparison.rows;
const lowerMean=rows.filter(row=>row.after.meanMs<row.before.meanMs).length,lowerP95=rows.filter(row=>row.after.p95Ms<row.before.p95Ms-.25).length,worseP95=rows.filter(row=>row.after.p95Ms>row.before.p95Ms+.25).length;
const table=rows.map(row=>`| ${row.profile==='flow'?'流暢':'畫面細節'} | ${labels[row.scenario]} | ${f(row.before.meanMs)} → ${f(row.after.meanMs)} | ${f(row.before.p95Ms)} → ${f(row.after.p95Ms)} | ${f(row.before.over50Percent)} → ${f(row.after.over50Percent)} | ${f(row.beforeCallback.p95Ms)} → ${f(row.afterCallback.p95Ms)} |`).join('\n');
const autoTable=auto.rows.map(row=>`| ${labels[row.scenario]} | ${f(row.before.meanMs)} → ${f(row.after.meanMs)} | ${f(row.before.p95Ms)} → ${f(row.after.p95Ms)} | ${f(row.before.over50Percent)} → ${f(row.after.over50Percent)} | ${[...new Set(row.beforeProfiles.flat())].join('／')} → ${[...new Set(row.afterProfiles.flat())].join('／')} | ${row.beforeFramebuffers.join('／')} → ${row.afterFramebuffers.join('／')} |`).join('\n');
const before=pose.cpuTiming.filter(run=>run.which==='before').reduce((n,run)=>n+run.meanPoseMs,0)/2,after=pose.cpuTiming.filter(run=>run.which==='after').reduce((n,run)=>n+run.meanPoseMs,0)/2;
const leaf=read(comparison.reports[0]),gpu=leaf.results[0].setup.renderer;
const doc=`# 0.15 持續遊玩的效能比較

本輪先測同畫質候選，再調整自動畫質。相同畫質的八種情境中，${lowerMean} 種平均畫面間隔下降；以 p95 相差 0.25 ms 作為描述界線，${lowerP95} 種較低、${worseP95} 種較高，其餘接近。後續自動模式的兩個情境另列，不把降低負載的結果混成同畫質加速。全部數字如下，沒有刪掉較慢情境。這是單機短時間重複測量，不代表統計顯著性或其他顯示卡的保證。

## 最後版本的自動模式

以下比較 0.14 與最後 0.15，兩者都從「自動調整」開始，使用同起點、視角、原生 GPU 和真實按鍵路線。次序 before-1、after-1、after-2、before-2；每情境各兩次，暖機 3 秒、測量 12 秒。balanced 開陰影且 framebuffer 為 1280×800；flow 關陰影且為 1088×680。若量測中切換，也保留在表內，因此不能宣稱這張表是相同渲染預算。

| 情境 | 平均間隔 ms | p95 ms | 超過 50 ms % | 實際畫質層級 | 實際 framebuffer |
| --- | ---: | ---: | ---: | --- | --- |
${autoTable}

新判斷累積足夠樣本，確認持續慢幀後才降負載；偶發一次慢幀不會觸發。玩家動作、手腳接點與紅橘標色保留，遠處會員沿用既有流暢模式的細節與更新管理；解析度與陰影的取捨會在介面顯示。這張表排除最初載入與暖機，沒有聲稱第一次選擇畫質也沒有等待。[自動模式原始資料](../artifacts/performance-v015/auto/comparison.json)

## 相同畫質候選的實際遊玩

這一階段使用改動自動判斷前的 0.15 候選，來源逐檔封存於 .local-tools/v015-fixed-candidate/，原始數據沒有改標成最後版本重跑。後續只改自動判斷與提示；手動 flow／clear 的 renderer 呼叫、陰影排程、解析度及原有診斷值，在六組 DPR／設定、3,600 個輸入下完全相同。詳見[最後修訂與驗證範圍](adaptive-quality-v015.md)。

單位為 ms；超過 50 ms 為百分比，箭頭由 0.14 指向 0.15。數字越低通常越順，p95 描述較慢的尾端畫格。

| 畫質 | 情境 | 平均間隔 | p95 間隔 | 超過 50 ms % | 主程式回呼 p95 |
| --- | --- | ---: | ---: | ---: | ---: |
${table}

這些是遊戲實際 requestAnimationFrame 回呼的間隔，包含真實 W／S 往返、Shift 奔跑、導航及持續播放啞鈴臥推。沒有使用同步 world.update 或 gl.finish 時間冒充 FPS，也沒有把控制器加速比例直接換成遊戲 FPS。

## 測量條件

- 顯示環境：${gpu}。
- 固定視窗 1280 × 800、DPR 1。流暢 framebuffer 1088 × 680、陰影關閉；畫面細節 framebuffer 1280 × 800、陰影開啟。新版沒有調低固定畫質、移除人物、降低姿勢更新率或取消紅橘標色。
- 次序 before-1、after-1、after-2、before-2；每個版本每情境兩次，每次暖機 2 秒、量測 8 秒，每情境使用新的瀏覽器 context。正式資料合併兩次的逐幀樣本，不只挑最快一次。
- 載入、就位與手動快轉的初始化不列入穩態間隔。課程音樂靜音。CPU profiler、GL API 計數包裝及網頁手動效能檢測均關閉。
- 本專案的其他測試與代理工作在正式計時期間停止。作業系統、驅動與其他非本專案程式仍可能造成背景變動；沒有清空驅動或系統快取。
- 原生 headless Chromium 的 RAF 可能受合成器節奏限制，不等於每一張都確實呈現在螢幕，也不是獨立 GPU 執行時間。

## 減少的工作與畫面保留

人物解姿在同一次交易裡重用已同步的根矩陣和反矩陣，避免反覆向祖先查詢；原骨長、IK 迭代、子樹更新順序及手腳接點保留。${pose.poses} 個姿勢、${pose.skinVertices.toLocaleString('en-US')} 個抽查真皮點完全相同。單一姿勢祖先更新呼叫 506 → 4，矩陣乘法 865 → 441。

離線純姿勢 CPU 的 ABBA 平均為 ${f(before)} → ${f(after)} ms，約減少 ${f((before-after)/before*100)}%；這只代表控制器工作。資料見[矩陣等價](../artifacts/performance-v015/profile/pose-equivalence.json)與[說明](pose-matrix-cache-v015.md)。

無厚度、沒有自訂 shader 的透明 MeshBasic 平面改用一次雙面繪製，保留文字、顏色及雙面可見性。六組固定相機／兩種畫質的 before／after PNG 逐像素完全相同；這六個視角每幀少 46～67 個繪製呼叫。其他立體透明材質、彎曲面與肌群 shader 不套用這個規則。[逐像素證據](../artifacts/performance-v015/flat-planes/qualification.json)

團課 NPC 改讀輕量播放資訊，避免每人每幀為了時間與課種產生完整診斷陣列。姿勢更新頻率保留。肩推與杯式深蹲的節奏改編另由[808 姿勢資格檢查](retimed-path-v015.md)驗證，不能把有意的節奏變化宣稱為同時點動畫完全相同。

## 顯示卡覆蓋與尚待處理

本機只有 Intel UHD 630，NVIDIA、AMD 與 Apple Silicon 尚未取得實機結果。SwiftShader 只作一項軟體繪圖相容性抽查，不算另一張顯示卡，也不混入以上性能表。

遊戲的「操作說明 → 效能檢測」可記錄 20 秒真實遊玩並下載 JSON，方便在其他電腦沿用同畫質、視角與路線收集資料；見[硬體測試表與操作方式](hardware-test-matrix-v015.md)。本輪沒有宣稱所有視角、團課上布、所有硬體或所有長幀都已解決，也沒有重新量測載入完成時間。

原始資料：[八情境比較](../artifacts/performance-v015/comparison.json)、[四輪執行與來源](../artifacts/performance-v015/measurement-session.json)。0.13 的載入停頓結果保留為[歷史數字](performance-v013.md)，不混作這次持續遊玩改善。
`;
writeFileSync('docs/performance-v015.md',doc);console.log(JSON.stringify({pass:true,rows:rows.length,lowerMean,lowerP95,worseP95}));
