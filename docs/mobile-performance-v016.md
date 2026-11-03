# 0.16 手機效能比較

2026-10-29，以 Intel UHD Graphics 630 原生 D3D11、Chromium 手機模擬測得；每版兩輪，完整 ABBA，走動與臥推各八秒。

| 情境 | 平均幀間隔：舊 → 新 | p95：舊 → 新 | 超過 25ms 比例：舊 → 新 |
| --- | --- | --- | --- |
| 走動 | 13.34 → 13.34 ms | 13.40 → 13.40 ms | 0.00% → 0.00% |
| 啞鈴臥推 | 15.44 → 13.35 ms | 26.70 → 13.40 ms | 9.34% → 0.08% |

走動兩版都接近這次測試環境的更新節奏，沒有可觀察的幀間隔改善；臥推的慢幀減少。遊戲回呼平均耗時另由走動 6.46 → 4.54ms、臥推 10.93 → 6.93ms，這包含更新與提交繪製指令，不能當作 GPU 時間。

新版兩輪都以 390 × 844、關閉陰影及 MSAA 執行；舊版走動為 487 × 1055 且有陰影，臥推一輪自動降至 331 × 717／無陰影，另一輪仍為 487 × 1055／有陰影，兩輪均開啟 MSAA。這是各版預設自動畫質的體驗比較，包含畫面取捨，沒有宣稱同畫質純加速。沒有實體手機、Safari、長時間發熱或耗電測量。

[完整比較 JSON](../artifacts/mobile-v016/performance-final/comparison.json)保留所有原始輪次與畫質；測試範圍見[手機矩陣](mobile-test-matrix-v016.md)。

## 重跑方式

手機渲染比較以桌機上的 Chromium 模擬手機執行：390 × 844 CSS 像素、DPR 3、`isMobile`、`hasTouch`，並驗證 coarse pointer、無 hover 與觸控點數。開發機使用 Intel 桌機顯示晶片；報告會留下實際 WebGL renderer。這不是手機實機的 FPS、發熱、耗電或觸控延遲測試。

先將程式與測試工具固定，另外啟動兩個開發伺服器：`.local-tools/v016-before` 對應 `http://127.0.0.1:5174`，目前版本對應 `http://127.0.0.1:5173`。再執行：

```powershell
node scripts/benchmark-mobile-v016.mjs
```

同一個入口循序執行 before-1、after-1、after-2、before-2，每版兩次。每次走動與啞鈴臥推各開全新瀏覽器 context，兩秒真實 RAF 暖機後，以第一個遊戲 RAF 時間戳作起點，各記錄八秒；可用 `--seconds=10` 改成十秒。兩版都使用實際 W、S 鍵往返移動，因為舊版沒有手機觸控介面；這段比較的是相同路線的渲染與遊戲更新。相機視角、起點、音量設定與量測前的十五秒模擬準備一致。準備與暖機不計入結果。

輸出在 `artifacts/mobile-v016/performance`：四份原始報告、`measurement-session.json` 與 `comparison.json`。每個 frame 保留時間戳、間隔、回呼耗時、動作階段及實際 framebuffer；另外每秒四次記錄畫質、角色位置與陰影設定。量測使用遊戲原生 RAF 間隔，保留跨越截止時間的最後一個 frame；按鍵在量測先備妥後才開始傳送，保留相對於相同起點的事件時間；第一筆 interval 銜接暖機的前一幀。初輪以 performance.now 作起點，遇到首筆名義 RAF 時間戳較早而被驗證器停止，原始資料保留在 `artifacts/mobile-v016/performance`，修正後完整重跑另存 `artifacts/mobile-v016/performance-final`。不包裝 WebGL API，也不把同步 `world.update` 計時稱作 FPS。

新版手機自動畫質會從較低的像素預算、關閉陰影與關閉 MSAA 開始。舊版與新版的預設品質不同，報告會分別記錄啟動預設值、實際 pixel ratio、像素數、pixel budget、陰影、WebGL context 的 antialias／powerPreference 與量測中的自動降級。評估流暢度時要一起看這些畫質取捨。`powerPreference` 是瀏覽器提示，不代表實際功耗。

需要重算時執行 `node scripts/compare-mobile-v016.mjs artifacts/mobile-v016/performance-final`。比較工具會從 raw frames 重算統計，檢查完整 ABBA 順序、原生 renderer、手機能力、行走輸入、器材動作、來源與 harness 的前後雜湊。來源已變更、報告不完整或統計被修改時會拒絕比較。v015 封存資料不會被修改。

純 CPU 檢查：`node --test tests/mobile-performance-tools-v016.test.mjs`。測試中的數字是驗證器的合成資料，不會寫入效能結果。真正手機仍需要後續實機測試。
