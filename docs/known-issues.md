# 已知問題

本文記錄 2026-11-13 對照各提供者官方文件時，發現 S1 Studio 與官方規格不一致的地方。這些問題在 v0.1.18 以前就已存在，與 v0.1.19 新增的 Gemini 支援無關，目前**尚未修正**。

- **檢查日期**：2026-11-13
- **檢查版本**：v0.1.19

## 總覽

| 問題 | 影響的提供者 | 嚴重程度 | 影響範圍 |
| --- | --- | --- | --- |
| [score 刻度判斷錯誤](#score-刻度判斷錯誤) | Ollama、Cloudflare、TypeSafe AI | 中 | 結果卡片的指標位置與刻度標籤 |
| [TypeSafe AI SDK 名稱錯誤](#typesafe-ai-sdk-名稱錯誤) | TypeSafe AI 與所有使用 SDK 範例的非 Gemini 提供者 | 中 | 匯出的 Python 與 TypeScript SDK 範例無法執行 |
| [TypeSafe AI 圖片格式不符](#typesafe-ai-圖片格式不符) | TypeSafe AI | 低 | 帶圖片的請求可能被拒絕或忽略 |
| [Ollama 與 Cloudflare 的 score 等級上限未檢查](#ollama-與-cloudflare-的-score-等級上限未檢查) | Ollama、Cloudflare | 低 | 超過 10 個等級時由 API 回傳錯誤 |

## score 刻度判斷錯誤

**現象**：Ollama、Cloudflare Workers AI 與 TypeSafe AI 的官方文件都說明，`score` 是依機率加權的等級索引，範圍 0 到「等級數 − 1」。但 [`ResultCards.tsx`](../src/components/ResultCards.tsx) 在沒有 `scoreScale` 時，只把大於 1 的值當成索引，小於等於 1 的值當成 0 到 1 的比例。

**例子**：3 個等級的題目回傳 `score: 0.83`，正確位置是 0.83 ÷ 2 ≈ 41%，畫面卻畫在 83%，刻度標籤也寫成 `0.000 ~ 1.000`。

**建議修正**：在 `executeSystemOneRequest()` 中，對非模擬器的提供者呼叫 `normalizeS1ResponsePayload(…, { scoreScale: 'index' })`；模擬器維持未設定（或明確設為 `'unit'`）。需同步更新 [`tests/request-routing.test.ts`](../tests/request-routing.test.ts) 中「legacy score rendering semantics」的回歸測試，因為那是刻意保留舊行為的測試。

**官方依據**：

- Ollama：[SystemOne API](https://docs.ollama.com/api/systemone)，「Probability-weighted average of the zero-based criterion indices … Not rounded to a level or normalized to 0–1」
- Cloudflare：[`@cf/cloudflare/clef` 模型頁](https://developers.cloudflare.com/workers-ai/models/clef/)，「Probability-weighted level; can land between levels」
- TypeSafe AI：[Score](https://docs.typesafe.ai/primitives/score)，「For a three-level scale it runs from 0 to 2」

## TypeSafe AI SDK 名稱錯誤

**現象**：[`src/lib/code-exporter.ts`](../src/lib/code-exporter.ts) 產生的非 Gemini SDK 範例使用不存在的套件與方法：

| 語言 | 目前產生 | 官方正確寫法 |
| --- | --- | --- |
| Python 套件 | `from typesafe import TypeSafeClient` | `pip install typesafe-sdk`，`from typesafe_sdk import TypeSafeClient` |
| Python 呼叫 | `client.systemone.evaluate(...)` | `client.system_one(state=…, questions=…)` |
| npm 套件 | `@typesafe/sdk` | `@typesafe-ai/sdk` |
| TypeScript 呼叫 | `client.systemone.evaluate(...)` | `client.systemOne({...})` |

PyPI 上的 `typesafe` 是另一個無關的套件（型別斷言裝飾器），npm 上的 `@typesafe/sdk` 不存在。照目前的範例安裝會裝錯套件或失敗。

**建議修正**：依官方 [SDK 文件](https://docs.typesafe.ai/sdk) 改寫 `generatePythonSnippet()` 與 `generateTypeScriptSnippet()` 的 SDK 版本，並更新 [README](../README.md) 中的描述。cURL 與原生 `fetch` 範例不受影響。

**官方依據**：

- [TypeSafe AI Quickstart](https://docs.typesafe.ai/introduction/quickstart)
- [typesafe-sdk-python](https://github.com/typesafe-ai/typesafe-sdk-python)
- [typesafe-sdk-js](https://github.com/typesafe-ai/typesafe-sdk-js)

## TypeSafe AI 圖片格式不符

**現象**：S1 Studio 對 TypeSafe AI 送出與 Ollama 相同的 `images` base64 陣列。TypeSafe AI 官方的圖片格式是頂層 `assets` 物件，並在 `state`、`instructions` 或 `criteria` 中以 id 引用，且請求需加上 `TypeSafe-Danger-Zone-Images: true` 標頭。

官方將此功能標示為「Dreamer-ready」（尚未達正式品質）。

**建議修正**：若要支援，需新增 TypeSafe 專用的請求轉換（類似 [`gemini-decisions.ts`](../src/lib/gemini-decisions.ts)），並讓 Proxy 轉送該標頭。在修正前，建議在介面上提示 TypeSafe AI 不支援圖片。

**官方依據**：[TypeSafe AI Images](https://docs.typesafe.ai/images)

## Ollama 與 Cloudflare 的 score 等級上限未檢查

**現象**：Ollama 與 Cloudflare 的 `score` 只接受 2 到 10 個等級，但 [`validateQuestionsBuilder()`](../src/lib/s1-utils.ts) 只檢查至少 2 個，沒有上限。

**影響**：超過 10 個等級時，錯誤由 API 回傳，而不是在編輯器中即時提示。

**官方依據**：

- [Ollama SystemOne API](https://docs.ollama.com/api/systemone)
- [Cloudflare `@cf/cloudflare/clef` 輸入 schema](https://developers.cloudflare.com/workers-ai/models/clef/)

## 待確認事項

以下項目無法從官方文件確認，記錄在此供之後驗證：

- **Ollama Cloud 直連的模型名稱**：官方決策指南的範例使用 `"model": "clef"`，但 `GET https://ollama.com/v1/models` 實際只列出 `clef:27b`。S1 Studio 預設使用 `clef:27b`。
- **Cloudflare 成功回應的外層**：依 [REST API 指南](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) 推論結果位於 `result` 中；未授權時的錯誤外層 `{"result": null, "success": false, "errors": […]}` 已實測確認。
- **各家 CORS 政策**：官方文件都沒有說明，[提供者總覽](providers/README.md#cors-實測) 中的 CORS 結果都是實測。
