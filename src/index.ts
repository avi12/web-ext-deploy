#!/usr/bin/env node
import yargs from "yargs/yargs";
import { getCookies, getJsonStoresFromCli } from "./cli.js";
import { getEdgePublishApiAccessToken } from "./get-edge-publish-api-access-token.js";
import { ChromeOptions, prepareToDeployChrome } from "./stores/chrome/chrome-input.js";
import { EdgeOptionsPublishApi, prepareToDeployEdgePublishApi } from "./stores/edge/edge-input.js";
import { FirefoxOptions, prepareToDeployFirefox } from "./stores/firefox/firefox-input.js";
import { OperaOptions, prepareToDeployOpera } from "./stores/opera/opera-input.js";
import { Stores, SupportedGetCookies } from "./types.js";

const isUseCli = Boolean(process.argv[1].match(/web-ext-deploy(?:[\\/](?:dist-esm|src)[\\/]index\.(?:ts|js))?$/));

const argv = yargs(process.argv.slice(2))
  .options({
    env: { type: "boolean", default: false },
    getCookies: { type: "array" },
    firefoxChangelog: { type: "string" },
    firefoxDevChangelog: { type: "string" },
    edgeDevChangelog: { type: "string" },
    operaChangelog: { type: "string" },
    verbose: { type: "boolean" },
    // Edge Publish API parameters
    edgeClientId: { type: "string" },
    edgeClientSecret: { type: "string" },
    edgeAccessTokenUrl: { type: "string" }
  })
  .parseSync();

function getIsIntendingToCreateEdgeCredentials(): boolean {
  return Boolean(argv.edgeClientId || argv.edgeClientSecret || argv.edgeAccessTokenUrl);
}

function checkIfIntendingToCreateEdgeCredentials(): boolean {
  if (getIsIntendingToCreateEdgeCredentials()) {
    const isRetrievable = Boolean(argv.edgeClientId && argv.edgeClientSecret && argv.edgeAccessTokenUrl);
    if (!isRetrievable) {
      throw new Error(
        `It appears you're trying to create an Edge Publish API access token, but you are missing some arguments.
To do so, make sure you have all of the following: --edge-client-id, --edge-client-secret, --edge-access-token-url`
      );
    }
    return isRetrievable;
  }

  return false;
}

async function initCli(): Promise<void> {
  if (!isUseCli) {
    return;
  }

  if (argv.getCookies) {
    await getCookies(argv.getCookies as SupportedGetCookies[]);
    process.exit();
    return;
  }

  if (checkIfIntendingToCreateEdgeCredentials()) {
    await getEdgePublishApiAccessToken({
      clientId: argv.edgeClientId,
      clientSecret: argv.edgeClientSecret,
      accessTokenUrl: argv.edgeAccessTokenUrl
    });
    process.exit();
    return;
  }

  const storeJsons = getJsonStoresFromCli();
  const storeEntries = Object.entries(storeJsons);

  const storeFuncs: {
    // eslint-disable-next-line no-unused-vars
    [store in typeof Stores[number]]: (deploy) => Promise<boolean>;
  } = {
    chrome: deployChrome,
    firefox: deployFirefox,
    edge: deployEdgePublishApi,
    opera: deployOpera
  };
  const promises = storeEntries.map(([store, json]) => storeFuncs[store](json));
  try {
    await Promise.all(promises);
  } catch (e) {
    throw new Error(e);
  }
}

initCli().catch(console.error);

export async function deployChrome(options: ChromeOptions): Promise<boolean> {
  return prepareToDeployChrome(options);
}

export async function deployFirefox(options: FirefoxOptions): Promise<boolean> {
  if (argv.firefoxChangelog) {
    options.changelog = argv.firefoxChangelog;
  }
  if (argv.firefoxDevChangelog) {
    options.devChangelog = argv.firefoxDevChangelog;
  }
  return prepareToDeployFirefox(options);
}

export async function deployEdgePublishApi(options: EdgeOptionsPublishApi): Promise<boolean> {
  if (argv.edgeDevChangelog) {
    options.devChangelog = argv.edgeDevChangelog;
  }
  return prepareToDeployEdgePublishApi(options);
}

export async function deployOpera(options: OperaOptions): Promise<boolean> {
  if (argv.operaChangelog) {
    options.changelog = argv.operaChangelog;
  }
  return prepareToDeployOpera(options);
}
