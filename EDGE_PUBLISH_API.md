# How to generate Microsoft Edge Publish API credentials

1. Follow the [Before you begin](https://docs.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#before-you-begin) part.
2. Run
   ```powershell
   web-ext-deploy --edge-client-id="client_id" --edge-client-secret="client_secret" --edge-access-token-url="access_token_url"
   ```
