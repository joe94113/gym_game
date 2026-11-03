# 搜尋與 GitHub Pages 上線準備

這版完成靜態網站的 SEO 基礎與 GitHub Pages 專案路徑相容。尚未建立遠端儲存庫或公開部署，沒有宣稱已被 Google 收錄、已有搜尋排名或 Search Console 成效。

## 已做的內容

- 首頁與八個文字頁有各自的標題、介紹、一個主要標題及可直接追蹤的連結。指南不執行遊戲程式、不下載人物模型，關閉 JavaScript 仍能讀。
- 指南分為啞鈴、龍門架、固定／槓片／槓鈴、有氧、草皮伸展、團課六類；與遊戲共用 65 個學習動作的資料，避免器材說明分成兩套。可由文字頁直接開啟相同動作的 3D 示範。
- 正式網址有值時，產生 canonical、Open Graph、社群分享卡及 JSON-LD。首頁描述 WebSite／VideoGame，分類使用 CollectionPage 與麵包屑；沒有虛構評分、評論、教練簽名或醫療認證。
- 網站地圖只列九個公開標準網址，不含動作查詢參數、預覽和 404 頁。正式網址未填時使用 noindex，不生成虛構網域的 sitemap。
- 有真正的 404 文件、`.nojekyll`、robots.txt；模型、聲音、圖片、字樣與 manifest 支援 GitHub Pages 的 `/儲存庫/` 子路徑。
- 保留 M 字槓鈴主標，將 favicon 簡化為單片槓片、移除小十字；提供 SVG、48／96 PNG、Apple touch 180、maskable 192／512，以及 1200×630 的分享圖。

## 第一次放到 GitHub Pages

1. 將專案放進 GitHub 儲存庫，推送到 `main`。不要把 `.env`、`server/data`、本機測試產物或任何帳號資料放進去。
2. 在儲存庫的 **Settings → Pages → Source** 選 **GitHub Actions**。
3. `.github/workflows/pages.yml` 會安裝依賴、驗證部署設定、建置並上傳 `dist`，再由部署工作發布。網址從 `actions/configure-pages` 的 `base_url` 取得，不需要先買網域或手填帳號／儲存庫名稱。
4. 如將來改用自訂網域，可設定 repository variable `SITE_URL` 為實際的 HTTPS 網站根網址，並完成 Pages 的網域及 HTTPS 設定後再建置。
5. 發布後用真實網址檢查首頁、`guide/`、模型與音效、分享圖、`sitemap.xml`。最後在自己的 Google Search Console 驗證網站，提交 sitemap 並檢查代表頁面的網址。這一步需要實際公開網址及帳號，本機不能完成。

一般專案網址是 `https://帳號.github.io/儲存庫/`；帳號根站及自訂網域通常是 `/`。設定由完整網址推導，兩種都支援。若儲存庫預設分支不是 `main`，需同步改 workflow 的分支。

## Pages 版本的資料保存

GitHub Pages 只提供靜態檔案，不能執行本專案的 Node 帳號 API。`build:pages` 一律使用 `local` 模式：

- 日誌、學習進度及訓練安排保存在目前瀏覽器，沒有隱藏的登入或同步請求。
- 「資料備份」提供 JSON 匯入／匯出與 CSV。換裝置可用 JSON 轉移，清除網站資料前要先備份。
- 原有自架版的帳號功能仍可用；要在 Pages 上跨裝置自動同步，需要另接後端並重新驗證，這次沒有部署這個服務。

## 本機檢查建置

`npm run build` 可檢查未設定公開網址的本機版，預設自架帳號模式，SEO 使用 noindex。

若要檢查 Pages 產物，將實際網址放進環境變數或 `.env.pages.local`，再執行：

```powershell
$env:VITE_SITE_URL = 'https://你的帳號.github.io/你的儲存庫/'
npm.cmd run build:pages
```

範例帳號文字是佔位說明，不能直接當正式設定使用。`VITE_SITE_URL` 不含查詢或錨點；建置會推導正確子路徑並強制本機日誌模式。未提供網址時，`build:pages` 會停止，避免把測試網址發布出去。

## 搜尋與效能的實際限制

Google 使用網域根目錄的 `/robots.txt`。專案站的 `/儲存庫/robots.txt` 無法控制整個 `帳號.github.io` 的爬取；若另有帳號根站，需在該站管理根 robots。頁面的 robots meta 與 sitemap 不受這個路徑限制。robots 也不是保護私人資料的方式。

這些設定有助於搜尋引擎理解內容，不保證收錄、排名、顯示指定摘要或應用程式豐富搜尋結果。真正的搜尋表現要在公開上線後觀察；本輪沒有把結構化資料通過當成流量成效。

遊戲仍有約 1.5 MB 的 JavaScript 主包與 3D 模型，首次載入和持續遊玩卡頓仍需另行改善；新增文字指南不載入這些資源。既有的載入停頓比較見[0.13 效能紀錄](performance-v013.md)，這不是 0.14 的新效能測量。

## 尚未完成與後續安排

- 公開儲存庫、正式網址、GitHub Pages 實際部署、Search Console 驗證與收錄觀察。
- 真人教練看過連續動作並提出修正；工作台已提供，尚未填入真人簽核。
- 器材動作的真人動捕擴充；目前只有玩家走跑手臂混合動捕，其餘仍是編排的骨架及接點動作。
- 持續遊玩長幀、吊布上布時的負載與更多顯示卡／瀏覽器驗證。
- Pages 上的帳號自動同步、密碼恢復需要額外後端；現階段採本機保存與手動備份。

全身與布面使用受約束的路徑、碰撞及蒙皮抽樣，沒有宣稱完整通用物理或所有姿勢都不會穿模。運動電視仍是原創動畫，並非真實頻道直播。

## 本次驗證

最後來源的 167 項 Node 全過，一般自架與 Pages 兩種正式建置通過。以原生 Intel UHD 630 Chromium 直接服務靜態產物，在 `/gym-game/` 子路徑完成九步操作驗證：九個公開頁面無 JavaScript 可讀、真正 404、模型及圖片載入、自由走動、本機日誌與備份重載、動作深連結與紅橘圖例、manifest／實際 WAV，以及零帳號 API／無損壞的 HTTP 資產。

另重跑兩項自架日誌與雙瀏覽器帳號同步案例，並檢查正式 Node 伺服器的八條 HTTP 回應。圖示有小尺寸與系統裁切的模擬看圖紀錄，沒有冒稱實機安裝驗收。317 個受測來源、建置檔及圖片雜湊核對通過；工具初輪的名稱與合法 blob 分類錯誤及後續實際重跑均保留。

完整結果見[0.14 驗證摘要](../artifacts/verification-summary-v0.14.json)。本輪未重新執行 0.13 的完整 53 個網頁案例或重新測 FPS；原先的密集動作報告保留為歷史證據。

參考：[Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)、[Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[favicon](https://developers.google.com/search/docs/appearance/favicon-in-search)、[robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)、[GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Vite Pages 部署](https://vite.dev/guide/static-deploy.html#github-pages)。
