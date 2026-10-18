# S1 Studio (`s1-studio`)

**S1 Studio** 是一個開源、不綁定單一廠商（Vendor-neutral）的 Web UI 結構化決策與評估工作台，專為相容於 `/v1/systemone` 協定的結構化決策模型（如 **Cloudflare Workers AI `@cf/cloudflare/clef`**、**Ollama Cloud `clef:27b`**、**Local Ollama `clef`**、**TypeSafe AI `jev-latest`** 及自建端點）打造。

- 🌐 **線上使用 (Live Workbench)**：[https://s1-studio.miniasp.com/](https://s1-studio.miniasp.com/)
- 📦 **GitHub Repository**：[https://github.com/doggy8088/s1-studio](https://github.com/doggy8088/s1-studio)

---

## ✨ 核心功能亮點

### 1. 端點與連線設定檔管理 (Endpoint Profiles & CORS Proxy)
- 內建五組標準端點範本（支援保留金鑰與 Account ID 的一鍵重置）：
  - **Built-in Sandbox Simulator (No Setup)**：`/api/mock-systemone`（免外部連線與金鑰即可完整體驗機率分佈與兩極化警示）
  - **Cloudflare Workers AI (`@cf/cloudflare/clef`)**：自動依據 `CLOUDFLARE_ACCOUNT_ID` 與所選模型（`@cf/cloudflare/clef`、`@cf/cloudflare/clef-omni`、`@cf/cloudflare/clef-flash`）組合 v4 REST 端點網址
  - **Ollama Cloud (`clef:27b`)**：`https://ollama.com`（預設模型 `clef:27b`，支援從 `/models` 動態探索與本機快取）
  - **Local Ollama (`clef`)**：`http://localhost:11434`（預設採用 Direct Mode 瀏覽器直連、不快取模型清單；內建三態連線診斷：未啟動 / CORS 阻擋 / 尚未下載模型，並提供一鍵透過 HTTP `POST /api/pull` 拉取 `clef` 模型）
  - **TypeSafe AI (`jev`)**：`https://api.typesafe.ai`（預設模型 `jev-latest`）
- **雙發送模式（Direct Mode / Proxy Mode）**：
  - **Direct Mode**：由瀏覽器直接發送 `fetch` 請求（適合測試本機已設定 `OLLAMA_ORIGINS` 的 Local Ollama）。
  - **Proxy Mode**：透過內建無狀態 `/api/proxy`（本機為 Next.js API Route，部署至 Cloudflare Pages 時自動轉換為 Cloudflare Edge Worker `functions/api/proxy.ts`）轉發請求，解決雲端 API CORS 阻擋問題，且不留存任何 Payload 與金鑰。
- **URL Deep Link 匯入**：支援以查詢參數自動建立或切換 Profile、載入場景範本，方便其他網站一鍵跳轉測試（詳見下節）。

#### 1.1 從網址一鍵匯入 Profile 與場景範本 (Deep Link)

其他網站或內部文件可直接以查詢參數連結至 S1 Studio，自動建立或切換端點 Profile，並載入指定的場景範本：

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| `profile` | 匯入 Profile 時必填 | Profile 名稱。以名稱比對（先比對完全相同，再忽略大小寫與前後空白）。只傳 `profile` 時，若名稱存在會直接切換。 |
| `baseUrl` | 新增 Profile 時必填 | 端點根網址，例如 `https://api.example.com`；僅接受 `http(s)` 或站內 `/api/...` 路徑。不可包含帳號密碼、查詢字串或 `#` 片段。 |
| `model` | 否 | 預設模型，例如 `clef`、`clef:27b`、`jev-latest`。未指定時新 Profile 會依端點推斷（Ollama Cloud `clef:27b`、TypeSafe AI `jev-latest`、內建模擬器 `clef-simulator-1.0`、Cloudflare 使用其預設模型，其餘 `clef`），既有 Profile 保留原值。 |
| `proxy` | 否 | `1`/`0`、`true`/`false`、`on`/`off`、`yes`/`no`。未指定時，`localhost`、私有 IP 與 `/api/...` 預設 Direct Mode，其餘預設 Proxy Mode。 |
| `accountId` | 否 | Cloudflare Workers AI 的 Account ID。未指定時會嘗試從 `baseUrl` 解析。 |
| `preset` | 否 | 內建或自訂場景範本的完整名稱或 ID。載入後可直接按「執行評估」。 |

> 未提供的欄位不會變更既有 Profile。新增 Profile 時，`model` 會依端點推斷，`proxy` 依上述規則推斷，`apiKey` 一律留空。

**範例（Profile + 場景範本）**：

```text
https://s1-studio.miniasp.com/?profile=My%20Endpoint&baseUrl=https%3A%2F%2Fapi.example.com&model=clef&proxy=1&preset=preset-prompt-injection
```

**範例（只載入場景範本，不變更 Profile）**：

```text
https://s1-studio.miniasp.com/?preset=preset-prompt-injection
```

**匯入行為**：

- **名稱不存在**：建立新 Profile（API Key 一律留空），切換為當前端點，並顯示非阻斷通知。
- **名稱存在且設定相同（忽略 API Key）**：直接切換，不顯示確認視窗。
- **名稱存在但設定不同**：跳出確認視窗。選擇「覆寫並切換」只會更新端點、模型、傳送模式等設定，**本機已儲存的 API Key 會保留**；選擇「保留現有並切換」則不變更任何設定。
- **場景範本**：先以 ID 精確比對，再以完整名稱比對；內建範本優先於自訂範本。名稱或參數值含中文、空白或特殊字元時，請使用 `encodeURIComponent` 編碼。

> [!IMPORTANT]
> 基於安全考量，本功能**不接受** `apiKey`、`token`、`secret`、`password`、`authorization` 等敏感參數。若網址帶有這些參數，會自動忽略並從網址移除，同時顯示警告；`baseUrl` 也不可內嵌帳密或敏感查詢參數。API Key 只應儲存在瀏覽器本機，覆寫既有 Profile 時會保留本機金鑰。`baseUrl` 仍可能出現在瀏覽器紀錄或伺服器日誌中，請勿將任何密鑰放在路徑裡。
>
> 匯入完成後，S1 Studio 會使用 `history.replaceState` 移除上述匯入參數，避免重新整理時重複匯入。請只匯入您信任的端點；執行評估時 State 與圖片會傳送至該端點。

### 2. 狀態與多模態視覺輸入 (State & Multimodal Input)
- **State 雙模式**：支援 `Text 純文字` 與 `JSON 結構`（CodeMirror 6 語法高亮與即時格式檢查，送出時自動以原生 JSON Object/Array 封裝而非轉義字串）。
- **Images 視覺輸入**：
  - 支援拖曳上傳或剪貼簿 `⌘V` 貼上 `PNG`、`JPEG`、`WebP` 圖片。
  - 自動剝除 `data:image/...;base64,` 前綴，轉為符合 `/v1/systemone` 規範的純 Base64 字串。
  - 內建容量與解析度防呆檢查：單次上限 **4 張**、單張上限 **4 MiB (16 MP)**、總容量上限 **8 MiB**。

### 3. 決策問題建構器 (Questions Builder)
- 支援單次請求最多 **64 個問題**，即時驗證 Question Key 正規表示式 `^[a-zA-Z0-9_.-]{1,100}$` 與重複鍵名。
- **GUI 表單與 Raw JSON 雙向即時同步**。
- 三種決策原語（Primitives）：
  - `noul`：布林機率評估（`0.000 ~ 1.000`）。
  - `choice`：動態 Key-Value `criteria` 清單，支援 **拖曳排序（Drag-and-drop）** 以控制同分判定（Tie-breaking）優先順序。
  - `score`：動態有序等級陣列（最少 2 個等級），支援拖曳調整等級順序並自動相容陣列或索引物件格式的 `probabilities`。

### 4. 視覺化診斷卡片 (Results & Diagnostics)
- **Noul 結果卡**：顯示 `0.000 ~ 1.000` 機率與進度條，內建 **Threshold 模擬滑桿**（預設 `0.50`），即時預覽 `TRUE (PASS)` 或 `FALSE (REJECT)` 判定。
- **Choice 結果卡**：醒目標示勝出選項、`confidence` 集中度與第一、二名領先幅度，並繪製 100% 橫條機率圖。
- **Score 結果卡**：顯示期望值 `score` 與 `confidence`，並內建 **兩極化分佈偵測（Bimodal Detection）**，當模型在首尾兩端等級同時給出高機率時自動發出警示。

### 5. 開發者工具：匯出、A/B 對比與歷史紀錄 (DX, Compare & History)
- **Code Exporter**：一鍵匯出針對不同供應商最佳化的 `cURL -s ... | jq`、`Python SDK`、`TypeScript SDK` 與 `Native fetch` 程式碼，支援環境變數（如 `$CLOUDFLARE_API_KEY`、`$OLLAMA_API_KEY`、`$TYPESAFE_API_KEY`）或帶入實際金鑰切換。
- **A/B 端點對比模式 (Compare Mode)**：同時選擇兩個 Profile 平行發送請求，並排比對延遲（Latency ms）、勝出選項與機率分佈差異。
- **內建六大測試場景範本 (Presets) 與 IndexedDB History**：
  1. 客服工單分流與退款審核 (Customer Support Triage)
  2. 內容安全與 Prompt Injection 攔截 (Trust & Safety Guardrail)
  3. 雙極化爭議評論分析 (Bimodal Polarization Stress Test)
  4. 多模態收據與圖片理解 (Multimodal Receipt & Vision Triage)
  5. SaaS 採購意向與銷售線索評分 (B2B Lead Qualification)
  6. 臺灣政治與實質治理現況判定 (Sovereignty & Governance Choice)

---

## 💻 本機 Ollama (`localhost:11434`) 跨域設定指南

當您在雲端網頁（`https://s1-studio.miniasp.com`）直接連線至自己電腦上的 `http://localhost:11434` 時，必須讓本機 Ollama 允許瀏覽器 `Origin` 跨域存取：

- **macOS (Ollama.app 背景常駐服務)**：
  ```bash
  launchctl setenv OLLAMA_ORIGINS "*"
  killall Ollama && open -a Ollama
  ```
- **macOS / Linux CLI (`ollama serve`)**：
  ```bash
  OLLAMA_ORIGINS="*" ollama serve
  ```
- **Windows PowerShell**：
  ```powershell
  [System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")
  # 設定後請重新啟動 Ollama
  ```

---

## 🚀 快速啟動

```bash
# 安裝依賴
make install

# 啟動開發伺服器 (http://localhost:3000)
make dev

# 執行完整檢查 (TypeScript + ESLint + Next.js Build)
make check

# 建置 Cloudflare Pages 靜態匯出 (out/)
make cf-build
```

---

## ☁️ 部署至 Cloudflare Pages（含 Edge Proxy API）

本專案已完整配置 **Cloudflare Pages 靜態匯出 (`out/`) + Cloudflare Pages Functions (`functions/api/*`)**：
- `functions/api/proxy.ts` 會自動部署為 Cloudflare Edge Worker `/api/proxy`，負責無狀態代理轉發雲端 `/v1/systemone` 請求。
- `functions/api/mock-systemone/v1/systemone.ts` 會自動部署為 `/api/mock-systemone/v1/systemone` 內建沙盒模擬端點。

```bash
make cf-deploy
```

---

## 📄 授權條款與版權宣告 (License & Copyright)

- 本專案採用 [MIT License](./LICENSE) 開源授權。
- Copyright © 2026 [Will 保哥](https://blog.miniasp.com/). All rights reserved.
- All third-party trademarks (Ollama, Cloudflare, TypeSafe AI) belong to their respective owners.
