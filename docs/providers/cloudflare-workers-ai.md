# Cloudflare Workers AI

Cloudflare Workers AI 提供三個 SystemOne 相容的決策模型，透過 Cloudflare v4 REST API 呼叫。請求本文與 SystemOne 幾乎相同，但網址包含帳戶 ID 與模型，且本文仍必須帶 `model` 欄位。

- **Profile id**：`cloudflare-workers-ai-clef`
- **預設模型**：`@cf/cloudflare/clef`
- **預設模式**：Proxy（REST API 不支援瀏覽器 CORS）
- **相關程式碼**：[`src/lib/s1-utils.ts`](../../src/lib/s1-utils.ts) 的 `buildCloudflareEndpointUrl()`、`normalizeCloudflareModelId()`、`getCloudflarePayloadModelSelector()`

## 端點與驗證

```text
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/cloudflare/clef
Authorization: Bearer $CLOUDFLARE_API_TOKEN
Content-Type: application/json
```

- **API Token 權限**：`Workers AI - Read` 與 `Workers AI - Edit`。
- **在 Worker 中呼叫**：`env.AI.run("@cf/cloudflare/clef", {...})`。

S1 Studio 的設定視窗只需要填 Account ID 與 API Token，網址會依所選模型自動組合；沒有填 Account ID 時，cURL 匯出會改用 `$CLOUDFLARE_ACCOUNT_ID` 變數，而瀏覽器執行會直接回傳 `Missing Account ID` 錯誤。

## 三個模型

| 模型 | 參數量 | Context | 輸入價格（輸出不計費） | 輸入類型 |
| --- | --- | --- | --- | --- |
| `@cf/cloudflare/clef` | 27B | 65,536 | US$0.24／百萬 tokens | 文字／JSON、圖片 |
| `@cf/cloudflare/clef-omni` | 30B MoE（3B 啟用） | 64,000 | US$0.15／百萬 tokens | 文字／JSON、圖片、音訊、影片 |
| `@cf/cloudflare/clef-flash` | 9B | 24,576 | US$0.038／百萬 tokens | 文字／JSON、圖片 |

三個模型都標示「Zero data retention」。每張圖片最多計為 1,024 tokens（以 32×32 區塊計算，另加 3 個標記 token）。

計費以 Neurons 計算：每百萬輸入 tokens 分別為 clef 21,818、clef-omni 13,636、clef-flash 3,455 Neurons；每 1,000 Neurons 為 US$0.011，每日有 10,000 Neurons 免費額度。

## 請求本文

必填欄位：`model`、`state`、`questions`。

| 欄位 | 說明 |
| --- | --- |
| `model` | **必填**，即使網址已包含模型。clef 與 clef-flash 頁面的 schema 接受 `clef` 或 `clef-flash`；clef-omni 只接受 `clef-omni` |
| `state` | 字串、物件或陣列；過長的文字 State **會被截斷**以符合 token 上限（Ollama 與 Gemini 則是拒絕） |
| `images` | data URL（`data:image/png;base64,…`）或 `{content_type, base64}`；不接受遠端網址；最多 4 張、單張 4 MiB 與 1,600 萬畫素、合計 8 MiB |
| `audio`、`videos` | 只有 clef-omni 支援：音訊最多 4 段（各 8 MiB、300 秒），影片最多 2 段（各 16 MiB、60 秒，每秒取 2 格） |
| `questions` | 1 到 64 題；問題鍵為英數、`_`、`.`、`-`，最多 100 字元 |

整個請求本文上限 13 MiB。

題型的 `criteria`：noul 為 `{true, false}`；choice 為 2 到 255 個選項，值可為字串、物件、陣列或 `null`；score 為 2 到 10 個等級，由低到高、索引從 0 開始。

### S1 Studio 的轉換

| 項目 | 畫面上的值 | 送出的值 |
| --- | --- | --- |
| 網址中的模型 | `@cf/cloudflare/clef` 或縮寫 `clef` | 一律補成 `@cf/cloudflare/clef` |
| 本文 `model` | `@cf/cloudflare/clef` | 縮寫 `clef` |
| `images` | 原始 base64 | `data:image/png;base64,…`（MIME 一律標為 PNG） |

## 回應格式

三個模型的輸出 schema 相同：`{model, answers, usage: {input_tokens, output_tokens}}`，題型欄位與 Ollama 相同（noul 只有 `noul`；score 為加權等級索引，「can land between levels」）。

REST API 會把結果包在 v4 外層中：

```json
{ "result": { "model": "clef", "answers": {}, "usage": {} },
  "success": true, "errors": [], "messages": [] }
```

`normalizeS1ResponsePayload()` 會自動取出 `result`。錯誤時的外層（實測，未授權）：

```json
{ "result": null, "success": false,
  "errors": [{ "code": 10000, "message": "Authentication error" }], "messages": [] }
```

S1 Studio 會顯示 `errors[0].message`。

## 速率限制

Workers AI 的文字生成模型預設每分鐘 300 個請求；需要 Workers Paid 方案的模型為每分鐘 20 個（搭配預付 AI Gateway 點數為 50 個）。官方模型頁沒有標示 clef 需要 Paid 方案，推測適用每分鐘 300 個，尚未驗證。

## CORS

官方文件沒有說明。2026-11-13 實測對 clef 端點發出 `OPTIONS` 請求，回傳 405 且沒有 `Access-Control-*` 標頭，瀏覽器無法直接呼叫，所以必須使用 Proxy Mode（正式環境為 Cloudflare Pages Function）。

## 參考資料

- [Workers AI 模型列表](https://developers.cloudflare.com/workers-ai/models/)
- [`@cf/cloudflare/clef`](https://developers.cloudflare.com/workers-ai/models/clef/)
- [`@cf/cloudflare/clef-omni`](https://developers.cloudflare.com/workers-ai/models/clef-omni/)
- [`@cf/cloudflare/clef-flash`](https://developers.cloudflare.com/workers-ai/models/clef-flash/)
- [Workers AI REST API 入門](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Workers AI 價格](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI 限制](https://developers.cloudflare.com/workers-ai/platform/limits/)
- [Workers AI 首頁](https://developers.cloudflare.com/workers-ai/)
