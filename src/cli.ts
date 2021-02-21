// eslint-disable-next-line no-unused-vars
import yargs, { Arguments } from "yargs";
import { isObjectEmpty } from "./utils";
import dotenv from "dotenv";
import { camelCase } from "camel-case";
// eslint-disable-next-line no-unused-vars
import { FirefoxOptions } from "./stores/firefox/firefox-input";

const { argv } = yargs(process.argv.slice(2)).options({
  env: { type: "boolean" },
  extId: { type: "string" },
  zip: { type: "string" },
  verbose: { type: "boolean" },
  // chrome
  chromeExtId: { type: "string" },
  chromeRefreshToken: { type: "string" },
  chromeClientId: { type: "string" },
  chromeClientSecret: { type: "string" },
  chromeZip: { type: "string" },
  // firefox
  firefoxExtId: { type: "string" },
  firefoxEmail: { type: "string" },
  firefoxPassword: { type: "string" },
  firefoxTwoFactor: { type: "string" },
  firefoxZip: { type: "string" },
  firefoxZipSource: { type: "string" },
  firefoxChangelog: { type: "string" },
  firefoxDevChangelog: { type: "string" },
  // edge
  edgeExtId: { type: "string" },
  edgeEmail: { type: "string" },
  edgePassword: { type: "string" },
  edgeZip: { type: "string" },
  edgeDevChangelog: { type: "string" },
  // opera
  operaExtId: { type: "string" },
  operaEmail: { type: "string" },
  operaPassword: { type: "string" },
  operaZip: { type: "string" },
});

function getJsons(isUseEnv?: boolean): { [p: string]: any } {
  if (isUseEnv) {
    return gStores.reduce((stores: { [s: string]: unknown }, store: string) => {
      const { parsed = {} } = dotenv.config({ path: `${store}.env` });
      if (!isObjectEmpty(parsed)) {
        const yargsStoreArgs = getJsons(false);
        let additionalParams = {};
        // @ts-ignore
        if (yargsStoreArgs[store]) {
          // @ts-ignore
          additionalParams = yargsStoreArgs[store];
        }
        // @ts-ignore
        stores[store] = { ...parsed, ...additionalParams };
      }
      return stores;
    }, {});
  }

  const getFlagsArguments = (
    argv: Arguments,
    store: string
  ): { [s: string]: unknown } => {
    const entries = Object.entries(argv)
      .filter(([key]) => key.startsWith(`${store}-`))
      .map(([key, value]) => [key.replace(`${store}-`, ""), value]);

    return Object.fromEntries(entries);
  };

  return gStores.reduce(
    (stores: { [s: string]: string | number }, store: string) => {
      const jsonStore = getFlagsArguments(argv, store);
      if (!isObjectEmpty(jsonStore)) {
        // @ts-ignore
        stores[store] = jsonStore;
      }
      return stores;
    },
    {}
  );
}

function jsonCamelCased(jsonStores: { [s: string]: string | number }) {
  const entriesStores = Object.entries(jsonStores);

  const entriesWithCamelCasedKeys = entriesStores.map(([store, values]) => {
    const entriesKeyValues = Object.entries(values);
    const entriesMapped = entriesKeyValues.map(([key, value]) => [
      camelCase(key),
      value,
    ]);

    return [store, Object.fromEntries(entriesMapped)];
  });

  return Object.fromEntries(entriesWithCamelCasedKeys);
}

interface StoreObjects {
  chrome?: object;
  firefox?: FirefoxOptions;
  edge?: object;
  opera?: object;
}

/**
 * Used for fallbacks, e.g. `--zip="some-ext.zip" --chrome-zip="chrome-ext.zip" --firefox-ext-id="EXT_ID" --edge-ext-id="EXT_ID"`<br>So the ZIP of Firefox and Edge will be `some-ext.zip`
 * @param jsonStoresRaw
 */
function fillMissing(jsonStoresRaw: StoreObjects): StoreObjects {
  const jsonStores = { ...jsonStoresRaw };
  const storeArgsMissing = ["zip", "devChangelog", "verbose"];

  const entries = Object.entries(jsonStoresRaw);
  storeArgsMissing.forEach(argument => {
    if (!argv[argument]) {
      return;
    }
    entries.forEach(([store, values]) => {
      values[argument] = values[argument] || argv[argument];
      // @ts-ignore
      jsonStores[store] = values;
    });
  });

  return jsonStores;
}

const gStores = ["chrome", "firefox", "edge", "opera"];

export function getJsonStoresFromCli(): StoreObjects {
  const jsonStoresRaw = jsonCamelCased(getJsons(argv.env));
  if (isObjectEmpty(jsonStoresRaw)) {
    throw new Error(
      "Please supply details of at least one store. See https://github.com/avi12/web-ext-deploy#usage"
    );
  }

  // eslint-disable-next-line no-unused-vars
  return fillMissing(jsonStoresRaw);
}
