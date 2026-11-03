# 啞鈴臥推椅 0–45°：0.11

臥推椅可設定 0–45°，每次 1°。這次沒有新增動作 ID；角度仍屬於同一個啞鈴臥推設定。原本 0°與 30°的訓練循環保留，拿鈴、入座、後躺、放回沿用 0.10 的握腕與固定骨長校正。紅橘肌肉標色不變。

## 設定介面

```js
rig.getEquipmentOptions('dumbbell-bench-press')
// benchAngleRange: { min: 0, max: 45, step: 1 }
// benchAngles: [{value: 0, label: '平躺 0°'}, …, {value: 45, label: '上斜 45°'}]

rig.getEquipmentSettings('dumbbell-bench-press')
// { benchAngle: 0 }

rig.setEquipmentSettings('dumbbell-bench-press', { benchAngle: 17 })
// idle: { ok: true, changed: true, settings: { benchAngle: 17 } }
// prepared/holding: { ok: false, reason: 'busy', settings: previous }
```

只接受整數 0–45；小數、字串、負數與 46°以上會被拒絕。每次取得的選項都是獨立資料，外部改寫不會擴大可用角度。設定相同角度屬於無變更。正在握持時不會瞬移器材；網頁由主程序處理預覽與套用，先放回、離開，再調椅與重新就位。

## 實際幾何與動作

- 椅背實體、碰撞形狀、上身與握持框架使用同一角度。腳底保留地板目標，由原固定骨長求解器處理。
- 低傾角若直接使用原 30°座墊，會與下背的軀幹碰撞形狀重疊。新設定讓固定尺寸座墊的後端下降，前端仍貼近大腿；可見座墊與碰撞形狀一起傾斜、升降。30°以上使用原座墊幾何。
- 入座時啞鈴保持直立，沿用大腿支撐階段；後躺與最後重握沿用原自然握桿及骨架插值，不會回到舊 49.56°偏腕的路徑。
- 修正 0°原本在圓角前緣入座時約 30.72 mm 的懸空：髖部降低 30 mm、持鈴高度一起調整。實體圓角墊射線檢查的支撐間隙降至約 3.39 mm。這是必要的入離位修正，原 0°訓練循環沒有改。
- 角度以有限的 46 個整數設定建立並重用器材，不會為相同角度重複新增啞鈴架。換角度會隱藏上一個器材根節點。

程式只修改 [incline-bench.js](../src/incline-bench.js)、[equipment-options.js](../src/equipment-options.js) 與 [dumbbell-lifecycle-paths.js](../src/dumbbell-lifecycle-paths.js) 的必要入座段。沒有修改通用骨架求解器、原訓練循環或肌肉標色。

## 驗證範圍

| 證據 | 取樣與檢查 |
| --- | --- |
| [全部角度](../artifacts/v011-bench-angles-all-final.json) | 46 個整數角，各循環／入位／離位 101 點，加雙向階段界線與起終點。真 GLB 接點、固定骨長、全身／自身／皮面、鞋底、實體握桿／套環／鈴片及單手閉握。 |
| [邊界與較差樣本加密](../artifacts/v011-bench-angles-edges-final.json) | 0、1、3、29、30、31、44、45°各模式 301 點。3°是初掃金屬間隙較小的角度；其餘涵蓋起終角及座墊過渡。 |
| [椅背與入座支撐](../artifacts/v011-bench-support-all-final.json) | 每角 101 個循環相位，torso／head／pelvis 的 stride 1 皮點對椅背支撐面；入座另對真正圓角座墊三角面做射線量測。 |
| [座墊接觸獨立檢查](../artifacts/v011-bench-seat-contact-all-final.json) | 每角 3 個循環相位與入座，共 184 次。直接量骨盆、大腿皮點與圓角墊的距離及壓入，避免接觸例外掩蓋問題。循環的背部支撐由上一份報告獨立驗證。 |
| [鈴片靠腿獨立檢查](../artifacts/v011-bench-thigh-contact.json) | 每角入座階段，所有大腿皮點對真實鈴片圓柱，另記底面間隙。 |
| [密集連續性](../artifacts/v011-bench-continuity-after.json) | 每角入位／離位各 1001 點，補階段前後 0.1 ms 與起終點。檢查掌心／鞋底、骨長、肘位、掌框、實體器材位移與角速度、持有權交接及孤立跳點。 |
| [保留結果](../artifacts/v011-bench-preservation.json) | 封存模型與程式另量 2046 姿態；1324 個受保護姿態完全相同，包含 0°循環及 30°完整流程。只有 106 個 0°入離位姿態有預期修正。 |

[總驗證報告](../artifacts/v011-bench-validation-summary.json) 會核對每份正式資料的來源 SHA 仍等於目前程式，再彙整數量與最差值。修前來源是 `.local-tools/v011-before`，原有 v0.9／0.10 證據沒有覆寫。修前入座間隙可查 [支撐參考](../artifacts/v011-bench-support-before.json)，該檔明確標為量測參考，沒有把原 0°懸空說成合格支撐。

正式 CPU 結果全部通過，來源 SHA 無變動：全角與加密合計 26022 次姿態檢查、40028 次閉握單手檢查；背墊另檢查 4646 個相位、85438425 次皮點；密集連續性共 101660 姿態。最大持握腕角 16.37°、掌心誤差約 7.40e−8 m、骨長誤差約 1.78e−7 m。步行時站立腳接點最大偏差約 5.39 mm，仍符合原檢查門檻。

13 項相關 Node 測試通過，包含逐角可見墊／碰撞墊一致、拒絕握持中調椅、角度快取，以及直接對圓角墊驗證 0°入座支撐的回歸測試。

主要檢查門檻沿用原值：手部金屬皮點 1 mm、非手部金屬皮點 4 mm、接縫位置 1 mm。入座以真圓角墊 6 mm 內接觸檢查；這次沒有增加身體接觸例外來迴避低角度座墊碰撞。

## 接觸容差與限制

0°新入座時，啞鈴放在大腿上，最外側衣物皮點有約 2.04 mm 鈴片接觸壓入，符合原有 4 mm 非手金屬容差。[專用全皮點報告](../artifacts/v011-bench-thigh-contact.json) 已明列。全流程 stride 24 身體檢查的 0，不能解讀成所有皮點都完全沒有穿入；手部的 1 mm 門檻仍獨立檢查。

椅背接近頭背的表面間隙約 4.26–4.80 mm。骨盆後表面並非每點都貼墊，模型的軀幹與大腿分別提供可見支撐；這裡沒有壓力、摩擦、重心或真實負重模擬。圓角墊射線也只測有限皮點與相位，沒有保證每一組三角面在連續時間都不相交。

這是可調角度的遊戲動畫與接點校正，沒有新增真人動捕、關節受力分析或教練簽核。新角度仍應從正面、側面與背面慢放看完整行程；網頁操作與實際畫面由主程序另行驗收。

真人教練姓名：＿＿＿＿　資格：＿＿＿＿　日期：＿＿＿＿　結論：＿＿＿＿

## 重跑方式

```powershell
node --test tests/bench-angle-range-v011.test.mjs tests/equipment-settings.test.mjs tests/dumbbell-wrist-v010.test.mjs
node scripts/fingerprint-bench-v011.mjs compare

$env:DB_PHASE_COUNT='101'
Remove-Item Env:BENCH_ANGLES -ErrorAction SilentlyContinue
$env:DB_REPORT_LABEL='all-final'
node scripts/qualify-bench-angles-v011.mjs

$env:DB_PHASE_COUNT='301'
$env:BENCH_ANGLES='0,1,3,29,30,31,44,45'
$env:DB_REPORT_LABEL='edges-final'
node scripts/qualify-bench-angles-v011.mjs

Remove-Item Env:BENCH_ANGLES -ErrorAction SilentlyContinue
$env:BENCH_SUPPORT_PHASES='101'
$env:DB_REPORT_LABEL='all-final'
node scripts/qualify-bench-support-v011.mjs
node scripts/qualify-bench-seat-contact-v011.mjs
node scripts/measure-bench-thigh-contact-v011.mjs

$env:CONTINUITY_PHASE_COUNT='1001'
node scripts/measure-bench-continuity-v011.mjs after --frozen
node scripts/summarize-bench-v011.mjs
```
