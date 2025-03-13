import chalk from "chalk";
import { camelCase } from "change-case";
import dotenv from "dotenv";
import yargs from "yargs";
import { getSignInCookie } from "./get-sign-in-cookie.js";
import { ChromeOptions } from "./stores/chrome/chrome-input.js";
import { EdgeOptionsPublishApi } from "./stores/edge/edge-input.js";
import { FirefoxOptionsSubmissionApi } from "./stores/firefox/firefox-input.js";
import { OperaOptions } from "./stores/opera/opera-input.js";
import { Stores, SupportedGetCookies, SupportedStores } from "./types.js";
import { isObjectEmpty } from "./utils.js";

const argv = yargs(process.argv.slice(2))
  .options({
    env: { type: "boolean" },
    publishOnly: { type: "array" },
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
    firefoxJwtIssuer: { type: "string" },
    firefoxJwtSecret: { type: "string" },
    firefoxExtId: { type: "string" },
    firefoxZip: { type: "string" },
    firefoxZipSource: { type: "string" },
    firefoxChangelog: { type: "string" },
    firefoxChangelogLang: { default: "en-US" },
    firefoxDevChangelog: { type: "string" },
    // edge
    edgeClientId: { type: "string" },
    edgeApiKey: { type: "string" },
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

function getJsons(isUseEnv?: boolean): Record<SupportedStores, any> {
  if (isUseEnv) {
    console.log(chalk.blue("Using env mode"));
    const stores = (argv.publishOnly || Stores) as Array<SupportedStores>;
    return stores.reduce((stores: Record<string, any>, store: SupportedStores) => {
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
  const getFlagsArguments = (argv: any, store: SupportedStores): Record<SupportedStores, unknown> => {
    const entries = Object.entries(argv)
      .filter(([key]) => key.startsWith(`${store}-`))
      .map(([key, value]) => [key.replace(`${store}-`, ""), value]);

    return Object.fromEntries(entries);
  };

  return Stores.reduce(
    (stores, store: SupportedStores) => {
      const jsonStore = getFlagsArguments(argv, store);
      if (!isObjectEmpty(jsonStore)) {
        stores[store] = jsonStore;
      }
      return stores;
    },
    {} as Record<SupportedStores, any>
  );
}

function jsonCamelCased(jsonStores: Record<SupportedStores, any>): any {
  const entriesStores = Object.entries(jsonStores);

  const entriesWithCamelCasedKeys = entriesStores.map(([store, values]) => {
    const entriesKeyValues = Object.entries(values);
    const entriesMapped = entriesKeyValues.map(([key, value]) => [camelCase(key), value]);
    return [store, Object.fromEntries(entriesMapped)];
  });

  return Object.fromEntries(entriesWithCamelCasedKeys);
}

type StoreObjects = Record<
  SupportedStores,
  ChromeOptions | FirefoxOptionsSubmissionApi | EdgeOptionsPublishApi | OperaOptions
>;

/**
 * Used for fallbacks, e.g. in the case of `--zip="some-ext.zip" --chrome-zip="chrome-ext.zip" --firefox-ext-id="EXT_ID" --edge-ext-id="EXT_ID"`, the ZIP of Firefox and Edge will be `some-ext.zip`
 */
function fillMissing(jsonStoresRaw: StoreObjects): StoreObjects {
  const jsonStores = { ...jsonStoresRaw };
  const storeArgsMissing = ["zip", "devChangelog", "verbose"];

  const entries = Object.entries(jsonStoresRaw);
  for (const argument of storeArgsMissing) {
    if (!argv[argument]) {
      continue;
    }
    for (const [store, values] of entries) {
      values[argument] ||= argv[argument];
      jsonStores[store] = values;
    }
  }

  return jsonStores;
}

export function getJsonStoresFromCli(): StoreObjects {
  const jsonStoresRaw = jsonCamelCased(getJsons(argv.env));
  if (isObjectEmpty(jsonStoresRaw)) {
    throw new Error(
      chalk.red("Please supply parameters of at least one store. See https://github.com/avi12/web-ext-deploy#usage")
    );
  }

  return fillMissing(jsonStoresRaw);
}

export async function getCookies(siteNames: Array<SupportedGetCookies>): Promise<void> {
  return getSignInCookie(siteNames);
}
