# WebExt Deploy

The ultimate automation tool for deploying to multiple extension stores simultaneously!

Supported stores:

- [Chrome Web Store](https://chrome.google.com/webstore/category/extensions)
- [Firefox Addons](https://addons.mozilla.org/en-US/firefox/extensions)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons)
- [Opera Addons](https://addons.opera.com/en/extensions)

## Core packages used

- [Puppeteer](https://github.com/puppeteer/puppeteer) - for updating extensions on Firefox Addons / Edge Add-ons / Opera
  Addons.
- [Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/using_webstore_api)

[comment]: <> (TODO: Change the wording)
## Disclaimer
While the package does not store the information provided to it, I do not take any responsibility for credentials theft.

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

Use the `.env` [snippet(s)](#Possible+.env+files) relevant to your extension.  
Make sure to have `*.env` in your `.gitignore`  

In the CLI:
```shell
web-ext-deploy --env
```

#### Additional arguments:
- `--package-json` string?  
  If specified, it will be used instead of the root `package.json`.    
  The `package.json` will be used for the `{version}` in the ZIP filename(s).


- `--zip` string?  
  If specified, it will be used for every `.env` that the `ZIP` is not specified.  


- `--firefox-changelog` string?  
  If specified and `firefox.env` exists, it will be used to provide changelog for the Firefox users.  
  New lines ("\n") are supported.


- `--firefox-dev-changelog` string?  
  If specified and `firefox.env` exists, it will be used to provide changelog for the Firefox Addons reviewers.  
  New lines ("\n") are supported.

  
- `--edge-dev-changelog` string?  
  If specified and `edge.env` exists, it will be used to provide changelog for the Edge Add-ons reviewers.  
  New lines ("\n") are supported.


#### Notes:

- Firefox Addons store: if your account has two-factor authentication enabled - if it relies on an authentication generator (e.g. Google Authenticator), you can specify the code with `--firefox-two-factor`  
  If you have email-based authentication, the module will prompt you to fill your OTP.  
  As for `EXT_ID`, you must provide the extension ID as seen in the store listing URL.

- Edge Add-ons store: The `EXT_ID` must be provided according to the dashboard URL.  
  I.e. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID`


- Opera Addons store: The same applies. To specify the current OTP, use `--opera-two-factor`  
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
web-ext-deploy --chrome-zip="some-zip-v{version).zip" --chrome-ext-id="Extension ID" --firefox-zip="some-zip-v{version).zip" --firefox-ext-id="Extension ID"
```

### CLI API
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
  web-ext-deploy --chrome-ext-id="Extension ID" --chrome-refresh-token="RefreshToken" --chrome-client-id="ClientID" --chrome-client-secret="ClientSecret" --chrome-zip="zip-v{version}.zip"
  ```


- Firefox Addons
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
    You can use "\n" for new lines.
  - `--firefox-dev-changelog` string?  
    The technical changes made in this version, which will be seen by the Firefox Addons reviewers.  
    You can use "\n" for new lines.
    
  Example:
  ```shell
  web-ext-deploy --firefox-ext-id="Extension ID" --firefox-email="some@email.com" --firefox-password="pass" --firefox-two-factor=123456 --firefox-zip="dist/some-zip-v{version}.zip" --firefox-changelog="Changelog\nWith line breaks" --firefox-dev-changelog="Changelog for reviewers\nWith line breaks"
  ```

- Edge Addons
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
    The technical changes made in this version, which will be seen by the Edge Addons reviewers.  
    You can use "\n" for new lines.


- Opera Addons
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
    web-ext-deploy --opera-ext-id="Extension ID" --opera-email="some@email.com" --opera-password="pass" --opera-two-factor=123456 --opera-zip="dist/some-zip-v{version}.zip"
    ```

- `--package-json` string?  
  If specified, it will be used instead of the root `package.json`.  
  The `package.json` will be used for the `{version}` in the ZIP filename(s).


- `--zip` string?  
  If specified, it will be used for every store that the `zip` is not specified.  
  For example, in
  ```shell
  web-ext-deploy --zip="zip-v{version}.zip" --chrome-refresh-token="refreshToken" --firefox-email="some@email.com"
  ```
  the `zip-v{version}.zip` will be used for the Chrome Web Store version *and* the Firefox Addons version.

### If using Node.js

#### ESM
```js
import { deployChrome, deployFirefox, deployOpera, deployEdge } from "web-ext-deploy";
```

#### CommonJS
```js
const { deployChrome, deployFirefox, deployOpera, deployEdge } = require("web-ext-deploy");
```


### Node.js API

- `deployChrome` object  
  Options:
  - `extId` string
  - `refreshToken` string
  - `clientId` string
  - `clientSecret` string
  - `zip` string
  - `packageJson` string?

  returns `Promise<boolean>` or throws an exception.


- `deployFirefox` object  
  Options:
  - `extId` string
  - `email` string
  - `password` string
  - `zip` string
  - `zipSource` string?
  - `changelog` string?
  - `devChangelog` string?
  - `packageJson` string?

  returns `Promise<boolean>` or throws an exception.


- `deployEdge` object  
  Options:

  - `email` string
  - `password` string
  - `zip` string
  - `devChangelog` string?
  - `packageJson` string?

  returns `Promise<boolean>` or throws an exception.


- `deployOpera` object  
  Options:
  - `extId` string
  - `email` string
  - `password` string
  - `zip` string
  - `packageJson` string?

  returns `Promise<boolean>` or throws an exception.

Example:

`deploy.js`
```js
import { deployChrome, deployFirefox, deployEdge, deployOpera } from "web-ext-deploy";
      
deployChrome({
  extId: "EXT_ID",
  refreshToken: "refreshToken",
  clientId: "clientID",
  clientSecret: "clientsecret",
  zip: "dist/some-zip-v{version}.zip",
  packageJson: "path/package.json"
})
.then(() => console.log("Uploaded to Chrome Web Store"))
.catch(console.error);

deployFirefox({
  extId: "EXT_ID",
  email: "some@email.com",
  password: "pass",
  zip: "dist/some-zip-v{version}.zip",
  zipSource: "zip-source-v{version}.zip",
  changes: "Some changes",
  devChanges: "Changes for reviewers",
  packageJson: "path/package.json"
})
.then(() => console.log("Uploaded to Firefox Addons"))
.catch(console.error);

deployEdge({
  extId: "EXT_ID",
  email: "some@email.com",
  password: "pass",
  zip: "dist/some-zip-v{version}.zip",
  devChanges: "Changes for reviewers",
  packageJson: "path/package.json"
})
.then(() => console.log("Uploaded to Edge Add-ons"))
.catch(console.error);

deployOpera({
  extId: "EXT_ID",
  email: "some@email.com",
  password: "pass",
  zip: "dist/some-zip-v{version}.zip",
  packageJson: "path/package.json"
})
.then(() => console.log("Uploaded to Opera Addons"))
.catch(console.error);
```
Then
```shell
node deploy.js --firefox-two-factor=123456 --opera-two-factor=123456
```
Of course, `--firefox-two-factor` and `--opera-two-factor` are optional.
## Note
- If you update your extension on Opera Addons, make sure to either have the source ZIP uploaded to a folder which is accessible to the Opera Addons reviewers (e.g. on a Google Drive account), OR make the extension open source and link to its repository.