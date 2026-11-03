# 啞鈴入位與歸位修正：0.10

這次處理原本拿鈴、轉握、搬運、入座與放回時的偏腕。器材位置、八種啞鈴訓練循環、0°／30°椅背設定與紅橘肌肉標色保留。這份文件記錄 CPU 驗證；網頁操作與畫面驗收由主程序另行記錄，真人教練尚未簽核。

## 實際改動

- 架上先調整掌向並握穩，再把啞鈴提離架面。啞鈴仍在架上時，握桿維持原方向。
- 離架後，獨立啞鈴的實體握桿隨前臂轉向；手掌、握桿、槓片與碰撞形狀一起更新。沒有把同樣設定套在雙手共握的直桿上。
- 身側轉握的啞鈴位置略微收回並放低，肘部採一致的外側路徑，避免先向前抬肘、再突然把肘拉回。
- 坐下時把手肘帶回身體後側。鈴身保持直立，原本的大腿接觸只保留在支撐階段，後躺時即撤除該接觸例外。
- 最後重握改成插值固定長度的上臂、前臂與掌心框架，讓實體啞鈴跟著手走。這段不再逐幀推算肘位，解決 curl 與 RDL 在循環前的肘部尖峰。
- 修掉原本 curl／側平舉在「準備完成」端點的肘部跳接。最後姿態仍精確接回既有訓練循環。

程式範圍只有 [dumbbell-lifecycle-paths.js](../src/dumbbell-lifecycle-paths.js)、[dumbbell-grip.js](../src/dumbbell-grip.js)、[rig-lifecycle.js](../src/rig-lifecycle.js) 與新增的 [free-dumbbell-shaft.js](../src/free-dumbbell-shaft.js)。人體模型、骨架長度、通用手腳求解器與原有動作循環未修改。

## 腕角前後比較

量測使用正式 GLB 手骨的前進方向與實際肘到腕骨的方向。下表是「閉握／持有的手」完整循環、入位與離位的最大總偏折角。修前每模式 301 點，修後增加到 1001 點，另補階段界線；不是只比較挑出的好看姿態。

| 動作／設定 | 修前最大腕角 | 修後最大腕角 | 修後最大值所在處 |
| --- | ---: | ---: | --- |
| 啞鈴彎舉 | 49.56° | 26.45° | 原訓練循環 |
| 平板啞鈴臥推 0° | 49.56° | 16.37° | 架上提鈴 |
| 上斜啞鈴臥推 30° | 49.56° | 16.37° | 架上提鈴 |
| 槌式彎舉 | 49.56° | 16.37° | 架上提鈴 |
| 啞鈴肩推 | 49.56° | 16.37° | 架上提鈴 |
| 啞鈴側平舉 | 49.56° | 25.47° | 原訓練循環 |
| 單手啞鈴划船 | 49.56° | 16.37° | 架上提鈴 |
| 啞鈴羅馬尼亞硬舉 | 49.56° | 16.37° | 架上提鈴 |
| 杯式深蹲 | 42.08° | 42.08° | 原本的托鈴握法，整段保留 |

兩種椅背角度的入座峰值由約 32.10° 降至 6.00°。修後後躺階段峰值約 10.01°。原本的身側轉握不再出現 49.56° 偏折。

肩、肘沒有靠改骨長來配合握把。[腕角報告](../artifacts/v010-dumbbell-wrists-after.json) 同時保留每階段的抬臂角、肘屈曲角與真實骨長。部分準備路徑的抬臂角也有改變，例如 curl／槌式由約 42.98° 增至 53.76°；這是肘位重排的結果，仍須真人檢查。腕角不含前臂旋前／旋後，也不代表關節受力或臨床安全判定。

修前資料另存於 [v010-dumbbell-wrists-before.json](../artifacts/v010-dumbbell-wrists-before.json) 與 [原始逐姿態指紋](../artifacts/v010-dumbbell-fingerprint-before.json)。v0.9 及更早的報告沒有覆寫。

## 碰撞、閉握與連續性

| 檢查 | 範圍與結果 |
| --- | --- |
| 全身、器材與鞋底 | 八動作加 30°設定共 8407 姿態。每模式 301 點加階段接縫；器材／自身／皮面／鞋底違規皆為 0。 |
| 啞鈴金屬 | 手部 stride 1 皮點對實體握桿、套環、槓片最大穿入 0.64469 mm，低於原有 1 mm 門檻。非手部 stride 24 皮點對鈴金屬最大穿入 0。 |
| 單手閉握包覆 | 7982 姿態、10680 個閉握單手樣本，每手至少 1811 個皮點。各自對實際 16 mm 握桿檢查；包覆、3 mm 內接觸與 1 mm 穿入門檻全部通過。 |
| 連續性 | 37414 個真 GLB 姿態，每入位／離位 2001 點加界線前後 0.1 ms。掌心誤差最大約 8.79e−8 m，骨長誤差最大約 2.03e−7 m。 |
| 接縫 | 階段界線最大關節位移 0.0743 mm，角差約 0.000225°；起終點最大位移約 4.14e−8 m。準備完成與循環起點的關節差為 0。 |
| 腳底 | 密集連續性量測的站立腳／整體 reach 最大約 5.385 mm，出現在步行；沿用原 15 mm 檢查門檻，鞋底穿地檢查另行通過。 |

初版修正曾在最後重握出現 curl 肘峰 8.169 m/s、RDL 3.941 m/s。改成真正的骨架插值後，該階段分別降為 0.0398、0.0356 m/s。全程較大的肘速多出現在步行，約 1.11 m/s；單手划船前伸支撐約 1.45 m/s。這些是動畫連續性量測，沒有當作人體安全限值。

證據：

- [八動作碰撞](../artifacts/v010-dumbbell-qualification-flat-final.json)、[30°碰撞](../artifacts/v010-dumbbell-qualification-incline-final.json)
- [單手閉握包覆](../artifacts/v010-dumbbell-grip-closure.json)
- [修前連續性](../artifacts/v010-dumbbell-continuity-before.json)、[修前端點補測](../artifacts/v010-dumbbell-continuity-before-endpoints.json)、[最終連續性](../artifacts/v010-dumbbell-continuity-after.json)

各正式報告都記錄來源 SHA，並在執行結束再次確認來源未變。數值驗證依碰撞形狀與有限皮點取樣，沒有宣稱逐三角、逐指關節或整段連續時間完全無碰撞。單手凸包包覆也不是逐指抓握／受力模型。

[總驗證報告](../artifacts/v010-dumbbell-validation-summary.json) 彙整正式證據的 SHA、前後腕角、碰撞與閉握數量，並重新核對每份報告的來源仍與目前程式一致。

## 原功能保留與回歸測試

[全 22 預設流程指紋](../artifacts/v010-rig-change-scope.json) 共比較 6666 姿態。5252 個受保護姿態完全一致，包含全部原訓練循環、其他 14 個入離位流程，以及杯式深蹲全流程；只有七個握桿式啞鈴的入離位出現預期差異。

[啞鈴循環另行比較](../artifacts/v010-dumbbell-loop-preservation.json) 使用修前同一批 2709 姿態，包含 0°與 30°，姿態、GLB 接點、實體器材變換及碰撞形狀的差異為 0。動作 ID、名稱與圖示沒有改。

[新增四項 Node 測試](../tests/dumbbell-wrist-v010.test.mjs) 驗證真 GLB 閉握與實體軸線、兩種椅角的入座接觸、端點與循環銜接，以及 240 Hz 抽驗最後重握的肘速。原設備設定五項測試一併通過。

```powershell
node --test tests/dumbbell-wrist-v010.test.mjs tests/equipment-settings.test.mjs
node scripts/fingerprint-rig-v010.mjs compare
node scripts/qualify-dumbbell-loop-preservation-v010.mjs
$env:WRIST_PHASE_COUNT='1001'
node scripts/measure-dumbbell-wrists-v010.mjs after
node scripts/measure-dumbbell-continuity-v010.mjs after --frozen
node scripts/qualify-dumbbell-grip-closure-v010.mjs
```

完整碰撞可分兩次跑，輸出只使用 v010 檔名：

```powershell
$env:DB_PHASE_COUNT='301'
$env:DB_BENCH_ANGLE='0'
$env:DB_REPORT_LABEL='flat-final'
node scripts/qualify-dumbbell-ergonomics-v010.mjs
$env:DB_BENCH_ANGLE='30'
$env:DB_REPORT_LABEL='incline-final'
node scripts/qualify-dumbbell-ergonomics-v010.mjs dumbbell-bench-press
```

## 仍待真人審核

主流程另完成[正式網頁擷取](../artifacts/dumbbell-wrist-review-v010/after-capture.json)及[實際看圖紀錄](../artifacts/dumbbell-wrist-review-v010/visual-review.json)：八個動作加 30°，各有入／離位四個關鍵點的前、側、背面，共 216 個圖格及 18 張握持近景，另保留四張修前對照。鋼架及槓片遮住的表面不以圖片推定通過；孤立場景沒有地板，鞋底支撐以正式數值報告核對。靜態圖格不能單獨證明整段節奏與自然度。

杯式支撐的 42.08°、原 curl／側平舉循環的 26.45°／25.47°保持原樣，尚未經教練判定。動畫仍使用校正過的骨架路徑，沒有新增真人動捕、肌肉受力或完整關節限制模型。需要從前、側、後方慢放確認整段動作、握法、肩胛與負重節奏；主程序的畫面檢查也不能代替真人簽核。

真人教練姓名：＿＿＿＿　資格：＿＿＿＿　日期：＿＿＿＿　結論：＿＿＿＿
