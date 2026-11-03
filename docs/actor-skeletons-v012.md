# 同一人物的骨架重複計算：0.12

原始 GLB 有一份 53 骨頭的 skin，八個人物 mesh 共用這份 skin。`SkeletonUtils.clone` 會替每個 mesh 各建立一份 Skeleton，雖然八份仍指向同一人物的相同骨頭與逆矩陣。原程式按物件身分去重，因此保留了八份相同計算及 bone texture。

這次只在人物初始化時合併等價 Skeleton。必須同時符合：

- mesh 與所有骨頭都屬於同一人物根節點。
- 骨頭物件引用及順序完全一致。
- 每個 inverse matrix 的 16 個有限數值逐項完全一致。
- Skeleton 類型及更新方法相同，而且尚未配置 boneTexture。

各 mesh 原本的 bindMatrix／bindMatrixInverse、幾何、材質、蒙皮權重和肌群遮罩保留。不同人物仍有各自可變的 Skeleton；不同骨序、逆矩陣差異與已配置 texture 的物件不合併。初始化時尚未配置 texture 的重複 Skeleton 由垃圾回收處理，沒有釋放外部已使用的 GPU texture。

實際 GLB 的每人物 unique Skeleton、一次 pose 的 Skeleton.update 呼叫及 CPU DataTexture 數由 8 變成 1。這是重複計算與資料數量的下降，沒有把它當成八倍 FPS 或八倍 draw call 改善。[實際遊玩測量](performance-v012.md)另比較遊戲 RAF 間隔；這份 CPU 報告不判定 GL 傳輸量。

## CPU 驗證

`node --test tests/actor-skeletons-v012.test.mjs` 五項測試包含合併條件、保守拒絕、跨人物隔離、實際 GLB 四種外型的接點／骨頭／binding／attributes 精確比對，以及 LOD、紅橘標色、clone/dispose 和缺少 LOD 的退回。

`node scripts/qualify-actor-skeletons-v012.mjs --quick` 是先行小樣本：15 個 pose／LOD 組合，98,988 個真正變形後頂點精確相同，最大誤差 0。正式完整指令移除 `--quick`，包含四種外型、走路／跑步，以及 15 種啞鈴、滑輪和草皮動作的循環及進出，再測三種 LOD。

CPU fixture 只在記憶體中移除圖片解碼引用，原始 GLB、骨頭、幾何與 skin 資料不變。這些檢查證明這項合併保持原變形結果，不是對原動作生物力學或所有碰撞的重新認證，也不取代實際網頁的材質、紅橘畫面與手腳檢視。

正式輸出為 `artifacts/skeletons-v012/qualification.json`；快速輸出另存 `qualification-quick.json`，不覆寫 0.11 的證據。每份報告包含本版及 0.11 封存來源 SHA。
