# 教室／浴室專用 GPU 資源休眠（v0.11）

房間離開視野後仍先移出 render scene。隱藏滿 12 秒，才釋放可證明由該房間獨占的 GPU geometry、material 與 texture 快取。CPU Object3D、typed arrays、圖片／Canvas Source、格局、碰撞資料、骨架與姿勢都保留；全館共用真人模型及共用 GPU 資源也保留。這是部分 GPU eviction，沒有把移出 Scene 或保留 CPU 模型稱作完整卸載。

## 接入

```js
const roomResources = createRoomResourceManager({
  scene,
  rooms: {
    classroom: architecture.roomZones.getRoot('classroom'),
    bathroom: architecture.roomZones.getRoot('bathroom'),
  },
  getInventoryRoots: () => [
    ...architecture.roomZones.getInventoryRoots(),
    ...groupClasses.getInventoryRoots(),
    // Additional cached equipment roots, if held outside these trees.
  ],
  getProtectedResources: () => ({
    character: character.getGpuResourceProtection(),
    globalMaterials: Object.values(materials),
    environment: environmentTarget.texture,
  }),
  cooldownSeconds: 12,
});
architecture.roomZones.setResourceManager(roomResources);
```

`room-zones` 在可見前同步呼叫 `wakeRoom`，接著才把 root 接回 Scene。原 CPU attribute、material 和 texture 標記重新上傳；同一幀的 Three render 以原物件重建 GPU 資源，不重建人物或重播課程。關閉 `roomResources.setEnabled(false)` 會立即恢復全部已釋放資源的上傳狀態。

`inspect()` 會主動重盤完整引用，`getDiagnostics()` 回傳上次盤點與目前狀態，後者不重新走訪全圖。完整盤點只在確實準備釋放或明確呼叫 inspect 時進行，沒有新增每幀全館掃描。

## 安全界線

每次釋放前都重新盤點 active scene、parked resident cache、兩房 root、所有曾註冊 root、所有已生成團課 gear 與額外 cached roots，包含隱藏 mesh 和設備 proxy。晚生成的 root 會使該房盤點失效，下一次冷卻檢查再掃描。

以下資源保留：

- 跨房／全館共用 geometry、material 或 texture；任一不同 geometry 共享 attribute／index／底層 ArrayBuffer，也保守排除。
- 全部 SkinnedMesh、骨架子樹附屬物、InstancedMesh proxy，以及真人共享 registry 內未掛在 graph 的 full／LOD geometry、material、texture。
- Scene environment／background、全域指定材質、shadow／render-target／PMREM texture、video texture、共用 Texture Source／圖片，以及沒有可供重上傳 CPU array 的外部 GLBufferAttribute。
- shader 深層 uniform 使用的 texture、customDepthMaterial、customDistanceMaterial 同樣納入引用盤點，不能只查 material.map。

同一房內多個 mesh 引用同一個房間專用 geometry／material，只 dispose 一次。靜態合併後留下的原 CPU root 若完全 detached，仍保留明確註冊的房間 ownership；若暫時移到 review／global Scene，則改視為外部引用並保護。任意 userData.roomId 不會單獨授予資源釋放資格。

Three 的 geometry.dispose 會移除 geometry 的 attribute/index GPU buffers，這也是必須排除 attributes 別名的原因。material.dispose 釋放該 material 的 shader program 引用；shader code 仍被其他 material 共用時，實際 program 可繼續存在。texture.dispose 保留 CPU Source，恢復時重新上傳；此流程不呼叫 image.close。

## 驗證與實測邊界

`node --test tests/room-gpu-resources-v011.test.mjs` 共 9／9 通過，包含共享資源／attribute 別名／parked roots／骨架與徽章／proxy／shader uniform／late gear／引用盤點失敗時不釋放／醒來先於顯示。當次全專案 Node 測試為 85／85 通過。

`node scripts/qualify-room-gpu-resources-v011.mjs` 輸出新報告 `artifacts/room-gpu-resources-v011/cpu-qualification.json`，沒有覆寫 v0.10 證據。使用實際 architecture、production 相同的靜態 room merge、四種 full／LOD 外型快取、192 個 equipment proxies，以及四位角色 × 七課共 28 組 cached programs。盤點 3,125 個 Object3D；睡眠／醒來後世界矩陣、geometry arrays 與參照、Texture Source／image、碰撞、接點及肌群快照不變，真人 protected resource 的 dispose event 為零。

CPU fixture 在教室對 214 個 geometry／29 個 material、浴室對 254 個 geometry／6 個 material 發出 dispose；估算的保留 source buffer 為 866,152／514,352 bytes。這包含從未上傳的 detached CPU 原描述，**不是實際釋放 GPU 數量或 GPU bytes**。fixture 沒有產生 world.js 的文字標牌 texture，也沒有解碼原模型圖片，不能用此處 texture=0 推斷 production 沒有可釋放貼圖。

真實 WebGL 驗收應先顯示並 render 各房，使要比較的器材與標牌確實配置 GPU 資源，再檢查冷卻後的 deleteBuffer／deleteTexture 呼叫、renderer.info.memory，以及恢復顯示後的重建與畫面。未 render 的 cached gear 原本沒有 GPU 配置；dispose event、source buffer 估算與移出 Scene 都不能替代這項實測。GPU 結果由主流程另外記錄，本文件不宣稱 CPU 檢查已證明實際 GL 記憶體下降或完整無穿模。


主流程已補上[實際原生 WebGL 循環](../artifacts/room-gpu-resources-v011/native-cycle.json)：Intel UHD 630 真正刪除 192 個 buffer、6 張 texture，renderer geometry／texture 計數由 605／254 降至 572／248，返回兩房恢復為 605／254；舞蹈課與淋浴進出皆可繼續使用。另有單項 SwiftShader 恢復測試通過。當前完整 Node 為 93／93；較早的 85／85 是此子功能完成時的統計。

[四輪前後效能](performance-v011.md)沒有測得穩定畫面時間改善；本功能的可確認結果是閒置 GPU 物件數下降，沒有量測或宣稱精確 VRAM bytes。
