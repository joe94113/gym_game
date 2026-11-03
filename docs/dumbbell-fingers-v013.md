# 0.13 啞鈴包握與放手

七個握桿動作改用逐指校正的握法：啞鈴彎舉、臥推、槌式彎舉、肩推、側平舉、單手划船及羅馬尼亞硬舉。末節會跟著收合，左右拇指朝相反方向對掌。杯式深蹲維持雙掌托住上方槓片；單手划船的另一手仍扶在椅墊上。

實體握桿直徑維持 32 mm。握緊時，掌心接點相對桿中心的法線偏移由 −30 mm 漸移至 −16 mm，前進方向偏移由 −15 mm 漸移至 −10 mm；放手時沿同一路徑退回。自然手腕求解、自由持鈴及最後就位的握桿反推使用同一組偏移，避免掌心和實際器材採用不同接點。架上先握緊再提鈴，放回架上後才張手離開。

模型、骨長及肌肉紅橘標色保留。沒有加入逐指骨軸覆寫或改動共用蒙皮控制器；`src/skinned-character.js` 與封存的 0.12 來源 SHA 完全相同。變更集中在 [啞鈴接點校正](../src/dumbbell-grip.js)、[持鈴手腕求解](../src/free-dumbbell-shaft.js)及最後就位時的器材接點反推。

## 實際驗證

[主報告](../artifacts/dumbbell-fingers-v013/qualification.json)包含八種啞鈴動作，各以 201 個相位檢查循環、完整進入與離開，並把半秒的握緊及反向放手各加密到 501 個相位。另測 [30° 臥推](../artifacts/dumbbell-fingers-v013/qualification-bench30.json)及 [45° 臥推](../artifacts/dumbbell-fingers-v013/qualification-bench45.json)。主報告保留兩份額外報告的路徑與 SHA。

總共檢查 16,372 個實際姿勢。每個姿勢取雙手共 3,622 個變形後皮點，對照畫面中真正的握桿、套環與槓片圓柱；也檢查骨長、手腳接點、身體與器材、自身碰撞、鞋底及段落接縫。身體其餘表皮採 stride 24，雙手採 stride 1，不能把全身檢查稱為所有頂點的連續碰撞證明。

- 手皮點進入金屬的最大數值為 **0.365 mm**，落在原有 **1 mm** 容差內。這是允許次毫米接觸的有限取樣結果，數值並非全部為零。
- 最大手部接點／可達誤差為 **5.385 mm**，發生在臥推離座準備，低於原有 15 mm 門檻。
- 所有已取樣姿勢的器材碰撞、自身碰撞、身體表皮、鞋底及接縫檢查均通過。39 個來源與資產 SHA、驗證工具 SHA 在各次執行期間維持一致。

[驗證器](../scripts/validate-dumbbell-finger-evidence-v013.mjs)會重新檢查原始相位順序、握緊／放手對應區間、實際皮點與器材數量、極值、來源 SHA 及額外椅背報告，不只讀取 `pass`。

原生網頁已拍八種動作、左右手共 16 張近景。[Root 的八張觀察](../artifacts/grip-v013/after/root-review.json)與[器材 agent 的另八張觀察](../artifacts/grip-v013/after/equipment-agent-observation.json)記錄實際看過的圖片、SHA、可見變化及遮擋。臥推、肩推可看見末節收合和反側拇指；側平舉等角度仍有槓片擋住指腹。這些是 AI 對有限畫面的觀察，真人教練與動作專業審查尚未完成。

## 回歸保護與重跑

[握緊／放手測試](../tests/dumbbell-fingers-v013.test.mjs)檢查雙手真正皮點、器材尚未提起時的握持及反向放手；[控制器保留測試](../tests/skinned-controller-preservation-v013.test.mjs)以相同姿勢比對封存控制器的 53 根骨骼及全部 stride 1 皮點。

舊的完整姿勢雜湊保留給其他活動。七個有意調整的握桿動作改保護其餘姿勢欄位、腳、臀肩頭、完整活動 metadata，以及真正啞鈴的尺寸和循環位置／旋轉。[額外保護資料](../tests/fixtures/legacy-grip-protected-v013.json)是從封存來源先重現舊有完整 SHA 後萃取，原本的 `legacy-rig-v011.json` 沒有重錄成新版握姿。手部變動另外由上述完整皮點檢查負責。

```powershell
node --test tests/dumbbell-fingers-v013.test.mjs tests/skinned-controller-preservation-v013.test.mjs tests/dumbbell-wrist-v010.test.mjs tests/cable-v011.test.mjs
$env:DB_PHASE_COUNT='201'
$env:DB_GRIP_PHASE_COUNT='501'
$env:DB_BENCH_ANGLE='0'
$env:DB_REPORT_LABEL='qualification'
node scripts/qualify-dumbbell-fingers-v013.mjs
$env:DB_BENCH_ANGLE='30'
$env:DB_REPORT_LABEL='qualification-bench30'
node scripts/qualify-dumbbell-fingers-v013.mjs dumbbell-bench-press
$env:DB_BENCH_ANGLE='45'
$env:DB_REPORT_LABEL='qualification-bench45'
node scripts/qualify-dumbbell-fingers-v013.mjs dumbbell-bench-press
node scripts/link-dumbbell-grip-evidence-v013.mjs
```

這套檢查針對目前這個人物與已列出的配置。它沒有加入動捕素材、通用手指物理或肌肉受力模擬，也不能推論任意角色、任意握把與未取樣相位都沒有穿模。
