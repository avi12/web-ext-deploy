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

export async function getEvaluation(
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

export async function clearInput(page: Page, selector: string) {
  const elInput = await page.$(selector);
  await elInput.click();
  await elInput.focus();
  await elInput.click({ clickCount: 3 });
  await elInput.press("Backspace");
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
  const msg = `${prefix} ${store}: ${message}`;
  if (prefix === "") {
    return msg.trim();
  }
  return msg;
}
