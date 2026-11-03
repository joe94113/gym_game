# 啞鈴拿取與歸位：v0.8 驗證紀錄

這次調整八種啞鈴動作的拿取、持鈴、就位和放回：彎舉、槌式彎舉、肩推、側平舉、單手划船、杯式深蹲、羅馬尼亞硬舉、平板啞鈴臥推。

人物先走到架前，再屈髖屈膝拿取。啞鈴離開架面後，先移出架面、站直、轉成垂握，再降到身側。單手划船只拿一顆鈴，踏好前後腳後才扶住支撐墊；杯式深蹲改成雙手托住上盤下緣。肩推增加身前彎肘與帶到肩旁的準備步驟。

臥推會先把鈴轉直、坐上椅墊、靠在大腿外側，再分段後躺。背部靠穩後才把鈴移到胸旁。離開時依相反順序收鈴、坐起、起身、走回架前、放好再鬆手。紅橘肌肉標色保留。

站姿持鈴的真骨架量測，上臂離身約 16°、腕部偏折約 19°。大腿支撐姿勢中，啞鈴底面與短褲表面的最近頂點間距約 3.1 mm；已比對實際繪製底盤的 24 個三角面，數值另存於 [carry-support 量測報告](../artifacts/dumbbell-carry-support-measures-v08.json)。這是目前網格的幾何近貼，沒有模擬軟組織或衣物受壓。

臥推的坐姿再後躺、閉握與支撐位置，參考 [Human Kinetics 的啞鈴臥推教學](https://us.humankinetics.com/blogs/excerpt/how-to-perform-a-dumbbell-bench-press) 與 [ACE 胸推教學](https://www.acefitness.org/resources/everyone/exercise-library/19/chest-press/)。本次分段路徑仍是遊戲動畫的實作，並非這些機構對每一格畫面的背書。

## 實作範圍

`src/dumbbell-lifecycle-paths.js` 只建立八種啞鈴動作的路徑；`src/dumbbell-grip.js` 把實體啞鈴位置和掌心標記分開。握把維持獨立幾何中心，手掌依實體半徑、掌向與手指形狀對位。托盤握法另外校正，不拿托盤當鋼軸握持。

`src/rig-lifecycle.js` 與 `src/extended-rig.js` 只在啞鈴分支接上這兩個模組。骨長不拉伸，既有團課和全域手掌解算器未改。一般彎舉在抬起時將兩鈴向外修正最多 20 mm，左鈴採鏡向轉動，避開原本下位過近腿部與左右混合握的問題。

對外的 `sample`、`sampleLifecycle`、`getActualContacts` 介面不變。接點回傳的是依實物表面推導的掌心目標，並非把人物已解出的手掌位置當成驗證答案。

## 數值與畫面驗證

正式 CPU 報告：[dumbbell-ergonomics-qualification.json](../artifacts/dumbbell-ergonomics-qualification.json)。每種動作的運動循環、進入、離開各取 301 點，另查所有段界，總計 7,448 個真人骨架畫格。手部與鞋底使用每個網格頂點；全身皮膚以 stride 24 取樣，另檢查骨架代理體、啞鈴鋼軸／套環／槓片的實際圓柱，以及托架和椅墊。

| 項目 | 結果 |
| --- | --- |
| 報告 | `pass: true`、`changedSources: []` |
| 手部對實體啞鈴最大穿入 | 0.645 mm，門檻 1 mm |
| 手腳接點最大誤差 | 3.921 mm，含行走中的腳部解算 |
| 骨長最大誤差 | 小於 0.001 mm |
| 進入終點與訓練起點 | 骨架差值 0 |
| 段界前後各 0.0001 秒，最大關節位移 | 0.455 mm |
| 同一段界，最大手部皮膚／啞鈴位置差 | 各小於 0.001 mm |
| 身體、自碰撞、皮膚、金屬與鞋底旗標 | 全部為 0 |

正式網頁截圖在 [dumbbell-ergonomics-review](../artifacts/dumbbell-ergonomics-review/)：八種動作各有進入、離開，每方向八個關鍵點，每點正面、側面、背面，共 384 格、32 張接圖。已逐張用 `view_image` 實際檢閱，所看樣本沒有新增的明顯衣物、肢段或器材穿插。臥推的大腿支撐、後躺和背靠椅墊可辨認；肩推有獨立的帶鈴到肩旁；單手划船沒有多出第二顆啞鈴；杯式深蹲能看到雙手在上盤下方。

[visual-review.json](../artifacts/dumbbell-ergonomics-review/visual-review.json) 記錄全部 32 張已看檔名、逐張 SHA-256、各動作觀察與遮擋。PNG 清單的聚合 SHA-256 為 `1acff19a43fff4e233b1fd438e8c677744afe9fc7bea751bd05b885a5db8f463`。[capture-report.json](../artifacts/dumbbell-ergonomics-review/capture-report.json) 保留擷取當時的來源雜湊和逐格數值，未用後來的來源雜湊覆寫舊證據。

後續同檔案的非啞鈴修正，另以 [v08-db-interface-baseline.json](../artifacts/v08-db-interface-baseline.json) 橋接：八種啞鈴、三種模式各 101 點，共 2,424 格，包含姿勢、實際骨架接點、啞鈴位置與旋轉、碰撞體和導航幾何。修正後只能執行 `node scripts/fingerprint-dumbbell-v08.mjs compare`，不得重建 baseline 取代原值。

最終非啞鈴修正後的 [compare 結果](../artifacts/v08-db-interface-bridge.json)已通過：2,424 格差異為零，聚合指紋相同。數值報告、拍攝報告與看圖紀錄均新增這個來源橋接，保留原來的來源雜湊、數值與圖片，沒有假稱重新執行 301 相位檢查或重拍。

## 可以判定的範圍

這些是 AI 圖像檢閱與取樣檢查，沒有真人教練或醫療專業簽核。300 px 圖格無法辨識每個指尖的毫米間隙；托架、啞鈴端盤、軀幹和椅墊也會擋住部分掌面與腿。靜態關鍵格不能單獨證明整段速度、重心或負重安全，數值檢查也不是連續實體物理模擬。

驗證只適用目前這個真人模型的比例與現有啞鈴、架子、椅墊。換模型比例或器材尺寸後，需要重新校正和驗證。
