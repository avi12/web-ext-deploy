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

- [Playwright](https://github.com/microsoft/playwright) - for fetching the Opera cookies
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

## 1. Obtain the relevant cookie(s) of the publisher's account:

### Disclaimer: I do NOT take any responsibility for leaked cookies or credentials.

- Opera: `sessionid`, `csrftoken`

If you have a hard time obtaining the cookie(s), you can run:

```shell
web-ext-deploy --get-cookies=opera
```

Note that for the Chrome Web Store, you'll use the Chrome Web Store Publish API  
As for the Edge Add-ons Store, you'll use the Microsoft Edge Publish API

## 2. Decide how to access the data & credentials

- [`.env` files method](#env-files-method)
- [CLI arguments method](#cli-arguments-method)

## `.env` files method

Use the `.env` [snippet(s)](#possible-env-files) relevant to your extension  
Include each one in your root directory  
Make sure to have `*.env` or `chrome.env`, `firefox.env`, `edge.env`, `opera.env` in your `.gitignore`  
Note that by using the aforementioned `--get-cookies`, it automatically added the `.env` items to it

Next, in the CLI:

```shell
web-ext-deploy --env
```

### Additional arguments for the `.env` mode:

- `--verbose` boolean?
  If specified, the steps of every store will be logged to the console

- `--auto-fetch-cookies` boolean?
  If specified, cookies will be automatically refreshed when they expire mid-deployment (Opera only)
  Playwright will be auto-installed if needed
  
- `--publish-only` `Array<"chrome" | "firefox" | "edge" | "opera">`?  
  If specified, for each specified store that has an `.env` file, it will be deployed  
  E.g. if you have `chrome.env`, `firefox.env`, `opera.env`, and you run:

  ```shell
  web-ext-deploy --env --publish-only=chrome firefox
  ```

  It will only deploy to Chrome Web Store and Firefox Add-ons Store

- `--zip` string?  
  If specified, it will be used for every `.env` that the `ZIP` is not specified

- `--firefox-changelog` string?  
  If specified and `firefox.env` exists, it will be used to provide changelog for the Firefox users  
  New lines (`\n`) are supported

- `--firefox-changelog-lang` string?  
  If specified and `firefox.env` exists, it will be used to dictate the language of the release notes.  
  Fallbacks to the Manifest's `default_locale` field, if applicable, or `en-US`

- `--firefox-dev-changelog` string?  
  If specified and `firefox.env` exists, it will be used to provide changelog for the Firefox Add-ons reviewers  
  New lines (`\n`) are supported

- `--edge-dev-changelog` string?  
  If specified and `edge.env` exists, it will be used to provide changelog for the Edge Add-ons reviewers  
  New lines (`\n`) are supported

- `--opera-changelog` string?  
  If specified and `opera.env` exists, it will be used to provide changelog for the Opera users  
  New lines (`\n`) are supported

### Notes:

- Chrome Web Store:

  - `REFRESH_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET` - follow [this guide](https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md)
  - `EXT_ID` - Get it from `https://chrome.google.com/webstore/detail/EXT_ID`, e.g. `https://chrome.google.com/webstore/detail/fcphghnknhkimeagdglkljinmpbagone`

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
  - **Source code inspection**:
    The Opera Add-ons reviewers require inspecting your extension's source code  
    This can be done by doing **one** of the following:
    - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service (e.g. [Google Drive](https://drive.google.com))
    - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository
- The keys are case-insensitive, as they will be [camel-cased](https://www.npmjs.com/package/change-case) anyway

### Possible `.env` files

#### `chrome.env`

```dotenv
REFRESH_TOKEN="RefreshToken"
CLIENT_ID="ClientID"
CLIENT_SECRET="ClientSecret"
ZIP="dist/some-zip-v{version}.zip"
EXT_ID="ExtensionID"
```

#### `firefox.env`

```dotenv
JWT_ISSUER="JwtIssuer"
JWT_SECRET="JwtSecret"
ZIP="dist/some-zip-v{version}.zip"
ZIP_SOURCE="dist/some-zip-source-v{version}.zip"
EXT_ID="ExtensionID"
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
web-ext-deploy --chrome-zip="some-zip-v{version}.zip" --chrome-ext-id="ExtensionID" --firefox-zip="some-zip-v{version}.zip" --firefox-ext-id="ExtensionID"
```

### CLI API

Stores:

- [Chrome Web Store](#chrome-web-store-cli)
- [Firefox Add-ons](#firefox-add-ons-cli)
- [Edge Add-ons](#edge-add-ons-cli)
- [Opera Add-ons](#opera-add-ons-cli)

Options:

- `--verbose` boolean?
  If specified, the steps of every store will be logged to the console

- `--auto-fetch-cookies` boolean?
  If specified, cookies will be automatically refreshed when they expire mid-deployment (Opera only)
  Playwright will be auto-installed if needed

- `--zip` string?  
  If specified, it will be used for every store that the `zip` is not specified  
  For example, in

  ```shell
  web-ext-deploy --zip="zip-v{version}.zip" --chrome-refresh-token="refreshToken" --chrome-client-id="clientId" --chrome-client-secret="clientSecret" --firefox-jwt-issuer="jwtIssuer" --firefox-jwt-secret="jwtSecret" --edge-client-id="clientId" --edge-api-key="apiKey" --edge-zip="some-zip-v{version}.zip"
  ```
  the `zip-v{version}.zip` will be used for the Chrome Web Store _and_ the Firefox Add-ons

#### Chrome Web Store CLI

```yaml
# Get it from https://chrome.google.com/webstore/detail/EXT_ID, e.g. https://chrome.google.com/webstore/detail/fcphghnknhkimeagdglkljinmpbagone
--chrome-ext-id: string

# Get them by following https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md
--chrome-refresh-token: string
--chrome-client-id: string
--chrome-client-secret: string

# The relative path from the root to the ZIP
# You can use {version}, which will be replaced by the `version` entry in your `package.json`
--chrome-zip: string
```

Get your `--chrome-refresh-token`, `--chrome-client-id` and `--chrome-client-secret` by following [this guide](https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md)  
Example:

```shell
web-ext-deploy --chrome-ext-id="ExtensionID" --chrome-refresh-token="RefreshToken" --chrome-client-id="ClientID" --chrome-client-secret="ClientSecret" --chrome-zip="some-zip-v{version}.zip"
```

#### Firefox Add-ons CLI

```yaml
# The extension ID from the store URL, e.g. https://addons.mozilla.org/addon/EXT_ID
--firefox-ext-id: string
  
# Get them from https://addons.mozilla.org/developers/addon/api/key
--firefox-jwt-issuer: string
--firefox-jwt-secret: string
  
# The relative path from the root to the ZIP
# You can use {version}, which will be replaced by the `version` entry from your `package.json`
--firefox-zip: string
  
# If applicable, the relative path from the root to the ZIP source
# You can use {version}, which will be replaced by the `version` entry from your `package.json`
--firefox-zip-source?: string
  
# A description of the changes in this version, compared to the previous one
# It's recommended to use instead --firefox-changelog , so it stays up to date
--firefox-changelog?: string

# The language of the changelog
# Fallbacks to the Manifest's `default_locale` field, if applicable, or `en-US`
--firefox-changelog-lang?: string
  
# A description of the technical changes made in this version, compared to the previous one
# This will only be seen by the Firefox Addons reviewers
# It's recommended to use instead --firefox-dev-changelog , so it stays up to date
--firefox-dev-changelog?: string
```

Example:

```shell
web-ext-deploy --firefox-ext-id="ExtensionID" --firefox-jwt-issuer="JwtIssuer" --firefox-jwt-secret="JwtSecret" --firefox-zip="dist/some-zip-v{version}.zip" --firefox-changelog="Changelog\nWith line breaks" --firefox-dev-changelog="Changelog for reviewers\nWith line breaks"
```

#### Edge Add-ons CLI

```yaml
# The product ID from the Edge Add-ons Dashboard, e.g.
# https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID
--edge-product-id: string

# Get them by following https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md
--edge-client-id: string
--edge-api-key: string

# The relative path from the root to the ZIP
# You can use {version}, which will be replaced by the `version` entry in `package.json`
--edge-zip: string

# A description of the technical changes made in this version, compared to the previous one
# This will only be seen by the Edge Add-ons reviewers
# You can use \n for new lines
--edge-dev-changelog?: string
```

Example:

```shell
web-ext-deploy --edge-product-id="ProductID" --edge-client-id="clientId" --edge-api-key="apiKey" --edge-zip="dist/some-zip-v{version}.zip" --edge-dev-changelog="Changelog for reviewers\nWith line breaks"
```

**Note:**  
Due to the way the Edge dashboard works, when an extension is being reviewed or its review has just been canceled, it will take about a minute until a cancellation will cause its state to change from "In review" to "In draft", after which the new version can be submitted  
Therefore, if you publish after you had just published/canceled, expect to wait a little longer

#### Opera Add-ons CLI

```yaml
# The extension ID from the Opera Add-ons Dashboard, e.g.
# https://addons.opera.com/developer/package/PACKAGE_ID
--opera-package-id: number

# If you have a hard time obtaining them, run: web-ext-deploy --get-cookies=opera
--opera-sessionid: string
--opera-csrftoken: string

# The relative path from the root to the ZIP
# You can use {version}, which will be replaced by the `version` entry from your `package.json`
--opera-zip: string
  
# A description of the changes in this version, compared to the previous one
# You can use \n for new lines
--opera-changelog?: string
```

Example:

```shell
web-ext-deploy --opera-package-id=123456 --opera-sessionid="sessionid_value" --opera-csrftoken="csrftoken_value" --opera-zip="dist/some-zip-v{version}.zip" --opera-changelog="Changelog\nWith line breaks"
```

**Notes:**

- Source code inspection:  
  The Opera Add-ons reviewers require inspecting your extension's source code.  
  This can be done by doing **one** of the following:

  - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service like [Google Drive](https://drive.google.com)
  - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository.

  Note that you **do not** want to store the command with your extension package, as the review team will have access to your precious cookies.
