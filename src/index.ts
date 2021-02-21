#!/usr/bin/env node
import yargs from "yargs";
import {
  // eslint-disable-next-line no-unused-vars
  FirefoxOptions,
  prepareToDeployFirefox,
} from "./stores/firefox/firefox-input";
import { getJsonStoresFromCli } from "./cli";

const isUseCli = Boolean(
  process.argv[1].match(/web-ext-deploy[\\/]dist[\\/]index\.js$/)
);

const { argv } = yargs(process.argv.slice(2)).options({
  env: { type: "boolean", default: false },
  firefoxTwoFactor: { type: "number" },
  firefoxChangelog: { type: "string" },
  firefoxDevChangelog: { type: "string" },
  operaTwoFactor: { type: "number" },
  verbose: { type: "boolean" },
});

async function initCli() {
  if (!isUseCli) {
    return;
  }
  return new Promise((_, reject) => {
    const jsonStores = getJsonStoresFromCli();
    if (jsonStores.firefox) {
      deployFirefox(jsonStores.firefox).catch(reject);
    }
    return true;
  });
}

initCli().catch(console.error);

export async function deployFirefox(
  options: Omit<FirefoxOptions, "twoFactor">
): Promise<boolean | string> {
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
