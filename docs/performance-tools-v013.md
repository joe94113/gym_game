# 0.13 效能測量工具

這份文件說明工具與重現方式，不是已測得的改善結果。正式數字必須等所有來源凍結、停止其他 GPU／重 CPU 工作後，由主流程實際執行並檢查原始資料。

## 八種穩定遊玩情境

工具沿用 0.12 的真正遊戲 RAF 量測，保留同畫面、同初始站位及相同鍵盤路線。1280×800、DPR 1；流暢模式 framebuffer 1088×680，細節模式 1280×800。每一輪測兩種固定畫質 × 走路、Shift 奔跑、導航走路、啞鈴臥推，共八種情境，每種正式八秒、另暖機兩秒。15 秒同步模擬只用來整理起始場景，不計入效能數字。

舊版伺服器用 `.local-tools/v013-before` 的 0.12 快照，在 5174 開啟；新版在 5173。只啟動一個瀏覽器測量流程，依下列順序執行：

```powershell
node scripts/benchmark-play-v013.mjs before-1 --hooks=off
node scripts/benchmark-play-v013.mjs after-1 --hooks=off
node scripts/benchmark-play-v013.mjs after-2 --hooks=off
node scripts/benchmark-play-v013.mjs before-2 --hooks=off
node scripts/compare-play-v013.mjs
```

每輪約 1.5～2 分鐘，實際依載入速度而定。原始輸出在 `artifacts/performance-v013/play`，合併比較在 `artifacts/performance-v013/comparison.json`。每個 RAF 間隔保留回呼耗時、活動階段、動作／進出相位與 framebuffer，另保存真正鍵盤事件、路線、畫質和 renderer。

比較器重算原始間隔的平均、第 95 百分位、超過 25／50 ms 比例，沒有預設新版會更快。正式比較要求四輪完整資料、同原生 renderer、固定畫質、相同初始位置／朝向及真正 W／S／Shift 事件。缺案例、來源漂移、軟體 renderer 或中途降低畫質都會拒絕產生通過結果。

`--root=...`、`--base-url=...`、`--output=...` 可另指定來源、伺服器與輸出位置。`--profiles`、`--scenarios`、`--seconds` 可用於小樣本偵錯，但正式比較器只接受完整 flow／clear × 四情境的八秒資料。

## 載入、準備、離場及房間回視野

補充工具預設每個版本兩輪，每輪五個情境：新分頁載入、由器材旁真正走近／上機、真正放回／離開、教室回視野、浴室回視野。

```powershell
node scripts/benchmark-transitions-v013.mjs before --quality=flow --repeats=2
node scripts/benchmark-transitions-v013.mjs after --quality=flow --repeats=2
node scripts/compare-transitions-v013.mjs --quality=flow
```

預設使用提踵機，準備與離場皆由真正 RAF 自行推進，沒有用 `advanceUntilReady` 或同步模擬取代遊玩。可用 `--exercise=dumbbell-bench-press --station=dumbbell-curl` 換成啞鈴臥推；兩版必須使用相同選擇。每個版本預估約 2～4 分鐘，房間冷卻與準備路徑長度會影響總時間。

若要交錯順序，每次執行 `--repeats=1`，依 before-1／after-1／after-2／before-2 排序，最後明確列出四份報告：

```powershell
node scripts/compare-transitions-v013.mjs --quality=flow --reports=artifacts/performance-v013/transitions/before-1-flow.json,artifacts/performance-v013/transitions/after-1-flow.json,artifacts/performance-v013/transitions/after-2-flow.json,artifacts/performance-v013/transitions/before-2-flow.json
```

兩版各情境至少需要兩份樣本，比較器才會通過。單輪可先驗證腳本是否適合當前場景，不能當成完整前後結論。`--seconds=4` 是載入後遊戲畫面及房間回視野的觀察窗；準備／離場則等真正進到使用中／閒置，再多觀察半秒。所有操作有逾時，不能把沒有完成的動作靜默跳過。

- 載入使用新瀏覽器 context 並以 CDP 停用 HTTP cache，保存 navigation／resource 時間、傳輸大小、觀察到 app ready 及第一個遊戲 RAF 的時間。OS／伺服器檔案快取與瀏覽器／驅動 shader cache 未控制，不能稱為冷開機測試。
- 遊戲 RAF 在 app 迴圈開始前不存在。載入總時間與之後的 RAF 間隔分開列出，不能把等待模型下載的時間算成遊戲 FPS。app ready 在第一個遊戲 RAF 觀察，約有一畫格的觀察粒度。
- 準備與離場保存每個階段／相位及完整時長。新版可能刻意加長合理的拿放流程，不能僅因為總秒數增加，就判定渲染效能退步；畫格間隔另行比較。
- 房間先真正進入視野，再以真實滑鼠拖曳轉離，等待休眠與 GPU 釋放要求。測量時以同一組滑鼠轉向回去，恢復由下一個真正遊戲 RAF 觸發，沒有用 `inspectView` 的同步繪製把第一個回視野畫格提前消耗掉。
- 房間資料記錄的是 dispose 要求與回視野狀態，沒有宣稱量到實際 GL 刪除數或傳輸 bytes。這是固定相機回視野測試，沒有涵蓋每條走進房間的路徑。

來源 SHA 包含 `src`、伺服器程式、所有 `public` 素材、入口與套件設定；伺服器的私人帳號資料不放進報告。所有原始間隔都保留，包含跨過結束界線的最後長幀；沒有使用 `gl.finish()`，也不把 RAF Hz 說成螢幕實際呈現的 FPS。

語法與純統計／畫質拒絕條件可先檢查：

```powershell
node --check scripts/benchmark-play-v013.mjs
node --check scripts/benchmark-transitions-v013.mjs
node --test tests/performance-tools-v013.test.mjs
```
