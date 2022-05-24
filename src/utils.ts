import * as fs from "fs";
import * as path from "path";
import { Page } from "puppeteer";
import zipper from "zip-local";

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

  const { version = "" } = JSON.parse(
    fs.readFileSync("package.json").toString()
  );
  return zipName.replace("{version}", version);
}

function getExtJson(zip: string): JSON {
  const unzippedFs = zipper.sync.unzip(zip).memory();
  const manifest = unzippedFs.read("manifest.json", "text");
  return JSON.parse(manifest);
}

export function getExtInfo(zip: string, info: string): any {
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
  const storeNames = {
    chrome: "Chrome Web Store",
    edge: "Edge Add-ons",
    firefox: "Firefox Add-ons",
    opera: "Opera Add-ons"
  };
  const extName = getExtInfo(zip, "name");
  const extVersion = getExtInfo(zip, "version");
  const storeName = storeNames[store] || store;
  console.log(
    `Successfully updated "${extId}" (${extName}) to version ${extVersion} on ${storeName}!`
  );
}

export async function disableImages(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (request.resourceType() === "image") {
      request.abort();
      return;
    }
    request.continue();
  });
}

export async function getExistingElementSelector(
  page: Page,
  selectors: string[]
): Promise<string> {
  const promises = selectors.map(selector => page.waitForSelector(selector));
  const {
    // @ts-ignore
    _remoteObject: { description }
  } = await Promise.race(promises);
  return description;
}

const gStepCounters = {};

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
    msg = msg.trimLeft();
  }
  return msg;
}

export function createGitIgnoreIfNeeded(stores: string[]): void {
  const filename = ".gitignore";
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, "*.env");
    return;
  }

  const gitIgnoreCurrent = fs.readFileSync(filename).toString();
  if (gitIgnoreCurrent.includes(".env")) {
    if (gitIgnoreCurrent.includes("*.env")) {
      return;
    }

    fs.appendFileSync(filename, stores.map(store => `${store}.env`).join("\n"));
    return;
  }

  fs.appendFileSync(filename, "*.env");
}

export function headersToEnv(headersTotal: object): string {
  return Object.entries(headersTotal)
    .map(([header, value]) => `${header}="${value}"`)
    .join("\n");
}
