# 走跑的真人動捕混合

玩家走路、奔跑的手臂擺動已加入 CMU Graphics Lab 的真人動作資料：走路 `07_01`、跑步 `09_01`。原始 ASF／AMC 從 [CMU 官方資料庫](https://mocap.cs.cmu.edu/)下載，來源、抽取起點、120 Hz 樣本與檔案 SHA 保存在 [素材記錄](../public/motions/cmu-v013.json)。使用條件見[官方說明](https://mocap.cs.cmu.edu/faqs.php)。

`scripts/import-cmu-v013.mjs` 解析原始骨架、軸向與關節旋轉，取得上臂、前臂方向，轉成目前角色的左右方向。執行時混合量測方向與原有動作，採現有人物骨長；不把拍攝者的肢段長度或位移套到玩家。循環接縫以八個樣本緩接，降低每步重播造成的突跳。

這是局部混合：腳步、地面支撐、手掌方向及 IK 仍採遊戲既有設定；器材拿放和運動沒有冒稱全部改用真人動捕。器材的完整準備修正另見[本版說明](prep-ergonomics-v013.md)。

`node scripts/qualify-captured-locomotion-v013.mjs` 使用正式 GLB，在每秒 120 個時點、五種走跑比例與五種移動比例下檢查 6,025 個姿勢。這些檢查涵蓋可達性與自身碰撞，實際畫面另外複核。它不是對人體受力或專業教學的判定。

素材聲明：The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
