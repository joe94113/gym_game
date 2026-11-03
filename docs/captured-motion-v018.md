# 肌動基地 0.18 真人動作來源與備審

目前有 73 個去重後的目錄項目，其中 65 個是運動或團課，另外 8 個是設施。17 個循環動作用到真人量測參考：2 個多關節、1 個上臂平面、1 個小幅骨盆參考，以及 13 個節奏參考。其餘 48 個循環仍是手工動畫。7 種團課都還是手工編排。

18 類動作的部分就位／離開段落，實際套用了量測節奏；這與循環動作的 17 項來源是兩種統計。所有 65 個運動／課程都待真人教練逐項審查，沒有任何專業簽核。

完整逐項資料與實際套用段落見 [motion-coverage.json](../artifacts/mocap-v018/motion-coverage.json)。重建指令：`node scripts/generate-motion-coverage-v018.mjs`。本檔由程式依目前目錄、來源 registry、正式 GLB fixture 與 lifecycle metadata 產生，不把「已下載」當成「已接入」。

## 目前用到哪些真人資料

| 動作 | 實際接入的部分 | 來源 ID | 教練狀態 |
| --- | --- | --- | --- |
| 站姿啞鈴彎舉（`dumbbell-curl`） | IMU 量測節奏 | uci-wle-273 | 待教練審查 |
| 啞鈴槌式彎舉（`dumbbell-hammer-curl`） | IMU 量測節奏 | uci-wle-273 | 待教練審查 |
| 站姿啞鈴肩推（`dumbbell-shoulder-press`） | 多關節參考＋接點校正 | 79_93 | 待教練審查 |
| 啞鈴側平舉（`dumbbell-lateral-raise`） | 上臂平面參考＋節奏 | ui-prmd-m07 | 待教練審查 |
| 啞鈴杯式深蹲（`dumbbell-goblet-squat`） | 多關節參考＋接點校正 | 13_29 | 待教練審查 |
| 啞鈴羅馬尼亞硬舉（`dumbbell-romanian-deadlift`） | 骨盆小幅參考＋節奏 | same-limb-user01-deadlift-A1 | 待教練審查 |
| 滑輪彎舉・直桿（`cable-straight-bar-curl`） | IMU 量測節奏 | uci-wle-273 | 待教練審查 |
| 滑輪彎舉・EZ 桿（`cable-ez-bar-curl`） | IMU 量測節奏 | uci-wle-273 | 待教練審查 |
| 繩索槌式彎舉（`cable-rope-hammer-curl`） | IMU 量測節奏 | uci-wle-273 | 待教練審查 |
| 槓片式腿推機（`machine-leg-press`） | 下肢量測節奏 | same-limb-user01-deep_squat-A1 | 待教練審查 |
| 坐姿腿伸展機（`machine-leg-extension`） | 下肢量測節奏 | same-limb-user01-deep_squat-A1 | 待教練審查 |
| 深蹲架（`machine-squat-rack`） | 下肢量測節奏 | same-limb-user01-deep_squat-A1 | 待教練審查 |
| 槓片式哈克深蹲機（`machine-hack-squat`） | 下肢量測節奏 | same-limb-user01-deep_squat-A1 | 待教練審查 |
| 槓片式坐姿提踵機（`machine-calf-raise`） | 下肢量測節奏 | same-limb-user01-heel_raise-A1 | 待教練審查 |
| 史密斯深蹲架（`machine-smith-squat`） | 下肢量測節奏 | same-limb-user01-deep_squat-A1 | 待教練審查 |
| 坐姿腿彎舉機（`machine-leg-curl`） | 下肢量測節奏 | same-limb-user01-deep_squat-A1 | 待教練審查 |
| 槓片式牧師彎舉機（`machine-preacher-curl`） | IMU 量測節奏 | uci-wle-273 | 待教練審查 |

CMU 肩推與深蹲沿用 0.17 的多關節參考和手腳接點校正，並非逐骨原樣播放。原深蹲沒有負重，遊戲改成雙手持鈴的杯式深蹲；來源沒有拍到這個持鈴方式。

SAME-Limb 只提供骨盆與下肢外部標記。腿推、哈克、史密斯與槓鈴深蹲、腿伸展／腿彎舉、小腿機使用量測節奏；器材行程、姿勢、手腳與握把路徑仍由原設定控制。RDL 額外使用小幅骨盆位移，每軸上限 **8 mm**，向量長度的理論上限為 **13.86 mm**，不是整體位移只限 8 mm。來源的硬舉動作是搬一個放有兩包 A4 紙的箱子，沒有上肢光學標記，不能稱為完整啞鈴 RDL 動捕。

UI-PRMD 的側平舉參考來自右臂、無負重的復健肩外展。左臂是右臂方向的鏡射改編，沒有拍到真正雙側持鈴動作。遊戲保留原負重動作的抬臂範圍、手肘彎度、手腕與握把，只加入有限的上臂平面參考與節奏。另已匯入肩伸展與肩胛平面抬臂資料，尚未接到其他遊戲動作，未列為已完成覆蓋。

UCI 使用正確 A 類、1.25 kg 單側啞鈴彎舉的 IMU 資料。6 個彎舉變式共享兩段量測節奏，採 35% 來源參考和速度限制；雙側、槌式、滑輪、牧師椅的姿勢及器材路徑仍是原動畫。感測器 roll 不是臨床手肘角度，也不是完整骨架動捕。官方範例只有 4,024 列，未宣稱已匯入研究的全部 39,242 列。

紅橘標色繼續依動作目錄的主要／輔助肌群顯示；沒有輔助肌群的動作不硬加橘色群。這不是量測玩家的肌肉用力，也沒有用 SAME-Limb 的 EMG／AMG 來驅動皮膚顏色。

## 就位、拿取與離開

本次實際套用 104 個方向性段落，涉及 18 類動作；可用轉場片段 10 段，實際選用 10 段。程式逐段比對 runtime metadata 與進出段落中點，只有真的回傳 `transitionTiming` 才計入。

量測內容是坐下／起身時骨盆的升降、彎身接近箱子／起身，以及原本已拿著啞鈴時的抬起／放低節奏。人物比例、原本的站位、路徑、手腳接點、握法與器材狀態沒有改成來源人物的姿勢。CMU 79_93 開始時已持鈴，不能拿它宣稱架上拿取、放回、放手都有真人實拍。

走路、跨步、轉身、變換握法、器材機構改變、特殊靠躺、槓架、TRX 與空中器材仍走原本的手工路徑。十種坐姿機器加八個啞鈴動作，只有符合條件的固定站位段落套節奏；同一動作的其他段落仍是手工動畫。JSON 分別列出每個已套用角色／片段，以及未套用的理由。

## 數值驗收與限制

- 轉場：[captured-transition-qualification.json](../artifacts/mocap-v018/captured-transition-qualification.json)，當次數值檢查通過。
- 下肢參考：[lower-body-qualification-final.json](../artifacts/mocap-v018/lower-body-qualification-final.json)，當次數值檢查通過。
- 上臂參考：[lateral-reference-qualification-final.json](../artifacts/mocap-v018/lateral-reference-qualification-final.json)，當次數值檢查通過。
- IMU 彎舉：[inertial-curl-qualification-first.json](../artifacts/mocap-v018/inertial-curl-qualification-first.json)，當次數值檢查通過。
- 伸手與手腕：[open-hand-wrist-qualification.json](../artifacts/mocap-v018/open-hand-wrist-qualification.json)，當次數值檢查通過；後續另有來源檔變更，這份歷史結果不等於目前整包已重驗。
- 坐姿划船鞋尖：[seated-row-crossing-qualification.json](../artifacts/mocap-v018/seated-row-crossing-qualification.json)，當次數值檢查通過。

轉場專項取樣 3636 個姿勢，其中 812 個樣本實際套節奏。下肢專項取樣 5328 個姿勢。上臂專項取樣 444 個姿勢。IMU 彎舉取樣 3996 個姿勢，與同一行程進度的原版姿勢、骨架、器材與皮膚對照。

坐姿划船的鞋尖另做原有跨軌路徑修正：修正前完整鞋面取樣曾出現 19.88 mm 的穿入；修正後，以 **1 mm 容差** 檢查完整鞋面頂點，未出現碰撞旗標。支撐腳、雙手與接觸遮罩維持不變。這不是「所有連續時間與三角面都零穿模」的證明。

手腕專項是八個啞鈴動作的進入／離開，每方向 201 個位置，使用正式 GLB；每姿勢檢查 3,622 個手部皮膚點。角度是手掌前向與前臂的動畫診斷角，不是人體工學或醫療安全門檻。單手划船的支撐手與杯式深蹲的托鈴可保留較大角度，不能說所有手腕都降到相同值。

| 動作 ID | 張手時最大腕角（前 → 後） | 持握時最大腕角（前 → 後） | 修正後手部／實體啞鈴金屬最深值 |
| --- | --- | --- | --- |
| dumbbell-curl | 50.78° → 34.53° | 16.37° → 16.37° | 0.513 mm |
| dumbbell-bench-press | 51.24° → 34.60° | 16.38° → 16.38° | 0.634 mm |
| dumbbell-hammer-curl | 51.13° → 33.94° | 16.35° → 16.35° | 0.392 mm |
| dumbbell-shoulder-press | 51.13° → 34.11° | 16.34° → 16.34° | 0.407 mm |
| dumbbell-lateral-raise | 51.13° → 33.94° | 22.49° → 22.49° | 0.392 mm |
| dumbbell-single-arm-row | 156.63° → 59.62° | 16.38° → 16.38° | 0.598 mm |
| dumbbell-goblet-squat | 54.48° → 54.48° | 42.08° → 42.08° | 0.000 mm |
| dumbbell-romanian-deadlift | 50.94° → 34.60° | 16.37° → 16.37° | 0.446 mm |

CPU 檢查包括固定骨長、手腳接點、全肢與自身碰撞、全身皮膚每 24 點取樣，啞鈴另檢完整手部與實體金屬。它不替代真人教練審查、全程慢放或實機效能測試；WebGL 截圖、手機與顯示卡結果由各自的報告記錄。

瀏覽器、手機、效能與本輪整合結果另見[本輪驗證摘要](../artifacts/verification-summary-v0.18.json)，以主流程最後產生的報告為準。這份來源備審文件不預填尚未完成的整合測試結果。

## 教練逐項查看

遊戲內「逐段查看動作」工作台目前來源版本為 **0.18.0**。請每個動作分別看「就位與拿取、運動行程、放回與離開」，再切正面、側面、背面；九格是記錄範圍，空格不能當成通過。用慢放及行程滑桿確認完整路徑，記下方向、百分比、器材設定與看到的問題，截圖後匯出 JSON 或離線 HTML。檔案也可匯出 CSV。

審查時逐項確認：進入與退出的順序、入座／入架支撐、手掌和握把、腳底和踏板、完整行程與軀幹代償、放回後才放手，以及主要／輔助肌群文字。團課還要分別看暖身、主要訓練、緩和、教練與學員是否同步，並確認換段前提醒與節奏。沒有實際審查者、資格與意見時保持「待審」；工作台保存意見，不自動發出專業認證。

| 動作 | 循環來源 | 轉場 | 真人教練 |
| --- | --- | --- | --- |
| 站姿啞鈴彎舉（`dumbbell-curl`） | IMU 量測節奏 | 部分段落套量測節奏 | 待審／未簽核 |
| 平板啞鈴臥推（`dumbbell-bench-press`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 高位繩索三頭下壓（`rope-pushdown`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 單手滑輪划船（`single-arm-cable-row`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 跪姿髖屈肌伸展（`kneeling-hip-flexor-stretch`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 啞鈴槌式彎舉（`dumbbell-hammer-curl`） | IMU 量測節奏 | 部分段落套量測節奏 | 待審／未簽核 |
| 站姿啞鈴肩推（`dumbbell-shoulder-press`） | 多關節參考＋接點校正 | 部分段落套量測節奏 | 待審／未簽核 |
| 啞鈴側平舉（`dumbbell-lateral-raise`） | 上臂平面參考＋節奏 | 部分段落套量測節奏 | 待審／未簽核 |
| 單手啞鈴划船（`dumbbell-single-arm-row`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 啞鈴杯式深蹲（`dumbbell-goblet-squat`） | 多關節參考＋接點校正 | 部分段落套量測節奏 | 待審／未簽核 |
| 啞鈴羅馬尼亞硬舉（`dumbbell-romanian-deadlift`） | 骨盆小幅參考＋節奏 | 部分段落套量測節奏 | 待審／未簽核 |
| 站姿腿後側伸展（`standing-hamstring-stretch`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 坐姿臀部伸展（`seated-glute-stretch`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 站姿胸肩伸展（`standing-chest-shoulder-stretch`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 扶桿小腿伸展（`standing-calf-stretch`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 站姿胸椎轉動（`standing-thoracic-rotation`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 滑輪彎舉・直桿（`cable-straight-bar-curl`） | IMU 量測節奏 | 手工路徑 | 待審／未簽核 |
| 滑輪彎舉・EZ 桿（`cable-ez-bar-curl`） | IMU 量測節奏 | 手工路徑 | 待審／未簽核 |
| 滑輪划船・V 把（`cable-v-bar-row`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 繩索面拉（`cable-rope-face-pull`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 單手滑輪側平舉（`cable-single-arm-lateral-raise`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 腳踝帶髖後踢（`cable-ankle-kickback`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 繩索槌式彎舉（`cable-rope-hammer-curl`） | IMU 量測節奏 | 手工路徑 | 待審／未簽核 |
| 直桿直臂下拉（`cable-straight-arm-pulldown`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 站姿繩索捲腹（`cable-rope-crunch`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 坐姿胸推機（`machine-chest-press`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 高位下拉機（`machine-lat-pulldown`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 坐姿划船機（`machine-seated-row`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 槓片式腿推機（`machine-leg-press`） | 下肢量測節奏 | 手工路徑 | 待審／未簽核 |
| 坐姿腿伸展機（`machine-leg-extension`） | 下肢量測節奏 | 部分段落套量測節奏 | 待審／未簽核 |
| 坐姿肩推機（`machine-shoulder-press`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| D 形手把夾胸（`machine-cable-fly`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 深蹲架（`machine-squat-rack`） | 下肢量測節奏 | 手工路徑 | 待審／未簽核 |
| 槓鈴臥推（`machine-bench-press`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 跑步機（`machine-treadmill`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 室內健身車（`machine-bike`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 槓片式上斜胸推機（`machine-plate-incline-press`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 槓片式高位划船機（`machine-plate-high-row`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 槓片式肩推機（`machine-plate-shoulder-press`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 槓片式哈克深蹲機（`machine-hack-squat`） | 下肢量測節奏 | 手工路徑 | 待審／未簽核 |
| 槓片式臀推機（`machine-hip-thrust`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 槓片式坐姿提踵機（`machine-calf-raise`） | 下肢量測節奏 | 手工路徑 | 待審／未簽核 |
| 史密斯深蹲架（`machine-smith-squat`） | 下肢量測節奏 | 手工路徑 | 待審／未簽核 |
| 坐姿腿彎舉機（`machine-leg-curl`） | 下肢量測節奏 | 部分段落套量測節奏 | 待審／未簽核 |
| 蝴蝶機夾胸（`machine-pec-deck`） | 手工動畫 | 部分段落套量測節奏 | 待審／未簽核 |
| 坐姿側平舉機（`machine-lateral-raise`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 橢圓交叉訓練機（`machine-elliptical`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 划船測功儀（`machine-rower`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 階梯機（`machine-stair-climber`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 輔助引體向上機（`machine-assisted-pullup`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 輔助雙槓撐體機（`machine-assisted-dip`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 髖外展機（`machine-hip-abduction`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 髖內收機（`machine-hip-adduction`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 45° 背伸展椅（`machine-back-extension`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 槓片式牧師彎舉機（`machine-preacher-curl`） | IMU 量測節奏 | 手工路徑 | 待審／未簽核 |
| 槓片式平躺胸推機（`machine-lying-chest-press`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 槓片式下斜胸推機（`machine-decline-chest-press`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 蝴蝶機反向飛鳥（`machine-reverse-fly`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 全身活動課（`group-class`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 有氧舞蹈（`class-dance`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 飛輪課（`class-cycle`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| TRX 懸吊訓練（`class-trx`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 槓鈴肌力訓練（`class-barbell`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 空中瑜珈（`class-aerial`） | 手工動畫 | 手工路徑 | 待審／未簽核 |
| 墊上皮拉提斯（`class-pilates`） | 手工動畫 | 手工路徑 | 待審／未簽核 |

## 資料授權與出處

- [CMU Graphics Lab](https://mocap.cs.cmu.edu/)／[資料條款](https://mocap.cs.cmu.edu/faqs.php)：資料可改編並整合於遊戲，不能把原始或轉檔資料直接轉售。依官方文字保留 NSF EIA-0196217 與 mocap.cs.cmu.edu 致謝。手指與拇指欄位不是實際捕捉，遊戲手指沿用握持設定。
- [SAME-Limb](https://doi.org/10.57967/hf/9950)：資料 CC BY 4.0。保留作者、資料 DOI 與改編說明。只使用光學下肢／骨盆標記和派生角度；不把代理長度當臨床關節中心，也不冒稱有上肢資料。
- [UI-PRMD 官方封存](https://zenodo.org/records/23104965)／[PDDL 1.0](https://opendatacommons.org/licenses/pddl/1-0/)：作者明文將資料採 PDDL 1.0；此判定來自資料說明，沒有把論文授權套到資料。Vicon 100 Hz，位置為 mm；角度欄位為度與 YXZ Euler，與 Kinect 的欄位／階層不同。引用 Vakanski、Jun、Paul、Baker，DOI [10.3390/data3010002](https://doi.org/10.3390/data3010002)。
- [UCI 彎舉資料](https://doi.org/10.24432/C5WK63)：資料 CC BY 4.0，Velloso 與 Ugulino（2013）。保留來源、選段、去除視窗摘要、感測器角度展開、按時間重採樣與平滑改編說明。作者論文另有自己的授權，沒有混用。

原始檔 hash、來源網址、切段、單位與匯入資格見 `public/motions/` 各來源 manifest，以及 [research 來源整理](../artifacts/mocap-v018/research/upperbody-extension-review.md)。目前沒有可直接列為已接入的負重臥推、各滑輪附件、特殊器材或團課真人全身動捕；這些仍需取得相容資料或另行拍攝，再逐動作校正與審查。
