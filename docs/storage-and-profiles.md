# 資料儲存與 Profile

S1 Studio 沒有後端資料庫，所有資料都存在使用者的瀏覽器。本文說明各種資料存放的位置、格式、遷移方式，以及 Deep Link 匯入的安全設計。

- **相關程式碼**：[`src/lib/db.ts`](../src/lib/db.ts)、[`src/lib/profile-link.ts`](../src/lib/profile-link.ts)、[`src/lib/presets.ts`](../src/lib/presets.ts)
- **使用說明**：Deep Link 參數說明見 [README](../README.md#11-從網址一鍵匯入-profile-與場景範本-deep-link)

## 儲存位置總覽

| 資料 | 位置 | 鍵名或資料表 | 說明 |
| --- | --- | --- | --- |
| 端點 Profile（含 API Key） | LocalStorage | `s1_studio_profiles_v1` | `EndpointProfile[]` JSON |
| 目前使用的 Profile | LocalStorage | `s1_studio_active_profile_id_v1` | Profile id |
| 模型清單快取 | LocalStorage | `s1_studio_models_cache_v1` | 以 `id::baseUrl::金鑰前 12 字元` 為鍵；Local Ollama 不快取 |
| 主題 | LocalStorage | `s1_studio_theme_v1` | 淺色或深色 |
| 執行歷史 | IndexedDB `S1StudioDatabase` | `history`（索引：`++id, timestamp, profileName, model`） | 最多 50 筆，超過時刪除最舊的 |
| 自訂場景範本 | IndexedDB `S1StudioDatabase` | `customPresets`（索引：`id, name, category, createdAt`） | `S1PresetDefinition` |

IndexedDB 透過 Dexie 4 存取，資料庫版本為 1。

## API Key 的安全性

- **只存在本機**：API Key 只存於 LocalStorage，不會傳到 S1 Studio 的伺服器；使用 Proxy Mode 時會經過 `/api/proxy` 轉送，但 Proxy 不留存。
- **匯出程式碼預設不含金鑰**：cURL 與程式碼範例預設使用環境變數（例如 `$GEMINI_API_KEY`），要勾選選項才會填入實際金鑰。
- **Deep Link 不接受金鑰**：見下方「Deep Link 安全設計」。
- **注意**：LocalStorage 可被同網域的 JavaScript 讀取。請勿在不信任的瀏覽器或共用電腦上儲存正式環境的金鑰。

## 內建 Profile 與自動遷移

`DEFAULT_PROFILES` 目前有六組（依顯示順序）：

| id | 名稱 | 預設模型 | 預設模式 |
| --- | --- | --- | --- |
| `local-ollama-clef` | Local Ollama | `clef` | Direct |
| `ollama-cloud-clef` | Ollama Cloud | `clef:27b` | Proxy |
| `typesafe-ai-jev` | TypeSafe AI | `jev-latest` | Proxy |
| `cloudflare-workers-ai-clef` | Cloudflare Workers AI | `@cf/cloudflare/clef` | Proxy |
| `gemini-decisions-api` | Gemini Decisions API | `gemini-decision-1` | Direct |
| `s1-builtin-simulator` | 內建沙盒模擬器(Demo) | `clef-simulator-1.0` | Direct |

`loadProfilesFromLocalStorage()` 每次載入時會執行下列遷移，並在有變更時寫回 LocalStorage：

1. **舊名稱改名**：例如 `Ollama Cloud (clef:cloud)` 改為 `Ollama Cloud`。
2. **修正預設值**：Local Ollama 強制 Direct Mode；Ollama Cloud 的 `clef:cloud` 改為 `clef:27b`；TypeSafe AI 的 `jev-1.13.0` 改為 `jev-latest`。
3. **Cloudflare 網址重組**：依 Account ID 與模型重新組合 `/ai/run/@cf/cloudflare/...` 網址。
4. **補上新的內建 Profile**：使用者資料中缺少的內建 Profile 會插入在模擬器之前。v0.1.19 的 Gemini Profile 就是由這個機制加入，使用者原有的設定與金鑰不受影響。

「重置為預設」會還原所有內建 Profile，但保留既有的 API Key 與 Cloudflare Account ID。

## 圖片限制

圖片上傳限制定義在 [`src/lib/s1-utils.ts`](../src/lib/s1-utils.ts)，所有提供者共用：

| 限制 | 值 |
| --- | --- |
| 每次請求圖片數 | 4 張 |
| 單張大小 | 4 MiB |
| 總大小 | 8 MiB |
| 單張畫素 | 1,600 萬畫素 |
| 接受格式 | PNG、JPEG、WebP |

這些限制比 Gemini Decisions API 的上限嚴格，所以送到 Gemini 時不需要額外檢查大小。

## 匯出檔格式

場景範本匯出為 `S1ExportFileFormat` JSON：

```json
{
  "version": "1.0",
  "exportedAt": "2026-11-13T00:00:00.000Z",
  "name": "範本名稱",
  "description": "說明",
  "stateMode": "text",
  "stateText": "…",
  "payload": { "model": "clef", "state": "…", "questions": {} }
}
```

`payload` 一律是 SystemOne 格式，與提供者無關。所以用 Gemini 執行過的範本，也能直接匯入後改用其他提供者執行。

## Deep Link 安全設計

`?profile=…&baseUrl=…&model=…&proxy=…&accountId=…&preset=…` 可建立或切換 Profile。安全規則如下：

- **不接受金鑰**：`apikey`、`api_key`、`key`、`token`、`secret`、`password`、`authorization` 等參數一律忽略、從網址列移除，並顯示警告。
- **`baseUrl` 驗證**：只接受 `http(s)` 或以 `/api/` 開頭的站內路徑；不可含帳號密碼、查詢字串、`#` 片段、控制字元或反斜線；長度上限 2,048 字元。
- **新建 Profile 的金鑰一律留空**。
- **覆寫既有 Profile 前先確認**：名稱相同但設定不同時，會跳出確認視窗；確認覆寫時保留本機已存的 API Key。
- **預設模式推斷**：`localhost`、`*.localhost`、私有 IP（`10.*`、`172.16-31.*`、`192.168.*`、`169.254.*`、IPv6 ULA 與 link-local）與 `/api/...` 預設 Direct Mode，其餘預設 Proxy Mode。

以 Deep Link 建立 Gemini Profile（`baseUrl=https://generativelanguage.googleapis.com`）時，模型會自動推斷為 `gemini-decision-1`，模式依上述規則為 Proxy Mode（與內建 Profile 的 Direct Mode 不同，但兩者都能正常運作）。

## 參考資料

- [MDN：Window.localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [MDN：IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Dexie.js 文件](https://dexie.org/docs/)
- [MDN：URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)
- [MDN：encodeURIComponent()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)
- [RFC 1918：私有網路位址](https://www.rfc-editor.org/rfc/rfc1918)（Deep Link 判斷 Direct Mode 的私有 IP 範圍）
- [Gemini Decisions API 限制](https://aistudio.google.com/docs/decisions-api)（圖片大小上限）
- [Ollama SystemOne API](https://docs.ollama.com/api/systemone)（S1 Studio 圖片限制與 Ollama Cloud 一致）
