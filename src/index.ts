#!/usr/bin/env node
import yargs from "yargs";
import { getCookies, getJsonStoresFromCli } from "./cli";
import {
  ChromeOptions,
  prepareToDeployChrome
} from "./stores/chrome/chrome-input";
import {
  FirefoxOptions,
  prepareToDeployFirefox
} from "./stores/firefox/firefox-input";
import { EdgeOptions, prepareToDeployEdge } from "./stores/edge/edge-input";
import { OperaOptions, prepareToDeployOpera } from "./stores/opera/opera-input";
import { getExtVersion } from "./utils";

const isUseCli = Boolean(
  process.argv[1].match(/web-ext-deploy[\\/](?:dist|src)[\\/]index\.(?:ts|js)$/)
);

const { argv } = yargs(process.argv.slice(2)).options({
  env: { type: "boolean", default: false },
  getCookies: { type: "array" },
  firefoxChangelog: { type: "string" },
  firefoxDevChangelog: { type: "string" },
  verbose: { type: "boolean" }
});

async function initCli() {
  if (!isUseCli) {
    return;
  }
  const storeFuncs = {
    chrome: deployChrome,
    firefox: deployFirefox,
    edge: deployEdge,
    opera: deployOpera
  };
  const storeNames = {
    chrome: "Chrome Web Store",
    edge: "Edge Add-ons",
    firefox: "Firefox Add-ons",
    opera: "Opera Add-ons"
  };

  if (argv.getCookies) {
    await getCookies(argv.getCookies as string[]);
    process.exit();
    return;
  }

  const storeJsons = getJsonStoresFromCli();
  const storeEntries = Object.entries(storeJsons);
  const promises = storeEntries.map(([store, json]) => storeFuncs[store](json));
  try {
    await Promise.all(promises);
    storeEntries.forEach(([store, details]) => {
      const extId = details?.extId ?? details.packageId;
      const version = getExtVersion(details.zip);
      console.log(
        `Successfully updated "${extId}" to version ${version} on ${storeNames[store]}!`
      );
    });
  } catch (e) {
    throw new Error(e);
  }
}

initCli().catch(console.error);

export async function deployChrome(options: ChromeOptions) {
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

export async function deployEdge(options: EdgeOptions) {
  return prepareToDeployEdge(options);
}

export async function deployOpera(options: OperaOptions): Promise<boolean> {
  return prepareToDeployOpera(options);
}
