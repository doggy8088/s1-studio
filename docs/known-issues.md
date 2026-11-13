# 已知問題

本文記錄 2026-11-13 對照各提供者官方文件時，發現 S1 Studio 與官方規格不一致的地方。這四個問題在 v0.1.18 以前就已存在，與 v0.1.19 新增的 Gemini 支援無關，已於 **v0.1.20 全部修正**。修正後仍有的限制列在「[尚存的限制](#尚存的限制)」。

- **檢查日期**：2026-11-13
- **檢查版本**：v0.1.19
- **修正版本**：v0.1.20

## 總覽

| 問題 | 影響的提供者 | 嚴重程度 | 狀態 |
| --- | --- | --- | --- |
| [score 刻度判斷錯誤](#score-刻度判斷錯誤) | Ollama、Cloudflare、TypeSafe AI | 中 | v0.1.20 已修正 |
| [TypeSafe AI SDK 名稱錯誤](#typesafe-ai-sdk-名稱錯誤) | TypeSafe AI 與所有使用 SDK 範例的非 Gemini 提供者 | 中 | v0.1.20 已修正 |
| [TypeSafe AI 圖片格式不符](#typesafe-ai-圖片格式不符) | TypeSafe AI | 低 | v0.1.20 已修正 |
| [Ollama 與 Cloudflare 的 score 等級上限未檢查](#ollama-與-cloudflare-的-score-等級上限未檢查) | Ollama、Cloudflare | 低 | v0.1.20 已修正 |

## score 刻度判斷錯誤

**原本的現象**：Ollama、Cloudflare Workers AI 與 TypeSafe AI 的官方文件都說明，`score` 是依機率加權的等級索引，範圍 0 到「等級數 − 1」。但 [`ResultCards.tsx`](../src/components/ResultCards.tsx) 在沒有 `scoreScale` 時，只把大於 1 的值當成索引，小於等於 1 的值當成 0 到 1 的比例。例如 3 個等級的題目回傳 `score: 0.83`，正確位置是 0.83 ÷ 2 ≈ 41%，畫面卻畫在 83%，刻度標籤也寫成 `0.000 ~ 1.000`。

**修正方式**：

- `executeSystemOneRequest()` 對所有非模擬器的提供者呼叫 `normalizeS1ResponsePayload(…, { scoreScale: 'index' })`；內建模擬器（`id` 為 `s1-builtin-simulator` 或網址以 `/api/` 開頭）標為 `'unit'`。
- 結果卡片的刻度標籤改用與指標位置相同的判斷，兩者不會再不一致。
- `normalizeS1ResponsePayload()` 本身不變，沒有 `scoreScale` 的舊歷史紀錄仍沿用舊的推測規則。

**驗證**：

- [`tests/request-routing.test.ts`](../tests/request-routing.test.ts) 原本刻意保留舊行為的「legacy score rendering semantics」測試，改為逐一確認 TypeSafe、Ollama Cloud、Local Ollama、Cloudflare 回傳 `'index'`，模擬器回傳 `'unit'`。
- 2026-11-13 實測：3 個等級、等級 2 的機率約 0.95 至 0.99 時，Ollama Cloud 回傳 1.938、Cloudflare 回傳 1.9399、TypeSafe 回傳 1.99，確認三者都是 0 到 2 的等級索引。

**官方依據**：

- Ollama：[SystemOne API](https://docs.ollama.com/api/systemone)，「Probability-weighted average of the zero-based criterion indices … Not rounded to a level or normalized to 0–1」
- Cloudflare：[`@cf/cloudflare/clef` 模型頁](https://developers.cloudflare.com/workers-ai/models/clef/)，「Probability-weighted level; can land between levels」
- TypeSafe AI：[Score](https://docs.typesafe.ai/primitives/score)，「For a three-level scale it runs from 0 to 2」

## TypeSafe AI SDK 名稱錯誤

**原本的現象**：[`src/lib/code-exporter.ts`](../src/lib/code-exporter.ts) 產生的非 Gemini SDK 範例使用不存在的套件與方法。另外，舊的 Python 範例以正規表示式把 JSON 的 `true`、`false`、`null` 換成 Python 寫法，連字串內容與 noul 的 `"true"`、`"false"` 鍵名也一起被改掉。

| 語言 | 原本產生 | 官方正確寫法 |
| --- | --- | --- |
| Python 套件 | `from typesafe import TypeSafeClient` | `pip install typesafe-sdk`，`from typesafe_sdk import TypeSafeClient` |
| Python 呼叫 | `client.systemone.evaluate(..., images=...)` | `client.system_one(state=…, questions=…, model=…)`，圖片用 `assets` |
| npm 套件 | `@typesafe/sdk` | `@typesafe-ai/sdk`（需要 Node.js 22 以上） |
| TypeScript 設定 | `baseUrl` | `baseURL` |
| TypeScript 呼叫 | `client.systemone.evaluate(...)` | `client.systemOne({...})` |

**修正方式**：

- **TypeSafe AI**：Python 範例改用 `typesafe-sdk` 的 `TypeSafeClient(api_key=…, base_url=…)` 與 `client.system_one()`，結果從 `result.nouls`、`result.choices`、`result.scores` 讀取；TypeScript 範例改用 `@typesafe-ai/sdk` 的 `new TypeSafeClient({ apiKey, baseURL })` 與 `client.systemOne()`。有圖片時以 `Image.from_base64()`／`Image.fromBase64()` 放入 `assets`，並加上 `TypeSafe-Danger-Zone-Images` 標頭。
- **其他 SystemOne 端點**（Ollama、Cloudflare、模擬器、自訂端點）：TypeSafe SDK 只適用於符合 TypeSafe OpenAPI 規格的 API，Cloudflare 的 `/ai/run/…` 路徑也無法由 SDK 組出。所以 Python 範例改用 `requests` 直接呼叫實際端點，TypeScript「SDK」分頁改為原生 `fetch` 並加註說明。
- **Python 字面值**：改用遞迴的 `toPythonLiteral()`，只轉換真正的布林值與 `null`，字串與鍵名保持原樣。Gemini 的 Python 範例也一併受惠，f-string 內的鍵名改用單引號，相容 Python 3.12 以前的版本。

**驗證**：

- 在暫存環境安裝官方 `typesafe-sdk` 0.7.5 與 `@typesafe-ai/sdk` 0.7.0，將產生的範例指向本機模擬伺服器執行：Python 與 TypeScript 都成功送出並解析回應，TypeScript 範例通過 `tsc --strict`；有圖片時兩個 SDK 都送出 `TypeSafe-Danger-Zone-Images: true`，`state` 中保留圖片參照。
- `requests` 版本的 Python 範例以同樣方式執行成功。
- [`tests/request-routing.test.ts`](../tests/request-routing.test.ts) 新增「code exporter: TypeSafe AI official SDKs」測試，確認正確的套件與方法名稱、不再出現 `systemone.evaluate`，以及 `"true"` 鍵名不被改寫。

**官方依據**：

- [TypeSafe Python SDK](https://docs.typesafe.ai/sdk/python)、[TypeSafeClient（Python）](https://docs.typesafe.ai/sdk/python/api/clients/sync)
- [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)、[TypeSafeClient（JavaScript）](https://docs.typesafe.ai/sdk/javascript/api/classes/TypeSafeClient)
- [typesafe-sdk-python](https://github.com/typesafe-ai/typesafe-sdk-python)、[typesafe-sdk-js](https://github.com/typesafe-ai/typesafe-sdk-js)

## TypeSafe AI 圖片格式不符

**原本的現象**：S1 Studio 對 TypeSafe AI 送出與 Ollama 相同的 `images` base64 陣列。TypeSafe AI 官方的圖片格式是頂層 `assets` 物件，並在 `state`、`instructions` 或 `criteria` 中以參照字串引用，且請求需加上 `TypeSafe-Danger-Zone-Images: true` 標頭。

**修正方式**：新增 [`src/lib/typesafe.ts`](../src/lib/typesafe.ts)，與 Gemini 一樣只在送出時轉換，畫面、範本與歷史紀錄仍維持 SystemOne 格式：

1. 每張圖片產生新的參照字串 `<s1-image-UUID>`（官方建議每次請求每張圖片使用新的 UUID）。
2. 圖片放入 `assets`：`{"type": "image", "format": "png" | "jpeg", "data_base64": "…"}`，`format` 依檔頭判斷，並移除 `data:` 字首。
3. 參照字串寫入 `state`，確保每個 asset 都有被引用（否則 API 回傳 400）：
   - 文字 State：在結尾加上 `Image 1: <ref>` 等行。
   - JSON 物件 State：加上 `images` 欄位（已存在時改用 `images_2`、`images_3`…）。
   - 其他 JSON 值：包成 `{"state": 原值, "images": [...]}`。
4. 只有帶圖片的請求才加上 `TypeSafe-Danger-Zone-Images: true` 標頭；兩種 `/api/proxy` 實作都會轉送此標頭，Cloudflare 版本的 `Access-Control-Allow-Headers` 也已加入。
5. TypeSafe 只接受 PNG 與 JPEG，S1 Studio 卻允許上傳 WebP。送出前會先檢查，遇到其他格式直接顯示正體中文錯誤，不會送出請求。
6. 匯出的 cURL、`fetch` 與 SDK 範例使用相同的 `assets` 格式與標頭。

沒有圖片的請求完全不受影響，本文與標頭都與修正前相同。

**驗證**：

- [`tests/typesafe.test.ts`](../tests/typesafe.test.ts) 涵蓋提供者判斷、格式偵測、三種 State 的參照寫入、參照不重複與標頭條件；[`tests/request-routing.test.ts`](../tests/request-routing.test.ts) 確認實際送出的本文與標頭、WebP 被擋下，以及 Ollama 圖片格式不變；[`tests/proxy.test.ts`](../tests/proxy.test.ts) 確認兩種 Proxy 轉送標頭。
- 2026-11-13 以真實 TypeSafe API（`jev-latest`）實測同一組問題：沒有圖片時「是否為紅色方塊」為 0.15、形狀選 `circle`；附上 320×320 的紅色方塊 PNG 後分別為 0.99 與 `square`，確認模型確實收到圖片。

**官方依據**：[TypeSafe AI Images](https://docs.typesafe.ai/images)。官方將此功能標示為實驗性質。

## Ollama 與 Cloudflare 的 score 等級上限未檢查

**原本的現象**：Ollama 與 Cloudflare 的 `score` 只接受 2 到 10 個等級，但 [`validateQuestionsBuilder()`](../src/lib/s1-utils.ts) 只檢查至少 2 個，沒有上限，超過時要等 API 回傳錯誤。

**修正方式**：新增 `getScoreLevelLimitForProfile()`，依目前的 Profile 回傳官方上限，`validateQuestionsBuilder()` 多了選填的 `scoreLevelLimit` 參數，編輯器會即時顯示錯誤並停用執行：

| 提供者 | 上限 | 判斷方式 |
| --- | --- | --- |
| Ollama（本機與雲端） | 10 | `isLocalOllamaProfile()`，或主機名稱為 `ollama.com` |
| Cloudflare Workers AI | 10 | `isCloudflareProfile()` |
| Gemini Decisions API | 255 | `isGeminiDecisionsProfile()` |
| TypeSafe AI、內建模擬器、自訂端點 | 不限制 | 官方未明訂 |

**驗證**：[`tests/typesafe.test.ts`](../tests/typesafe.test.ts) 的「score level limits per provider」確認各 Profile 的上限，以及 10 個等級通過、11 個等級在 Ollama 下產生錯誤、未傳入上限時行為與修正前相同。

**官方依據**：

- [Ollama SystemOne API](https://docs.ollama.com/api/systemone)
- [Cloudflare `@cf/cloudflare/clef` 輸入 schema](https://developers.cloudflare.com/workers-ai/models/clef/)
- [Gemini Decisions API](https://aistudio.google.com/docs/decisions-api)

## 尚存的限制

- **舊歷史紀錄的 score 刻度**：v0.1.20 以前存下的歷史紀錄沒有 `scoreScale`，仍以「大於 1 視為索引」推測，小於等於 1 的索引值會畫錯位置。重新執行即可得到正確顯示。
- **TypeSafe 圖片尺寸**：TypeSafe 要求每邊 280 到 1,568 畫素、總畫素 78,400 到 2,458,624。S1 Studio 只檢查格式，尺寸不符時由 API 回傳 400。
- **TypeSafe 圖片傳輸方式**：S1 Studio 以 JSON 內嵌 base64 傳送；官方建議 multipart，但 JSON 方式同樣受支援，只是本文約大三分之一。
- **自架 Ollama 的等級上限**：只能辨識內建的 Local Ollama Profile、`localhost:11434` 與 `ollama.com`。Ollama 架在其他主機時，不會套用 10 個等級的上限。
- **A/B 對比**：等級上限依「目前使用的 Profile」檢查。對比用的 Profile 上限較低時，仍由該 API 回傳錯誤。

## 待確認事項

以下項目無法從官方文件確認，記錄在此供之後驗證：

- **Ollama Cloud 直連的模型名稱**：官方決策指南的範例使用 `"model": "clef"`，但 `GET https://ollama.com/v1/models` 實際只列出 `clef:27b`。S1 Studio 預設使用 `clef:27b`。
- **Cloudflare 成功回應的外層**：依 [REST API 指南](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) 推論結果位於 `result` 中；未授權時的錯誤外層 `{"result": null, "success": false, "errors": […]}` 已實測確認。
- **各家 CORS 政策**：官方文件都沒有說明，[提供者總覽](providers/README.md#cors-實測) 中的 CORS 結果都是實測。
