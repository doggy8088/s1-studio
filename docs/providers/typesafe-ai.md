# TypeSafe AI

TypeSafe AI 提供 `jev` 系列模型，端點為 SystemOne 格式的 `POST /v1/systemone`。請求與回應格式與 Ollama 相近，但圖片格式、SDK 與額外功能不同。

- **Profile id**：`typesafe-ai-jev`
- **端點**：`POST https://api.typesafe.ai/v1/systemone`
- **預設模型**：`jev-latest`
- **預設模式**：Proxy
- **API Key 環境變數**：`TYPESAFE_API_KEY`

## 端點與驗證

```bash
curl -s -X POST "https://api.typesafe.ai/v1/systemone" \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jev-latest",
    "state": "Charged twice for the October invoice.",
    "questions": {
      "refund": { "type": "noul", "instructions": "Does the customer ask for a refund?" }
    }
  }' | jq
```

API Key 在 TypeSafe 主控台建立（需要登入）。

## 模型

| 模型 | 說明 |
| --- | --- |
| `jev-1.14.0` | 2026-10-14 起提供；新增 **Box**（圖片邊界框）題型 |
| `jev-1.13.0` | 前一版 |
| `jev-latest`、`jev-preview` | 別名，目前都指向 `jev-1.14.0` |

- **價格**：每百萬輸入 tokens US$0.042，輸出不計費。
- **Context**：每次請求 64k、每題 32k；加上 `TypeSafe-Danger-Zone-Long-Context: true` 標頭後兩者都提高到 262k。
- **問題數**：沒有固定上限，受 context 限制。
- **速率限制**：以組織為單位，超過時回傳 HTTP 429。

S1 Studio 會把舊設定中的 `jev-1.13.0` 自動改為 `jev-latest`（見 [資料儲存與 Profile](../storage-and-profiles.md#內建-profile-與自動遷移)）。

## 請求與回應

- **題型**：Choice、Score、Noul，以及 jev 1.14 新增的 Box。S1 Studio 目前不支援 Box。
- **noul**：`criteria` 為 `{true, false}`。
- **choice**：最多 255 個選項。
- **score**：回傳等級索引，「For a three-level scale it runs from 0 to 2」；官方建議除以 `len(criteria) - 1` 正規化。
- **回應**：`{model, answers, usage: {input_tokens, output_tokens}}`，score 答案包含 `legend`。

## 圖片（與其他提供者不同）

TypeSafe AI 的圖片不是放在 `images` 陣列，而是：

1. 加上標頭 `TypeSafe-Danger-Zone-Images: true`。
2. 在頂層 `assets` 物件中定義圖片：`{"<id>": {"type": "image", "format": "png", "data_base64": "…"}}`，`data_base64` 不可含 `data:` 字首。
3. 在 `state`、`instructions` 或 `criteria` 中以 id 引用圖片。

限制為 PNG 或 JPEG、單張 16 MiB、每邊 280 到 1,568 畫素、總畫素 78,400 到 2,458,624、請求 32 MiB。官方建議改用 multipart form-data 上傳，JSON 內嵌 base64 也受支援。此功能標示為實驗性質。

### S1 Studio 的轉換方式（v0.1.20 起）

[`src/lib/typesafe.ts`](../../src/lib/typesafe.ts) 的 `toTypeSafeRequest()` 在送出時把 SystemOne 的 `images` 陣列轉成官方格式，沒有圖片的請求完全不變：

| 步驟 | 做法 |
| --- | --- |
| 參照字串 | 每張圖片每次請求產生新的 `<s1-image-UUID>` |
| `assets` | `{"type": "image", "format": "png" \| "jpeg", "data_base64": "…"}`，`format` 依檔頭判斷 |
| 文字 State | 結尾加上 `Image 1: <ref>`、`Image 2: <ref>`… |
| JSON 物件 State | 加上 `images` 欄位（已存在時改用 `images_2`…） |
| 其他 JSON State | 包成 `{"state": 原值, "images": [...]}` |
| 標頭 | 有圖片時加上 `TypeSafe-Danger-Zone-Images: true`，Proxy 會轉送 |
| 格式檢查 | 非 PNG、JPEG（例如 WebP）時不送出，直接顯示錯誤 |

例如文字 State `My order arrived broken.` 加上一張 PNG，實際送出：

```json
{
  "model": "jev-latest",
  "state": "My order arrived broken.\n\nImage 1: <s1-image-3f2a…>",
  "questions": { "damaged": { "type": "noul", "instructions": "Is the item damaged?" } },
  "assets": {
    "<s1-image-3f2a…>": { "type": "image", "format": "png", "data_base64": "iVBORw0KGgo…" }
  }
}
```

S1 Studio 只檢查格式，不檢查尺寸；尺寸不符時由 API 回傳 400。修正紀錄見 [已知問題](../known-issues.md#typesafe-ai-圖片格式不符)。

## SDK

| 語言 | 套件 | 用法 |
| --- | --- | --- |
| Python | `typesafe-sdk` | `from typesafe_sdk import TypeSafeClient`；`TypeSafeClient(api_key=…, base_url=…)` 的 `system_one(state=…, questions=…, model=…)`；結果在 `response.nouls`、`response.choices`、`response.scores`；圖片用 `assets={ref: Image.from_base64(…)}` 與 `extra_headers` |
| TypeScript | `@typesafe-ai/sdk`（Node.js 22 以上） | `new TypeSafeClient({ apiKey, baseURL })` 的 `systemOne({ model, state, questions, assets })`；結果在 `response.answers`；圖片用 `Image.fromBase64(…)`，標頭放在第二個參數的 `headers` |

`base_url`／`baseURL` 是 API 根網址（例如 `https://api.typesafe.ai`），SDK 會自行加上 `/v1/systemone`。兩個 SDK 都拒絕空白的 API Key。

> **注意**：PyPI 的 `typesafe` 是無關的套件；npm 的 `@typesafe/sdk` 不存在。v0.1.19 以前 S1 Studio 匯出的 SDK 範例使用了這些錯誤的名稱，v0.1.20 已修正，見 [已知問題](../known-issues.md#typesafe-ai-sdk-名稱錯誤)。

S1 Studio 的「匯出程式碼」只對 TypeSafe AI 產生 SDK 範例；其他 SystemOne 端點（Ollama、Cloudflare、模擬器、自訂端點）的 Python 範例使用 `requests`，TypeScript「SDK」分頁改為原生 `fetch`。

## CORS

官方文件沒有說明。2026-11-13 實測以任意 `Origin` 發出 `OPTIONS` 請求，回傳 400，回應有 `access-control-allow-headers` 但沒有 `access-control-allow-origin`，推測不允許任意來源的瀏覽器呼叫，所以預設使用 Proxy Mode。

## 參考資料

- [TypeSafe AI 官方網站](https://www.typesafe.ai/)
- [TypeSafe AI 文件](https://docs.typesafe.ai)
- [Quickstart](https://docs.typesafe.ai/introduction/quickstart)
- [System One API](https://docs.typesafe.ai/api)
- [Models](https://docs.typesafe.ai/models)
- [Images](https://docs.typesafe.ai/images)
- [Noul](https://docs.typesafe.ai/primitives/noul)
- [Choice](https://docs.typesafe.ai/primitives/choice)
- [Score](https://docs.typesafe.ai/primitives/score)
- [SDK](https://docs.typesafe.ai/sdk)
- [typesafe-sdk-python（GitHub）](https://github.com/typesafe-ai/typesafe-sdk-python)
- [typesafe-sdk-js（GitHub）](https://github.com/typesafe-ai/typesafe-sdk-js)
- [Python SDK：TypeSafeClient](https://docs.typesafe.ai/sdk/python/api/clients/sync)
- [JavaScript SDK：TypeSafeClient](https://docs.typesafe.ai/sdk/javascript/api/classes/TypeSafeClient)
