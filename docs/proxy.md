# Proxy 代理協定

`/api/proxy` 是無狀態的轉送端點，用來處理瀏覽器因 CORS 無法直接呼叫的雲端 API。本文說明它的請求標頭、各動作的行為，以及本機與 Cloudflare 兩種實作的差異。

- **本機實作**：[`src/app/api/proxy/route.ts`](../src/app/api/proxy/route.ts)（Next.js Route Handler）
- **正式環境實作**：[`functions/api/proxy.ts`](../functions/api/proxy.ts)（Cloudflare Pages Function）
- **測試**：[`tests/proxy.test.ts`](../tests/proxy.test.ts) 會用同一組案例測試兩種實作

## 何時需要 Proxy Mode

| 情境 | 建議模式 | 原因 |
| --- | --- | --- |
| 本機 Ollama（`localhost:11434`） | Direct | Cloudflare 上的 Proxy 連不到使用者電腦；請改設定 `OLLAMA_ORIGINS` |
| Ollama Cloud、TypeSafe AI | Proxy | 這些 API 未必允許瀏覽器跨網域呼叫 |
| Cloudflare Workers AI | Proxy | Cloudflare REST API 不提供瀏覽器 CORS |
| Gemini Decisions API | Direct（預設）或 Proxy | Gemini API 的 CORS 預檢會回傳 `access-control-allow-origin` 與 `x-goog-api-key`，瀏覽器可直接呼叫 |
| 內建模擬器 | 不適用 | 同網域的 `/api/...` 路徑，永遠直接呼叫 |

## 請求格式

一律使用 `POST /api/proxy`，以標頭指定目標與動作：

| 標頭 | 必填 | 說明 |
| --- | --- | --- |
| `x-s1-target-url` | 是 | 目標網址（根網址或完整端點） |
| `x-s1-proxy-action` | 否 | 省略時轉送決策請求；`models` 探索模型；`ollama-pull` 拉取 Ollama 模型 |
| `Authorization` | 否 | `Bearer <API Key>`，依目標轉成對應的驗證方式 |
| `x-goog-api-key` | 否 | 直接指定 Gemini API Key，優先於 `Authorization` |
| `TypeSafe-Danger-Zone-Images` | 否 | TypeSafe AI 圖片功能的啟用標頭，有值時原樣轉送給上游（v0.1.20 起） |
| `Content-Type` | 是 | `application/json` |

請求本文會原封不動轉送。

## 動作：轉送決策請求（預設）

目標網址依下列規則決定：

| `x-s1-target-url` | 實際轉送網址 | 轉送的驗證標頭 |
| --- | --- | --- |
| 主機為 `generativelanguage.googleapis.com` | 結尾為 `/v1beta/decisions` 時照用；結尾為 `/v1beta` 時加上 `/decisions`；其餘一律改為 `https://generativelanguage.googleapis.com/v1beta/decisions` | `x-goog-api-key`（取自 `x-goog-api-key` 或去掉 `Bearer ` 的 `Authorization`），**不送** `Authorization` |
| 結尾為 `/v1/systemone` 或含 `/ai/run/` | 照用 | `Authorization` |
| 其他 | 在後面加上 `/v1/systemone` | `Authorization` |

回應會保留上游的狀態碼、`Content-Type` 與本文，並加上 `X-S1-Upstream-Latency` 標頭（毫秒）。前端會優先用這個值當作延遲時間，避免把 Proxy 本身的往返時間算進去。

## 動作：`models`

依序嘗試 `{root}/v1/models`、`{root}/models`、`{root}/api/tags`，只保留名稱含 `clef` 或 `jev` 的模型，回傳 `{ "models": [...] }`。`{root}` 是去掉 `/v1/systemone` 或 `/v1` 的根網址。

Gemini 與 Cloudflare 的模型清單是固定的，前端不會對它們呼叫這個動作。

## 動作：`ollama-pull`

轉送到 `{root}/api/pull`，並以串流（NDJSON）回傳拉取進度。

## 兩種實作的差異

| 項目 | Next.js（本機） | Cloudflare Pages Function |
| --- | --- | --- |
| `localhost`、`127.0.0.1` 目標 | 允許 | 拒絕並回傳 400（Edge 連不到使用者電腦） |
| CORS 預檢（`OPTIONS`） | 不需要（同網域） | `onRequestOptions` 回傳 `Access-Control-Allow-Headers: Content-Type, Authorization, x-s1-target-url, x-s1-proxy-action, x-goog-api-key, TypeSafe-Danger-Zone-Images` |
| 回應 CORS 標頭 | 無 | `Access-Control-Allow-Origin: *` |
| 延遲量測 | `performance.now()` | `Date.now()`（最少 1 毫秒） |

Gemini 相關的三個輔助函式（`isGeminiApiHost`、`resolveGeminiDecisionsEndpoint`、`extractGeminiApiKey`）在兩個檔案中內容完全相同。Pages Function 不能 import `src/` 的程式碼，所以只能各放一份，修改時務必兩邊一起改。

## 安全性

- **不留存資料**：Proxy 不記錄請求本文與金鑰，也不寫入任何儲存空間。
- **協定限制**：只接受 `http:` 與 `https:` 目標。
- **金鑰不外洩到錯誤主機**：只有目標主機完全等於 `generativelanguage.googleapis.com` 時，才會把金鑰改放在 `x-goog-api-key`。
- **已知限制**：Proxy 會轉送到任意公開網址，屬於開放式轉送。若要部署在內部網路，請自行加上允許清單。

## 參考資料

- [MDN：跨來源資源共用（CORS）](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [Next.js：Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Cloudflare Pages Functions 路由規則](https://developers.cloudflare.com/pages/functions/routing/)
- [Gemini Decisions API](https://aistudio.google.com/docs/decisions-api)（`x-goog-api-key` 驗證）
- [Gemini API 金鑰](https://aistudio.google.com/docs/api-key)
- [Ollama：Pull a Model](https://docs.ollama.com/api/pull)
- [Ollama：List Local Models](https://docs.ollama.com/api/tags)
- [Ollama：OpenAI 相容 API（`/v1/models`）](https://docs.ollama.com/api/openai-compatibility)
