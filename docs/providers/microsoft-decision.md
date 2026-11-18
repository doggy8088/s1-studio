# Microsoft Decision 1.1 (Foundry)

1. 在 Microsoft Foundry 的 Model catalog 部署 `Microsoft-Decision-1.1`。
2. 在 S1 Studio 開啟「端點與金鑰設定」，選擇 **Microsoft Decision 1.1 (Foundry)**。
3. 貼上部署詳細資料中的資源端點與資源 API Key，再填入實際的 **Deployment Name**。S1 Studio 預設填入 `Decision-1.1`。如果在 Foundry 使用其他部署名稱，請在這裡填入相同名稱。

端點欄位接受 `https://<resource>.services.ai.azure.com` 或包含 `/providers/microsoft/v1/systemone` 的完整網址。貼上完整網址時，S1 Studio 會自動保留資源根網址，並在送出請求時補上決策 API 路徑。預設使用 Proxy Mode，並以 `api-key` 標頭驗證。cURL、Python `requests` 與 TypeScript `fetch` 匯出預設從 `AZURE_API_KEY` 讀取金鑰。

支援 `noul`、`choice` 與 `score` 題型。上傳 PNG 或 JPEG 後，S1 Studio 會在請求中將圖片放入 `assets`，並在 `state` 加入對應的 `image:<name>` 參照。Score 結果的 `score` 是機率加權的等級索引，範圍為 0 到等級數減 1。

參考 [Microsoft Foundry 部署與 API 文件](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision)。
