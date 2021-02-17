import yargs, { Arguments } from "yargs";
import { camelCase } from "camel-case";
import * as dotenv from "dotenv";
import { validateStoreJsons } from "./utils";

import main from "./main";

function isObjectEmpty(object) {
  return Object.keys(object).length === 0;
}

const { argv } = yargs(process.argv.slice(2)).options({
  env: { type: "boolean" },
  extName: { type: "string" },
  packageJson: { type: "string" },
  zip: { type: "string" },
  // chrome
  chromeExtName: { type: "string" },
  chromeRefreshToken: { type: "string" },
  chromeClientId: { type: "string" },
  chromeClientSecret: { type: "string" },
  chromeZip: { type: "string" },
  // firefox
  firefoxExtName: { type: "string" },
  firefoxExtId: { type: "string" },
  firefoxEmail: { type: "string" },
  firefoxPassword: { type: "string" },
  firefoxTwoFactor: { type: "string" },
  firefoxZip: { type: "string" },
  firefoxZipSource: { type: "string" },
  firefoxChangelog: { type: "string" },
  firefoxDevChangelog: { type: "string" },
  // edge
  edgeExtName: { type: "string" },
  edgeEmail: { type: "string" },
  edgePassword: { type: "string" },
  edgeZip: { type: "string" },
  edgeDevChangelog: { type: "string" },
  // opera
  operaExtName: { type: "string" },
  operaEmail: { type: "string" },
  operaPassword: { type: "string" },
  operaZip: { type: "string" }
});

function getJsons(isUseEnv: boolean) {
  if (isUseEnv) {
    return gStores.reduce((stores, store) => {
      const { parsed = {} } = dotenv.config({ path: `${store}.env` });
      if (!isObjectEmpty(parsed)) {
        const yargsStoreArgs = getJsons(false);
        let additionalParams = {};
        if (yargsStoreArgs[store]) {
          additionalParams = yargsStoreArgs[store];
        }
        stores[store] = { ...parsed, ...additionalParams };
      }
      return stores;
    }, {});
  }

  const getFlagsArguments = (
    argv: Arguments,
    store: string
  ): Record<string, unknown> => {
    const entries = Object.entries(argv)
      .filter(([key]) => key.startsWith(`${store}-`))
      .map(([key, value]) => [key.replace(`${store}-`, ""), value]);

    return Object.fromEntries(entries);
  };

  return gStores.reduce((stores, store) => {
    const jsonStore = getFlagsArguments(argv, store);
    if (!isObjectEmpty(jsonStore)) {
      stores[store] = jsonStore;
    }
    return stores;
  }, {});
}

function jsonCamelCased(jsonStores: Record<string, unknown>) {
  const entriesStores = Object.entries(jsonStores);

  const entriesWithCamelCasedKeys = entriesStores.map(([store, values]) => {
    const entriesKeyValues = Object.entries(values);
    const entriesMapped = entriesKeyValues.map(([key, value]) => [
      camelCase(key),
      value
    ]);

    return [store, Object.fromEntries(entriesMapped)];
  });

  return Object.fromEntries(entriesWithCamelCasedKeys);
}

function fillMissing(jsonStoresRaw) {
  const jsonStores = { ...jsonStoresRaw };
  const storeArgsMissing = ["extName", "zip", "devChangelog"];
  const additionalArgsMissing = ["packageJson"];

  const entries = Object.entries(jsonStoresRaw);
  storeArgsMissing.forEach(argument => {
    if (argv[argument]) {
      entries.forEach(([store, values]) => {
        values[argument] = values[argument] || argv[argument];
        jsonStores[store] = values;
      });
    }
  });

  additionalArgsMissing.forEach(argument => {
    if (argv[argument]) {
      jsonStores[argument] = argv[argument];
    }
  });

  return jsonStores;
}

export const gStores = ["chrome", "firefox", "edge", "opera"];

export default function init() {
  const jsonStoresRaw = jsonCamelCased(getJsons(argv.env));
  if (isObjectEmpty(jsonStoresRaw)) {
    throw new Error(
      "Please supply details about at least one store. See https://github.com/avi12/web-ext-deploy#usage"
    );
  }
  const jsonStores = fillMissing(jsonStoresRaw);
  // If invalidated, an exception is thrown
  validateStoreJsons(jsonStores);
  main(jsonStores);
}
