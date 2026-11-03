# 訓練日誌、帳號與跨裝置保存

日誌只收錄使用者自己填寫的實際訓練。播放示範、上完遊戲課程或按「已了解」都不會自動產生重量、次數或運動紀錄。

## 網頁操作

上方「訓練日誌」可新增日期、動作、各組重量、次數、秒數、吃力程度與備註。次數和秒數至少填一項；重量及吃力程度可以留空。重量另記「總重量／每手／每側不含槓／額外負重／徒手」，避免把啞鈴每手重量和整支槓的重量混在一起。可以複製組別、編輯或刪除紀錄，查看當日、本週（週一到週日）及全部摘要。

JSON 備份包含日誌、學習進度與訓練安排；合併匯入保留本機資料，同一筆有不同內容時另存複本。CSV 可用試算表閱讀，每組各一列；文字以公式起始字元開頭時會加單引號，避免備註被試算表當公式執行。CSV 不用來還原。

每個瀏覽器可以先記訪客日誌。第一次啟用會擷取原有的 `form.exercise-progress.v1`、`form.learned` 和 `form.training-profile.v1` 所對應的程式狀態，不會先套用空資料。帳號各用自己的本機資料區；登入不會直接把訪客日誌灌入帳號，需要時按「匯入這台裝置的離線紀錄」。登出會恢復原訪客資料，並保留帳號尚未同步的本機備份。

## 帳號與同步

「帳號」提供註冊、登入、登出和更改密碼。帳號使用 3～32 個英文字母、數字、點、底線或連字號，密碼為 10～128 字元。沒有電子郵件找回密碼；更換伺服器前可先匯出 JSON。

資料存放在執行遊戲的同一個伺服器，**目前沒有部署公網代管服務**。其他瀏覽器或裝置連到這台伺服器，再登入同一帳號，即可同步日誌、動作學習、器材認識與訓練安排。離線時先留在原瀏覽器，重新連線、切回視窗或按「立即同步」後再送出。自動同步由資料修改觸發，沒有每幀或持續輪詢。

同步採版本檢查。其他裝置已寫入新版本時，伺服器回傳 HTTP 409，網頁請使用者選擇合併方式。三方合併會辨認只有一邊修改的紀錄；同一筆真的被兩邊改動時保留兩份，刪除碰上另一邊編輯也會保留可核對的內容。學習進度合併保留；兩邊都改訓練安排時，由使用者選擇本機或伺服器的安排。更改密碼後，其他裝置的登入 session 失效。

## 執行伺服器

開發模式由 `vite.config.js` 掛上 `/api/form/v1/` API。原本已開著的 Vite 需要重啟才會掛上新 API。

```powershell
npm.cmd run dev
```

正式執行先建置，再啟動 Node。預設只監聽 `127.0.0.1:5173`，不會直接對外開放。

```powershell
npm.cmd run build
node server/start.mjs
```

同一區網的其他裝置要連線時，可在主機設定監聽位址，並用主機的區網 IP 開啟網頁；`127.0.0.1` 在其他裝置代表它自己。

```powershell
$env:HOST='0.0.0.0'
$env:PORT='5173'
node server/start.mjs
```

開發模式則使用 `npm.cmd run dev -- --host 0.0.0.0`。若透過 HTTPS 反向代理公開，設定 `FORM_PUBLIC_ORIGIN` 為實際完整來源，例如 `https://gym.example.com`；這會啟用 Secure cookie 與對應的來源檢查。這是部署方式，並不表示本次已取得網域、憑證或完成公網部署。

預設資料保存在 `server/data/accounts.json`，可用 `FORM_DATA_DIR` 改到其他持久目錄。請備份這個目錄；不能只複製 `dist/` 後丟到純靜態主機，因為帳號 API 需要 Node 程序。此版是單一 Node 程序的自架服務，尚未提供多節點共用資料庫。Vite 除了 fs deny，也會攔截帳號目錄的直接 URL、編碼、大小寫與 `@fs` 存取；正式伺服器只服務 `dist/`。

密碼使用獨立隨機鹽值與 scrypt 雜湊，session 使用隨機 token，伺服器只保存 token 雜湊。Cookie 設為 HttpOnly、SameSite=Strict，HTTPS 設定下再加 Secure。修改請求有來源檢查、JSON 與大小上限、欄位驗證和限流。開發測試帳號使用作業系統暫存目錄，不寫入正式的 `server/data/`。

## 程式介面

```js
const journal = createTrainingJournal({
  getCatalog: () => catalogActivities,
  getProgress: () => ({learned: [...state.learned], knowledge: [...state.knowledge]}),
  getProfile: () => state.trainingProfile,
  onRemoteState(snapshot) { /* 套用進度及安排，然後保存／重畫既有 UI */ },
  onOpenChange(open) { /* 暫停或恢復場景鍵盤操作 */ },
});
journal.open({exerciseId: 'dumbbell-curl'});
journal.openAccount();
```

在原本保存學習進度或訓練設定後呼叫 `journal.captureLearningState()`。套用遠端資料期間內部會抑制重複擷取，避免循環。另提供 `sync()`、`close()`、`ready`、`getDiagnostics()` 及 `dispose()`；診斷只有數量和狀態，不回傳密碼或 cookie。

## 驗證

`node --test tests/training-journal-v013.test.mjs tests/account-api-v013.test.mjs` 共 16 項已通過，包含日期／數值、日週摘要、三方合併、刪除衝突、JSON 保留進度、CSV 公式處理、首次啟用遷移、離線保存及同步途中再編輯。

HTTP 測試實際啟動獨立本機伺服器，檢查鹽值雜湊、Cookie、來源阻擋、欄位驗證、409 競爭寫入、重啟持久化、登出／密碼撤銷、限流和兩個 client 的真正同步。測試完成會關閉自己的隨機連接埠並移除經路徑檢查的暫存資料。

`tests/journal-ui-v013.spec.js` 的兩項原生網頁案例也已在本版固定來源下實際通過。它以獨立暫存 API 檢查實際表單、編輯刪除、下載匯入，以及兩個瀏覽器 context 的登入與同步；同步證據來自同一伺服器上的兩個獨立瀏覽器資料區。這兩項與其他原生測試由主流程統一排程，避開正式 3D 效能測量；完整回歸的最終狀態另由[本版總驗證](../artifacts/verification-summary.json)彙整。
