import yargs from "yargs";
import { isObjectEmpty } from "./utils";
import dotenv from "dotenv";
import { camelCase } from "camel-case";
import { ChromeOptions } from "./stores/chrome/chrome-input";
import { FirefoxOptions } from "./stores/firefox/firefox-input";
import { OperaOptions } from "./stores/opera/opera-input";
import { getSignInCookie } from "./get-sign-in-cookie";
import { EdgeOptionsPublishApi } from "./stores/edge/new/edge-input";
import { Stores } from "./types";
import { EdgeOptions } from "./stores/edge/old/edge-input-old";

const argv = yargs(process.argv.slice(2))
  .options({
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
    firefoxSessionid: { type: "string" },
    firefoxExtId: { type: "string" },
    firefoxZip: { type: "string" },
    firefoxZipSource: { type: "string" },
    firefoxChangelog: { type: "string" },
    firefoxDevChangelog: { type: "string" },
    // edge
    /** @deprecated Use an access token, client ID, client secret, and access token URL instead */
    edgeCookie: { type: "string" },
    /** @deprecated Use product ID instead */
    edgeExtId: { type: "string" },
    edgeAccessToken: { type: "string" },
    edgeClientId: { type: "string" },
    edgeClientSecret: { type: "string" },
    edgeAccessTokenUrl: { type: "string" },
    edgeProductId: { type: "string" },
    edgeZip: { type: "string" },
    edgeDevChangelog: { type: "string" },
    // opera
    operaSessionid: { type: "string" },
    operaCsrftoken: { type: "string" },
    operaExtId: { type: "string" },
    operaZip: { type: "string" },
    operaChangelog: { type: "string" }
  })
  .parseSync();

function getJsons(isUseEnv?: boolean): { [p: string]: any } {
  if (isUseEnv) {
    return Stores.reduce((stores: { [s: string]: unknown }, store: string) => {
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
    argv: any,
    store: string
  ): { [s: string]: unknown } => {
    const entries = Object.entries(argv)
      .filter(([key]) => key.startsWith(`${store}-`))
      .map(([key, value]) => [key.replace(`${store}-`, ""), value]);

    return Object.fromEntries(entries);
  };

  return Stores.reduce((stores, store: string) => {
    const jsonStore = getFlagsArguments(argv, store);
    if (!isObjectEmpty(jsonStore)) {
      stores[store] = jsonStore;
    }
    return stores;
    // eslint-disable-next-line no-unused-vars
  }, {} as { [store in typeof Stores[number]]: unknown });
}

function jsonCamelCased(jsonStores: { [s: string]: string | number }) {
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

const StoreObjects = {
  chrome: {} as ChromeOptions,
  firefox: {} as FirefoxOptions,
  edge: argv.edgeAccessToken
    ? ({} as EdgeOptionsPublishApi)
    : ({} as EdgeOptions),
  opera: {} as OperaOptions
} as const;

/**
 * Used for fallbacks, e.g. `--zip="some-ext.zip" --chrome-zip="chrome-ext.zip" --firefox-ext-id="EXT_ID" --edge-ext-id="EXT_ID"`<br>So the ZIP of Firefox and Edge will be `some-ext.zip`
 */
function fillMissing(jsonStoresRaw: typeof StoreObjects): typeof StoreObjects {
  const jsonStores = { ...jsonStoresRaw };
  const storeArgsMissing = ["zip", "devChangelog", "verbose"];

  const entries = Object.entries(jsonStoresRaw);
  storeArgsMissing.forEach(argument => {
    if (!argv[argument]) {
      return;
    }
    entries.forEach(([store, values]) => {
      values[argument] = values[argument] || argv[argument];
      jsonStores[store] = values;
    });
  });

  return jsonStores;
}

export function getJsonStoresFromCli(): typeof StoreObjects {
  const jsonStoresRaw = jsonCamelCased(getJsons(argv.env));
  if (isObjectEmpty(jsonStoresRaw)) {
    throw new Error(
      "Please supply details of at least one store. See https://github.com/avi12/web-ext-deploy#usage"
    );
  }

  return fillMissing(jsonStoresRaw);
}

export async function getCookies(siteNames: string[]): Promise<void> {
  return getSignInCookie(siteNames);
}
