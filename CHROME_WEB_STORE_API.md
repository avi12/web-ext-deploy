# How to retrieve Chrome Web Store API credentials

## Publisher ID

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. Click **Account** in the left sidebar
3. Your publisher ID is displayed on this page

## Refresh Token

### 1. Enable the Chrome Web Store API

1. Go to the [Google Cloud Console](https://console.developers.google.com)
2. Create a new project or select an existing one
3. Enable the [Chrome Web Store API](https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com)

### 2. Configure OAuth consent screen

1. Go to **OAuth consent screen**
2. Select **External**, then click **Create**
3. Fill in the required fields (app name, support email, developer contact)
4. Click **Save and Continue** through the remaining steps
5. Under **Test users**, add your Google account email

### 3. Create OAuth credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Under **Authorized redirect URIs**, add `http://localhost:8818`
5. Click **Create** and save the **Client ID** and **Client Secret**

### 4. Set up chrome.env

Add your credentials to `chrome.env`:

```ini
EXT_ID=your-extension-id
PUBLISHER_ID=your-publisher-id
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
```

### 5. Get the refresh token

Pass `--auto-fetch-credentials` when deploying. It will open your browser for Google sign-in, capture the authorization code, and either save the refresh token to `chrome.env` (in `env` mode) or keep it in memory for the current run (in `cli` mode):

```shell
# env mode - fetches and saves REFRESH_TOKEN to chrome.env
web-ext-deploy env --auto-fetch-credentials

# cli mode - fetches and uses in-memory only
web-ext-deploy cli --chrome-ext-id EXT_ID ... --auto-fetch-credentials
```

On subsequent `env` runs, the saved `REFRESH_TOKEN` in `chrome.env` is used directly - no browser prompt needed.
