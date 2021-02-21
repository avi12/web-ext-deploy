# WebExt Deploy

The ultimate automation tool for deploying to multiple extension stores simultaneously!

Supported stores:

- [Chrome Web Store](https://chrome.google.com/webstore/category/extensions)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/extensions)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons)
- [Opera Add-ons](https://addons.opera.com/en/extensions)

## Core packages used

- [Puppeteer](https://github.com/puppeteer/puppeteer) - for updating extensions on Firefox Add-ons / Edge Add-ons / Opera
  Add-ons.
- [Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/using_webstore_api)

[comment]: <> (TODO: Add a disclaimer of not taking responsibility for stolen credentials)

## Installing

```shell
npm i -D web-ext-deploy
# or
yarn add -D web-ext-deploy
# or
pnpm i -D web-ext-deploy
```

Deployment to Chrome Web Store: [follow this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).

## Usage

### If using `.env`

Use the `.env` [snippet(s)](#possible-env-files) relevant to your extension.  
Include each one in your root directory.  
Make sure to have `*.env` in your `.gitignore`

In the CLI:

```shell
web-ext-deploy --env
```

#### Additional arguments:

<!-- prettier-ignore -->
- `--verbose` boolean?  
  If specified, the steps of every store will be logged to the console.

<!-- prettier-ignore -->
- `--zip` string?  
  If specified, it will be used for every `.env` that the `ZIP` is not specified.

<!-- prettier-ignore -->
- `--firefox-changelog` string?  
  If specified and `firefox.env` exists, it will be used to provide changelog for the Firefox users.  
  New lines (`\n`) are supported.

<!-- prettier-ignore -->
- `--firefox-dev-changelog` string?  
  If specified and `firefox.env` exists, it will be used to provide changelog for the Firefox Add-ons reviewers.  
  New lines (`\n`) are supported.

<!-- prettier-ignore -->
- `--edge-dev-changelog` string?  
  If specified and `edge.env` exists, it will be used to provide changelog for the Edge Add-ons reviewers.  
  New lines (`\n`) are supported.

#### Notes:

<!-- prettier-ignore -->
- Firefox Add-ons store: If the publisher account has two-factor authentication enabled - if it relies on an authentication generator (e.g., Google Authenticator), you can specify the code with `--firefox-two-factor`  
  If you have email-based authentication, the module will prompt you to fill your OTP using [`prompt-promise`](https://www.npmjs.com/package/prompt-promise).  
  As for `EXT_ID`, you must provide the extension ID as seen in the store listing URL, e.g. `https://addons.mozilla.org/en-US/developers/EXT_ID`

<!-- prettier-ignore -->
- Edge Add-ons store: The `EXT_ID` must be provided according to the dashboard URL.  
  I.e. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`


- Opera Add-ons store: The same applies. To specify the current OTP, use `--opera-two-factor`  
  As for `EXT_ID`, you must provide the extension ID as seen in the store listing URL.

#### Possible `.env` files:

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
EMAIL="some@email.com"
PASSWORD="pass"
ZIP="dist/some-zip-v{version}.zip"
ZIP_SOURCE="some-zip-source-v{version}.zip"
EXT_ID="ExtensionID"
```

`edge.env`

```dotenv
EMAIL="some@email.com"
PASSWORD="pass"
ZIP="dist/some-zip-v{version}.zip"
EXT_ID="ExtensionID"
```

`opera.env`

```dotenv
EMAIL="some@email.com"
PASSWORD="pass"
ZIP="dist/some-zip-v{version}.zip"
EXT_ID="ExtensionID"
```

### if using CLI

Use it only if your extension's code will not be published.

```shell
web-ext-deploy --chrome-zip="some-zip-v{version).zip" --chrome-ext-id="ExtensionID" --firefox-zip="some-zip-v{version).zip" --firefox-ext-id="ExtensionID"
```

### CLI API

<!-- prettier-ignore -->
- `--verbose` boolean?  
  If specified, the steps of every store will be logged to the console.

<!-- prettier-ignore -->
- `--zip` string?  
  If specified, it will be used for every store that the `zip` is not specified.  
  For example, in
  ```shell
  web-ext-deploy --zip="zip-v{version}.zip" --chrome-refresh-token="refreshToken" --firefox-email="some@email.com" --edge-zip="some-zip-v{version}.zip"
  ```
  the `zip-v{version}.zip` will be used for the Chrome Web Store version _and_ the Firefox Add-ons version.


- Chrome Web Store
  - `--chrome-ext-id` string  
    The extension ID.
  - `--chrome-refresh-token` string  
    The refreshToken you have registered.
  - `--chrome-client-id` string  
    The client ID you have registered.
  - `--chrome-client-secret` string  
    The client secret you have registered.
  - `--chrome-zip` string  
    The path to the ZIP from the root.  
     You can use `{version}` in the ZIP filename, which will be replaced by the version in `package.json`

  Example:

  ```shell
  web-ext-deploy --chrome-ext-id="ExtensionID" --chrome-refresh-token="RefreshToken" --chrome-client-id="ClientID" --chrome-client-secret="ClientSecret" --chrome-zip="zip-v{version}.zip"
  ```

- Firefox Add-ons
  - `--firefox-ext-id` string  
    The extension ID. (From the store listing URL)
  - `--firefox-email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `--firefox-password` string  
    The publisher account's password. Used in Puppeteer to login to the account and update the extension.
  - `--firefox-two-factor` number?  
    If the publisher account has two-factor authentication enabled using an authentication application such as Google Authenticator, it will be used in the login process.  
    If the OTP is sent to the publisher's email, the module will prompt you to enter the OTP.
  - `--firefox-zip` string  
    The path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry in `package.json`
  - `--firefox-zip-source` string?  
    The path to the ZIP that contains the source code of your extension.  
    You can use `{version}` in the ZIP filename, which will be replaced by the version in `package.json`
  - `--firefox-changelog` string?  
    The changes made in this version.  
    You can use `\n` for new lines.
  - `--firefox-dev-changelog` string?  
    The technical changes made in this version, which will be seen by the Firefox Add-ons reviewers.  
    You can use `\n` for new lines.

  Example:

  ```shell
  web-ext-deploy --firefox-ext-id="ExtensionID" --firefox-email="some@email.com" --firefox-password="pass" --firefox-two-factor=123456 --firefox-zip="dist/some-zip-v{version}.zip" --firefox-changelog="Changelog\nWith line breaks" --firefox-dev-changelog="Changelog for reviewers\nWith line breaks"
  ```

- Edge Add-ons
  - `--edge-ext-id` string  
    The extension ID from the Edge Add-ons Dashboard.  
    I.e. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`
  - `--edge-email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `--edge-password` string  
    The publisher account's password. Used in Puppeteer to login to the account and update the extension.
  - `--edge-zip` string  
    The path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry in `package.json`
  - `--edge-dev-changelog` string?  
    The technical changes made in this version, which will be seen by the Edge Add-ons reviewers.  
    You can use `\n` for new lines.


- Opera Add-ons
  - `--opera-ext-id` string  
    The extension ID.
  - `--opera-email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `--opera-password` string  
    The publisher account's password. Used in Puppeteer to login to the account and update the extension.
  - `--opera-two-factor` number?  
    If the publisher account has two-factor authentication enabled using an authentication application such as Google Authenticator, it will be used in the login process.  
    If the OTP is sent to the publisher's email, the module will prompt you to enter the OTP.
  - `--opera-zip` string  
    The path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry in `package.json`

  Example:

  ```shell
  web-ext-deploy --opera-ext-id="ExtensionID" --opera-email="some@email.com" --opera-password="pass" --opera-two-factor=123456 --opera-zip="dist/some-zip-v{version}.zip"
  ```

### If using Node.js

#### ESM

<!-- prettier-ignore -->
```js
import { deployChrome, deployFirefox, deployOpera, deployEdge } from "web-ext-deploy";
```

#### CommonJS

<!-- prettier-ignore -->
```js
const { deployChrome, deployFirefox, deployOpera, deployEdge } = require("web-ext-deploy");
```

### Node.js API

<!-- prettier-ignore -->
- `deployChrome` object  
  Options:

  - `extId` string  
    The extension ID from the store URL, e.g. `https://chrome.google.com/webstore/detail/EXT_ID`
  - `refreshToken` string  
    The refresh token.
  - `clientId` string  
    The client ID.
  - `clientSecret` string  
    The client secret.
  - `zip` string  
    The ZIP file.
  - `verbose` boolean?  
    If specified, it wil be logged to the console when the upload has been finished.

  returns `Promise<boolean>` or throws an exception.


- `deployFirefox` object  
  Options:

  - `extId` string  
    The extension ID from the store URL, e.g. `https://addons.mozilla.org/en-US/developers/EXT_ID`
  - `email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `password` string  
    The publisher account's password.
  - `zip` string  
    The ZIP file location, relative from the root directory.
  - `zipSource` string?  
    The ZIP that contains the source code of the extension, if applicable.
  - `changelog` string?  
    The changes made in this version, compared to the last one.
  - `devChangelog` string?  
    The changes made in this version, compared to the last one, which will be visible only to the Firefox Add-ons reviewers.
  - `verbose` boolean?  
    If specified, every step of uploading to Firefox Add-ons will be logged to the console.

  returns `Promise<boolean>` or throws an exception.


- `deployEdge` object  
  Options:

  - `extId` string  
    The extension ID from the dashboard URL, e.g. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`
  - `email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `password` string  
    The publisher account's password.
  - `zip` string  
    The ZIP file location, relative from the root directory.
  - `devChangelog` string?  
    The changes made in this version, compared to the last one, which will be visible only to the Edge Add-ons reviewers.
  - `verbose` boolean?  
    If specified, every step of uploading to Edge Add-ons will be logged to the console.

  returns `Promise<boolean>` or throws an exception.


- `deployOpera` object  
  Options:

  - `extId` string  
    The extension ID from the store URL, e.g. `https://addons.opera.com/en/extensions/details/EXT_ID`
  - `email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `password` string  
    The publisher account's password.
  - `zip` string  
    The ZIP file location, relative from the root directory.
  - `verbose` boolean?  
    If specified, every step of uploading to Opera Add-ons will be logged to the console.

  returns `Promise<boolean>` or throws an exception.

Example:

<!-- prettier-ignore -->
```js
import { deployChrome, deployFirefox, deployEdge, deployOpera } from "web-ext-deploy";

deployChrome({
  extId: "EXT_ID",
  refreshToken: "refreshToken",
  clientId: "clientID",
  clientSecret: "clientSecret",
  zip: "dist/some-zip-v{version}.zip",
  verbose: false
}).catch(console.error);

deployFirefox({
  extId: "EXT_ID",
  email: "some@email.com",
  password: "pass",
  zip: "dist/some-zip-v{version}.zip",
  zipSource: "zip-source-v{version}.zip",
  changes: "Some changes",
  devChanges: "Changes for reviewers",
  verbose: false
}).catch(console.error);

deployEdge({
  extId: "EXT_ID",
  email: "some@email.com",
  password: "pass",
  zip: "dist/some-zip-v{version}.zip",
  devChanges: "Changes for reviewers",
  verbose: false
}).catch(console.error);

deployOpera({
  extId: "EXT_ID",
  email: "some@email.com",
  password: "pass",
  zip: "dist/some-zip-v{version}.zip",
  verbose: false
}).catch(console.error);
```

Then, optionally

```shell
node deploy.js --firefox-two-factor=123456 --opera-two-factor=123456
```

## Notes

- If you update your extension on Opera Add-ons, make sure to either have the source ZIP uploaded to a folder which is accessible to the Opera Add-ons reviewers (e.g. on a Google Drive account), OR make the extension open source and link to its repository.

<!-- prettier-ignore -->
- If you have two-factor authentication enabled, but you don't provide the two-factor CLI argument _OR_ you provide an incorrect code, the module will prompt you using [`prompt-promise`](https://www.npmjs.com/package/prompt-promise)
