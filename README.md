# S1 Studio (`s1-studio`)

**S1 Studio** 是一個開源、不綁定單一廠商（Vendor-neutral）的 Web UI 測試沙盒，專為相容於 `/v1/systemone` 協定的結構化決策模型（如 **TypeSafe Jev**、**Ollama `clef` / `clef-flash` / `clef:cloud`** 及自建端點）打造。

---

## ✨ 核心功能亮點

### 1. 端點與連線設定檔管理 (Endpoint Profiles & CORS Proxy)
- 內建三組標準端點範本與一組本機沙盒模擬器：
  - **Local Ollama**：`http://localhost:11434` (`clef` / `clef-flash`)
  - **Ollama Cloud**：`https://ollama.com` (`clef:cloud`)
  - **TypeSafe AI**：`https://api.typesafe.ai` (`jev-1.13.0`)
  - **Built-in Sandbox Simulator**：`/api/mock-systemone`（免外部連線即可完整體驗機率分佈與兩極化警示）
- **雙發送模式（Direct / Proxy Mode）**：
  - **Direct Mode**：由瀏覽器直接發送 `fetch` 請求（適合測試本機已設定 `OLLAMA_ORIGINS="*"` 的 Ollama）。
  - **Proxy Mode**：透過內建無狀態 `/api/proxy`（本機為 Next.js API Route，部署至 Cloudflare Pages 時自動轉換為 Cloudflare Edge Worker `functions/api/proxy.ts`）轉發請求，解決雲端 CORS 阻擋問題，且不留存任何 Payload 與金鑰。

### 2. 狀態與多模態視覺輸入 (State & Multimodal Input)
- **State 雙模式**：支援 `Text Mode` 純文字與 `JSON Mode`（CodeMirror 6 語法高亮與即時格式檢查，送出時自動以 JSON Object/Array 封裝而非轉義字串）。
- **Images 視覺輸入**：
  - 支援拖曳上傳或剪貼簿 `⌘V` 貼上 `PNG`、`JPEG`、`WebP` 圖片。
  - 自動剝除 `data:image/...;base64,` 前綴，轉為符合 `/v1/systemone` 規範的純 Base64 字串。
  - 內建容量與解析度防呆檢查：單次上限 **4 張**、單張上限 **4 MiB (16 MP)**、總容量上限 **8 MiB**。

### 3. 決策問題建構器 (Questions Builder)
- 支援單次請求最多 **64 個問題**，即時驗證 Question Key 正規表示式 `^[a-zA-Z0-9_.-]{1,100}$` 與重複鍵名。
- **GUI 表單與 Raw JSON 雙向即時同步**。
- 三種決策原語（Primitives）：
  - `noul`：布林機率評估。
  - `choice`：動態 Key-Value `criteria` 清單，支援 **拖曳排序（Drag-and-drop）** 以控制同分判定（Tie-breaking）優先順序。
  - `score`：動態有序等級陣列（最少 2 個等級），支援拖曳調整等級順序。

### 4. 視覺化診斷卡片 (Results & Diagnostics)
- **Noul 結果卡**：顯示 `0.000 ~ 1.000` 機率與進度條，內建 **Threshold 模擬滑桿**（預設 `0.50`），即時預覽 `TRUE (PASS)` 或 `FALSE (REJECT)` 判定。
- **Choice 結果卡**：醒目標示勝出選項、`confidence` 集中度與第一、二名領先幅度，並繪製 100% 橫條機率圖。
- **Score 結果卡**：顯示期望值 `score` 與 `confidence`，並內建 **兩極化分佈偵測（Bimodal Detection）**，當模型在首尾兩端等級同時給出高機率時自動發出警示。

### 5. 開發者工具：匯出、A/B 對比與歷史紀錄 (DX, Compare & History)
- **Code Exporter**：一鍵匯出 `cURL -s ... | jq`、`Python (typesafe-sdk)`、`TypeScript (@typesafe/sdk)` 與 `Native fetch` 程式碼，支援 `$API_KEY` 環境變數或帶入實際金鑰切換。
- **A/B 端點對比模式 (Compare Mode)**：同時選擇兩個 Profile 平行發送請求，並排比對延遲（Latency ms）、勝出選項與機率分佈差異。
- **Presets 與 IndexedDB History**：內建三大經典測試場景，自動透過 Dexie.js 記錄最近 50 筆測試歷史，並支援匯出入 `.s1.json` 測試定義檔。

---

## 🚀 快速啟動

```bash
# 安裝依賴
make install

# 啟動開發伺服器 (http://localhost:3000)
make dev

# 執行完整檢查 (TypeScript + ESLint + Build)
make check
```

---

## ☁️ 部署至 Cloudflare Pages（含 Edge Proxy API）

本專案已完整配置 **Cloudflare Pages 靜態匯出 (`out/`) + Cloudflare Pages Functions (`functions/api/*`)**：
- `functions/api/proxy.ts` 會自動部署為 Cloudflare Edge Worker `/api/proxy`，負責無狀態代理轉發雲端 `/v1/systemone` 請求。
- `functions/api/mock-systemone/v1/systemone.ts` 會自動部署為 `/api/mock-systemone/v1/systemone` 內建沙盒模擬端點。

### 方式 A：透過 GitHub Actions CI 自動部署（已內建 `.github/workflows/deploy-cloudflare-pages.yml`）
只需在 GitHub Repository 的 **Settings → Secrets and variables → Actions** 新增以下兩個 Secrets，每次推送至 `main` 分支即會自動建置並部署至 Cloudflare Pages：
1. `CLOUDFLARE_API_TOKEN`：具備 **Cloudflare Pages: Edit** 權限的 API Token。
2. `CLOUDFLARE_ACCOUNT_ID`：您的 Cloudflare Account ID。

### 方式 B：在 Cloudflare Pages 後台直接綁定 GitHub 儲存庫
- **Build command**：`bun run build:cf`
- **Build output directory**：`out`

### 方式 C：本機透過 Wrangler CLI 一鍵部署
```bash
make cf-deploy
```
