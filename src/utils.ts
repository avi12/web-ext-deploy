const gValidJsons = {
  chrome: ["extName", "refreshToken", "clientId", "clientSecret", "zip"],
  firefox: ["extName", "email", "password", "zip"],
  edge: ["extName", "email", "password", "zip"],
  opera: ["extName", "email", "password", "zip"]
};

export function validateStoreJsons(jsonStores: {
  chrome?: {
    extName: string;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    zip?: string;
  };
  firefox?: {
    extName?: string;
    email: string;
    password: string;
    zip?: string;
    zipSource?: string;
  };
  edge?: { extName?: string; email: string; password: string; zip?: string };
  opera?: { extName?: string; email: string; password: string; zip?: string };
  zip?: string;
  extName?: string;
}) {
  // TODO: Complete validation algorithm
  // Object.entries(gValidJsons).forEach(([store, values]) => {
  //   const valuesToCheck = values.sort();
  //
  //   const entriesCurrently = Object.entries(jsonStores[store]);
  //
  // });
}

interface IJsonBase {
  twoFactor?: number;
}

export interface IChrome {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  zip: string;
  extId: string;
  packageJson?: string;
}

export interface IFirefox extends IJsonBase {
  // The publisher account's email address.
  email: string;

  // The publisher account's password.
  password: string;

  // The extension ID. E.g. `https://addons.mozilla.org/en-US/developers/EXT_ID`
  extId: string;

  // The path to the ZIP, relative from the current working directory (`process.cwd()`).<br>
  // You can use `{version}` to pull the current version of the `package.json`, e.g. `some-zip-v{version}.zip`
  zip: string;

  // If applicable, the path to the ZIP source, relative from the current working directory (`process.cwd()`).<br>
  // You can use `{version}` to pull the current version of the `package.json`, e.g. `some-zip-v{version}.zip`
  zipSource?: string;

  // Recommended. A description of the changes in this version, compared to the previous one.
  changelog?: string;

  // Recommended. A description of the technical changes made in this version, compared to the previous one.<br>
  // This will only be seen by the Firefox Addons reviewers.
  devChangelog?: string;

  // If the extension is nested within another project, you can point to the path of this `package.json`, relative to the current working directory (`process.cwd()`).
  packageJson?: string;
}

export interface IOpera extends IJsonBase {
  email: string;
  password: string;
  extId: string;
  zip: string;
  packageJson?: string;
}
