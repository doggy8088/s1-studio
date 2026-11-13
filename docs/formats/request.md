# 請求格式差異

S1 Studio 內部一律使用 SystemOne 格式（`S1RequestPayload`）。本文逐欄比較 SystemOne、Cloudflare Workers AI 與 Gemini Decisions API 的請求格式，並說明 S1 Studio 的轉換規則。

- **型別定義**：[`src/types/systemone.ts`](../../src/types/systemone.ts)
- **Gemini 轉換程式**：[`src/lib/gemini-decisions.ts`](../../src/lib/gemini-decisions.ts) 的 `toGeminiDecisionsRequest()`
- **Cloudflare 轉換程式**：[`src/lib/s1-utils.ts`](../../src/lib/s1-utils.ts) 的 `executeSystemOneRequest()`
- **相關文件**：[回應格式差異](response.md)、[提供者總覽](../providers/README.md)

## 總覽

| 項目 | SystemOne（Ollama、TypeSafe、模擬器） | Cloudflare Workers AI | Gemini Decisions API |
| --- | --- | --- | --- |
| 方法與路徑 | `POST {baseUrl}/v1/systemone` | `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/cloudflare/{model}` | `POST https://generativelanguage.googleapis.com/v1beta/decisions` |
| 驗證 | `Authorization: Bearer <key>`（本機可省略） | `Authorization: Bearer <CLOUDFLARE_API_TOKEN>` | `x-goog-api-key: <GEMINI_API_KEY>` |
| 模型欄位 | `model`（例如 `clef:27b`、`jev-latest`） | 路徑中的 `@cf/cloudflare/clef`；本文 `model` 為縮寫 `clef` | `model`，必須是 `gemini-decision-1` |
| 情境內容 | `state`：字串、物件或陣列 | `state` | `input`：字串，或內容區塊陣列 |
| 圖片 | `images`：原始 base64 字串陣列 | `images`：data URI 陣列 | `input` 陣列中的 `{"type": "image", "data", "mime_type"}` 區塊 |
| 問題 | `questions`：鍵值對 | `questions` | `questions` |

## 情境內容：`state` 與 `input`

### SystemOne

```json
{ "state": "The blue mug arrived cracked." }
```

`state` 也可以是 JSON 物件或陣列，模型會直接讀取結構化資料：

```json
{ "state": { "ticket_id": "TCK-9482", "ticket": "Charged twice" } }
```

### Gemini Decisions API

`input` 只接受字串、單一內容區塊或內容區塊陣列，不接受任意 JSON 物件，且不可為空。S1 Studio 的轉換規則：

| SystemOne `state` | 有無圖片 | Gemini `input` |
| --- | --- | --- |
| 字串 | 無 | 原字串 |
| 物件或陣列 | 無 | `JSON.stringify(state, null, 2)` 的字串 |
| 任何形式 | 有 | `[{"type": "text", "text": "<文字>\n"}, {"type": "image", …}, …]` |
| 空字串 | 無 | 送出前擋下，顯示「input 不可為空」 |

Gemini 會把相鄰的文字區塊直接串接，中間不加分隔字元，所以 S1 Studio 會在文字區塊結尾補上換行。

## 圖片

四家提供者的圖片格式都不同：

| 項目 | Ollama | Cloudflare | TypeSafe AI | Gemini |
| --- | --- | --- | --- | --- |
| 欄位 | `images: string[]` | `images: (string \| {content_type, base64})[]` | 頂層 `assets` 物件，在 `state`、`instructions` 或 `criteria` 中以 id 引用 | `input` 陣列中的 `image` 區塊 |
| 編碼 | 原始 base64；**不接受** data URL 或網址 | data URL（`data:image/png;base64,…`）或 `{content_type, base64}`；不接受遠端網址 | `data_base64`（不可含 `data:` 字首），建議改用 multipart | `data`：原始 base64；或 `uri`（HTTPS、Files API） |
| MIME 類型 | 不需要 | 寫在 data URL 或 `content_type` | `format`：`png`、`jpg`、`jpeg` | `mime_type` 必填 |
| 額外標頭 | 無 | 無 | `TypeSafe-Danger-Zone-Images: true` | 無 |
| 數量與大小 | 雲端：最多 4 張、單張 4 MiB 與 1,600 萬畫素、合計 8 MiB | 最多 4 張、單張 4 MiB 與 1,600 萬畫素、合計 8 MiB | 單張 16 MiB、請求 32 MiB | 每次請求 100 MB |
| S1 Studio 送出方式 | 原始 base64 | data URL，一律標為 `image/png` | `assets` 加上寫入 `state` 的參照字串，並帶上標頭；只接受 PNG、JPEG（v0.1.20 起，見 [TypeSafe AI](../providers/typesafe-ai.md#圖片與其他提供者不同)） | `image` 區塊，MIME 依檔頭判斷 |

Gemini 另有選填的 `resolution`（`low`、`medium`、`high`、`ultra_high`）。

`S1RequestPayload.images` 沒有記錄 MIME 類型，所以 `detectImageMimeType()` 依 base64 的檔頭判斷：

| base64 開頭 | MIME 類型 |
| --- | --- |
| `iVBORw0KGgo` | `image/png` |
| `/9j/` | `image/jpeg` |
| `R0lGOD` | `image/gif` |
| `UklGR` | `image/webp` |
| `Qk` | `image/bmp` |
| `SUkq`、`TU0AK` | `image/tiff` |
| `data:<mime>;base64,` | 取 data URI 中的類型 |
| 其他 | `image/png` |

Gemini 另外支援音訊、影片與 PDF（`audio`、`video`、`document` 區塊），也可用 HTTPS 網址或 Files API 的 URI 取代 base64。S1 Studio 目前只送出圖片。

## 問題（`questions`）

三者都以「問題鍵 → 問題定義」的物件表示，題型都是 `noul`、`choice`、`score`。差異在 `criteria` 與鍵名限制。

### noul（是非題）

| SystemOne | Gemini |
| --- | --- |
| `criteria.true`：符合時的描述 | `criteria.true_description` |
| `criteria.false`：不符合時的描述 | `criteria.false_description` |

Gemini 不接受 `true`／`false` 鍵，送出會得到 `Unknown parameter 'true' at 'questions.<key>.criteria'`。S1 Studio 會自動改名；兩者都沒填時整個 `criteria` 省略。

```jsonc
// SystemOne
{ "type": "noul", "instructions": "Did the item arrive damaged?",
  "criteria": { "true": "Broken or cracked", "false": "Intact" } }

// Gemini（轉換後）
{ "type": "noul", "instructions": "Did the item arrive damaged?",
  "criteria": { "true_description": "Broken or cracked", "false_description": "Intact" } }
```

### choice（選擇題）

| 項目 | SystemOne | Gemini |
| --- | --- | --- |
| `criteria` | `{ "選項鍵": "描述" \| null }` | `{ "選項鍵": "描述" }` |
| 不需描述的選項 | `null` | `""`（S1 Studio 自動轉換；實測 Gemini 也接受 `null`） |
| 選項數 | 至少 2 個 | 2 到 255 個 |
| 同分判定 | 依選項排列順序，排在前面的優先 | 先依選項鍵的 UTF-8 位元組排序，同分時取排序最前面的 |

S1 Studio 轉換時保留選項的原始順序，但 Gemini 評估前會自行重新排序，所以兩邊的同分結果可能不同。

### score（評分題）

| 項目 | SystemOne | Gemini |
| --- | --- | --- |
| `criteria` | 由低到高的等級描述陣列 | 相同 |
| 等級數 | 至少 2 個 | 2 到 255 個（建議 2 到 10 個） |

請求格式相同，但回應的 `score` 意義不同，見 [回應格式差異](response.md#score-的刻度)。

### 問題鍵與數量限制

| 限制 | S1 Studio 編輯器 | Ollama | Cloudflare | TypeSafe AI | Gemini |
| --- | --- | --- | --- | --- | --- |
| 問題鍵格式 | `[a-zA-Z0-9_.-]`，1 到 100 字元 | 英數、`_`、`.`、`-`，最多 100 字元（雲端） | 英數、`_`、`.`、`-`，最多 100 字元 | 未明訂 | `[A-Za-z0-9_-]`，1 到 64 字元（**不可含 `.`**） |
| 問題數 | 1 到 64 | 1 到 64 | 1 到 64 | 無固定上限，受 context 限制 | 1 到 1,000 |
| choice 選項數 | 至少 2 | 2 到 255（依模型而定；指南表格寫 2 到 26） | 2 到 255 | 最多 255 | 2 到 255 |
| score 等級數 | 至少 2，並依提供者檢查上限 | 2 到 10 | 2 到 10 | 2 到 10 | 2 到 255（建議 2 到 10） |
| `instructions` 型別 | 字串 | 字串 | 字串、物件或陣列 | 字串 | 只接受文字 |
| 選項鍵長度 | 未限制 | 未明訂 | 未明訂 | 未明訂 | 1 到 128 字元（最多 512 個 UTF-8 位元組） |
| 輸入過長 | — | 拒絕（400／413），不截斷 | **截斷文字 State** 以符合 token 上限 | 拒絕 | 拒絕 |

S1 Studio 編輯器檢查共通的規則（問題數 64、至少 2 個選項或等級），並自 v0.1.20 起依目前的 Profile 檢查 score 等級上限（`getScoreLevelLimitForProfile()`）：Ollama、Cloudflare 與 TypeSafe AI 為 10，Gemini 為 255，模擬器與自訂端點不限制。空白的等級列也會送出，所以同樣計入上限。超過上限時編輯器會顯示錯誤並停用執行。

問題鍵含 `.` 或超過 64 字元時，`validateGeminiDecisionsPayload()` 會在送出前擋下並列出不符合的鍵，不會發出請求。內建場景範本的問題鍵都符合 Gemini 的規則。

## 完整範例對照

同一份 S1 Studio 請求：

```json
{
  "model": "gemini-decision-1",
  "state": { "ticket": "Charged twice for October invoice" },
  "images": ["iVBORw0KGgoAAAANSUhEUgAA…"],
  "questions": {
    "refund": { "type": "noul", "instructions": "Does the customer ask for a refund?" },
    "team": {
      "type": "choice",
      "instructions": "Which team should handle it?",
      "criteria": { "billing": null, "technical": "Bugs and API errors" }
    },
    "urgency": {
      "type": "score",
      "instructions": "How urgent?",
      "criteria": ["Routine", "Soon", "Urgent"]
    }
  }
}
```

送到 Gemini Decisions API 時轉換為：

```json
{
  "model": "gemini-decision-1",
  "input": [
    { "type": "text", "text": "{\n  \"ticket\": \"Charged twice for October invoice\"\n}\n" },
    { "type": "image", "data": "iVBORw0KGgoAAAANSUhEUgAA…", "mime_type": "image/png" }
  ],
  "questions": {
    "refund": { "type": "noul", "instructions": "Does the customer ask for a refund?" },
    "team": {
      "type": "choice",
      "instructions": "Which team should handle it?",
      "criteria": { "billing": "", "technical": "Bugs and API errors" }
    },
    "urgency": {
      "type": "score",
      "instructions": "How urgent?",
      "criteria": ["Routine", "Soon", "Urgent"]
    }
  }
}
```

送到 Cloudflare Workers AI（`@cf/cloudflare/clef`）時：

```jsonc
{
  "model": "clef",
  "state": { "ticket": "Charged twice for October invoice" },
  "images": ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA…"],
  "questions": { "…": "與 SystemOne 相同" }
}
```

## 參考資料

- [Ollama SystemOne API](https://docs.ollama.com/api/systemone)（`SystemOneRequest` schema）
- [Ollama 決策能力指南](https://docs.ollama.com/capabilities/decision)
- [Cloudflare `@cf/cloudflare/clef`](https://developers.cloudflare.com/workers-ai/models/clef/)（輸入 schema）
- [Cloudflare `@cf/cloudflare/clef-omni`](https://developers.cloudflare.com/workers-ai/models/clef-omni/)
- [Cloudflare `@cf/cloudflare/clef-flash`](https://developers.cloudflare.com/workers-ai/models/clef-flash/)
- [TypeSafe AI：System One API](https://docs.typesafe.ai/api)
- [TypeSafe AI：Images](https://docs.typesafe.ai/images)
- [TypeSafe AI：Noul](https://docs.typesafe.ai/primitives/noul)、[Choice](https://docs.typesafe.ai/primitives/choice)、[Score](https://docs.typesafe.ai/primitives/score)
- [Gemini Decisions API](https://aistudio.google.com/docs/decisions-api)（Request Schema、Limits）
- [Gemini Files API](https://aistudio.google.com/docs/files)
