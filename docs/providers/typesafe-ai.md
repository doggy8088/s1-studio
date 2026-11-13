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

限制為單張 16 MiB、請求 32 MiB，官方建議改用 multipart form-data 上傳。此功能標示為「Dreamer-ready」（尚未達正式品質）。

S1 Studio 目前送出的是 Ollama 格式的 `images` 陣列，與官方格式不符，見 [已知問題](../known-issues.md#typesafe-ai-圖片格式不符)。

## SDK

| 語言 | 套件 | 用法 |
| --- | --- | --- |
| Python | `typesafe-sdk` | `from typesafe_sdk import TypeSafeClient`；`TypeSafeClient(model="jev-latest").system_one(state=…, questions=…)`；結果在 `response.choices`、`response.scores`、`response.nouls` |
| TypeScript | `@typesafe-ai/sdk` | `new TypeSafeClient({ defaultModel: "jev-latest" }).systemOne({...})`；結果在 `response.answers` |

> **注意**：PyPI 的 `typesafe` 是無關的套件；npm 的 `@typesafe/sdk` 不存在。S1 Studio 目前匯出的 SDK 範例使用錯誤的名稱，見 [已知問題](../known-issues.md#typesafe-ai-sdk-名稱錯誤)。

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
