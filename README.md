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

## Installing

```powershell
npm i -D web-ext-deploy
# or
yarn add -D web-ext-deploy
# or
pnpm i -D web-ext-deploy
```

Deployment to Chrome Web Store: [follow this guide](https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md).

## Usage

### If using `.env`

Rename `.env.sample` to `STORE.env`, e.g. `firefox.env`, and fill in the details.

### if using CLI

```powershell
web-ext-deploy --ext-name=EXT_NAME --filename=some-filename-v{version}.zip --filename-source=some-filename-source-v{version}.zip --chrome=CWS_DETAIS --firefox=FIREFOX_DETAILS --edge=EDGE_DETAILS --opera=OPERA_DETAILS
```

### CLI API

- `ext-name` string  
  The name of the extension. This module will use the `name.toLowerCase()`.  
  It must be identical to the one listed on the stores.


- `filename` string  
  The ZIP to be uploaded.  
  `{version}` can be used to pull the version of the extension's manifest.


- `filename-source` string  
  The extension source. It wil be used for the Firefox Addons store.  
  `{version}` can be used to pull the version of the extension's manifest.


- `chrome` object  
  Example: `--chrome={refreshToken: "refreshToken", clientId: "client ID", clientSecret: "clientSecret", filename: "filename-v{version}.zip"}`


- `firefox` object  
  Example: `--firefox={email: "some@email.com", password: "password", twoFactor: 123456, filename: "filename-v{version}.zip", changes: "Changes\nWith new lines"}`


- `edge` object  
  Example: `--edge={email: "some@email.com", password: "password", filename: "filename-v{version}.zip"}`


- `opera` object  
  Example: `--opera={email: "some@email.com", password: "password", twoFactor: 123456, filename: "filename-v{version}.zip"}`

### If using Node.js

```js
import { deployChrome, deployFirefox, deployOpera, deployEdge } from "web-ext-deploy";
// or
const { deployChrome, deployFirefox, deployOpera, deployEdge } = require("web-ext-deploy");
```

### Node.js API

- `deployChrome` object  
  Options:

  - `refreshToken` string
  - `clientId` string
  - `clientSecret` string
  - `filename` string

  returns `Promise<boolean>`


- `deployFirefox` object  
  Options:

  - `email` string
  - `password` string
  - `twoFactor?` string
  - `filename` string
  - `filenameSource?` string
  - `changes?` string

  returns `Promise<boolean>`


- `deployEdge` object  
  Options:

  - `email` string
  - `password` string
  - `filename` string
  - `changes` string

  returns `Promise<boolean>`


- `deployOpera` object  
  Options:

  - `email` string
  - `password` string
  - `filename` string

  returns `Promise<boolean>`
