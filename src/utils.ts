import chalk from "chalk";
import zipper from "zip-local";
import type { SupportedStores, SupportedStoresCapitalized } from "./types.js";
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

export function getExtJson(zip: string): Record<string, any> {
  const unzippedFs = zipper.sync.unzip(zip).memory();
  const manifest = unzippedFs.read("manifest.json", "text");
  return JSON.parse(manifest);
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
  const storeNames: Record<SupportedStores, string> = {
    chrome: "Chrome Web Store",
    edge: "Edge Add-ons",
    firefox: "Firefox Add-ons",
    opera: "Opera Add-ons"
  };
  const { name, version } = getExtJson(zip);
  const storeName = storeNames[store] || store;
  console.log(chalk.green(`Successfully updated "${extId}" (${name}) to version ${version} on ${storeName}! ✔`));
}

const stepCounter: Record<SupportedStoresCapitalized, number> = {};

export function getErrorMessage({
  store,
  zip,
  error = "",
  actionName
}: {
  store: SupportedStoresCapitalized;
  zip: string;
  error?: number | string;
  actionName: string;
}): string {
  return getVerboseMessage({
    store,
    prefix: "Error",
    message: `Failed to ${actionName} ${getExtJson(zip).name}: ${error}`.trim()
  });
}

export function getVerboseMessage({
  message,
  prefix = "Info",
  store
}: {
  message: string;
  prefix?: "Info" | "Error" | "Warning";
  store: SupportedStoresCapitalized;
}): string {
  stepCounter[store] = 1 + (stepCounter?.[store] ?? 0);

  const messageFull = `${prefix} ${store}: Step ${stepCounter[store]}) ${message}`;
  if (prefix === "Error") {
    return chalk.red(messageFull.trimStart());
  }
  return messageFull.trim();
}

export function createGitIgnoreIfNeeded(stores: Array<SupportedStores>): void {
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

export function headersToEnv(headersTotal: Record<string, unknown>): string {
  return Object.entries(headersTotal)
    .map(([header, value]) => `${header}="${value}"`)
    .join("\n");
}
