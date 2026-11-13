# 測試策略

本文說明測試的分層、各測試檔的範圍、執行方式，以及真實 API 整合測試的設定。

- **測試框架**：Bun 內建測試執行器（`bun test`），不需另外安裝 Jest 或 Vitest
- **型別定義**：`@types/bun`（devDependency）
- **相關文件**：[開發指南](development.md)、[CI/CD](ci-cd.md)

## 執行方式

```bash
# 全部測試（沒有 GEMINI_API_KEY 時，真實 API 測試會自動略過）
make test

# 包含真實 Gemini Decisions API 整合測試
GEMINI_API_KEY=你的金鑰 make test

# 只跑單一檔案或符合名稱的測試
bun test tests/proxy.test.ts
bun test -t "Gemini target"
```

## 測試分層

| 層級 | 檔案 | 驗證內容 | 是否連網 |
| --- | --- | --- | --- |
| 單元測試 | [`tests/gemini-decisions.test.ts`](../tests/gemini-decisions.test.ts) | Gemini 提供者判斷、端點組合、格式轉換、MIME 判斷、限制檢查、回應正規化 | 否 |
| 路由測試 | [`tests/request-routing.test.ts`](../tests/request-routing.test.ts) | `executeSystemOneRequest()` 的網址、標頭、本文與錯誤處理；程式碼匯出 | 否（mock `fetch`） |
| Proxy 測試 | [`tests/proxy.test.ts`](../tests/proxy.test.ts) | Next.js 與 Cloudflare 兩種 `/api/proxy` 的轉送行為與 CORS 預檢 | 否（mock `fetch`） |
| 整合測試 | [`tests/gemini-live.test.ts`](../tests/gemini-live.test.ts) | 以 SystemOne 格式呼叫真實 Gemini API：三種題型、JSON State 加圖片、無效金鑰 | 是 |

### 回歸測試

新增提供者時，以下測試確保既有行為沒有改變：

- **Ollama Cloud**：仍經由 Proxy 送出 SystemOne 本文，使用 `Authorization: Bearer`，且不帶 `x-goog-api-key`。
- **Cloudflare Workers AI**：仍組合 `/ai/run/@cf/cloudflare/clef` 網址，`model` 欄位縮寫成 `clef`，圖片轉成 data URI。
- **內建模擬器**：仍直接呼叫 `/api/mock-systemone/v1/systemone`。
- **Score 顯示**：非 Gemini 提供者不帶 `scoreScale`，沿用原本的判斷邏輯。
- **cURL 匯出**：Ollama Cloud 的 cURL 指令逐字比對，與修改前完全相同。
- **Proxy**：SystemOne 與 Cloudflare 目標的轉送網址與 `Authorization` 標頭不變。

## Mock `fetch` 的寫法

路由與 Proxy 測試在 `beforeEach` 以自訂函式取代 `globalThis.fetch`，記錄每次呼叫的網址與 `RequestInit`，並在 `afterEach` 還原：

```ts
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return nextResponse();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
```

Next.js Route Handler 可直接 import 後以 `new NextRequest(req)` 呼叫；Cloudflare Pages Function 則以 `onRequestPost({ request })` 呼叫。

## 真實 API 整合測試

`tests/gemini-live.test.ts` 以 `describe.skipIf(!apiKey)` 包住，沒有金鑰時整組略過，不會失敗。

- **費用**：每次執行會呼叫三次 Gemini Decisions API，用量很小，但仍會計入配額。
- **金鑰保護**：測試不會印出金鑰；無效金鑰測試使用固定字串 `invalid-key`。
- **CI**：在 GitHub Repository Secrets 設定 `GEMINI_API_KEY` 後，CI 會自動執行，見 [CI/CD](ci-cd.md)。

## 型別檢查與 `tests/tsconfig.json`

根目錄 `tsconfig.json` 排除了 `tests/`，原因是 `make cf-build` 會暫時移走 `src/app/api`，而 `tests/proxy.test.ts` 有 import 它，若被 Next.js 建置時的型別檢查掃到就會失敗。

[`tests/tsconfig.json`](../tests/tsconfig.json) 繼承根設定，加入 `types: ["bun"]`，並包含 `tests/`、`src/`、`functions/`。`make typecheck` 會分別檢查兩份設定。

## UI 端對端測試（手動執行）

v0.1.19 開發時，曾以 Playwright 無介面瀏覽器對 `make dev` 執行過下列 16 項檢查（腳本未納入版本控制）：

- 舊使用者的 LocalStorage 會自動補上 Gemini Profile，原有 API Key 保留。
- Gemini Direct Mode 呼叫 `/v1beta/decisions`，使用 `x-goog-api-key`，本文為 `input` 而非 `state`。
- 多模態範本送出 `{"type": "image", "mime_type": "image/png"}` 內容區塊。
- Gemini Proxy Mode 經由 `/api/proxy` 成功回應。
- Score 卡片顯示「等級索引」刻度；模擬器仍顯示 `0.000 ~ 1.000` 刻度。
- 頁面沒有未捕捉的 JavaScript 錯誤。

若要將 UI 測試納入 CI，建議改用 `@playwright/test` 並在 CI 中先啟動 `make dev`。

## 參考資料

- [Bun：Test runner](https://bun.com/docs/test)
- [Bun：Writing tests](https://bun.com/docs/test/writing-tests)（`describe.skipIf()`、`test.skipIf()`）
- [Bun：Mocks](https://bun.com/docs/test/mocks)（`mock()`、`spyOn()`；本專案直接替換 `globalThis.fetch`，Bun 沒有專門的 fetch mock 文件）
- [Next.js：Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Playwright](https://playwright.dev/)
- [Gemini Decisions API](https://aistudio.google.com/docs/decisions-api)
