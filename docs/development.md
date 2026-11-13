# 開發指南

本文說明本機開發環境、常用指令、提交前檢查流程，以及新增提供者時要修改的地方。

- **相關文件**：[系統架構](architecture.md)、[測試策略](testing.md)、[CI/CD](ci-cd.md)

## 環境需求

| 工具 | 用途 | 備註 |
| --- | --- | --- |
| [Bun](https://bun.sh/) | 套件管理、執行腳本、測試 | CI 使用最新版；本機已驗證 1.3.x |
| Node.js | `make bump-patch` 使用 `node -e` | 任何現行 LTS 版本皆可 |
| GNU Make | 統一的指令入口 | macOS 內建 |
| Git | `next.config.ts` 讀取 `git rev-parse --short HEAD` 顯示在頁尾 | 沒有 Git 時顯示 `dev` |

## 常用指令

所有指令都定義在 [`Makefile`](../Makefile)，執行 `make help` 可列出全部。

| 指令 | 說明 |
| --- | --- |
| `make install` | `bun install` |
| `make dev` | 啟動開發伺服器，預設 `PORT=3000`，可用 `make dev PORT=3123` 指定 |
| `make typecheck` | 分別檢查應用程式（`tsconfig.json`）與測試（`tests/tsconfig.json`）的型別 |
| `make lint` | ESLint（`eslint-config-next` 的 core-web-vitals 與 typescript 規則） |
| `make test` | `bun test`；有 `GEMINI_API_KEY` 時一併執行真實 API 整合測試 |
| `make build` | 標準 Next.js 建置（含 API 路由） |
| `make check` | `typecheck` → `lint` → `test` → `build` |
| `make cf-build` | Cloudflare Pages 靜態匯出到 `out/` |
| `make cf-deploy` | 建置後以 `wrangler pages deploy` 部署（需先 `wrangler login`） |
| `make bump-patch` | 將 `package.json` 的 patch 版本加 1 |
| `make clean` | 刪除 `.next`、`out`、`tsconfig.tsbuildinfo`、`.cf-api-backup` |

## 提交前檢查流程

依 [AGENTS.md](../AGENTS.md) 規定，每次修改程式碼都要：

1. 執行 `make bump-patch`。版本號碼會透過 `NEXT_PUBLIC_APP_VERSION` 顯示在頁尾。
2. 執行 `make check` 與 `make cf-build`，兩者都必須零錯誤。
3. 修改 `/api/proxy` 或模擬器時，`src/app/api/*` 與 `functions/api/*` 要同步修改。
4. Commit 訊息使用正體中文（zh-TW）。

## 已知的開發環境現象

- **`next dev` 會改寫 `AGENTS.md`**：Next.js 16 啟動開發伺服器時，會在 `AGENTS.md` 尾端加入 `<!-- BEGIN:nextjs-agent-rules -->` 區塊（來源：`node_modules/next/dist/server/lib/generate-agent-files.js`）。這段與專案無關，提交前請用 `git checkout -- AGENTS.md` 還原。
- **`cf-build` 會暫時移走 `src/app/api`**：若建置中途被強制中斷（例如 `kill -9`），請確認 `src/app/api` 已還原；未還原時可從 `.cf-api-backup/api` 搬回。

## 新增提供者檢查清單

以 Gemini Decisions API 為例，新增一個提供者需要修改下列位置。可用 `git show 63f8762 --stat` 檢視實際的完整修改。

1. **格式轉換模組**：在 `src/lib/` 新增純函式模組，負責判斷提供者、組合端點、轉換請求與正規化回應。參考 [`src/lib/gemini-decisions.ts`](../src/lib/gemini-decisions.ts)。
2. **`src/lib/s1-utils.ts`**：
   - `formatEndpointPreviewUrl()`：回傳實際呼叫的網址。
   - `isProfileEndpointAndKeyValid()`：決定模型欄位顯示成下拉選單的條件。
   - `getDefaultModelsForProfile()`、`getSelectableModelsForProfile()`、`fetchModelsForProfile()`：模型清單。判斷式要放在通用邏輯之前。
   - `executeSystemOneRequest()`：分派到新提供者的執行函式。
3. **`src/lib/presets.ts`**：在 `DEFAULT_PROFILES` 加入內建 Profile（放在模擬器之前），並在 `BASE_URL_TEMPLATES` 加入網址範本。既有使用者會由 `loadProfilesFromLocalStorage()` 自動補上，不需要另寫遷移。
4. **`src/lib/code-exporter.ts`**：API Key 環境變數名稱，以及 cURL、Python、TypeScript 範例。
5. **兩個 Proxy**：若新提供者的驗證方式或路徑與 SystemOne 不同，`src/app/api/proxy/route.ts` 與 `functions/api/proxy.ts` 都要修改，Cloudflare 版本還要更新 `Access-Control-Allow-Headers`。
6. **UI**：`ProfileManagerModal.tsx` 的端點提示與模型探索按鈕；`S1StudioApp.tsx` 的自動模型探索；必要時調整 `ResultCards.tsx`。
7. **測試**：格式轉換的單元測試、mock `fetch` 的路由測試、兩種 Proxy 的測試，以及既有提供者的回歸測試。
8. **文件**：在 [`docs/providers/`](providers/README.md) 新增提供者文件，並更新比較表與 [格式差異](formats/request.md) 文件。

## 程式碼慣例

- **路徑別名**：`@/*` 對應 `src/*`（見 [`tsconfig.json`](../tsconfig.json)）。
- **TypeScript**：`strict: true`。
- **純函式優先**：格式轉換、驗證、端點組合等邏輯不依賴 React 或全域狀態，方便以 `bun test` 直接測試。
- **使用者訊息**：錯誤與提示訊息使用正體中文。
- **儲存格式不變**：新增提供者時不修改 `S1RequestPayload`，只在送出時轉換，確保舊的歷史紀錄與匯出檔仍可載入。

## 參考資料

- [Bun 官方網站](https://bun.sh/)
- [Next.js：How to create a static export](https://nextjs.org/docs/app/guides/static-exports)
- [Next.js：Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Wrangler：Pages 指令](https://developers.cloudflare.com/workers/wrangler/commands/pages/)
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)（`make bump-patch` 遵循的版本規則）
- [CommonMark Spec](https://spec.commonmark.org/)（文件撰寫的 Markdown 規範）
