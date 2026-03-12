# WebExt Deploy

The ultimate automation tool for deploying to multiple extension stores simultaneously!

Made by [Avi](https://avi12.com)

Supported stores:

- [Chrome Web Store](https://chrome.google.com/webstore/category/extensions)
  - [`.env` snippet](#chromeenv)
  - [CLI API](#chrome-web-store-cli)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/extensions)
  - [`.env` snippet](#firefoxenv)
  - [CLI API](#firefox-add-ons-cli)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons)
  - [`.env` snippet](#edgeenv)
  - [CLI API](#edge-add-ons-cli)
- [Opera Add-ons](https://addons.opera.com/en/extensions)
  - [`.env` snippet](#operaenv)
  - [CLI API](#opera-add-ons-cli)

# Core packages/APIs used

- [Playwright](https://github.com/microsoft/playwright) - for fetching Opera credentials
- [Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)
- [Microsoft Edge Publish API v1.1](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api)
- [Firefox Add-ons Store Submission API](https://mozilla.github.io/addons-server/topics/api/addons.html)
- Opera Store API

# Installing

```shell
npm i -D web-ext-deploy
# or
pnpm i -D web-ext-deploy
# or
bun add -D web-ext-deploy
```

or install globally

```shell
npm i -g web-ext-deploy
# or
pnpm i -g web-ext-deploy
# or
bun add -g web-ext-deploy
```

Deployment to Chrome Web Store: [follow this guide](https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md)  
Deployment to Edge Add-ons Store: [follow this guide](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md)

# Usage

## 1. Get the relevant credentials for each store:

### Disclaimer: I do NOT take any responsibility for leaked cookies or credentials.

- Opera: `sessionid`, `csrftoken` — obtained via Playwright (use `--auto-fetch-credentials` to fetch automatically)
- Chrome: `REFRESH_TOKEN` — obtained via OAuth (use `--auto-fetch-credentials` to fetch automatically)

For the Edge Add-ons Store, you'll use the Microsoft Edge Publish API

## 2. Decide how to access the data & credentials

- [`.env` files method](#env-files-method)
- [CLI arguments method](#cli-arguments-method)

## `.env` files method

Use the `.env` [snippet(s)](#possible-env-files) relevant to your extension  
Include each one in your root directory  
Make sure to have `*.env` or `chrome.env`, `firefox.env`, `edge.env`, `opera.env` in your `.gitignore`

Next, in the CLI:

```shell
web-ext-deploy env
```

### Options for `env` mode

**Global:**

| Flag | Description |
|------|-------------|
| `--publish-only <stores...>` | Only deploy to specific stores (e.g. `--publish-only chrome firefox`) |
| `--auto-fetch-credentials` | Automatically fetch missing or expired credentials. Opera: fetches `sessionid`/`csrftoken` via Playwright (auto-installed if needed). Chrome: fetches `REFRESH_TOKEN` via OAuth. In `env` mode, saves fetched credentials to the store's `.env` file |
| `--dry-run` | Validate inputs without deploying |
| `--verbose` | Log each deployment step |

**Chrome overrides:**

| Flag | Description |
|------|-------------|
| `--chrome-skip-review` | Publish without waiting for a review |
| `--chrome-deploy-percentage <number>` | Staged rollout percentage (1-100) |

**Firefox overrides:**

| Flag | Description                                                                            |
|------|----------------------------------------------------------------------------------------|
| `--firefox-changelog <text>` | Changelog for Firefox users. Supports `\n` for new lines                               |
| `--firefox-changelog-lang <code>` | Language of the changelog. [Full list](https://github.com/mozilla/addons-server/blob/master/src/olympia/core/languages.py#L3) (default: manifest's `default_locale` or `en-US`) |
| `--firefox-dev-changelog <text>` | Changelog for Firefox Add-ons reviewers only. Supports `\n` for new lines              |

**Edge overrides:**

| Flag | Description |
|------|-------------|
| `--edge-dev-changelog <text>` | Changelog for Edge Add-ons reviewers only. Supports `\n` for new lines |

**Opera overrides:**

| Flag | Description |
|------|-------------|
| `--opera-changelog <text>` | Changelog for Opera users. Supports `\n` for new lines |

### Notes:

- Chrome Web Store:

  - `REFRESH_TOKEN` - follow [this guide](https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md), or omit and run `web-ext-deploy env --auto-fetch-credentials` to fetch and save it automatically
  - `PUBLISHER_ID` - Get it from the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/) > Account
  - `EXT_ID` - Get it from `https://chromewebstore.google.com/detail/EXT_ID`

- Firefox Add-ons store:

  - `EXT_ID` - Get it from `https://addons.mozilla.org/addon/EXT_ID`
  - `ZIP` - The relative path to the ZIP. You can use `{version}`, which will be replaced by the `version` entry from your `package.json`
  - `ZIP_SOURCE` - Optional. The relative path to the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) of your extension, if applicable
  - `JWT_ISSUER`, `JWT_SECRET` - obtain from the [Developer Hub](https://addons.mozilla.org/developers/addon/api/key/)

- Edge Add-ons store:

  - `CLIENT_ID`, `API_KEY` - follow [this guide](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md)
  - `PRODUCT_ID` - Get it from `https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID`
  - `ZIP` - You can use `{version}`

- Opera Add-ons store:
  - `PACKAGE_ID` - Get it from `https://addons.opera.com/developer/package/PACKAGE_ID`
  - `ZIP` - You can use `{version}`
  - `SESSIONID`, `CSRFTOKEN` - can be omitted if you run `web-ext-deploy env --auto-fetch-credentials` (fetches and saves them automatically via Playwright)
  - **Source code inspection**:
    The Opera Add-ons reviewers require inspecting your extension's source code  
    This can be done by doing **one** of the following:
    - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service (e.g. [Google Drive](https://drive.google.com))
    - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository
- The keys are case-insensitive, as they will be [camel-cased](https://www.npmjs.com/package/change-case) anyway

### Possible `.env` files

#### `chrome.env`

```dotenv
EXT_ID="ExtensionID"
PUBLISHER_ID="PublisherID"
REFRESH_TOKEN="RefreshToken"
ZIP="dist/some-zip-v{version}.zip"
```

#### `firefox.env`

```dotenv
JWT_ISSUER="JwtIssuer"
JWT_SECRET="JwtSecret"
ZIP="dist/some-zip-v{version}.zip"
ZIP_SOURCE="dist/some-zip-source-v{version}.zip"
EXT_ID="ExtensionID"
CHANGELOG_LANG="en-US"
```

#### `edge.env`

```dotenv
CLIENT_ID="ClientID"
API_KEY="ApiKey"
ZIP="dist/some-zip-v{version}.zip"
PRODUCT_ID="ProductID"
```

#### `opera.env`

```dotenv
SESSIONID="sessionid_value"
CSRFTOKEN="csrftoken_value"
ZIP="dist/some-zip-v{version}.zip"
PACKAGE_ID=123456
```

## CLI arguments method

Use it only if your extension's code will not be publicly available

```shell
web-ext-deploy cli --chrome-zip="some-zip-v{version}.zip" --chrome-ext-id="ExtensionID" --firefox-zip="some-zip-v{version}.zip" --firefox-ext-id="ExtensionID"
```

### CLI API

Stores:

- [Chrome Web Store](#chrome-web-store-cli)
- [Firefox Add-ons](#firefox-add-ons-cli)
- [Edge Add-ons](#edge-add-ons-cli)
- [Opera Add-ons](#opera-add-ons-cli)

Options:

| Flag | Description |
|------|-------------|
| `--auto-fetch-credentials` | Automatically fetch missing or expired credentials. Opera: fetches `sessionid`/`csrftoken` via Playwright (auto-installed if needed). Chrome: fetches `REFRESH_TOKEN` via OAuth. In `env` mode, saves fetched credentials to the store's `.env` file |
| `--dry-run` | Validate inputs without deploying |
| `--verbose` | Log each deployment step |

#### Chrome Web Store CLI

| Flag | Description |
|------|-------------|
| `--chrome-ext-id <id>` | Extension ID from `https://chromewebstore.google.com/detail/EXT_ID` |
| `--chrome-publisher-id <id>` | Publisher ID from the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/) > Account |
| `--chrome-client-id <id>` | OAuth client ID (required for `--auto-fetch-credentials`) |
| `--chrome-client-secret <secret>` | OAuth client secret (required for `--auto-fetch-credentials`) |
| `--chrome-refresh-token <token>` | OAuth refresh token. Can be omitted if `--auto-fetch-credentials` is set ([how to get one](https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md)) |
| `--chrome-zip <path>` | Path to the ZIP. Supports `{version}` placeholder |
| `[--chrome-skip-review]` | Publish without waiting for a review |
| `[--chrome-deploy-percentage <n>]` | Staged rollout percentage (1-100) |

Example:

```shell
web-ext-deploy cli --chrome-ext-id="ExtensionID" --chrome-publisher-id="PublisherID" --chrome-refresh-token="RefreshToken" --chrome-zip="some-zip-v{version}.zip"
```

Or, fetch the refresh token automatically (opens a browser for OAuth consent):

```shell
web-ext-deploy cli --auto-fetch-credentials --chrome-ext-id="ExtensionID" --chrome-publisher-id="PublisherID" --chrome-client-id="ClientID" --chrome-client-secret="ClientSecret" --chrome-zip="some-zip-v{version}.zip"
```

#### Firefox Add-ons CLI

| Flag | Description |
|------|-------------|
| `--firefox-ext-id <id>` | Extension ID from `https://addons.mozilla.org/addon/EXT_ID` |
| `--firefox-jwt-issuer <issuer>` | JWT issuer from the [Developer Hub](https://addons.mozilla.org/developers/addon/api/key/) |
| `--firefox-jwt-secret <secret>` | JWT secret from the [Developer Hub](https://addons.mozilla.org/developers/addon/api/key/) |
| `--firefox-zip <path>` | Path to the ZIP. Supports `{version}` placeholder |
| `[--firefox-zip-source <path>]` | Path to the source code ZIP. Supports `{version}` placeholder |
| `[--firefox-changelog <text>]` | Changelog for Firefox users. Supports `\n` for new lines |
| `[--firefox-changelog-lang <code>]` | Language of the changelog. [Full list](https://github.com/mozilla/addons-server/blob/master/src/olympia/core/languages.py#L3) (default: manifest's `default_locale` or `en-US`) |
| `[--firefox-dev-changelog <text>]` | Changelog for reviewers only. Supports `\n` for new lines |

Example:

```shell
web-ext-deploy cli --firefox-ext-id="ExtensionID" --firefox-jwt-issuer="JwtIssuer" --firefox-jwt-secret="JwtSecret" --firefox-zip="dist/some-zip-v{version}.zip"
```

#### Edge Add-ons CLI

| Flag | Description |
|------|-------------|
| `--edge-product-id <id>` | Product ID from `https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID` |
| `--edge-client-id <id>` | Client ID ([how to get one](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md)) |
| `--edge-api-key <key>` | API key ([how to get one](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md)) |
| `--edge-zip <path>` | Path to the ZIP. Supports `{version}` placeholder |
| `[--edge-dev-changelog <text>]` | Changelog for reviewers only. Supports `\n` for new lines |

Example:

```shell
web-ext-deploy cli --edge-product-id="ProductID" --edge-client-id="clientId" --edge-api-key="apiKey" --edge-zip="dist/some-zip-v{version}.zip"
```

**Note:**  
Due to the way the Edge dashboard works, when an extension is being reviewed or its review has just been canceled, it will take about a minute until a cancellation will cause its state to change from "In review" to "In draft", after which the new version can be submitted  
Therefore, if you publish after you had just published/canceled, expect to wait a little longer

#### Opera Add-ons CLI

| Flag | Description |
|------|-------------|
| `--opera-package-id <id>` | Package ID from `https://addons.opera.com/developer/package/PACKAGE_ID` |
| `--opera-sessionid <value>` | Session cookie. Use `--auto-fetch-credentials` to obtain automatically |
| `--opera-csrftoken <value>` | CSRF cookie. Use `--auto-fetch-credentials` to obtain automatically |
| `--opera-zip <path>` | Path to the ZIP. Supports `{version}` placeholder |
| `[--opera-changelog <text>]` | Changelog for Opera users. Supports `\n` for new lines |

Example:

```shell
web-ext-deploy cli --opera-package-id=123456 --opera-sessionid="sessionid_value" --opera-csrftoken="csrftoken_value" --opera-zip="dist/some-zip-v{version}.zip"
```

Or, fetch the cookies automatically via Playwright:

```shell
web-ext-deploy cli --auto-fetch-credentials --opera-package-id=123456 --opera-zip="dist/some-zip-v{version}.zip"
```

**Notes:**

- Source code inspection:  
  The Opera Add-ons reviewers require inspecting your extension's source code.  
  This can be done by doing **one** of the following:

  - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service like [Google Drive](https://drive.google.com)
  - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository.

  Note that you **do not** want to store the command with your extension package, as the review team will have access to your credentials.
