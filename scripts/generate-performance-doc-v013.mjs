import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {frameStatistics} from './perf-stats-v013.mjs';
const read=path=>JSON.parse(readFileSync(path,'utf8')),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),f=(value,digits=2)=>{if(!Number.isFinite(value))throw Error('Missing actual measurement.');return value.toFixed(digits);};
const playPath='artifacts/performance-v013/comparison.json',transitionPath='artifacts/performance-v013/transitions-comparison-flow.json',play=read(playPath),transitions=read(transitionPath);
for(const proof of [play,transitions]){
 if(proof.pass!==true)throw Error('Only validated measured comparisons can be published.');
 for(const [path,value]of Object.entries(proof.sourceHashes||{}))if(sha(path)!==value)throw Error('Current measurement source changed '+path);
 for(const [path,value]of Object.entries(proof.baselineSourceHashes||{}))if(sha('.local-tools/v013-before/'+path)!==value)throw Error('Baseline measurement source changed '+path);
 for(const [path,value]of Object.entries(proof.dependencies||{}))if(sha(path)!==value)throw Error('Measurement leaf changed '+path);
}
if(play.rows.length!==8||transitions.rows.length!==5)throw Error('Full comparison coverage is required.');
const names={walking:'走動',sprint:'Shift 奔跑',guided:'導航中走動',equipment:'啞鈴臥推',load:'載入後首段',mount:'上機',exit:'放回與離開','classroom-wake':'教室返回','bathroom-wake':'浴室返回'},profiles={flow:'流暢',clear:'清晰'},pair=(row,key)=>`${f(row.before[key])} → ${f(row.after[key])}`;
const mainRows=play.rows.map(row=>`| ${profiles[row.profile]} | ${names[row.scenario]} | ${pair(row,'meanMs')} | ${pair(row,'p95Ms')} | ${pair(row,'over50Percent')} | ${f(row.beforeCallback.p95Ms)} → ${f(row.afterCallback.p95Ms)} |`).join('\n');
const transitionRows=transitions.rows.map(row=>`| ${names[row.scenario]} | ${pair(row,'meanMs')} | ${pair(row,'p95Ms')} | ${pair(row,'over50Percent')} |`).join('\n');
const duration=(row,key,version)=>row[version+'Duration'][key].map(value=>f(value/1000)).join('／');
const load=transitions.rows.find(row=>row.scenario==='load'),mount=transitions.rows.find(row=>row.scenario==='mount'),exit=transitions.rows.find(row=>row.scenario==='exit');
const loadPeaks={before:[],after:[]};for(const path of transitions.reports){const leaf=read(path),sample=leaf.results.find(result=>result.scenario==='load');loadPeaks[leaf.name.startsWith('before')?'before':'after'].push(Math.max(...sample.raw.frames.map(frame=>frame.intervalMs)));}
const navPath='artifacts/performance-v013/nav-probe/comparison.json';let navSection='';
if(existsSync(navPath)){const nav=read(navPath);if(nav.pass!==true||nav.adopted!==false||nav.rows?.length!==9)throw Error('Invalid diagnostic observation.');for(const [path,value]of Object.entries({...nav.sourceHashes,...nav.dependencies}))if(sha(path)!==value)throw Error('Diagnostic source or leaf changed '+path);const labels={current:'原介面',visible:'移除頁首裁切',shared:'共用背景模糊'};navSection=`## 介面合成的額外診斷\n\n九次診斷使用同版遊戲、相同流暢畫質與路線，暫時注入 CSS；每次都核對按鈕位置與尺寸不變。這些樣本不取代前述四輪版本比較，也沒有套用任何試驗樣式。\n\n| 次序 | 樣式 | 平均間隔 ms | p95 ms | 超過25 ms % |\n| --- | --- | ---: | ---: | ---: |\n${nav.rows.map((row,index)=>`| ${index+1} | ${labels[row.mode]} | ${f(row.cadence.meanMs)} | ${f(row.cadence.p95Ms)} | ${f(row.cadence.over25Percent)} |`).join('\n')}\n\n原樣式本身的 p95 在13.5～26.6 ms之間變動；反向順序的對照未穩定分離樣式差異，因此保留原介面。這提醒我們，兩次短取樣的差異不能全部歸因於單一程式修改。[完整診斷](../${navPath})\n\n`;}
const approximatelyEqual=play.rows.filter(row=>Math.abs(row.before.p95Ms-row.after.p95Ms)<=.25).length,faster=play.rows.filter(row=>row.before.p95Ms-row.after.p95Ms>.25).length,slower=8-approximatelyEqual-faster;
const aerial=[];
for(const [label,path]of [['上布過渡','artifacts/performance-v013/aerial/after-aerial-mount-off.json'],['倒掛支撐','artifacts/performance-v013/aerial/after-aerial-inversion-off.json']])if(existsSync(path)){
 const proof=read(path);if(!proof.pass||proof.classId!=='class-aerial'||proof.hooks!=='off'||proof.changedSources.length||proof.changedValidators.length||proof.results.length!==1)throw Error('Invalid aerial measurement '+path);
 for(const [source,value]of Object.entries({...proof.sourceHashes,...proof.validatorSourceHashes}))if(sha(source)!==value)throw Error('Aerial measurement source changed '+source);
 const result=proof.results[0],actual=frameStatistics(result.raw.frames.map(frame=>frame.intervalMs));for(const key of Object.keys(actual))if(Math.abs(actual[key]-result.cadence[key])>1e-7)throw Error('Aerial raw statistics mismatch');
 aerial.push(`| ${label} | ${f(actual.meanMs)} | ${f(actual.p95Ms)} | ${f(actual.over50Percent)} | [原始資料](../${path}) |`);
}
const text=`# 0.13 實際遊玩與轉場效能

本表比較本機 Vite 開發伺服器上的 0.12 封存版本與目前 0.13。幀間隔取自遊戲實際 requestAnimationFrame 回呼；載入與流程完成時間另列。沒有把同步呼叫 world.update() 或 gl.finish() 的時間當成 FPS。原始逐幀資料、按鍵與階段紀錄都保留，結果較慢的情境也列出。

本次確認的改善在載入初段：兩次舊版記錄到的最長間隔為${loadPeaks.before.map(value=>f(value)).join('／')} ms，新版為${loadPeaks.after.map(value=>f(value)).join('／')} ms。連續遊玩沒有證明全面加速，部分情境較慢；後文保留所有數字。

## 量測方式

- 顯示晶片：${play.rows[0].settings.renderer}。
- 視窗固定 1280 × 800、DPR 1。流暢模式實際 framebuffer 為 1088 × 680、關閉陰影；清晰模式為 1280 × 800、保留陰影。沒有為了測得較快而降低新版本的固定畫質。
- 四輪依序為 before-1、after-1、after-2、before-2。每個版本每個遊玩情境各測兩次，每次先暖機 2 秒，再保留 8 秒實際遊戲 RAF；走動使用真 W／S 按鍵，奔跑另按住 Shift。
- 測量期間沒有同時執行本專案其他測試或看圖瀏覽器。原生 Chromium 使用 D3D11；軟體繪圖驗證另外執行。
- 初始載入、上下機與教室／浴室返回另量，每個版本每種轉場各兩次。新瀏覽器 HTTP cache 受到控制，但作業系統與顯示驅動快取沒有清空。

## 連續遊玩

單位：幀間隔與回呼時間為 ms，長幀比例為 %；箭頭前為舊版，後為新版。p95 為第 95 百分位，數字越低越好。回呼時間包含遊戲主程式與繪圖提交，不是獨立 GPU 執行時間。

| 畫質 | 情境 | 平均間隔 | p95 間隔 | 超過 50 ms | 主程式回呼 p95 |
| --- | --- | ---: | ---: | ---: | ---: |
${mainRows}

以 p95 相差 0.25 ms 作為描述「接近」的界線，八種情境中 ${faster} 種較低、${slower} 種較高、${approximatelyEqual} 種接近。這是單機取樣的描述，沒有把這個界線當成統計顯著性或通用效能保證。

## 載入與轉場

以下固定使用流暢畫質。上下機包含實際走近、可能的會員交接、準備與歸還；人物動作變長時，完成所需秒數與每幀是否卡頓要分開看。

| 情境 | 平均間隔 ms | p95 間隔 ms | 超過 50 ms % |
| --- | ---: | ---: | ---: |
${transitionRows}

兩次觀察到的完成時間（秒）：

| 項目 | 舊版兩次 | 新版兩次 |
| --- | ---: | ---: |
| 導航開始至 ready 旗標首次出現的 RAF 時間戳 | ${duration(load,'appReadyObservedMs','before')} | ${duration(load,'appReadyObservedMs','after')} |
| 上機完成 | ${duration(mount,'completionMs','before')} | ${duration(mount,'completionMs','after')} |
| 放回與離場完成 | ${duration(exit,'completionMs','before')} | ${duration(exit,'completionMs','after')} |

初始載入前沒有遊戲 RAF，表中的載入幀間隔只描述開始回呼後的畫面。ready 時刻採回呼開始時間戳，不是回呼完成或螢幕實際呈現時刻；新版把編譯移到載入中，該時刻可能變晚，但第一輪卡住的長間隔明顯縮短。器材準備更完整而增加的秒數，不能直接算作渲染退步。

${aerial.length?`## 新增吊布動作的目前負載

以下只有目前版本，不與舊版的地面吊布動作宣稱等負載比較。教練與學員跟隨玩家課程，固定流暢畫質，實際播放 8 秒；上布段會持續改變身體與布面，倒掛段以支撐維持為主。

| 目前情境 | 平均間隔 ms | p95 間隔 ms | 超過 50 ms % | 資料 |
| --- | ---: | ---: | ---: | --- |
${aerial.join('\n')}

`:''}${navSection}## 範圍與原始資料

本輪使用 A* 穩定優先佇列減少導航搜尋的重複排序、在載入時預先準備 shader，並以重設遊戲首幀時鐘避免把載入等待當成模擬追趕。插銷配重片使用 InstancedMesh；角色、原骨長、接點與紅橘標色保留。這些修改的影響以實測為準，不把程式改動數量當成改善比例。

這是此電腦、此版 Chromium 和指定路線的觀察。RAF 回呼頻率不等於每一張都確實呈現在螢幕，也不保證其他顯示卡達到同樣 FPS。其他程式、視角、瀏覽器與驅動仍可能影響偶發長幀。

完整八情境：[comparison.json](../${playPath})。完整五種轉場：[transitions-comparison-flow.json](../${transitionPath})。來源、測試與看圖：[0.13 驗證摘要](../artifacts/verification-summary-v0.13.json)。
`;
writeFileSync('docs/performance-v013.md',text);console.log(JSON.stringify({file:'docs/performance-v013.md',playRows:8,transitionRows:5,aerialRows:aerial.length,p95Lower:faster,p95Higher:slower,p95Close:approximatelyEqual}));
