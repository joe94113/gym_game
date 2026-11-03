# 0.13.0 團課設計與來源

2026-10-29。七課共 159 段、47 種課內動作：一堂 15 分鐘全身活動課、六堂 30 分鐘訓練課。0.13 新增吊布離地坐姿與受支撐倒掛，其他課程的段數及時間保留。課表是遊戲原創內容，參考官方資料的課程形式、動作原則及暖身緩和安排；沒有複製品牌編舞，也尚未取得真人教練簽核。

## 課程安排

0.8.0 保留原有 159 段課表；人物就位後新增三秒倒數，再開始正式課程時鐘。原創背景音樂與中文口令依同一時鐘切段；換段前八秒、段尾三秒、休息及完成均有提示。音樂與語音可以分別調整，暫停、預覽、換課與背景分頁會取消舊聲音。口令是 Hanhan zh-TW 合成錄音，不是品牌課程音樂或真人教練錄製，見 [聲音與效能說明](audio-and-performance.md)。

| 課程 | 暖身／主訓／緩和 | 段落 | 主要安排 |
| --- | --- | --- | --- |
| 全身活動 | 5／5／5 分鐘 | 18 | 踏步、肩部開合、側步、屈髖、抬膝、小幅屈膝及呼吸，依序漸進再放慢 |
| 有氧舞蹈 | 5／20／5 分鐘 | 23 | 三輪踏併步、V 字踏步、抬膝、腿後勾腳、側伸與手臂組合；輪間恢復踏步 |
| 飛輪 | 5／20／5 分鐘 | 23 | 全程坐姿，主段三輪穩定踩踏、踏頻段與恢復輕踩；畫面踏頻 60～90 rpm，最後逐漸停穩 |
| TRX | 5／20／5 分鐘 | 24 | 三輪低划船、輔助淺蹲、交替划船、20 秒短停留與站姿恢復；雙手握帶、雙腳著地 |
| 槓鈴肌力 | 5／20／5 分鐘 | 24 | 三輪硬舉、划船及反握站姿彎舉；每組間真正把短槓放回地面，空手休息後再拿起 |
| 空中瑜珈 | 5／20／5 分鐘 | 24 | 三輪離地坐姿、左右各 20 秒舒展、受支撐倒掛與回正、20 秒屈髖停留及站姿恢復；空中段先上布、離地，回正落地後再離布 |
| 墊上皮拉提斯 | 5／20／5 分鐘 | 23 | 三輪交替抬腳、腳跟滑動、單側開膝、小幅橋式與仰躺恢復，另有呼吸與骨盆控制 |

精確秒數、節奏、動作 ID、輪次和肌群 key 見 [course-plans.js](../src/classes/course-plans.js)。一趟交替動作包含左右各一次。畫面趟數來自動畫循環，不是玩家實際完成的次數。放槓休息段包含放下與拿起的時間，兩端各約 4.25 秒，中間才是空手休息。

槓鈴彎舉採雙掌朝上的反握。硬舉／划船與彎舉需要換握時，先把槓放回地面、鬆手，再以接下來動作的握法拿起；不在持槓空中扭腕。從彎舉中途離開，也保留當下握法把槓放回。

## 0.13 空中段落

以下六個 120 秒段落替換原來三輪的主段屈髖與站姿胸肩活動，沒有增加課程長度。每段只有一趟完整流程，沒有把一小段離地動畫重複播放。坐姿先由兜布支撐髖部，再收腳離地；倒掛段先完成上布，再緩慢轉向、回正、落地。中途離開空中段會用 14 秒先回正再落地，之後才接原本放手與離場。

| 段落 ID | 顯示名稱 | 課程時鐘 | 動作 ID |
| --- | --- | --- | --- |
| `aerial-1-hinge` | 第 1 輪・吊布離地坐姿 | 5:00～7:00 | `aerial-supported-seat` |
| `aerial-1-reach` | 第 1 輪・吊布支撐倒掛與回正 | 7:40～9:40 | `aerial-supported-inversion` |
| `aerial-2-hinge` | 第 2 輪・吊布離地坐姿 | 11:40～13:40 | `aerial-supported-seat` |
| `aerial-2-reach` | 第 2 輪・吊布支撐倒掛與回正 | 14:20～16:20 | `aerial-supported-inversion` |
| `aerial-3-hinge` | 第 3 輪・吊布離地坐姿 | 18:20～20:20 | `aerial-supported-seat` |
| `aerial-3-reach` | 第 3 輪・吊布支撐倒掛與回正 | 21:00～23:00 | `aerial-supported-inversion` |

原地面暖身、左右舒展、屈髖與緩和段保留 `activationKind: 'mobility'`，圖例顯示活動與伸展目標。離地坐姿與倒掛段使用 `activationKind: 'support'`，紅色顯示主要支撐與參與、橘色顯示輔助與支撐，不把它稱為伸展或量測的出力。教練與學員跟隨同一課程時鐘；中途加入空中段也會先坐入兜布，再銜接當下姿勢。

進出時先握住局部高度 1.60 m、前方 0.30 m 的停放手把，再拉到準備位；伸手中段採較低的手肘方向，回到原準備姿勢時平順混合。空中瑜珈的局部入口為 `[1.35, 0, 1.05]`，轉成教室世界位置後避開舞台與吊布的導航包圍盒。原生網頁已確認能加入空中課、離場，再走到胸推並就位；主動作與原場館格局保留。

最終空中動作與進出、返回、加入共 2,222 姿勢通過；最大接點可達誤差 2.170287 mm、承托面與實際外皮最小間隙約 8.128 mm。每姿勢另以 stride 1 檢查髖與大腿的真正蒙皮及衣物，累計 4,688,964 次承托投影範圍內的頂點檢查，沒有套用軟接觸豁免。這是有限取樣的幾何證據，精確範圍見[正式吊布報告](../artifacts/aerial-v013/qualification.json)。

十張本版空中圖片已由 AI 實際開圖查看，包含六張正側背、兩張全教室及進出兩張分格圖，見[看圖紀錄](../artifacts/release-v013/visual/aerial-agent-observation.json)。側布會遮擋部分手臂與髖部，教室圖片有學員裁切、前景與面板遮擋；布面仍是粗節點近似，靜態圖片也不能涵蓋完整連續動作。真人教練簽核尚未完成。

布面、固定端點、材料區域與取樣限制見[吊布支撐說明](aerial-suspension-v013.md)。六個新標題的換段提醒與開始口令由同一份課表產生，正式語音檔及覆蓋檢查以本版總驗證為準。

## 官方資料如何使用

- 暖身與緩和採各五分鐘。AHA 的一般建議是各花五到十分鐘，並以較慢節奏漸進進入、離開活動；此處只參考漸進原則，沒有引用療效或把同一份課表套成個人處方。[AHA：Warm Up, Cool Down](https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down)
- 舞蹈先練主段會用到的簡單腳步，再加入手臂與不同組合，最後縮小步幅。這符合 ACE 對暖身預演主段動作、平順轉換的建議；舞步與順序由遊戲自行編排。[ACE：Movement Sequencing](https://www.acefitness.org/continuing-education/certified/october-2023/8462/movement-sequencing-strategies-to-build-a-smooth-and-effective-group-fitness-experience/)、[World Gym：舞動有氧](https://www.worldgymtaiwan.com/aerobics-class/cardio-sculpt/cardio-fat-burning/dance-aerobics)
- 飛輪參考坐姿踩踏與節奏變化。Spinning 官方分別說明平路與爬坡踏頻；遊戲沒有模擬真實阻力、坡度或心率，因此不把自己的 60～90 rpm 分段稱為品牌標準課程，也不顯示虛構的生理數值。[Spinning：Cadence Ranges](https://spinning.com/blogs/default-blog/how-to-measure-cadence-ranges-while-spinning)、[World Gym：飛輪課程](https://www.worldgymtaiwan.com/aerobics-class/indoor-cycling/indoor-cycling)
- TRX 參考低划船、淺蹲、可調身體角度及分組休息的形式。官方快速入門與動作資料提供這些基本類型；本版只用已校正的握帶、雙腳著地版本，沒有照搬進階懸吊課表。[TRX：Quick Start](https://www.trxtraining.com/pages/quickstart-suspension-trainer)、[TRX：Design Your Own Workouts](https://www.trxtraining.com/blogs/news/design-your-own-trx-workouts)、[TRX：Quick Start Guide](https://www.trxtraining.com/pages/trx-quick-start-guide)
- 槓鈴團課參考以不同動作、節奏、組次與恢復編排的形式。Les Mills 的官方介紹列有不同長度的槓鈴課，但這裡的三輪安排、短槓道具和動作順序是原創，沒有使用 BODYPUMP 的編舞、音樂或品牌課表。[Les Mills：Strength Continuum](https://www.lesmills.com/nordic/articles/understanding-the-strength-continuum-2)
- 空中瑜珈使用雙點吊布，加入受支撐坐姿與緩慢倒掛。Aerial Essentials 的 FAQ 說明雙點形式與布底約在髖部的設備概念；Aerial Fabric Acrobatics 也說明寬布與雙點吊布的形式。這些資料支持設備形式，沒有審核本遊戲的 120 秒動作或安裝尺寸；動畫與布面是遊戲自行製作，實際上布及倒掛由現場教練帶領。[Aerial Essentials：FAQ](https://www.aerialessentials.com/pages/faq)、[Aerial Fabric Acrobatics：雙點吊布](https://aerialfabric.com/products/adjustable-double-point-hammock)。先前地面版本另參考 [Uplift Active：FAQ](https://upliftactive.com/pages/faqs) 與 [Studio Guide](https://upliftactive.com/pages/aerial-yoga-studio-set-up-guide)。
- 皮拉提斯參考呼吸、姿勢與平順控制；腳跟滑動、開膝、小幅橋式等是遊戲動作變式。NHS 的介紹和教學資料提供相關概念，但沒有授權或審查本遊戲的完整課表；本版也不宣稱能治療特定症狀。[NHS：Pilates for Beginners](https://www.nhs.uk/live-well/exercise/pilates-and-yoga/pilates-for-beginners/)、[NHS CUH：General Exercises](https://www.cuh.nhs.uk/patient-information/general-exercises/)、[World Gym：皮拉提斯](https://www.worldgymtaiwan.com/aerobics-class/static-stretching/wellness-fitness/pilates)

## 完成與預覽

課程時間從人物和場內學員就位後開始，經暖身、主訓與緩和，走到終點就停下，不會重新循環。暫停和慢速會影響時間推進。點段落或拖曳進度屬於預覽；抵達結尾時會寫「預覽已到課程結尾」，不算完整上課。從頭重新上課會清除這次預覽旗標。

「已了解」仍只保存動作學習。結束摘要中的時間是遊戲播放進度，不是玩家的身體運動紀錄。真人教練仍須逐項核對動作、節奏、劑量、休息、適用對象與進退階；簽核欄見 [教練審核表](coach-review-checklist.md)。

## 0.7～0.12 歷史動作銜接證據

本節保留新增離地版本之前的課程證據，不能把舊地面空中瑜珈的取樣當成 0.13 倒掛已通過驗證。新動作另查[本版吊布檢查範圍](aerial-suspension-v013.md)與正式來源雜湊。

七課全部 152 個內部段界已經正式團課介面取樣。段界前後各 0.0001 秒，最大關節差 0.362833 mm、真實手部表面差 0.00000762 mm，均低於 0.5 mm 門檻；來源與模型 hash 前後一致，見 [正式段界報告](../artifacts/full-course-boundary-qualification.json)。另外記錄 100 ms 內的正常移動量，不把持續踩踏要求成零位移。

槓鈴握持另以全部手部蒙皮頂點檢查，最大入軸深度 0.675351 mm，低於 1 mm 容許值。七課中途返回的 74 個主角及 21 個 NPC 案例也已重測，接回既有離場姿勢時最大肘部差 4.817579 mm，低於既有 15 mm 門檻。全課教室的 159 段與七次 NPC 換課也已通過有限時間點的幾何檢查。這些是幾何與銜接的數值證據，不能取代真人對動作教學、節奏和適用性的判斷；各報告及取樣限制見 [功能核對](feature-audit.md)。

## 0.7.0 課程看圖索引

當時每個課內動作輸出正、側、背三向，各三個代表時點，共 45 張九格圖、405 格；另有七張教室圖與 14 張握把近景。放槓休息圖採放下、空手休息與重新拿起的時點。當時的 66 張 PNG 均已實際開圖複核，記錄於[地面組報告](../artifacts/visual-floor-review.json)與[器材組報告](../artifacts/full-course-review/visual-equipment-review.json)，未確認新的明顯穿插；帶子、吊布與器材遮擋，以及靜態取樣和像素限制仍保留。這是 AI 圖像檢查，真人教練簽核尚未完成。

### group-class

全身活動課：[教室畫面](../artifacts/full-course-review/group-class-room.png)

- [march](../artifacts/full-course-review/group-class-march.png)
- [shoulder-open](../artifacts/full-course-review/group-class-shoulder-open.png)
- [side-step](../artifacts/full-course-review/group-class-side-step.png)
- [hip-hinge](../artifacts/full-course-review/group-class-hip-hinge.png)
- [knee-lift](../artifacts/full-course-review/group-class-knee-lift.png)
- [shallow-squat](../artifacts/full-course-review/group-class-shallow-squat.png)
- [breathe](../artifacts/full-course-review/group-class-breathe.png)

### class-dance

有氧舞蹈：[教室畫面](../artifacts/full-course-review/class-dance-room.png)

- [march](../artifacts/full-course-review/class-dance-march.png)
- [step-touch](../artifacts/full-course-review/class-dance-step-touch.png)
- [side-reach](../artifacts/full-course-review/class-dance-side-reach.png)
- [knee-lift](../artifacts/full-course-review/class-dance-knee-lift.png)
- [v-step](../artifacts/full-course-review/class-dance-v-step.png)
- [arm-combo](../artifacts/full-course-review/class-dance-arm-combo.png)
- [recover](../artifacts/full-course-review/class-dance-recover.png)
- [hamstring-curl](../artifacts/full-course-review/class-dance-hamstring-curl.png)

### class-cycle

飛輪課：[教室畫面](../artifacts/full-course-review/class-cycle-room.png)

- [cycle-easy](../artifacts/full-course-review/class-cycle-cycle-easy.png)
- [cycle-steady](../artifacts/full-course-review/class-cycle-cycle-steady.png)
- [cycle-cadence](../artifacts/full-course-review/class-cycle-cycle-cadence.png)
- [cycle-recovery](../artifacts/full-course-review/class-cycle-cycle-recovery.png)

### class-trx

TRX 懸吊訓練：[教室畫面](../artifacts/full-course-review/class-trx-room.png)

- [trx-recovery](../artifacts/full-course-review/class-trx-trx-recovery.png)
- [trx-low-row](../artifacts/full-course-review/class-trx-trx-low-row.png)
- [trx-shallow-squat](../artifacts/full-course-review/class-trx-trx-shallow-squat.png)
- [trx-alternating-row](../artifacts/full-course-review/class-trx-trx-alternating-row.png)
- [trx-row-hold](../artifacts/full-course-review/class-trx-trx-row-hold.png)
- [trx-squat-hold](../artifacts/full-course-review/class-trx-trx-squat-hold.png)

### class-barbell

槓鈴肌力訓練：[教室畫面](../artifacts/full-course-review/class-barbell-room.png)

- [hinge-prep](../artifacts/full-course-review/class-barbell-hinge-prep.png)
- [shallow-deadlift](../artifacts/full-course-review/class-barbell-shallow-deadlift.png)
- [put-down-rest](../artifacts/full-course-review/class-barbell-put-down-rest.png)
- [romanian-deadlift](../artifacts/full-course-review/class-barbell-romanian-deadlift.png)
- [bent-row](../artifacts/full-course-review/class-barbell-bent-row.png)
- [biceps-curl](../artifacts/full-course-review/class-barbell-biceps-curl.png)
- [hold-rest](../artifacts/full-course-review/class-barbell-hold-rest.png)

### class-aerial

空中瑜珈入門的歷史地面版本：[教室畫面](../artifacts/full-course-review/class-aerial-room.png)。以下六張不能代替 0.13 新離地動作的看圖檢查。

- [aerial-recovery](../artifacts/full-course-review/class-aerial-aerial-recovery.png)
- [aerial-standing-reach](../artifacts/full-course-review/class-aerial-aerial-standing-reach.png)
- [aerial-assisted-hinge](../artifacts/full-course-review/class-aerial-aerial-assisted-hinge.png)
- [aerial-side-left](../artifacts/full-course-review/class-aerial-aerial-side-left.png)
- [aerial-side-right](../artifacts/full-course-review/class-aerial-aerial-side-right.png)
- [aerial-hinge-hold](../artifacts/full-course-review/class-aerial-aerial-hinge-hold.png)

### class-pilates

墊上皮拉提斯：[教室畫面](../artifacts/full-course-review/class-pilates-room.png)

- [breathe](../artifacts/full-course-review/class-pilates-breathe.png)
- [pelvic-control](../artifacts/full-course-review/class-pilates-pelvic-control.png)
- [heel-slide](../artifacts/full-course-review/class-pilates-heel-slide.png)
- [toe-tap](../artifacts/full-course-review/class-pilates-toe-tap.png)
- [knee-open](../artifacts/full-course-review/class-pilates-knee-open.png)
- [bridge](../artifacts/full-course-review/class-pilates-bridge.png)
- [rest](../artifacts/full-course-review/class-pilates-rest.png)
