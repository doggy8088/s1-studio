# 回應格式差異

各提供者的回應結構不同。S1 Studio 以 `normalizeS1ResponsePayload()` 將它們統一成 `S1ResponsePayload`，再交給結果卡片顯示。本文說明各種回應格式、score 刻度、usage 欄位與錯誤格式的差異。

- **正規化程式**：[`src/lib/s1-utils.ts`](../../src/lib/s1-utils.ts) 的 `normalizeS1ResponsePayload()`
- **Gemini usage 對應**：[`src/lib/gemini-decisions.ts`](../../src/lib/gemini-decisions.ts) 的 `normalizeGeminiUsage()`
- **相關文件**：[請求格式差異](request.md)

## 四種回應結構

### 1. `answers` 格式（Ollama、TypeSafe AI、Gemini）

每個問題鍵對應一個帶 `type` 的答案（以下數值為示意）：

```json
{
  "model": "clef:27b",
  "answers": {
    "refund": { "type": "noul", "noul": 0.97 },
    "team": { "type": "choice", "choice": "billing", "confidence": 0.99,
              "probabilities": { "billing": 0.99, "technical": 0.01 } },
    "urgency": { "type": "score", "score": 0.83, "confidence": 0.5,
                 "legend": { "0": "Routine", "1": "Soon", "2": "Urgent" },
                 "probabilities": { "0": 0.34, "1": 0.50, "2": 0.16 } }
  },
  "usage": { "input_tokens": 220, "output_tokens": 0 }
}
```

### 2. 分組格式（SDK 與內建模擬器）

依題型分成三組：

```json
{
  "nouls": { "refund": { "noul": 0.97 } },
  "choices": { "team": { "choice": "billing", "confidence": 0.99 } },
  "scores": { "urgency": { "score": 0.41, "confidence": 0.5 } }
}
```

內建模擬器同時回傳 `answers` 與分組欄位。

### 3. Cloudflare v4 REST 外層

Cloudflare 會把結果包在 `result` 中：

```json
{ "result": { "model": "clef", "answers": { "…": "…" }, "usage": { "…": "…" } },
  "success": true, "errors": [], "messages": [] }
```

正規化時，若頂層有 `result` 物件且沒有 `answers` 或 `nouls`，就改從 `result` 讀取。

### 4. Gemini Decisions API

結構同 `answers` 格式，但沒有 `model` 欄位，`usage` 欄位名稱也不同：

```json
{
  "answers": {
    "is_damaged": { "type": "noul", "noul": 0.979, "confidence": 0.979 },
    "urgency": { "type": "score", "score": 0.827, "confidence": 0.4959,
                 "probabilities": { "0": 0.3385, "1": 0.4959, "2": 0.1656 },
                 "legend": { "0": "Routine", "1": "Soon", "2": "Urgent" } },
    "topic": { "type": "choice", "choice": "product", "confidence": 0.7777,
               "probabilities": { "billing": 0.0066, "shipping": 0.2158, "product": 0.7777 } }
  },
  "usage": {
    "total_tokens": 220,
    "total_input_tokens": 220,
    "input_tokens_by_modality": [{ "modality": "text", "tokens": 220 }],
    "total_output_tokens": 0
  }
}
```

（以上為 2026-11-12 實際呼叫 `gemini-decision-1` 取得的回應，數值已四捨五入。）

S1 Studio 會補上 `model: "gemini-decision-1"`，並將 `total_input_tokens` 對應到 `input_tokens`、`total_output_tokens` 對應到 `output_tokens`，原始欄位保留。

## 各題型欄位比較

| 題型 | 欄位 | SystemOne（Ollama 等） | Gemini |
| --- | --- | --- | --- |
| noul | `noul` | 「是」的機率，0 到 1 | 「是」的機率，範圍 0.01 到 0.99 |
| noul | `confidence` | 無（Ollama 文件明確說明只回傳 `noul`） | `max(noul, 1 - noul)`；S1 Studio 目前不顯示 |
| choice | `choice` | 機率最高的選項鍵 | 相同 |
| choice | `probabilities` | 選項鍵 → 機率 | 相同，總和為 1 |
| choice | `confidence` | Ollama：`1 - H(p) / ln(N)`（以熵計算，官方註明不是校準過的正確率） | 最高選項的機率 |
| score | `score` | 見下方刻度說明 | 依機率加權的等級索引 |
| score | `probabilities` | 陣列或以索引為鍵的物件 | 以索引字串為鍵的物件 |
| score | `legend` | 索引 → 等級描述 | 相同（鍵的順序不一定由小到大） |
| score | `confidence` | Ollama：同 choice 的熵公式 | 最高等級的機率 |

`probabilities` 無論是陣列 `[0.45, 0.35, 0.20]` 或物件 `{"0": 0.45, …}`，都由 `normalizeScoreProbabilities()` 轉成陣列。

Gemini 的 noul 機率範圍是 0.01 到 0.99，所以門檻值設在 0.99 以上永遠不會通過。

## score 的刻度

這是最容易誤判的差異。依各家官方文件，**所有真實提供者**回傳的 `score` 都是依機率加權的等級索引，只有內建模擬器例外：

| 來源 | `score` 意義 | 範圍 | 官方說明 |
| --- | --- | --- | --- |
| Ollama `/v1/systemone` | 加權等級索引 | 0 到「等級數 − 1」 | 「Not rounded to a level or normalized to 0–1」 |
| Cloudflare Workers AI | 加權等級索引 | 0 到「等級數 − 1」 | 「Probability-weighted level; can land between levels」 |
| TypeSafe AI | 加權等級索引 | 0 到「等級數 − 1」 | 「For a three-level scale it runs from 0 to 2」 |
| Gemini Decisions API | 加權等級索引 | 0 到「等級數 − 1」 | 「divide the score by the highest level index to normalize」 |
| 內建模擬器 | 加權相對位置 | 0 到 1 | S1 Studio 自訂（`Σ 機率 × 索引 ÷ (等級數 − 1)`） |

以 3 個等級為例，Gemini 回傳 0.83，表示位置約在 0.83 ÷ 2 ≈ 41%，也就是中間偏低。

S1 Studio 在 `ScoreResult` 以 `scoreScale` 標示刻度：

| `scoreScale` | 指標位置計算 | 刻度標籤 | 設定時機 |
| --- | --- | --- | --- |
| `'index'` | `score ÷ (等級數 − 1)` | `Scale: 0 ~ N 等級索引` | Ollama、Cloudflare、TypeSafe AI、Gemini 與自訂端點（v0.1.20 起） |
| `'unit'` | `score` | `Scale: 0.000 ~ 1.000` | 內建模擬器（v0.1.20 起） |
| 未設定 | `score > 1` 時視為索引，否則視為 0 到 1 | 依判斷結果顯示 | 只出現在 v0.1.20 以前存下的歷史紀錄 |

v0.1.19 以前，Gemini 以外的提供者都不設定 `scoreScale`，小於等於 1 的索引值（例如 3 個等級回傳 0.83）會被畫成 0 到 1 的比例。v0.1.20 已修正，詳見 [已知問題](../known-issues.md#score-刻度判斷錯誤)。

## usage 欄位

| 欄位 | SystemOne | Gemini | S1 Studio 顯示 |
| --- | --- | --- | --- |
| 輸入 token | `input_tokens` | `total_input_tokens` | `input_tokens` |
| 輸出 token | `output_tokens` | `total_output_tokens`（永遠為 0） | `output_tokens` |
| 總計 | 無 | `total_tokens` | 保留原值 |
| 各模態 token | 無 | `input_tokens_by_modality` | 保留原值 |

## 錯誤格式

`executeSystemOneRequest()` 依下列順序取出錯誤訊息：

| 來源 | 錯誤格式 | S1 Studio 顯示 |
| --- | --- | --- |
| Cloudflare | `{"success": false, "errors": [{"message": "…"}]}` | `errors[0].message` |
| Gemini 驗證或安全性錯誤 | `{"error": {"message": "…", "code": "invalid_request"}}` | `[invalid_request] …` |
| Google API 金鑰錯誤 | `{"error": {"code": 400, "message": "…", "status": "INVALID_ARGUMENT", "details": […]}}` | `[INVALID_ARGUMENT] …` |
| 一般 | `{"error": "…"}` 或 `{"message": "…"}` | 原字串 |
| 非 JSON | 純文字 | 原文字或 `HTTP <狀態碼>` |

Gemini 的安全性封鎖會回傳 HTTP 400，`code` 可能是 `safety`、`prohibited_content`、`blocklist`、`image_safety` 或 `content_blocked`。

### S1 Studio 自己產生的錯誤

以下錯誤在送出前就會回傳，不會發出網路請求：

| 情況 | `status` | `statusText` |
| --- | --- | --- |
| Gemini 未填 API Key | 401 | `Missing API Key` |
| Gemini 問題鍵不符規則或 `input` 為空 | 400 | `Invalid Request` |
| Cloudflare 未填 Account ID | 400 | `Missing Account ID` |
| 網路錯誤或 CORS 阻擋 | 0 | `Network Error` |
| Local Ollama 連不上、CORS 阻擋或模型未下載 | 0 或 403 | `Connection Refused`、`CORS Blocked (403)`、`Model Missing` |

## 參考資料

- [Ollama SystemOne API](https://docs.ollama.com/api/systemone)（`SystemOneResponse` schema、`confidence` 公式、score 語意、錯誤狀態碼）
- [Ollama 決策能力指南](https://docs.ollama.com/capabilities/decision)（score 計算範例）
- [Cloudflare `@cf/cloudflare/clef`](https://developers.cloudflare.com/workers-ai/models/clef/)（輸出 schema）
- [Cloudflare Workers AI REST API 入門](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)（`result` 外層）
- [TypeSafe AI：Score](https://docs.typesafe.ai/primitives/score)
- [Gemini Decisions API](https://aistudio.google.com/docs/decisions-api)（Response Schema、Errors）
- [Gemini Decision 模型頁](https://aistudio.google.com/docs/models/gemini-decision-1)
