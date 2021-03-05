import * as fs from "fs";
import * as path from "path";
import { Page } from "puppeteer";

export function getFullPath(file: string): string {
  return path.resolve(process.cwd(), file);
}

export function getIsFileExists(file: string): boolean {
  return fs.existsSync(getFullPath(file));
}

export function isObjectEmpty(object: object) {
  return Object.keys(object).length === 0;
}

export function getCorrectZip(zip: string): string {
  const { version } = require(path.resolve(process.cwd(), "package.json"));
  return zip.replace("{version}", version);
}

export async function disableImages(page: Page) {
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

export function getVerboseMessage({
  message,
  prefix = "Info",
  store
}: {
  message: string;
  prefix?: string;
  store: string;
}): string {
  let msg = `${store}: ${message}`;
  if (prefix !== "Error") {
    msg = `${prefix} ${msg}`;
  }
  if (!message.startsWith("Enter")) {
    msg = "\n" + msg + "\n";
  }
  if (prefix === "") {
    msg = msg.trim();
  } else if (prefix === "Error") {
    msg = msg.trimLeft();
  }
  return msg;
}
