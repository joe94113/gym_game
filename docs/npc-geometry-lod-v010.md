# 遠處 NPC 幾何細節（v0.10）

這次改的是遠處人物實際繪製的三角形索引。完整人物仍是同一個真人比例蒙皮模型，沒有替換成幾何假人，也沒有把降低動畫更新頻率稱作 LOD。

## 啟用條件與整合

`src/npc-geometry-lod-v010.js` 提供載入、索引驗證、共用幾何 wrapper 與距離選擇。`createSkinnedCharacter` 會在 GLB 載入旁並行請求 `/models/athlete/lod-v010/manifest.json`，再取得其同目錄 `indices.bin`；這兩個請求不在真人模型的等待路徑上。二進位資料以 SHA-256 驗證，再以原始幾何 attributes／indices 的 fingerprint 確認適用來源。資料失敗、來源不符或缺少相機位置時維持完整模型。

`createSkinnedCharacterFromModel({lodData, geometryLodAllowed})` 可在 Node 注入已解碼的資料。production 的玩家 instance 強制 `geometryLodAllowed=false`；`createClone` 建立的 NPC 才能使用 `setGeometryLod(0|1|2)`。

`crowd` 與 `socialCrowd` 均提供：

- `setViewContext({cameraPosition, playerPosition, quality})`：控制器應在本幀相機最終定位後、render 前呼叫；立即重新選擇幾何細節。`quality` 可傳入，目前距離保護規則適用所有畫質。
- `setGeometryLodEnabled(bool)`：同場景 A/B 開關。關閉時立即還原所有完整幾何，保留人物姿勢與原位置。
- `getGeometryLodDiagnostics()`：總數、各級數量、完整／已選三角形數，以及每人的級別、資料狀態、來源驗證、保護區與三角形數。`visibleSelectedTriangles` 依 group.visible 加總，並非 GPU frustum 後的 renderer.info 實測。

距離採相機與玩家中較近者。由完整模型切入第一級需至少 16 公尺，返回完整模型的邊界為 13 公尺；切入第二級需超過 26 公尺，回到第一級的邊界為 22 公尺。這是有緩衝區的距離判斷，沒有改動場館格局或器材姿勢。

玩家永遠完整。器材 NPC 在交接請求當下立即完整，放回、放手、起身、走離與返回流程也完整；只有穩定運動或離開器材後站定的人物可降低細節。團課教練和學員在七種課程及換課過程一律完整，遠處櫃台與談話人物才依距離選擇。

## 幾何與生命週期

原 GLB 不變，SHA-256 為 `6d69811af9db9eb6247357c242f91682a33a69fe83c7679a5c6572f4bfc0d912`。離線產生器使用既有 Three.js 附帶的 meshoptimizer 1.1，沒有安裝新套件。它將 default／feminine、adult／senior 四個外型的保護區取聯集，鎖住所有頭、手、腳、肌群與左右標色邊界的原三角形，並保留網格邊界；normal、UV 和六個實際蒙皮姿勢參與簡化誤差約束。

| 細節 | 每人三角形 | 相對完整模型減少 |
| --- | ---: | ---: |
| 完整 | 56,185 | — |
| 第一級 | 42,369 | 24.6% |
| 第二級 | 35,847 | 36.2% |

獨立索引 binary 為 469,296 bytes，manifest 約 3 KB。wrapper 依完整外型幾何快取，共享該外型全部 position／normal／UV／skinIndex／skinWeight／formMuscle attributes，材料、骨架、bind matrix 與接點控制器維持原物件。切換不複製或釋放 attributes；共用 wrapper 只在最後一個真人 instance dispose 時釋放，避免一位 NPC 離開造成其他人的 GPU attribute buffer 失效。

這項變更減少遠景實際繪製的三角形及部分被引用頂點，不會減少 GLB 下載量、既有 vertex attribute 記憶體、骨架計算或每人八個 mesh draw calls。原本因分區而隱藏的 NPC 已不會被繪製，不能再次計入節省。

## 驗證與限制

`node --test tests/npc-geometry-lod-v010.test.mjs`：7／7 通過。包含二進位完整性、載入失敗、延後資料到達、來源不符時整人退回完整模型、四種外型、共享 attributes／骨架／紅橘肌群 uniforms、距離緩衝區、交接完整流程、A/B 開關、共用幾何釋放，以及七種實際團課皆完整。當次 `node --test tests/*.test.mjs` 共 69／69 通過。

`node scripts/qualify-npc-lod-v010.mjs` 的結果在 `artifacts/npc-lod-v010/qualification.json`，包含執行時的檔案 hash：

- 四外型 × 21 個實際姿勢 × 兩級，共 168 次姿勢檢查。
- 5,543,328 次蒙皮頂點比較，差值為零；骨架與接點不變。
- 210,240 次保護三角形存在檢查均通過；73,052 個新增三角形沒有引入新的肌群／左右標色邊界；640 次 attributes 檢查皆為原參照。
- 另以真正候選三角形的重心與邊中點取樣 61,120 次，和原本同網格的變形表面比距離，最大差為 18.30 mm。這是遠景簡化表面的取樣差，不能將「原頂點差零」解讀成「所有新三角形表面相同」。這項取樣不是完整 Hausdorff 距離或全表面無穿模證明。

`getSurfaceSamples` 原本列舉所有原始頂點，不依索引刪減；因此 qualifier 另外檢查真正的候選 indices 與變形三角形。GPU 正／側／背面畫面、衣物輪廓與同場景 renderer.info 三角形／時間比較由主流程另行驗收，本文件不把 CPU 檢查當作 GPU 實測、真人動捕或教練審核。

派生索引沿用原人物各部分的 CC0／CC BY／CC BY 3.0 來源，詳見 `ASSET-LICENSES.md` 與資產目錄的 `LICENSES.md`；原服裝作者沒有被重新標成 CC0。

## 主流程的網頁與畫面檢查

正式網頁已驗證固定主場館視角的繪製三角形減量、相機拉近同幀恢復完整人物、三位團課人物維持完整模型，以及選配 LOD 下載失敗時仍能使用原角色與器材。一次固定鏡頭、相同姿勢、零時間步的實際擷取為 678,749 → 582,809 三角形，約少 14.1％；這不是新舊版本的 FPS 比較，也沒有測得原生硬體幀率。

[擷取報告](../artifacts/npc-lod-v010/capture-report.json)及[實際看圖紀錄](../artifacts/npc-lod-v010/visual-review.json)包括場館前後兩張與八張人物圖板。四種外型各看站姿及既有活動姿勢，三個細節級別均有前／側／背圖，紅橘標色保留；圖板為了檢視刻意在近距離強制低細節，正常遊戲會在靠近後恢復完整模型。這些有限靜態畫面沒有出現明顯新破洞或肢體分離，不能代替全部姿勢、所有切換時點或真人驗收。
