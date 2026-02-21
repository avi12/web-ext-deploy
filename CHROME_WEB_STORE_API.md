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

### 4. Get the refresh token

Run the helper script:

```shell
pnpm chrome:token <client-id> <client-secret>
```

This opens your browser for Google sign-in, captures the authorization code, and prints the refresh token
