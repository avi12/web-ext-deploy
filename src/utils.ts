import chalk from "chalk";
import zipper from "zip-local";
import { Stores } from "./types.js";
import fs from "fs";
import path from "path";

export function getFullPath(file: string): string {
  return path.resolve(process.cwd(), file);
}

export function getIsFileExists(file: string): boolean {
  return fs.existsSync(getFullPath(file));
}

export function isObjectEmpty(object: object): boolean {
  return Object.keys(object).length === 0;
}

export function getCorrectZip(zipName: string): string {
  if (!getIsFileExists("package.json")) {
    return zipName;
  }

  const { version = "" } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  return zipName.replace("{version}", version);
}

function getExtJson(zip: string): JSON {
  const unzippedFs = zipper.sync.unzip(zip).memory();
  const manifest = unzippedFs.read("manifest.json", "text");
  return JSON.parse(manifest);
}

export function getExtInfo(zip: string, info: string): unknown {
  return getExtJson(zip)[info];
}

export function logSuccessfullyPublished({
  extId,
  store,
  zip
}: {
  extId: string | number;
  store: string;
  zip: string;
}): void {
  const storeNames: {
    [store in typeof Stores[number]]: string;
  } = {
    chrome: "Chrome Web Store",
    edge: "Edge Add-ons",
    firefox: "Firefox Add-ons",
    opera: "Opera Add-ons"
  };
  const { name, version } = getExtJson(zip) as JSON & { name: string; version: string };
  const storeName = storeNames[store] || store;
  console.log(chalk.green(`Successfully updated "${extId}" (${name}) to version ${version} on ${storeName}! ✔`));
}

const gStepCounters = {};

export function getErrorMessage({
  store,
  zip,
  error = "",
  actionName
}: {
  store: "Chrome" | "Edge" | "Firefox" | "Opera";
  zip: string;
  error?: number | string;
  actionName: string;
}): string {
  return getVerboseMessage({
    store,
    prefix: "Error",
    message: `Failed to ${actionName} ${getExtInfo(zip, "name")}: ${error}`.trim()
  });
}

export function getVerboseMessage({
  message,
  prefix,
  store
}: {
  message: string;
  prefix?: string;
  store: string;
}): string {
  gStepCounters[store] = 1 + (gStepCounters?.[store] ?? 0);
  let msg = `${store}: Step ${gStepCounters[store]}) ${message}`;
  if (prefix !== "Error") {
    prefix = prefix || "Info";
    msg = `${prefix} ${msg}`;
  }
  if (prefix === "Info") {
    msg = msg.trim();
  } else if (prefix === "Error") {
    msg = chalk.red(msg.trimStart());
  }
  return msg;
}

export function createGitIgnoreIfNeeded(stores: string[]): void {
  const filename = ".gitignore";
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, "*.env");
    return;
  }

  const gitIgnoreCurrent = fs.readFileSync(filename, "utf8");
  if (gitIgnoreCurrent.includes(".env")) {
    if (gitIgnoreCurrent.includes("*.env")) {
      return;
    }

    const storesToAppend = stores.filter(store => !gitIgnoreCurrent.includes(`${store}.env`));
    fs.appendFileSync(filename, storesToAppend.map(store => `${store}.env`).join("\n"));
    return;
  }

  fs.appendFileSync(filename, "*.env");
}

export function headersToEnv(headersTotal: object): string {
  return Object.entries(headersTotal)
    .map(([header, value]) => `${header}="${value}"`)
    .join("\n");
}
