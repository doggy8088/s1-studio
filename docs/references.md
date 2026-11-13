# 參考資料總表

本頁彙整所有技術文件引用的官方連結，依主題分類。

- **連結檢查日期**：2026-11-13
- **說明**：標示「需登入」的頁面無法匿名瀏覽，但為官方管理介面

## Gemini Decisions API（Google）

- [Decisions API](https://aistudio.google.com/docs/decisions-api)：端點、請求與回應 schema、限制、錯誤
- [Gemini Decision 模型頁](https://aistudio.google.com/docs/models/gemini-decision-1)
- [Using Gemini API keys](https://aistudio.google.com/docs/api-key)
- [API Key 管理頁](https://aistudio.google.com/apikey)（需登入）
- [Files API 指南](https://aistudio.google.com/docs/files)
- [Files API 參考](https://ai.google.dev/api/files)
- [Gemini Developer API 價格](https://aistudio.google.com/docs/pricing#gemini-decision)
- [速率限制](https://aistudio.google.com/docs/rate-limits#gemini-decision)
- [Gemini API 函式庫](https://aistudio.google.com/docs/libraries)
- [googleapis/python-genai](https://github.com/googleapis/python-genai)、[google-genai（PyPI）](https://pypi.org/project/google-genai/)
- [googleapis/js-genai](https://github.com/googleapis/js-genai)、[@google/genai（npm）](https://www.npmjs.com/package/@google/genai)

## Ollama

- [SystemOne API](https://docs.ollama.com/api/systemone)：`/v1/systemone` 的 OpenAPI schema、限制、錯誤
- [決策能力指南](https://docs.ollama.com/capabilities/decision)
- [API 驗證](https://docs.ollama.com/api/authentication)
- [Ollama Cloud](https://docs.ollama.com/cloud)
- [List Local Models（`/api/tags`）](https://docs.ollama.com/api/tags)
- [Pull a Model（`/api/pull`）](https://docs.ollama.com/api/pull)
- [OpenAI 相容 API](https://docs.ollama.com/api/openai-compatibility)
- [FAQ：允許其他網頁來源](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama)
- [FAQ：設定伺服器環境變數](https://docs.ollama.com/faq#how-do-i-configure-ollama-server)
- [clef 模型頁](https://ollama.com/library/clef)、[clef 標籤](https://ollama.com/library/clef/tags)、[clef-flash 模型頁](https://ollama.com/library/clef-flash)
- [Ollama 下載](https://ollama.com/download)
- [ollama-python](https://github.com/ollama/ollama-python)、[ollama-js](https://github.com/ollama/ollama-js)

## Cloudflare Workers AI

- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [模型列表](https://developers.cloudflare.com/workers-ai/models/)
- [`@cf/cloudflare/clef`](https://developers.cloudflare.com/workers-ai/models/clef/)、[`clef-omni`](https://developers.cloudflare.com/workers-ai/models/clef-omni/)、[`clef-flash`](https://developers.cloudflare.com/workers-ai/models/clef-flash/)
- [REST API 入門](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [價格](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [限制](https://developers.cloudflare.com/workers-ai/platform/limits/)

## TypeSafe AI

- [官方網站](https://www.typesafe.ai/)
- [文件首頁](https://docs.typesafe.ai)
- [Quickstart](https://docs.typesafe.ai/introduction/quickstart)
- [System One API](https://docs.typesafe.ai/api)
- [Models](https://docs.typesafe.ai/models)
- [Images](https://docs.typesafe.ai/images)
- [Noul](https://docs.typesafe.ai/primitives/noul)、[Choice](https://docs.typesafe.ai/primitives/choice)、[Score](https://docs.typesafe.ai/primitives/score)
- [SDK](https://docs.typesafe.ai/sdk)
- [typesafe-sdk-python](https://github.com/typesafe-ai/typesafe-sdk-python)、[typesafe-sdk-js](https://github.com/typesafe-ai/typesafe-sdk-js)
- [Python SDK](https://docs.typesafe.ai/sdk/python)：[TypeSafeClient](https://docs.typesafe.ai/sdk/python/api/clients/sync)、[回應型別](https://docs.typesafe.ai/sdk/python/api/types/responses)、[Image](https://docs.typesafe.ai/sdk/python/api/types/assets)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)：[TypeSafeClient](https://docs.typesafe.ai/sdk/javascript/api/classes/TypeSafeClient)、[TypeSafeClientConfig](https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig)、[Image](https://docs.typesafe.ai/sdk/javascript/api/classes/Image)

## Next.js

- [How to create a static export](https://nextjs.org/docs/app/guides/static-exports)
- [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [route.js API 參考](https://nextjs.org/docs/app/api-reference/file-conventions/route)

## Cloudflare Pages 與 Wrangler

- [Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Pages Functions 路由規則](https://developers.cloudflare.com/pages/functions/routing/)
- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Use Direct Upload with continuous integration](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Wrangler：Pages 指令](https://developers.cloudflare.com/workers/wrangler/commands/pages/)
- [cloudflare/wrangler-action](https://github.com/cloudflare/wrangler-action)

## Bun 與測試

- [Bun 官方網站](https://bun.sh/)
- [Test runner](https://bun.com/docs/test)
- [Writing tests](https://bun.com/docs/test/writing-tests)
- [Mocks](https://bun.com/docs/test/mocks)
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun)
- [Playwright](https://playwright.dev/)

## GitHub

- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub CLI：`gh secret set`](https://cli.github.com/manual/gh_secret_set)

## Web 標準（MDN）

- [跨來源資源共用（CORS）](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)
- [Request.mode](https://developer.mozilla.org/en-US/docs/Web/API/Request/mode)
- [Response.type](https://developer.mozilla.org/en-US/docs/Web/API/Response/type)
- [Window.localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)
- [encodeURIComponent()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)

## 其他規範與函式庫

- [Dexie.js 文件](https://dexie.org/docs/)
- [Mermaid 流程圖語法](https://mermaid.js.org/syntax/flowchart.html)
- [CommonMark Spec](https://spec.commonmark.org/)
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- [RFC 1918：私有網路位址](https://www.rfc-editor.org/rfc/rfc1918)
