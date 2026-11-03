# 真人角色素材與授權

0.13 另加入 CMU 真人走跑資料的局部手臂混合，模型與服裝授權仍依下表。資料取自 [CMU Graphics Lab](https://mocap.cs.cmu.edu/)，使用條件見[官方 FAQ](https://mocap.cs.cmu.edu/faqs.php)，檔案來源及 SHA 見 `public/motions/cmu-v013.json`。資料可作產品的一部分使用，不將動捕資料本身作為商品轉售。實際混合範圍與轉換方式見[動捕說明](docs/captured-locomotion-v013.md)。

0.15 新增 CMU `79_93` 的兩次站姿啞鈴肩推，以及 `13_29` 的兩次徒手深蹲時序。前者為實際持啞鈴拍攝；後者未持鈴，只將量測的膝屈伸節奏改編至既有杯式深蹲路徑。原始來源、畫格、SHA、衍生方式與授權分別見 `public/motions/cmu-exercise-v015.json`、`public/motions/cmu-squat-v015.json` 及[器材節奏說明](docs/captured-equipment-v015.md)。不宣稱兩者都是負重全身動捕或已經真人教練簽核，原始影片不隨網站發布。

0.17 將上述兩個 CMU 動作的一部分關節方向與骨盆、軀幹資料改編到既有角色，來源與變換見 `public/motions/cmu-fullbody-v017.json`。0.18 另從 `143_18`、`115_06`、`143_10` 和 `79_93` 取得部分起坐、物件升降與已持鈴升降的量測節奏；來源畫格、雜湊與反向改編記錄見 `public/motions/cmu-transitions-v018.json`。拿放的身體姿勢、手腳接點與器材路徑仍由本專案編排，來源沒有拍到的手指或完整器材操作不另稱真人動捕。這些 CMU 衍生資料沿用上方官方 FAQ 條件與下方必須保留的致謝。

0.18 加入的其他真人量測資料如下。公開網站保留精簡衍生資料與來源清單，沒有散布原始研究影片；資料授權與工具程式授權分別判定。

| 資料 | 作者與來源 | 資料授權 | 本專案使用與修改 |
| --- | --- | --- | --- |
| SAME-Limb | Dongxu Tang、Shih Ying-Lei、Zhuoyi Ren、Jianting Liao、Yitian Shao；[資料 DOI](https://doi.org/10.57967/hf/9950)、[作者資料庫](https://huggingface.co/datasets/Tdongxu/A_Synchronized_Lower_Limb_AMG_sEMG_and_Mocap) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；原始授權文件的雜湊記於 `public/motions/same-limb-v018.json` | 選取下肢光學標記與關節角度，平滑、依初始人體座標與標記路徑正規化、裁切完整重複、重採樣與量化；遊戲依動作採骨盆微幅修正或節奏參考，不從未提供的上肢重建全身。未用 EMG／AMG 訊號控制肌群顏色。 |
| UI-PRMD | A. Vakanski、D. Paul、R. Baker、H.-p. Jun；[作者資料頁](https://www.idahofallshighered.org/vakanski/ui-prmd.html)、[作者存檔與 README](https://zenodo.org/records/23104965)、[論文 DOI](https://doi.org/10.3390/data3010002) | 資料依作者頁與資料 README 明列的 [Open Data Commons PDDL 1.0](https://opendatacommons.org/licenses/pddl/1-0/)；不是以論文授權代替資料授權 | 選取六段完整右臂 Vicon 紀錄，五畫格平滑、由實際標記建立人體座標及肢段方向、121 點重採樣與量化；遊戲目前採右臂外展參考並鏡射到左側，是未負重單側復健動作的改編，不是實拍雙手負重側平舉。來源及證據見 `public/motions/ui-prmd-v018.json`。 |
| Weight Lifting Exercises monitored with Inertial Measurement Units | Velloso, E. & Ugulino, W.（2013）；[UCI 官方資料頁](https://archive.ics.uci.edu/dataset/273/weight+lifting+exercises+monitored+with+inertial+measurement+units)、[資料 DOI](https://doi.org/10.24432/C5WK63) | UCI 官方資料集明列 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 從官方 4,024 列示例選取正確 A 類的兩次實際彎舉，移除視窗統計列、展開前臂感測器 roll 通道、依原時間戳重採樣與量化。只改編量測節奏；感測器 roll 不是臨床手肘角度，也不是完整骨架。來源、裁切列與雜湊見 `public/motions/uci-curl-v018.json`。 |

上述資料的使用範圍、實際接入的動作與尚未接入的素材，另見[真人動作覆蓋說明](docs/captured-motion-v018.md)。紅橘標色依動作資料表顯示主要、輔助與伸展目標，並非這些研究受試者的肌肉出力量測。

The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

「肌動基地」的向量圖示 `public/brand-mark.svg` 為本專案原創，以 M 字形、槓鈴和動態標記組合，沒有使用連鎖健身房的商標。

`public/models/athlete/athlete.glb` 是由 MakeHuman／MPFB 2.0.18 產生並整理的真實比例、連續蒙皮人物。不是舊版以幾何物件拼成的人物，也不是從商用健身 App 擷取的模型。

網頁可讀的來源記錄位於 `public/models/athlete/credits.json`。散布模型時應一併保留本檔及該來源記錄。

| 使用部分 | 作者／來源 | 原始授權 | 修改 |
| --- | --- | --- | --- |
| 基礎人體、年輕亞洲男性皮膚、眼睛、眉毛、睫毛、短髮 | MakeHuman Community；核心資產原著作權人包括 Data Collection AB、Joel Palmius、Jonas Hauquier | CC0 1.0 | MPFB 體型調整、烘焙建模形變、刪除輔助網格、以原人體表面與相同骨架權重製作合身壓縮短褲、骨架與幾何統一為 1.78 公尺 |
| Male athletic tank top（`elvs_male_athletic_tank1`） | Elvaerwyn | 官方資產包與原始檔頭標示 CC BY／CC-by；未指定版本號 | 貼合體型、降低網格面數、背心下擺的腿骨權重改由骨盆帶動，調整為網頁 PBR 不透明材質 |
| Running shoes（`punkduck_running_shoes_01`） | punkduck | CC BY 3.0，原始檔頭明列此版本 | 貼合體型、骨架權重、網頁 PBR 材質整理 |

來源與授權連結：

- [MakeHuman 官方核心素材包（CC0）](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)
- [背心來源：Shirts 03](https://static.makehumancommunity.org/assets/assetpacks/shirts03.html)
- [跑鞋來源：Shoes 02](https://static.makehumancommunity.org/assets/assetpacks/shoes02.html)
- [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)

原始服裝檔中的作者、授權和 UUID 也保存在 `credits.json`，沒有把第三方社群服裝誤標成 CC0。

製作工具使用官方 [Blender 4.5 LTS](https://www.blender.org/releases/4-5/) 及 [MPFB](https://github.com/makehumancommunity/mpfb2)。工具下載在忽略的 `.local-tools` 目錄，用於離線製作，不作為網頁執行程式發布。製作程式位於 `scripts/assets/`；匯出時烘焙 Blender 建模形變、保留 53 個 GameEngine 骨骼，並修正不透明皮膚／服裝及頭髮透明遮罩設定。

模型目前約 56,185 個三角形、8 個網格／材質，GLB 約 12.0 MB。材質貼圖主要限制為 2K；紅橘肌群標色由網頁隨蒙皮變形的材質遮罩處理。

先前的寬鬆短褲候選曾使用 Elvaerwyn 的 `elvs_male_swim_shorts1`（官方 Pants 03／CC BY）。正式模型已移除此服裝，改用 MakeHuman CC0 人體表面的衍生壓縮褲，沒有把舊服裝改標成 CC0。

服裝修正腳本為 `scripts/assets/refit_sportswear.py`；它從 `.local-tools/athlete-final.blend` 製作候選，保留所有 53 骨的原始變換並與正式 GLB 逐一比對。`scripts/assets/preview_dressed_poses.py` 將瀏覽器匯出的深屈髖與臥推姿勢套回同一骨架，輸出正面、側面、背面預覽。

場內會員、櫃台人員與教練共用以上來源。部分 NPC 在執行時調整下顎、腰臀及服裝網格，搭配髮色、膚色與年齡細節，保留原骨架和接點。這些是同一模型的衍生外觀，沒有使用獨立的老年男女掃描模型。

遠處 NPC 的幾何細節索引存於 `public/models/athlete/lod-v010/`，由原 GLB 離線衍生，僅減少部分三角形索引；原 GLB、頂點、UV、蒙皮權重與骨架不變。頭、手、腳及肌群標色邊界的原三角形保留，玩家與近距離人物使用完整模型。衍生索引沿用上表各部分的 CC0／CC BY／CC BY 3.0 授權與作者來源，沒有將第三方服裝改標成 CC0。產生器 `scripts/generate-npc-lod-v010.mjs` 使用既有 Three.js 附帶的 meshoptimizer 1.1（Arseny Kapoulkine，MIT），無新增下載資產。這項幾何簡化與程式檢查不代表真人動捕或教練審核。

教練介紹牆使用原創生成圖像 `public/images/coaches/coach-roster-atlas.png`。圖中的 16 位人物及遊戲姓名均為虛構；內建 imagegen 的生成提示與檔案記錄見 [docs/coach-portrait-generation.md](docs/coach-portrait-generation.md)。
