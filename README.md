# WebExt Deploy

The ultimate automation tool for deploying to multiple extension stores simultaneously!

Supported stores:

- [Chrome Web Store](https://chrome.google.com/webstore/category/extensions)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/extensions)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons)
- [Opera Add-ons](https://addons.opera.com/en/extensions)

# Core packages used

- [Puppeteer](https://github.com/puppeteer/puppeteer) - for updating extensions on Firefox Add-ons / Edge Add-ons
  Add-ons / Opera Add-ons store.
- [Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/using_webstore_api)

# Installing

```shell
npm i -D web-ext-deploy
# or
yarn add -D web-ext-deploy
# or
pnpm i -D web-ext-deploy
```

Deployment to Chrome Web Store: [follow this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).

# Usage

## 1. Obtain the relevant cookie(s) of the publisher's account:

### Disclaimer: I do NOT take any responsibility for leaked cookies.

- Firefox: `sessionid`
- Opera: `sessionid`, `csrftoken`
- Edge: `.AspNet.Cookies`

If you have a hard time obtaining the cookie(s), you can run:

```shell
web-ext-deploy --get-cookies=firefox edge opera
```

Note that for the Chrome Web Store, you'll use the Chrome Web Store Publish API.

## 2. Decide how to access the info

- [`.env` files method](#env-files-method)
- [CLI arguments method](#cli-arguments-method)
- [Node.js API method](#nodejs-api-method)

## `.env` files method

Use the `.env` [snippet(s)](#possible-env-files) relevant to your extension.  
Include each one in your root directory.  
Make sure to have `*.env` in your `.gitignore`  
Note that if you used the aforementioned `--get-cookies`, it automatically added the `.env` listing(s) to it.

To use the `.env` files, in the CLI:

```shell
web-ext-deploy --env
```

### Additional arguments for the `.env` mode:

- `--verbose` boolean?  
  If specified, the steps of every store will be logged to the console.

- `--zip` string?  
  If specified, it will be used for every `.env` that the `ZIP` is not specified.

- `--firefox-changelog` string?  
  If specified and `firefox.env` exists, it will be used to provide changelog for the Firefox users.  
  New lines (`\n`) are supported.

- `--firefox-dev-changelog` string?  
  If specified and `firefox.env` exists, it will be used to provide changelog for the Firefox Add-ons reviewers.  
  New lines (`\n`) are supported.
- `--edge-dev-changelog` string?  
  If specified and `edge.env` exists, it will be used to provide changelog for the Edge Add-ons reviewers.  
  New lines (`\n`) are supported.

- `--opera-changelog` string?  
  If specified and `opera.env` exists, it will be used to provide changelog for the Opera users.  
  New lines (`\n`) are supported.

### Notes:

- Chrome Web Store:

  - `REFRESH_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET` - follow [this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).
  - `EXT_ID` - Get it from `https://chrome.google.com/webstore/detail/EXT_ID`, e.g. `https://chrome.google.com/webstore/detail/fcphghnknhkimeagdglkljinmpbagone`

- Firefox Add-ons store:

  - `EXT_ID` - Get it from `https://addons.mozilla.org/addon/EXT_ID`
  - `ZIP` - The relative path to the ZIP. You can use `{version}`, which will be replaced by the `version` entry from your `package.json`
  - `ZIP_SOURCE` - Optional. The relative path to the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) of your extension, if applicable.

- Edge Add-ons store:

  - `EXT_ID` - Get it from `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`
  - `ZIP` - You can use `{version}`

- Opera Add-ons store:
  - `PACKAGE_ID` - Get it from `https://addons.opera.com/developer/package/PACKAGE_ID`
  - `ZIP` - You can use `{version}`
  - **Source code inspection**:  
    The Opera Add-ons reviewers require inspecting your extension's source code.  
    This can be done by doing **one** of the following:
    - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service (e.g. [Google Drive](https://drive.google.com)).
    - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository.
  
- The keys are case-insensitive, as they will be [camel-cased](https://www.npmjs.com/package/camel-case) anyway.

### Possible `.env` files

`chrome.env`

```dotenv
REFRESH_TOKEN="RefreshToken"
CLIENT_ID="ClientID"
CLIENT_SECRET="ClientSecret"
ZIP="dist/some-zip-v{version}.zip"
EXT_ID="ExtensionID"
```

`firefox.env`

```dotenv
sessionid="sessionid_value"
ZIP="dist/some-zip-v{version}.zip"
ZIP_SOURCE="dist/some-zip-source-v{version}.zip"
EXT_ID="ExtensionID"
```

`edge.env`

```dotenv
cookie=".AspNet.Cookies_value"
ZIP="dist/some-zip-v{version}.zip"
EXT_ID="ExtensionID"
```

`opera.env`

```dotenv
sessionid="sessionid_value"
csrftoken="csrftoken_value"
ZIP="dist/some-zip-v{version}.zip"
PACKAGE_ID="PackageID"
```

## CLI arguments method

Use it only if your extension's code will not be published.

```shell
web-ext-deploy --chrome-zip="some-zip-v{version}.zip" --chrome-ext-id="ExtensionID" --firefox-zip="some-zip-v{version}.zip" --firefox-ext-id="ExtensionID"
```

### CLI API

- `--verbose` boolean?  
  If specified, the steps of every store will be logged to the console.

- `--zip` string?  
  If specified, it will be used for every store that the `zip` is not specified.  
  For example, in

  ```shell
  web-ext-deploy --zip="zip-v{version}.zip" --chrome-refresh-token="refreshToken" --firefox-sessionid="sessionid_value" --edge-zip="some-zip-v{version}.zip"
  ```

  the `zip-v{version}.zip` will be used for the Chrome Web Store version _and_ the Firefox Add-ons version.

- Chrome Web Store

  - `--chrome-ext-id` string  
    Get it from `https://chrome.google.com/webstore/detail/EXT_ID`, e.g. `https://chrome.google.com/webstore/detail/fcphghnknhkimeagdglkljinmpbagone`
  - `--chrome-refresh-token` string  
    The refreshToken you have registered.
  - `--chrome-client-id` string  
    The client ID you have registered.
  - `--chrome-client-secret` string  
    The client secret you have registered.
  - `--chrome-zip` string  
    The relative path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the version in `package.json`

  To get your `--chrome-refresh-token`, `--chrome-client-id` and `--chrome-client-secret`, follow [this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).  
  Example:

  ```shell
  web-ext-deploy --chrome-ext-id="ExtensionID" --chrome-refresh-token="RefreshToken" --chrome-client-id="ClientID" --chrome-client-secret="ClientSecret" --chrome-zip="some-zip-v{version}.zip"
  ```

- Firefox Add-ons

  - `--firefox-ext-id` string  
    The extension ID from the store URL, e.g. `https://addons.mozilla.org/addon/EXT_ID`
  - `--firefox-sessionid` string  
    The value of the `sessionid` cookie, which will be used to log in to the publisher's account.  
    If you have a hard time getting its value, run:
    ```shell
    web-ext-deploy --get-cookies=firefox
    ```
  - `--firefox-zip` string  
    The relative path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry from your `package.json`
  - `--firefox-zip-source` string?  
    The relative path to the ZIP that contains the source code of your extension, if applicable.  
    You can use `{version}` as well.  
    Note that if your extension's source code *is* required to be seen by the review team, you **do not** want to store the command with the package.
  - `--firefox-changelog` string?  
    The changes made in this version compared to the previous one. The Firefox users will see this.  
    You can use `\n` for new lines.
  - `--firefox-dev-changelog` string?  
    The technical changes made in this version, which will be seen by the Firefox Add-ons reviewers.  
    You can use `\n` for new lines.

  Example:

  ```shell
  web-ext-deploy --firefox-ext-id="ExtensionID" --firefox-sessionid="sessionid_value" --firefox-zip="dist/some-zip-v{version}.zip" --firefox-changelog="Changelog\nWith line breaks" --firefox-dev-changelog="Changelog for reviewers\nWith line breaks"
  ```

- Edge Add-ons

  - `--edge-ext-id` string  
    The extension ID from the Edge Add-ons Dashboard, e.g. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`
  - `--edge-cookie` string  
    The value of the cookie `.AspNet.Cookies`, which will be used to log in to the publisher's account.
  - `--edge-zip` string  
    The path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry in `package.json`
  - `--edge-dev-changelog` string?  
    The technical changes made in this version, which will be seen by the Edge Add-ons reviewers.  
    You can use `\n` for new lines.

  Example:

  ```shell
  web-ext-deploy --edge-ext-id="ExtensionID" --edge-cookie=".AspNet.Cookies value" --edge-zip="dist/some-zip-v{version}.zip" --edge-dev-changelog="Changelog for reviewers\nWith line breaks"
  ```

- Opera Add-ons

  - `--opera-package-id` number  
    The extension ID from the Opera Add-ons Dashboard, e.g. `https://addons.opera.com/developer/package/PACKAGE_ID`
  - `--opera-sessionid` string  
    The value of the cookie `sessionid`, which will be used to log in to the publisher's account.
  - `--opera-csrftoken` string  
    The value of the cookie `csrftoken`, which will be used to upload the ZIP.
  - `--opera-zip` string  
    The relative path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry in `package.json`
  - `--opera-changelog` string?  
    The changes made in this version, which will be seen by the Opera Add-ons reviewers.  
    You can use `\n` for new lines.

  Example:

  ```shell
  web-ext-deploy --opera-ext-id="ExtensionID" --opera-sessionid="sessionid_value" --opera-csrftoken="csrftoken_value" --opera-zip="dist/some-zip-v{version}.zip" --opera-changelog="Changelog\nWith line breaks"
  ```

  **Notes:**

  - Source code inspection:  
    The Opera Add-ons reviewers require inspecting your extension's source code.  
    This can be done by doing **one** of the following:
    - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service (e.g. [Google Drive](https://drive.google.com))
    - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository.

    Note that you **do not** want to store the command with your extension package, as the review team will have access to your precious cookies.

## Node.js API method

### ESM / TypeScript

<!-- prettier-ignore -->
```ts
import { deployChrome, deployFirefox, deployEdge, deployOpera } from "web-ext-deploy";
```

### CommonJS

<!-- prettier-ignore -->
```js
const { deployChrome, deployFirefox, deployEdge, deployOpera } = require("web-ext-deploy");
```

### Node.js API

- `deployChrome` object  
  Options:

  - `extId` string  
    Get it from `https://chrome.google.com/webstore/detail/EXT_ID`, e.g. `https://chrome.google.com/webstore/detail/fcphghnknhkimeagdglkljinmpbagone`
  - `refreshToken` string  
    The refresh token.
  - `clientId` string  
    The client ID.
  - `clientSecret` string  
    The client secret.
  - `zip` string  
    The relative path from the root to the ZIP.  
    You can use `{version}` to use the `version` entry from your `package.json`
  - `verbose` boolean?  
    If `true`, it will be logged to the console when the uploading has begun.

  To get your `refreshToken`, `clientId`, and `clientSecret`, follow [this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).  
  Returns `Promise<true>` or throws an exception.

- `deployFirefox` object  
  Options:

  - `extId` string  
    Get it from `https://addons.mozilla.org/addon/EXT_ID`
  - `sessionid` string  
    The value of the cookie `sessionid`, which will be used to log in to the publisher's account.  
    If you have a hard time obtaining it, you can run:

  ```shell
  web-ext-deploy --get-cookies=firefox
  ```

  - `zip` string  
    The relative path from the root to the ZIP.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry from your `package.json`
  - `zipSource` string?  
    The relative path from the root to the ZIP that contains the source code of your extension, if applicable.  
    You can use `{version}` as well.  
    Note that if your extension's source code *is* required to be seen by the review team, you **do not** want to store the deployment script with the package.
  - `changelog` string?  
    The changes made in this version, compared to the previous one, which will be seen by the Firefox users.  
    I recommend providing the changelog via `--firefox-changelog`, so it stays dynamic.
  - `devChangelog` string?  
    The technical changes made in this version, compared to the previous one, which will be visible only to the Firefox Add-ons reviewers.  
    I recommend providing the changelog via `--firefox-dev-changelog`, so it stays up to date.
  - `verbose` boolean?  
    If `true`, every step of uploading to the Firefox Add-ons will be logged to the console.

  Returns `Promise<true>` or throws an exception.

- `deployEdge` object  
  Options:

  - `extId` string  
    Get it from `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`
  - `cookie` string  
    The value of the cookie `.AspNet.Cookies`, which will be used to log in to the publisher's account.  
    If you have a hard time obtaining it, you can run:

  ```shell
  web-ext-deploy --get-cookies=edge
  ```

  - `zip` string  
    The relative path from the root to the ZIP.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry from your `package.json`
  - `devChangelog` string?  
    The changes made in this version, compared to the previous one, which will be visible only to the Edge Add-ons reviewers.  
    I recommend providing the changelog via `--edge-dev-changelog`, so it stays up to date.
  - `verbose` boolean?  
    If `true`, every step of uploading to the Edge Add-ons will be logged to the console.

  Returns `Promise<true>` or throws an exception.

- `deployOpera` object  
  Options:

  - `packageId` number  
    The package ID of the extension from the store dashboard, e.g. `https://addons.opera.com/developer/package/PACKAGE_ID`
  - `sessionid` string  
    The value of the cookie `sessionid`, which will be used to log in to the publisher's account.
  - `csrftoken` string  
    The value of the cookie `csrftoken`, which will be used to upload the ZIP.
  - `zip` string  
    The relative path from the root to the ZIP.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry from your `package.json`
  - `changelog` string?  
    The changes made in this version, compared to the previous one, which will be seen by the Opera users.  
    I recommend providing the changelog via `--opera-changelog`, so it stays up to date.
  - `verbose` boolean?  
    If `true`, every step of uploading to the Opera Add-ons will be logged to the console.

  If you have a hard time obtaining the values of the cookies `sessionid` and `csrftoken`, you can run:

  ```shell
  web-ext-deploy --get-cookies=opera
  ```

  Returns `Promise<true>` or throws an exception.

  **Notes:**

  - Source code inspection:  
    The Opera Add-ons reviewers require inspecting your extension's source code.  
    This can be done by doing **one** of the following:
    - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service (e.g. [Google Drive](https://drive.google.com))
    - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository.
    
    Note that you **do not** want to store the deployment script with your extension package, as the review team will have access to your precious cookies.  
    If you'll open-source the extension on GitHub, you can exclude the deployment script by listing it in `.gitignore`

Examples:

<!-- prettier-ignore -->
```ts
import { deployChrome, deployFirefox, deployEdge, deployOpera } from "web-ext-deploy";

deployChrome({
  extId: "EXT_ID",
  refreshToken: "refreshToken",
  clientId: "clientId",
  clientSecret: "clientSecret",
  zip: "dist/some-zip-v{version}.zip",
  verbose: false
}).catch(console.error);

deployFirefox({
  extId: "EXT_ID",
  sessionid: "sessionid_value",
  zip: "dist/some-zip-v{version}.zip",
  zipSource: "dist/zip-source-v{version}.zip",
  changelog: "Some changes",
  devChangelog: "Changes for reviewers",
  verbose: false
}).catch(console.error);

deployEdge({
  extId: "EXT_ID",
  cookie: ".AspNet.Cookies value",
  zip: "dist/some-zip-v{version}.zip",
  devChangelog: "Changes for reviewers",
  verbose: false
}).catch(console.error);

deployOpera({
  packageId: 123456,
  sessionid: "sessionid_value",
  csrftoken: "csrftoken_value",
  zip: "dist/some-zip-v{version}.zip",
  changelog: "Some changes",
  verbose: false
}).catch(console.error);
```
