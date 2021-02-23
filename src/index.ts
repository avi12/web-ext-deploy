#!/usr/bin/env node
import yargs from "yargs";
import {
  FirefoxOptions,
  prepareToDeployFirefox
} from "./stores/firefox/firefox-input";
import { getJsonStoresFromCli } from "./cli";
import { OperaOptions, prepareToDeployOpera } from "./stores/opera/opera-input";
import {
  ChromeOptions,
  prepareToDeployChrome
} from "./stores/chrome/chrome-input";

const isUseCli = Boolean(
  process.argv[1].match(/web-ext-deploy[\\/](?:dist|src)[\\/]index\.(?:ts|js)$/)
);

const { argv } = yargs(process.argv.slice(2)).options({
  env: { type: "boolean", default: false },
  firefoxTwoFactor: { type: "number" },
  firefoxChangelog: { type: "string" },
  firefoxDevChangelog: { type: "string" },
  operaTwoFactor: { type: "number" },
  verbose: { type: "boolean" }
});

async function initCli() {
  if (!isUseCli) {
    return;
  }
  const storeFuncs = {
    chrome: deployChrome,
    firefox: deployFirefox,
    opera: deployOpera
  };
  const storeNames = {
    chrome: "Chrome Web Store",
    edge: "Edge Add-ons",
    firefox: "Firefox Add-ons",
    opera: "Opera Add-ons"
  };

  const storeJsons = getJsonStoresFromCli();
  const storeEntries = Object.entries(storeJsons);
  const promises = storeEntries.map(([store, json]) => storeFuncs[store](json));
  try {
    await Promise.all(promises);
    storeEntries.forEach(([store, details]) => {
      const extId = details?.extId ?? details.packageId;
      console.log(`Successfully updated "${extId}" on ${storeNames[store]}!`);
    });
  } catch (e) {
    console.error(e);
  }
}

initCli().catch(console.error);

export async function deployChrome(options: ChromeOptions) {
  return new Promise((resolve, reject) =>
    prepareToDeployChrome(options).then(resolve).catch(reject)
  );
}

export async function deployFirefox(
  options: Omit<FirefoxOptions, "twoFactor">
): Promise<boolean> {
  (options as FirefoxOptions).twoFactor = argv.firefoxTwoFactor;
  if (argv.firefoxChangelog) {
    options.changelog = argv.firefoxChangelog;
  }
  if (argv.firefoxDevChangelog) {
    options.devChangelog = argv.firefoxDevChangelog;
  }
  return new Promise((resolve, reject) =>
    prepareToDeployFirefox(options).then(resolve).catch(reject)
  );
}

export async function deployOpera(
  options: Omit<OperaOptions, "twoFactor">
): Promise<boolean> {
  (options as OperaOptions).twoFactor = argv.operaTwoFactor;
  return new Promise((resolve, reject) =>
    prepareToDeployOpera(options).then(resolve).catch(reject)
  );
}
