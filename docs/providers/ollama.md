# Ollama（Local 與 Cloud）

Ollama 提供 SystemOne 決策端點 `POST /v1/systemone`，可在本機執行 `clef` 模型，也可呼叫 ollama.com 的雲端推論。S1 Studio 內建兩組 Profile：

| Profile id | 名稱 | 端點 | 預設模型 | 預設模式 |
| --- | --- | --- | --- | --- |
| `local-ollama-clef` | Local Ollama | `http://localhost:11434/v1/systemone` | `clef` | Direct |
| `ollama-cloud-clef` | Ollama Cloud | `https://ollama.com/v1/systemone` | `clef:27b` | Proxy |

- **相關程式碼**：[`src/lib/s1-utils.ts`](../../src/lib/s1-utils.ts) 的 `diagnoseLocalOllama()`、`fetchModelsForProfile()`、`pullLocalOllamaModel()`

## 版本需求

| 項目 | 需求 | 來源 |
| --- | --- | --- |
| `/v1/systemone` API | Ollama v0.35.0 以上；雲端模型 v0.40.5 以上 | SystemOne API 文件 |
| `clef` 模型 | Ollama 0.35.1 以上；雲端 0.40.6 以上 | clef 模型頁 |

兩份官方文件的版本號碼略有出入，使用 `clef` 時以模型頁為準。

## 端點與驗證

| 項目 | Local | Cloud |
| --- | --- | --- |
| 網址 | `http://localhost:11434/v1/systemone` | `https://ollama.com/v1/systemone` |
| 驗證 | 不需要 | `Authorization: Bearer $OLLAMA_API_KEY`（不支援只用 `x-api-key`） |
| 金鑰取得 | 不需要 | ollama.com 的帳號設定頁 |
| 費用 | 免費（使用本機資源） | 需要付費方案或點數 |
| 回應方式 | 單次 JSON，不支援串流 | 同左 |

官方文件提醒：「Keep keys outside browser code and source control」。S1 Studio 的金鑰只存在使用者自己的瀏覽器 LocalStorage，屬於個人測試用途。

## 請求格式

必填欄位：`model`、`state`、`questions`。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `model` | 字串 | 例如 `clef`、`clef:27b`、`clef:cloud` |
| `state` | 字串、物件或陣列 | 物件與陣列會序列化成 JSON 文字 |
| `images` | base64 字串陣列 | 所有問題共用；**不接受網址或 data URL**；PNG、JPEG、WebP；需要支援視覺的模型 |
| `questions` | 物件 | 1 到 64 題；各題獨立，前面的答案不會傳給後面的題目 |
| `keep_alive` | 字串或數字 | 只在本機有效 |

題型的 `criteria`：

| 題型 | `criteria` |
| --- | --- |
| `noul` | 選填，`{"true": "…", "false": "…"}`，不接受其他鍵 |
| `choice` | `{"選項鍵": "描述" \| null}`，2 到 255 個選項（依模型而定）；同分時依選項順序 |
| `score` | 2 到 10 個字串，由低（索引 0）到高 |

## 回應格式

```json
{
  "model": "clef",
  "answers": {
    "refund": { "type": "noul", "noul": 0.97 },
    "team": { "type": "choice", "choice": "billing",
              "probabilities": { "billing": 0.95, "technical": 0.05 }, "confidence": 0.71 },
    "urgency": { "type": "score", "score": 1.4,
                 "legend": { "0": "Routine", "1": "Soon", "2": "Urgent" },
                 "probabilities": { "0": 0.1, "1": 0.4, "2": 0.5 }, "confidence": 0.12 }
  },
  "usage": { "input_tokens": 312, "output_tokens": 3 }
}
```

（數值為示意。）

- **noul**：只有 `noul`（0 到 1 的數字，不是布林值），沒有 `confidence`。
- **confidence**：`1 - H(p) / ln(N)`，以熵計算，官方註明「Not calibrated correctness」。
- **score**：0 到「等級數 − 1」的加權等級索引，「Not rounded to a level or normalized to 0–1」。S1 Studio 自 v0.1.20 起一律以等級索引顯示，見 [已知問題](../known-issues.md#score-刻度判斷錯誤)。
- **output_tokens**：模型內部評分用的 token，不是回應 JSON 的長度。

## 限制

| 限制 | Local | Cloud |
| --- | --- | --- |
| 文字與 schema | 64 KiB | 輸入需在 65,536 tokens 內 |
| 整個請求 | 32 MiB | 13 MiB |
| 問題數 | 1 到 64 | 1 到 64 |
| 問題鍵 | — | 最多 100 個 ASCII 英數、`_`、`.`、`-` |
| 圖片 | — | 最多 4 張、單張 4 MiB 與 1,600 萬畫素、合計 8 MiB |
| 過長輸入 | 拒絕（400 或 413），不截斷 | 同左 |

錯誤狀態碼：400、401（經本機伺服器呼叫雲端時會附 `signin_url`）、402、404、413、500。

## 模型

`clef` 的標籤（取自 ollama.com 模型標籤頁）：

| 標籤 | 說明 |
| --- | --- |
| `clef:latest`、`clef:27b` | 本機版本，約 18 到 20 GB，256K context |
| `clef:cloud`、`clef:27b-cloud` | 雲端版本，64K context |
| `clef:27b-q4_K_M`、`clef:27b-q8_0`、`clef:27b-mxfp8`、`clef:27b-nvfp4`、`clef:27b-mlx-bf16` | 其他量化版本 |

相關模型：`clef-flash`（較小、較快，支援圖片）、`nimble`（純文字，官方範例常用）。

模型名稱的使用方式：

- **本機**：先執行 `ollama pull clef`，再使用 `clef`。
- **本機伺服器代理雲端**：登入 ollama.com 後使用 `clef:cloud`。
- **直接呼叫 ollama.com**：官方決策指南範例使用 `clef`；但 2026-11-13 實測 `GET https://ollama.com/v1/models` 只列出 `clef:27b`。S1 Studio 預設使用 `clef:27b`。

## 模型探索與拉取

| 用途 | 端點 | 說明 |
| --- | --- | --- |
| 列出本機模型 | `GET /api/tags` | 回傳 `{"models": [{"name", "model", "size", …}]}` |
| OpenAI 相容清單 | `GET /v1/models` | 雲端 ollama.com 也提供 |
| 拉取模型 | `POST /api/pull` | `{"model": "clef", "stream": true}`，以 NDJSON 回傳進度 |

S1 Studio 只保留名稱含 `clef` 或 `jev` 的模型。Local Ollama 不快取清單，雲端端點的清單會快取在 LocalStorage。

## 本機 CORS 設定

官方 FAQ：「Ollama allows cross-origin requests from `127.0.0.1` and `0.0.0.0` by default. Additional origins can be configured with `OLLAMA_ORIGINS`.」

從 `https://s1-studio.miniasp.com` 直連本機 Ollama 時，必須設定 `OLLAMA_ORIGINS`：

```bash
# macOS（Ollama.app）
launchctl setenv OLLAMA_ORIGINS "*"
killall Ollama && open -a Ollama

# macOS／Linux 命令列
OLLAMA_ORIGINS="*" ollama serve
```

Windows 與 systemd 的設定方式見官方 FAQ。

### S1 Studio 的連線診斷

`diagnoseLocalOllama()` 依序判斷四種狀態：

| 狀態 | 判斷方式 | 畫面提示 |
| --- | --- | --- |
| `ready` | `/api/tags` 或 `/v1/models` 成功，且有 `clef`／`jev` 模型 | 顯示模型下拉選單 |
| `model_missing` | 可連線但沒有 `clef`／`jev` 模型 | 提供「拉取 clef 模型」按鈕 |
| `cors_blocked` | 收到 HTTP 403，或 `mode: 'no-cors'` 探測得到 opaque 回應 | 提供 `OLLAMA_ORIGINS` 設定指令 |
| `unreachable` | 連 `no-cors` 探測都失敗 | 提示啟動 `ollama serve` |

`no-cors` 請求的回應是 opaque（狀態碼 0、無本文），無法讀取內容，但能證明伺服器有回應，藉此區分「被 CORS 擋下」與「服務沒啟動」。

### Ollama Cloud 的 CORS

2026-11-13 實測 `OPTIONS https://ollama.com/v1/systemone` 回傳 405 且沒有 `Access-Control-*` 標頭，瀏覽器無法直接呼叫，所以內建 Profile 預設使用 Proxy Mode。

## SDK

| 語言 | 套件 | 呼叫方式 |
| --- | --- | --- |
| Python | `ollama`（0.6.3 以上） | `ollama.systemone(...)`、`Client.systemone`、`AsyncClient.systemone` |
| JavaScript | `ollama` | `ollama.systemone({...})`，型別由 `ollama` 與 `ollama/browser` 匯出 |

官方模型頁也說明，TypeSafe 的 Python SDK（`typesafe-sdk`）設定 `TYPESAFE_BASE_URL=http://localhost:11434` 後可呼叫本機 Ollama，但只支援文字與 JSON State。

## 參考資料

- [Ollama SystemOne API](https://docs.ollama.com/api/systemone)
- [Ollama 決策能力（Decision）指南](https://docs.ollama.com/capabilities/decision)
- [clef 模型頁](https://ollama.com/library/clef)
- [clef 模型標籤](https://ollama.com/library/clef/tags)
- [clef-flash 模型頁](https://ollama.com/library/clef-flash)
- [Ollama API 驗證](https://docs.ollama.com/api/authentication)
- [Ollama Cloud](https://docs.ollama.com/cloud)
- [List Local Models（`/api/tags`）](https://docs.ollama.com/api/tags)
- [Pull a Model（`/api/pull`）](https://docs.ollama.com/api/pull)
- [OpenAI 相容 API](https://docs.ollama.com/api/openai-compatibility)
- [FAQ：允許其他網頁來源存取 Ollama](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama)
- [FAQ：設定 Ollama 伺服器環境變數](https://docs.ollama.com/faq#how-do-i-configure-ollama-server)
- [ollama-python](https://github.com/ollama/ollama-python)
- [ollama-js](https://github.com/ollama/ollama-js)
- [MDN：Request.mode（`no-cors`）](https://developer.mozilla.org/en-US/docs/Web/API/Request/mode)
- [MDN：Response.type（opaque）](https://developer.mozilla.org/en-US/docs/Web/API/Response/type)
