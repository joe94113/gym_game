# 0.11 原生 WebGL 與房間資源實測

這次確認房間休眠後確實釋放 GPU 物件；穩定畫面時間沒有變快。三個視角的繪製呼叫數維持不變，不能把物件釋放說成 FPS 提升。

測量硬體為 Intel UHD Graphics 630，Chromium ANGLE D3D11／WebGL2。使用同一台電腦、1280×800 視窗、DPR 1、流暢模式、1088×680 framebuffer，初始 RAF 在載入前停用。每個視角另開頁面，兩個房間先真正 render，再以相同玩家位置／攝影機和 15 秒模擬時間等待冷卻。每次先暖機 16 格，再測 64 格；依「前、後、後、前」順序各跑兩次，表格合併為每視角 128 格。當時無其他代理 CPU／GPU 測試工作。

| 視角 | 整幀中位數 ms，前 → 後 | 整幀 p95 ms，前 → 後 | CPU 更新中位數 ms，前 → 後 | GL buffer 物件，前 → 後 | GL texture 物件，前 → 後 |
| --- | --- | --- | --- | --- | --- |
| 主場館 | 9.80 → 10.30 | 59.10 → 56.60 | 0.70 → 0.80 | 2646 → 2454 | 267 → 261 |
| 團課教室 | 5.70 → 5.90 | 13.90 → 14.10 | 1.20 → 1.20 | 2634 → 2466 | 267 → 262 |
| 浴室 | 2.60 → 2.80 | 3.70 → 3.80 | 0.40 → 0.40 | 2631 → 2607 | 267 → 266 |

整幀時間包含 CPU 更新、提交繪製與 gl.finish 等待，並非單獨 GPU 毫秒或螢幕實際 FPS。buffer／texture 欄為第一輪兩版的 live API handle 數；第二輪原始數也保留在 JSON，不能拿物件數當成 VRAM bytes。兩輪仍有排程及 GPU 負載差異，沒有據此保證其他電腦的幀率。閒置資源下降是這次可確認的效果；後續若要持續降低畫面時間，仍需從可見物件、材質、人物與特效成本下手。

另以[正式 GL 冷卻／返回測試](../artifacts/room-gpu-resources-v011/native-cycle.json)計算真正已配置的 deleteBuffer／deleteTexture 呼叫：兩房冷卻共刪除 192 個 buffer 與 6 張 texture，renderer.info.memory 的 geometry／texture 物件由 605／254 降至 572／248；依序返回教室、浴室後恢復到 605／254，並能繼續上舞蹈課及使用淋浴。CPU 模型、共享人物、LOD、環境及跨區資源保留。

[合併數字與四輪原始檔](../artifacts/performance-v011/comparison.json)包含每格毫秒、renderer、相機、畫面大小、source SHA、room diagnostics 與 GL 計數。前版來源在 .local-tools/v011-before，來源雜湊與 0.10 封存核對；[0.9 的 SwiftShader 歷史紀錄](performance-v09.md)仍保留，兩種 renderer 的數字不能直接互比。
