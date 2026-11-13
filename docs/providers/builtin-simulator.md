# 內建沙盒模擬器

內建模擬器是 S1 Studio 自帶的假端點，不需要外部連線或 API Key，用來展示介面、機率分佈與雙峰分佈警示。它的結果由關鍵字規則與雜湊值產生，**不是真正的模型推論**。

- **Profile id**：`s1-builtin-simulator`
- **端點**：`POST /api/mock-systemone/v1/systemone`（同網域，永遠直接呼叫）
- **模型名稱**：`clef-simulator-1.0`（只是標籤，不影響結果）
- **本機實作**：[`src/app/api/mock-systemone/v1/systemone/route.ts`](../../src/app/api/mock-systemone/v1/systemone/route.ts)
- **正式環境實作**：[`functions/api/mock-systemone/v1/systemone.ts`](../../functions/api/mock-systemone/v1/systemone.ts)

## 請求與回應

請求使用 SystemOne 格式（`model`、`state`、`questions`），會忽略 `images`。

回應同時包含 `answers` 與分組欄位（`nouls`、`choices`、`scores`），可用來驗證兩種解析路徑：

```json
{
  "model": "clef",
  "answers": { "q": { "type": "noul", "noul": 0.996 } },
  "nouls": { "q": { "type": "noul", "noul": 0.996 } },
  "choices": {},
  "scores": {},
  "usage": { "input_tokens": 52, "output_tokens": 1 }
}
```

## 模擬規則

| 題型 | 規則摘要 |
| --- | --- |
| noul | 依問題鍵與指示中的關鍵字（`refund`、`injection`、`jailbreak`、`harm`、`pii` 等）比對 State 內容，回傳接近 0 或接近 1 的機率；沒有符合的規則時，以雜湊值產生 0.02 到 0.98 之間的固定值 |
| choice | 選項鍵或描述的關鍵字出現在 State 中時加權，再以雜湊值加入少量變化，最後正規化成機率 |
| score | State 含 `bimodal`、`ambiguous`、`polarized` 時產生兩極化分佈；含 `urgent`、`immediately` 等字時偏向高等級；其餘以雜湊值決定 |

- **score 刻度**：`score` 為 0 到 1 的相對位置（`Σ 機率 × 索引 ÷ (等級數 − 1)`），與 Gemini 的等級索引不同，見 [回應格式差異](../formats/response.md#score-的刻度)。
- **固定延遲**：每次請求固定等待 65 毫秒，模擬推論時間。
- **確定性**：相同輸入永遠得到相同結果。

## 用途

- 沒有任何 API Key 時體驗完整功能。
- 展示雙峰分佈警示（可載入「多模態截圖診斷與兩極化分佈測試」範本）。
- 端對端測試時當作不需連網的回歸基準。

兩份實作必須保持一致（見 [AGENTS.md](../../AGENTS.md)）。Pages Function 不能 import `src/`，所以型別定義在檔案內另外宣告一份。

## 參考資料

- [S1 Studio 系統架構：雙模式建置](../architecture.md#雙模式建置)
- [Cloudflare Pages Functions 路由規則](https://developers.cloudflare.com/pages/functions/routing/)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
