import type { StoreName } from "../types.js";
import { config, parse } from "../utils/dotenv.js";
import { createGitIgnoreIfNeeded, headersToEnv } from "../utils/helpers.js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { chromium, Page } from "playwright";

function getFilename(site: string) {
  return `./${site}.env`;
}

function extractCookies(cookiesInput: string, cookiesToLogin: string[]) {
  return cookiesInput
    .split("; ")
    .filter(cookieName => cookieName.match(new RegExp("^(" + cookiesToLogin.join("|") + ")")))
    .map(cookieNameValuePair => {
      const [name, value] = cookieNameValuePair.split("=");
      return `${name}=${value}`;
    })
    .join("\n");
}

async function saveOperaHeaders(page: Page) {
  const cookiesToLogin = ["sessionid", "csrftoken"];
  const url = "https://addons.opera.com/developer/";

  const cookiePromise = new Promise<string>((resolve, reject) => {
    let done = false;

    page.on("request", async request => {
      if (done) {
        return;
      }

      let cookie: string | undefined;
      try {
        ({ cookie } = await request.allHeaders());
      } catch {
        return;
      }

      if (!cookie) {
        return;
      }

      const isRequiredCookiesExist = cookiesToLogin.every(cookieName => cookie!.includes(` ${cookieName}=`));
      if (isRequiredCookiesExist && request.url() === url) {
        done = true;
        resolve(extractCookies(cookie, cookiesToLogin));
      }
    });

    page.on("close", () => {
      if (!done) {
        reject(new Error("Browser page closed before cookies were captured"));
      }
    });
  });

  await page.goto(url);
  return cookiePromise;
}

const siteFuncs: Record<string, typeof saveOperaHeaders> = { opera: saveOperaHeaders };

function normalizeKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toUpperCase(), value]));
}

function appendToEnv(filename: string, headers: string) {
  const { parsed: envCurrent = {} } = config({ path: filename });
  const envNew = {
    ...normalizeKeys(envCurrent),
    ...normalizeKeys(parse(headers))
  };
  fs.writeFileSync(filename, headersToEnv(envNew));
}

export async function getSignInCookie(siteNames: StoreName[]) {
  const width = 1280;
  const height = 720;
  const launchOptions = { headless: false, args: [`--window-size=${width},${height}`] };
  const browser = await chromium.launch(launchOptions).catch(async error => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("npx playwright install")) {
      throw error;
    }

    execSync("npx playwright install", { stdio: "inherit" });
    return chromium.launch(launchOptions);
  });
  const context = await browser.newContext({ viewport: { width, height } });

  for (const siteName of siteNames) {
    const page = await context.newPage();
    const pagesCurrent = context.pages();
    if (pagesCurrent.length > 1) {
      await pagesCurrent[0].close();
    }

    const headersTotal = await siteFuncs[siteName](page);
    appendToEnv(getFilename(siteName), headersTotal);
  }

  await browser.close();
  createGitIgnoreIfNeeded(siteNames);
}
