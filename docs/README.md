# S1 Studio 技術文件

本目錄收錄 S1 Studio 的開發與技術文件，包含系統架構、各提供者的差異、請求與回應格式對照、測試與部署流程。使用說明請見專案根目錄的 [README](../README.md)。

- **適用版本**：v0.1.20 以後
- **最後更新**：2026-11-13
- **外部資料查證日期**：2026-11-13

## 依需求選擇文件

| 我想要… | 請看 |
| --- | --- |
| 了解整體架構與請求流程 | [系統架構](architecture.md) |
| 比較各提供者的端點、驗證、價格與限制 | [提供者總覽](providers/README.md) |
| 知道 SystemOne 與 Gemini 的欄位怎麼對應 | [請求格式差異](formats/request.md)、[回應格式差異](formats/response.md) |
| 在本機開發、新增提供者 | [開發指南](development.md) |
| 撰寫或執行測試 | [測試策略](testing.md) |
| 了解 CI 流程、設定 Secrets、部署 | [CI/CD](ci-cd.md) |
| 了解 `/api/proxy` 的行為 | [Proxy 代理協定](proxy.md) |
| 了解資料存在哪裡、Deep Link 的安全設計 | [資料儲存與 Profile](storage-and-profiles.md) |
| 檢視與官方規格不一致的地方及修正紀錄 | [已知問題](known-issues.md) |
| 找所有官方文件連結 | [參考資料總表](references.md) |

## 文件目錄

### 架構與開發

- [系統架構](architecture.md)：雙模式建置（Next.js 與 Cloudflare Pages）、請求流程圖、模組分工、提供者判斷順序。
- [開發指南](development.md)：環境需求、Make 指令、提交前檢查、新增提供者檢查清單、程式碼慣例。
- [Proxy 代理協定](proxy.md)：`x-s1-target-url` 等標頭、三種動作、本機與 Cloudflare 實作差異、安全性。
- [資料儲存與 Profile](storage-and-profiles.md)：LocalStorage 與 IndexedDB 的鍵名、Profile 自動遷移、圖片限制、匯出檔格式、Deep Link 安全設計。

### 品質與部署

- [測試策略](testing.md)：測試分層、回歸測試範圍、mock `fetch` 寫法、真實 API 整合測試、型別檢查設定。
- [CI/CD](ci-cd.md)：GitHub Actions 流程、Secrets、部署產物、部署後驗證指令。

### 提供者

- [提供者總覽](providers/README.md)：端點、驗證、模型、格式、價格、速率限制與 CORS 實測比較表。
- [Ollama（Local 與 Cloud）](providers/ollama.md)
- [Cloudflare Workers AI](providers/cloudflare-workers-ai.md)
- [TypeSafe AI](providers/typesafe-ai.md)
- [Gemini Decisions API](providers/gemini-decisions-api.md)
- [內建沙盒模擬器](providers/builtin-simulator.md)

### 格式差異

- [請求格式差異](formats/request.md)：`state` 與 `input`、四種圖片格式、`criteria` 對應、各家限制、完整轉換範例。
- [回應格式差異](formats/response.md)：四種回應結構、各題型欄位、score 刻度、usage 欄位、錯誤格式。

### 其他

- [已知問題](known-issues.md)：score 刻度判斷、TypeSafe AI SDK 名稱與圖片格式、score 等級上限等問題的修正紀錄（v0.1.20），以及尚存的限制。
- [參考資料總表](references.md)：所有文件引用的官方連結。

## 撰寫規範

新增或修改本目錄的文件時：

- 使用正體中文（zh-TW）撰寫。
- 粗體標籤寫成 `**標籤**：內容`，冒號放在粗體外。
- 中繼資料（版本、日期等）使用清單，不要只用單一換行分隔。
- 引用外部規格時附上官方連結，並放在文件最後的「參考資料」一節；同時更新 [參考資料總表](references.md)。
- 實測結果（例如 CORS）要註明「實測」與日期，與官方文件說明區分。
- 交付前執行 `markdown-fixer --check` 確認 0 個錯誤與警告。
