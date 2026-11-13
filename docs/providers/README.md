# 提供者總覽

S1 Studio 支援五種決策 API 提供者，外加一個內建模擬器。本頁比較各家的端點、驗證、格式與限制；細節請見各提供者文件。

- **資料查證日期**：2026-11-13（依各家官方文件；標示「實測」的項目為實際呼叫結果）

| 提供者 | 文件 | 協定 |
| --- | --- | --- |
| Ollama（Local 與 Cloud） | [ollama.md](ollama.md) | SystemOne |
| Cloudflare Workers AI | [cloudflare-workers-ai.md](cloudflare-workers-ai.md) | SystemOne（v4 REST 外層） |
| TypeSafe AI | [typesafe-ai.md](typesafe-ai.md) | SystemOne |
| Gemini Decisions API | [gemini-decisions-api.md](gemini-decisions-api.md) | Gemini Decisions（格式不同，需轉換） |
| 內建沙盒模擬器 | [builtin-simulator.md](builtin-simulator.md) | SystemOne（模擬） |

## 端點與驗證

| 提供者 | 端點 | 驗證標頭 | 金鑰環境變數 | 預設模式 |
| --- | --- | --- | --- | --- |
| Local Ollama | `http://localhost:11434/v1/systemone` | 不需要 | — | Direct |
| Ollama Cloud | `https://ollama.com/v1/systemone` | `Authorization: Bearer` | `OLLAMA_API_KEY` | Proxy |
| Cloudflare Workers AI | `https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/@cf/cloudflare/{model}` | `Authorization: Bearer` | `CLOUDFLARE_API_KEY`（S1 Studio 匯出用名稱） | Proxy |
| TypeSafe AI | `https://api.typesafe.ai/v1/systemone` | `Authorization: Bearer` | `TYPESAFE_API_KEY` | Proxy |
| Gemini Decisions API | `https://generativelanguage.googleapis.com/v1beta/decisions` | `x-goog-api-key` | `GEMINI_API_KEY` | Direct |
| 內建模擬器 | `/api/mock-systemone/v1/systemone` | 不需要 | — | Direct（同網域） |

## 模型

| 提供者 | 模型 | S1 Studio 取得模型清單的方式 |
| --- | --- | --- |
| Ollama | `clef`、`clef:27b`、`clef:cloud`、`clef-flash` 等 | Local：即時查詢 `/api/tags`、`/v1/models`（不快取）；Cloud：查詢後快取 |
| Cloudflare | `@cf/cloudflare/clef`、`clef-omni`、`clef-flash` | 固定清單 |
| TypeSafe AI | `jev-latest`、`jev-preview`、`jev-1.14.0`、`jev-1.13.0` | 查詢 `/v1/models` 等端點後快取 |
| Gemini | `gemini-decision-1` | 固定清單 |
| 內建模擬器 | `clef-simulator-1.0`（標籤） | 固定清單 |

## 請求格式

| 項目 | Ollama | Cloudflare | TypeSafe AI | Gemini |
| --- | --- | --- | --- | --- |
| 情境欄位 | `state` | `state` | `state` | `input` |
| 本文 `model` | 必填 | 必填（縮寫 `clef`） | 必填 | 必填，固定 `gemini-decision-1` |
| 圖片 | `images` 原始 base64 | `images` data URL | `assets` 物件加特殊標頭 | `input` 內容區塊 |
| 其他媒體 | 不支援 | clef-omni：音訊、影片 | 不支援 | 音訊、影片、PDF |
| noul `criteria` | `true`／`false` | `true`／`false` | `true`／`false` | `true_description`／`false_description` |
| choice 無描述選項 | `null` | `null` | `null` | `""` |
| choice 同分 | 依選項順序 | — | — | 依選項鍵 UTF-8 排序 |
| 問題數 | 1 到 64 | 1 到 64 | 受 context 限制 | 1 到 1,000 |
| score 等級數 | 2 到 10 | 2 到 10 | — | 2 到 255 |
| 問題鍵 | 可含 `.`，最多 100 字元 | 可含 `.`，最多 100 字元 | — | 不可含 `.`，最多 64 字元 |
| 過長輸入 | 拒絕 | 截斷文字 State | 拒絕 | 拒絕 |

「—」表示官方文件未明訂。逐欄說明見 [請求格式差異](../formats/request.md)。

## 回應格式

| 項目 | Ollama | Cloudflare | TypeSafe AI | Gemini |
| --- | --- | --- | --- | --- |
| 外層 | 無 | `{result, success, errors, messages}` | 無 | 無 |
| 頂層 `model` | 有 | 有（在 `result` 中） | 有 | 無 |
| noul `confidence` | 無 | 無 | — | 有，`max(noul, 1 - noul)` |
| noul 範圍 | 0 到 1 | 0 到 1 | 0 到 1 | 0.01 到 0.99 |
| `confidence` 計算 | `1 - H(p) / ln(N)` | — | — | 最高選項機率 |
| score | 加權等級索引 | 加權等級索引 | 加權等級索引 | 加權等級索引 |
| usage | `input_tokens`、`output_tokens` | 同左 | 同左 | `total_input_tokens`、`total_output_tokens`、`total_tokens`、`input_tokens_by_modality` |

內建模擬器的 score 是 0 到 1 的相對位置，與真實提供者不同。逐欄說明見 [回應格式差異](../formats/response.md)。

## 價格（輸入 tokens，輸出皆不計費）

| 提供者 | 價格 |
| --- | --- |
| Local Ollama | 免費（使用本機資源） |
| Ollama Cloud | 需要付費方案或點數 |
| Cloudflare `clef`／`clef-omni`／`clef-flash` | US$0.24／0.15／0.038 每百萬 tokens；每日 10,000 Neurons 免費 |
| TypeSafe AI | US$0.042 每百萬 tokens |
| Gemini `gemini-decision-1` | 付費層 US$0.10 每百萬 tokens；免費層免費（資料會用於改善 Google 產品） |

價格可能隨時調整，請以各家官方價格頁為準。

## Gemini 速率限制

| 層級 | RPM | TPM | RPD |
| --- | --- | --- | --- |
| 免費 | 200 | 50,000 | 10,000 |
| Tier 1 | 1,500 | 1,000,000 | 50,000 |
| Tier 2 | 5,000 | 4,000,000 | 不限 |
| Tier 3 | 15,000 | 10,000,000 | 不限 |

## CORS 實測

各家官方文件都沒有說明 CORS 政策。以下是 2026-11-12 至 2026-11-13 以 `OPTIONS` 預檢請求實測的結果：

| 端點 | 結果 | 瀏覽器可直接呼叫 |
| --- | --- | --- |
| Local Ollama | 預設只允許 `127.0.0.1`、`0.0.0.0`；可用 `OLLAMA_ORIGINS` 擴充（官方 FAQ） | 設定後可以 |
| `https://ollama.com/v1/systemone` | 405，無 `Access-Control-*` 標頭 | 否 |
| Cloudflare `/ai/run/@cf/cloudflare/clef` | 405，無 `Access-Control-*` 標頭 | 否 |
| `https://api.typesafe.ai/v1/systemone` | 400，有 `allow-headers` 但無 `allow-origin` | 推測否 |
| `https://generativelanguage.googleapis.com/v1beta/decisions` | 200，回傳請求的 `Origin`，允許 `x-goog-api-key` | 是 |

無法直接呼叫的端點請使用 Proxy Mode，見 [Proxy 代理協定](../proxy.md)。

## 參考資料

- [Ollama SystemOne API](https://docs.ollama.com/api/systemone)
- [Cloudflare Workers AI 模型列表](https://developers.cloudflare.com/workers-ai/models/)
- [Cloudflare Workers AI 價格](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [TypeSafe AI 文件](https://docs.typesafe.ai)
- [TypeSafe AI Models](https://docs.typesafe.ai/models)
- [Gemini Decisions API](https://aistudio.google.com/docs/decisions-api)
- [Gemini Developer API 價格](https://aistudio.google.com/docs/pricing)
- [Gemini API 速率限制](https://aistudio.google.com/docs/rate-limits)
- [MDN：跨來源資源共用（CORS）](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
