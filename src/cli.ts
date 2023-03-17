import { camelCase } from "camel-case";
import chalk from "chalk";
import dotenv from "dotenv";
import yargs from "yargs";
import { getSignInCookie } from "./get-sign-in-cookie.js";
import { ChromeOptions } from "./stores/chrome/chrome-input.js";
import { EdgeOptionsPublishApi } from "./stores/edge/edge-input.js";
import { FirefoxOptions } from "./stores/firefox/firefox-input.js";
import { OperaOptions } from "./stores/opera/opera-input.js";
import { Stores, SupportedGetCookies, SupportedStores } from "./types.js";
import { isObjectEmpty } from "./utils.js";

const argv = yargs(process.argv.slice(2))
  .options({
    env: { type: "boolean" },
    include: { type: "array" },
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

function getJsons(isUseEnv?: boolean): Record<string, any> {
  if (isUseEnv) {
    console.log(chalk.blue("Using env mode"));
    return Stores.reduce((stores: { [s: string]: unknown }, store: string) => {
      const { parsed = {} } = dotenv.config({ path: `${store}.env` });
      if (!isObjectEmpty(parsed)) {
        const yargsStoreArgs = getJsons(false);
        stores[store] = { ...parsed, ...yargsStoreArgs[store] };
      }
      return stores;
    }, {});
  }

  if (!argv.env) {
    console.log(chalk.blue("Using CLI mode"));
  }
  const getFlagsArguments = (argv: any, store: string): Record<string, any> => {
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
  }, {} as { [store in SupportedStores]: unknown });
}

function jsonCamelCased(jsonStores: Record<string, any>): any {
  const entriesStores = Object.entries(jsonStores);

  const entriesWithCamelCasedKeys = entriesStores.map(([store, values]) => {
    const entriesKeyValues = Object.entries(values);
    const entriesMapped = entriesKeyValues.map(([key, value]) => [camelCase(key), value]);
    return [store, Object.fromEntries(entriesMapped)];
  });

  return Object.fromEntries(entriesWithCamelCasedKeys);
}

const StoreObjects: {
  [key in SupportedStores]: ChromeOptions | FirefoxOptions | EdgeOptionsPublishApi | OperaOptions;
} = {
  chrome: {} as ChromeOptions,
  firefox: {} as FirefoxOptions,
  edge: {} as EdgeOptionsPublishApi,
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
      values[argument] ||= argv[argument];
      jsonStores[store] = values;
    });
  });

  return jsonStores;
}

export function getJsonStoresFromCli(): typeof StoreObjects {
  const jsonStoresRaw = jsonCamelCased(getJsons(argv.env));
  if (isObjectEmpty(jsonStoresRaw)) {
    throw new Error(
      chalk.red("Please supply details of at least one store. See https://github.com/avi12/web-ext-deploy#usage")
    );
  }

  return fillMissing(jsonStoresRaw);
}

export async function getCookies(siteNames: SupportedGetCookies[]): Promise<void> {
  return getSignInCookie(siteNames);
}
