# Gemini Decisions API

Google AI Studio 提供的結構化決策 API，題型與 SystemOne 相同（`noul`、`choice`、`score`），但端點、驗證方式與欄位名稱不同。S1 Studio 自 v0.1.19 起支援。

- **Profile id**：`gemini-decisions-api`
- **端點**：`POST https://generativelanguage.googleapis.com/v1beta/decisions`
- **模型**：`gemini-decision-1`（唯一可用的模型）
- **驗證**：`x-goog-api-key` 標頭
- **API 版本**：只在 Gemini Developer API 的 `v1beta` 提供
- **實作**：[`src/lib/gemini-decisions.ts`](../../src/lib/gemini-decisions.ts)

## 在 S1 Studio 中使用

1. 到 Google AI Studio 的 API Key 頁面建立金鑰。
2. 開啟「端點與金鑰設定」，選擇 **Gemini Decisions API**，填入 API Key。
3. 預設為 Direct Mode，瀏覽器直接呼叫 Gemini API；需要時可切換為 Proxy Mode。
4. 模型欄位固定為 `gemini-decision-1`，不會呼叫模型探索。

`baseUrl` 可以是 `https://generativelanguage.googleapis.com`、`…/v1beta` 或完整的 `…/v1beta/decisions`，`buildGeminiDecisionsEndpoint()` 都會解析成同一個端點。

## 最小 cURL 範例

```bash
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/decisions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-decision-1",
    "input": "The blue mug I ordered on Monday arrived cracked on Wednesday.",
    "questions": {
      "is_damaged": { "type": "noul", "instructions": "Did the item arrive damaged?" }
    }
  }' | jq
```

## SDK

| 語言 | 套件 | 建立 client | 呼叫 |
| --- | --- | --- | --- |
| Python | `google-genai` 3.2 以上 | `genai.Client(http_options={"api_version": "v1beta"})` | `client.decisions.create(model=…, input=…, questions=…)` |
| JavaScript／TypeScript | `@google/genai` 最新版 | `new GoogleGenAI({ apiVersion: "v1beta" })` | `ai.decisions.create({ model, input, questions })` |

S1 Studio 的「匯出程式碼」會依目前的問題產生上述兩種 SDK 範例，以及 cURL 與原生 `fetch` 範例。

## 與 SystemOne 的差異摘要

| 項目 | SystemOne | Gemini Decisions API |
| --- | --- | --- |
| 路徑 | `/v1/systemone` | `/v1beta/decisions` |
| 驗證 | `Authorization: Bearer` | `x-goog-api-key` |
| 情境欄位 | `state` | `input`（字串或內容區塊陣列） |
| 圖片 | `images` base64 陣列 | `input` 中的 `image` 區塊，需要 `mime_type` |
| noul 描述 | `criteria.true`／`criteria.false` | `criteria.true_description`／`criteria.false_description` |
| 問題鍵 | 可含 `.`，最長 100 字元 | 不可含 `.`，最長 64 字元 |
| choice 同分 | 選項排列順序 | 選項鍵的 UTF-8 位元組排序 |
| score 數值 | 依提供者而定 | 等級索引（0 到「等級數 − 1」） |
| noul 範圍 | 0 到 1 | 0.01 到 0.99 |
| usage | `input_tokens`、`output_tokens` | `total_input_tokens`、`total_output_tokens`、`total_tokens`、`input_tokens_by_modality` |

逐欄說明見 [請求格式差異](../formats/request.md) 與 [回應格式差異](../formats/response.md)。

## 官方限制

| 限制 | 值 |
| --- | --- |
| 每次請求問題數 | 1 到 1,000 |
| choice 選項數 | 2 到 255 |
| score 等級數 | 2 到 255（建議 2 到 10） |
| 問題鍵長度 | 1 到 64 字元，`[A-Za-z0-9_-]+` |
| 選項鍵長度 | 1 到 128 字元（最多 512 個 UTF-8 位元組） |
| Context window | 262,144 tokens（輸入加上所有問題） |
| JSON 巢狀深度 | 100 層 |
| 內嵌輸入大小 | 每次請求 100 MB（PDF 為 50 MB） |
| 外部網址大小 | 每個網址 15 MB |

### 不支援的功能

- YouTube 網址與 `gs://` URI（請改用 Files API URI、HTTPS 網址或 base64）。
- 思考、工具呼叫與工具結果區塊。
- Context caching、Batch API、Flex 與 Priority 推論。
- 問題的 `instructions` 只接受文字。

## 行為說明

- **問題彼此獨立**：每個問題各自針對同一份 `input` 評估，增減其他問題不影響結果。
- **choice 排序**：選項鍵先依 UTF-8 位元組排序再評估，完全同分時取排序最前面的鍵。
- **輸出 token**：`total_output_tokens` 永遠為 0。

## CORS 與 Direct Mode

v0.1.19 開發時實測 CORS 預檢（2026-11-12）：

```text
OPTIONS /v1beta/decisions
Origin: https://s1-studio.pages.dev
Access-Control-Request-Headers: content-type,x-goog-api-key

HTTP/2 200
access-control-allow-origin: https://s1-studio.pages.dev
access-control-allow-headers: content-type,x-goog-api-key
access-control-allow-methods: DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT
```

官方文件沒有說明瀏覽器呼叫，這是實測結果。若之後 Google 調整 CORS 政策，請切換為 Proxy Mode。

> **安全提醒**：Direct Mode 會讓 API Key 出現在瀏覽器的網路請求中。正式產品不應在前端暴露 Gemini API Key，S1 Studio 是個人測試工具，金鑰只存在使用者自己的瀏覽器。

## 錯誤處理

| 情況 | HTTP | 回應範例 |
| --- | --- | --- |
| 欄位錯誤 | 400 | `{"error": {"message": "Unknown parameter 'state'.", "code": "invalid_request"}}` |
| 問題鍵不符規則 | 400 | `{"error": {"message": "* CreateDecisionRequest.questions[a.b]: question IDs must be 1-64 characters matching [A-Za-z0-9_-]+", "code": "invalid_request"}}` |
| API Key 無效 | 400 | `{"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT", …}}` |
| 安全性封鎖 | 400 | `code` 為 `safety`、`prohibited_content`、`blocklist`、`image_safety` 或 `content_blocked` |

以上範例都是 2026-11-12 實際呼叫取得的回應。

## 參考資料

- [Gemini Decisions API](https://aistudio.google.com/docs/decisions-api)（官方主要文件）
- [Gemini Decision 模型頁](https://aistudio.google.com/docs/models/gemini-decision-1)
- [Using Gemini API keys](https://aistudio.google.com/docs/api-key)
- [Google AI Studio API Key 管理頁](https://aistudio.google.com/apikey)（需登入）
- [Files API](https://aistudio.google.com/docs/files)
- [Files API 參考](https://ai.google.dev/api/files)
- [Gemini Developer API 價格](https://aistudio.google.com/docs/pricing#gemini-decision)
- [Gemini API 速率限制](https://aistudio.google.com/docs/rate-limits#gemini-decision)
- [Gemini API 函式庫](https://aistudio.google.com/docs/libraries)
- [googleapis/python-genai](https://github.com/googleapis/python-genai)
- [google-genai（PyPI）](https://pypi.org/project/google-genai/)
- [googleapis/js-genai](https://github.com/googleapis/js-genai)
- [@google/genai（npm）](https://www.npmjs.com/package/@google/genai)
- [MDN：跨來源資源共用（CORS）](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
