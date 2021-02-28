# WebExt Deploy

The ultimate automation tool for deploying to multiple extension stores simultaneously!

Supported stores:

- [Chrome Web Store](https://chrome.google.com/webstore/category/extensions)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/extensions)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons)
- [Opera Add-ons](https://addons.opera.com/en/extensions)

## Core packages used

- [Puppeteer Extra](https://github.com/berstend/puppeteer-extra) - for updating extensions on Firefox Add-ons / Edge Add-ons
  Add-ons / Opera Add-ons store.
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

#### Notes:

<!-- prettier-ignore -->
- Chrome Web Store:  
  To get your `REFRESH_TOKEN`, `CLIENT_ID`, and `CLIENT_SECRET`, follow [this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).


- Firefox Add-ons store:  
  If the publisher account has two-factor authentication enabled - if it relies on an authentication generator (e.g., Google Authenticator), you can specify the code with `--firefox-two-factor`  
  If you have email-based authentication, the module will prompt you to fill your OTP using [`prompt-promise`](https://www.npmjs.com/package/prompt-promise).  
  As for `EXT_ID`, you must provide the extension ID as seen in the store listing URL, e.g. `https://addons.mozilla.org/en-US/developers/EXT_ID`
  

- Edge Add-ons store:
  - `PASSWORD` is optional, as if you enable the login through the [Microsoft Authenticator](https://www.microsoft.com/en-us/account/authenticator#getapp) app - it will be used instead of your password.  
    If you do *not* use Microsoft Authenticator, you can use `PASSWORD` to automatically fill-in the password for you, so you only have to deal with a two-factor authentication method of your choice.
  - The Puppeteer instance for this store will always be headless (i.e. the Chromium window will launch), to let you handle the two-factor authentication on Microsoft's site.
  - The `EXT_ID` must be provided according to the dashboard URL.  
    I.e. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`


- Opera Add-ons store:
  - **This is not guaranteed to work!** This store uses [Google reCAPTCHA v2](https://www.google.com/recaptcha/about), which will not always be bypassable.
  - Two-factor code: The same applies as for Firefox Add-ons store. To specify the current OTP, use `--opera-two-factor`  
  - `EXT_ID`: Taken from the dashboard, e.g. `https://addons.opera.com/developer/package/EXT_ID`
  - `RE_CAPTCHA_SOLVER` - Available option: `2captcha`
  - `RE_CAPTCHA_API_KEY` - Get one for 2Captcha [here](https://2captcha.com?from=11267395). Make sure to have credits in your account.
  - **Source code inspection**:  
    The Opera Add-ons reviewers require inspecting your extension's source code.  
    This can be done by doing **one** of the following:
    - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service (e.g. [Google Drive](https://drive.google.com)).
    - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository.

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
PACKAGE_ID=123456
RE_CAPTCHA_SOLVER="2captcha"
RE_CAPTCHA_API_KEY="ApiKey"
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
    The extension ID from the store URL, e.g. `https://chrome.google.com/webstore/detail/fcphghnknhkimeagdglkljinmpbagone`
  - `--chrome-refresh-token` string  
    The refreshToken you have registered.
  - `--chrome-client-id` string  
    The client ID you have registered.
  - `--chrome-client-secret` string  
    The client secret you have registered.
  - `--chrome-zip` string  
    The path to the ZIP from the root.  
     You can use `{version}` in the ZIP filename, which will be replaced by the version in `package.json`

  To get your `--chrome-refresh-token`, `--chrome-client-id` and `--chrome-client-secret`, follow [this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).

  Example:

  ```shell
  web-ext-deploy --chrome-ext-id="ExtensionID" --chrome-refresh-token="RefreshToken" --chrome-client-id="ClientID" --chrome-client-secret="ClientSecret" --chrome-zip="zip-v{version}.zip"
  ```

- Firefox Add-ons
  - `--firefox-ext-id` string  
    The extension ID from the store URL, e.g. `https://addons.mozilla.org/en-US/developers/EXT_ID`
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
    The changes made in this version compared to the previous one. The Firefox users will see this.  
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
    The extension ID from the Edge Add-ons Dashboard, e.g. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`
  - `--edge-email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `--edge-password` string?  
    - If the publisher's account is linked to a [Microsoft Authenticator](https://www.microsoft.com/en-us/account/authenticator#getapp) app, you can leave this argument out.  
      If the account is *not* linked to Microsoft Authenticator, if you provide the password - it will be filled in.  
    - The Puppeteer instance for this store will never be headless (i.e. the Chromium window will open), to let you handle the two-factor authentication on Microsoft's site.
  - `--edge-zip` string  
    The path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry in `package.json`
  - `--edge-dev-changelog` string?  
    The technical changes made in this version, which will be seen by the Edge Add-ons reviewers.  
    You can use `\n` for new lines.


- Opera Add-ons
  - `--opera-package-id` string  
    The extension ID, e.g. `https://addons.opera.com/developer/package/PACKAGE_ID`
  - `--opera-email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `--opera-password` string  
    The publisher account's password. Used in Puppeteer to login to the account and update the extension.
  - `--opera-recaptcha-solver` string  
    The reCaptcha service chosen. Available option: `2captcha`
  - `--opera-recaptcha-api-key` string  
    The reCaptcha [API key](https://2captcha.com?from=11267395). Make sure to have credits in your account.
  - `--opera-two-factor` number?  
    If the publisher account has two-factor authentication enabled using an authentication application such as Google Authenticator, it will be used in the login process.  
    If the OTP is sent to the publisher's email, the module will prompt you to enter the OTP.
  - `--opera-zip` string  
    The path to the ZIP from the root.  
    You can use `{version}` in the ZIP filename, which will be replaced by the `version` entry in `package.json`
  - `--opera-changelog` string?  
    The changes made in this version compared to the previous one. The Opera users will see this.  
    You can use `\n` for new lines.  

  Example:

  ```shell
  web-ext-deploy --opera-ext-id="ExtensionID" --opera-email="some@email.com" --opera-password="pass" --opera-two-factor=123456 --opera-zip="dist/some-zip-v{version}.zip"
  ```
  
  **Notes:**
  - **This is not guaranteed to work!** This store uses [Google reCAPTCHA v2](https://www.google.com/recaptcha/about), which will not always be bypassable.
  - **Source code inspection:**  
    The Opera Add-ons reviewers require inspecting your extension's source code.  
    This can be done by doing **one** of the following:
    - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service (e.g. [Google Drive](https://drive.google.com))
    - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository.

### If using Node.js

#### ESM / TypeScript

```js
import { deployChrome, deployFirefox, deployEdge, deployOpera } from "web-ext-deploy";
```

#### CommonJS

```js
const { deployChrome, deployFirefox, deployEdge, deployOpera } = require("web-ext-deploy");
```

### Node.js API

<!-- prettier-ignore -->
- `deployChrome` object  
  Options:

  - `extId` string  
    The extension ID from the store URL, e.g. `https://chrome.google.com/webstore/detail/fcphghnknhkimeagdglkljinmpbagone`
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

  To get your `refreshToken`, `clientId` and `clientSecret`, follow [this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).  
  Returns `Promise<boolean>` or throws an exception.


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

  Returns `Promise<boolean>` or throws an exception.


- `deployEdge` object  
  Options:

  - `extId` string  
    The extension ID from the Edge Extensions Dashboard URL, e.g. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`
  - `email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `password` string?  
    - If the publisher's account is linked to a [Microsoft Authenticator](https://www.microsoft.com/en-us/account/authenticator#getapp) app, you can leave this argument out.  
      If the account is *not* linked to Microsoft Authenticator, if you provide the password - it will be filled in.
    - The Puppeteer instance for this store will never be headless (i.e. the Chromium window will open), to let you handle the two-factor authentication on Microsoft's site.
  - `zip` string  
    The ZIP file location, relative from the root directory.
  - `devChangelog` string?  
    The changes made in this version, compared to the last one, which will be visible only to the Edge Add-ons reviewers.
  - `verbose` boolean?  
    If specified, every step of uploading to Edge Add-ons will be logged to the console.

  Returns `Promise<boolean>` or throws an exception.


- `deployOpera` object  
  Options:

  - `packageId` number  
    The package ID from the store URL, e.g. `https://addons.opera.com/developer/package/PACAKGE_ID`
  - `email` string  
    The publisher account's email address. Used in Puppeteer to login to the account and update the extension.
  - `password` string  
    The publisher account's password.
  - `reCaptchaSolver` string
    - Currently: `2captcha`
  - `reCaptchaApiKey` string
    Get one for 2Captcha [here](https://2captcha.com?from=11267395). Make sure to have credits in your account.
  - `zip` string  
    The ZIP file location, relative from the root directory.
  - `verbose` boolean?  
    If specified, every step of uploading to Opera Add-ons will be logged to the console.

  Returns `Promise<boolean>` or throws an exception.

  **Notes:**
  - **This is not guaranteed to work!** This store uses [Google reCAPTCHA v2](https://www.google.com/recaptcha/about), which will not always be bypassable. 
  - **Source code inspection:**  
    The Opera Add-ons reviewers require inspecting your extension's source code.  
    This can be done by doing **one** of the following:
    - Uploading the ZIP that contains the [source code](https://www.npmjs.com/package/zip-self) to a public folder on a storage service (e.g. [Google Drive](https://drive.google.com))
    - Making the extension's code open source on a platform like GitHub, with clear instructions on the `README.md`, and then linking to its repository.

Example:

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
  changelog: "Some changes",
  devChangelog: "Changes for reviewers",
  verbose: false
}).catch(console.error);

deployEdge({
  extId: "EXT_ID",
  email: "some@email.com",
  password: "pass",
  zip: "dist/some-zip-v{version}.zip",
  devChangelog: "Changes for reviewers",
  verbose: false
}).catch(console.error);

deployOpera({
  packageId: 123456,
  email: "some@email.com",
  password: "pass",
  reCaptchaSolver: "2captcha",
  reCaptchaApiKey: "apiKey", // Register at https://2captcha.com/?from=11267395 , then get from https://2captcha.com
  zip: "dist/some-zip-v{version}.zip",
  changelog: "Some changes",
  verbose: false
}).catch(console.error);
```

Then, optionally

```shell
node deploy.js --firefox-two-factor=123456 --opera-two-factor=123456
```

## Notes

<!-- prettier-ignore -->
- If you have two-factor authentication enabled, but you don't provide the two-factor CLI argument _OR_ you provide an incorrect code, the module will prompt you using [`prompt-promise`](https://www.npmjs.com/package/prompt-promise)
