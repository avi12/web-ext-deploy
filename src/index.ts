#!/usr/bin/env node
import chalk from "chalk";
import yargs from "yargs/yargs";
import { getCookies, getJsonStoresFromCli } from "./cli.js";
import { getEdgePublishApiAccessToken } from "./get-edge-publish-api-access-token.js";
import { ChromeOptions, prepareToDeployChrome } from "./stores/chrome/chrome-input.js";
import { EdgeOptionsPublishApi, prepareToDeployEdgePublishApi } from "./stores/edge/edge-input.js";
import { FirefoxOptionsSubmissionApi, prepareToDeployFirefox } from "./stores/firefox/firefox-input.js";
import { OperaOptions, prepareToDeployOpera } from "./stores/opera/opera-input.js";
import { Stores, SupportedGetCookies, SupportedStores } from "./types.js";

const isUseCli = Boolean(process.argv[1].match(/web-ext-deploy(?:[\\/](?:dist-esm|src)[\\/]index\.(?:ts|js))?$/));

const argv = yargs(process.argv.slice(2))
  .options({
    env: { type: "boolean", default: false },
    publishOnly: { type: "array", default: [] },
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

function verifySelectiveDeployments(storesToInclude: SupportedStores[]): boolean {
  if (!argv.env) {
    if (storesToInclude.length >= 0) {
      throw new Error(chalk.red(`You must use the --env flag to use --publish-only`));
    }

    return storesToInclude.length === 0;
  }

  if (!storesToInclude) {
    return true;
  }

  const storesUnsupported = storesToInclude.filter(store => !Stores.includes(store));
  if (storesUnsupported.length > 0) {
    const store = storesUnsupported.length === 1 ? "store" : "stores";
    throw new Error(
      chalk.red(`Unsupported ${store}: ${storesUnsupported}
Supported stores: ${Stores}`)
    );
  }
  return true;
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

  if (!verifySelectiveDeployments(argv.publishOnly as SupportedStores[])) {
    return;
  }

  const storeJsons = getJsonStoresFromCli();
  const storeEntries = Object.entries(storeJsons);

  const storeFuncs: {
    [store in SupportedStores]: (
      deploy: ChromeOptions | FirefoxOptionsSubmissionApi | EdgeOptionsPublishApi | OperaOptions
    ) => Promise<boolean>;
  } = {
    chrome: deployChrome,
    firefox: deployFirefoxSubmissionApi,
    edge: deployEdgePublishApi,
    opera: deployOpera
  } as const;
  const promises = storeEntries.map(([store, json]) => storeFuncs[store](json));
  try {
    await Promise.all(promises);
  } catch (e) {
    throw new Error(chalk.red(e));
  }
}

initCli().catch(console.error);

export async function deployChrome(options: ChromeOptions): Promise<boolean> {
  return prepareToDeployChrome(options);
}

export async function deployFirefoxSubmissionApi(options: FirefoxOptionsSubmissionApi): Promise<boolean> {
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
