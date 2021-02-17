#!/usr/bin/env node
import { IFirefox } from "./utils";
import deployToFirefox from "./stores/firefox";

import * as yargs from "yargs";
import * as path from "path";

import cli from "./cli";

const { argv } = yargs(process.argv.slice(2)).options({
  firefoxTwoFactor: { type: "number" },
  operaTwoFactor: { type: "number" }
});

// TODO: Proper if statement
if (false) {
  cli();
}

export async function deployFirefox(jsonStore: Omit<IFirefox, "twoFactor">) {
  try {
    const { version } = await import(path.resolve(process.cwd(), jsonStore.packageJson || "package.json"));
    jsonStore.zip = jsonStore.zip.replace("{version}", version);
    jsonStore.zipSource = jsonStore.zipSource.replace("{version}", version);
    await deployToFirefox({ ...jsonStore, twoFactor: argv.firefoxTwoFactor });
    return true;
  } catch (e) {
    throw new Error(e);
  }
}
