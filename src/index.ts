#!/usr/bin/env node
import yargs from "yargs/yargs";
import { getCookies, getJsonStoresFromCli } from "./cli";
import { ChromeOptions, prepareToDeployChrome } from "./stores/chrome/chrome-input";
import { FirefoxOptions, prepareToDeployFirefox } from "./stores/firefox/firefox-input";
import { EdgeOptions, prepareToDeployEdge } from "./stores/edge/old/edge-input-old";
import { OperaOptions, prepareToDeployOpera } from "./stores/opera/opera-input";
import { getEdgePublishApiAccessToken } from "./get-edge-publish-api-access-token";
import { EdgeOptionsPublishApi, prepareToDeployEdgePublishApi } from "./stores/edge/new/edge-input";
import { Stores } from "./types";

const isUseCli = Boolean(process.argv[1].match(/web-ext-deploy(?:[\\/](?:dist|src)[\\/]index\.(?:ts|js))?$/));

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
    await getCookies(argv.getCookies as string[]);
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
    edge: (<EdgeOptionsPublishApi>storeJsons.edge)?.accessToken ? deployEdgePublishApi : deployEdge,
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

/**
 * @deprecated Use `deployEdgePublishApi` instead
 */
export async function deployEdge(options: EdgeOptions): Promise<boolean> {
  if (argv.edgeDevChangelog) {
    options.devChangelog = argv.edgeDevChangelog;
  }
  return prepareToDeployEdge(options);
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
