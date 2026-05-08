import { StoreName } from "../../types.js";
import { config, parse } from "../../utils/dotenv.js";
import { createGitIgnoreIfNeeded, headersToEnv } from "../../utils/helpers.js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { chromium, type Page } from "playwright";

const CREDENTIALS_FILE = `${StoreName.Opera}.env`;
const COOKIE_NAMES = ["sessionid", "csrftoken"] as const;
const DEVELOPER_URL = "https://addons.opera.com/developer/";

function extractCookies(cookiesInput: string) {
  return cookiesInput
    .split("; ")
    .filter(cookieName => cookieName.match(new RegExp("^(" + COOKIE_NAMES.join("|") + ")")))
    .map(cookieNameValuePair => {
      const [name, value] = cookieNameValuePair.split("=");
      return `${name}=${value}`;
    })
    .join("\n");
}

async function captureCookiesFromBrowser(page: Page) {
  const cookiePromise = new Promise<string>((resolve, reject) => {
    let isDone = false;

    page.on("request", async request => {
      if (isDone) {
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

      const hasAllCookies = COOKIE_NAMES.every(name => new RegExp(`(^|; )${name}=`).test(cookie!));
      const isDeveloperRequest = request.url() === DEVELOPER_URL;
      if (hasAllCookies && isDeveloperRequest) {
        isDone = true;
        resolve(extractCookies(cookie));
      }
    });

    page.on("close", () => {
      if (!isDone) {
        reject(new Error("Browser page closed before cookies were captured"));
      }
    });
  });

  await page.goto(DEVELOPER_URL);
  return cookiePromise;
}

function saveToEnvFile(cookiesRaw: string) {
  const { parsed: envCurrent = {} } = config({ path: CREDENTIALS_FILE });
  const envNew = {
    ...Object.fromEntries(Object.entries(envCurrent).map(([key, value]) => [key.toUpperCase(), value])),
    ...Object.fromEntries(Object.entries(parse(cookiesRaw)).map(([key, value]) => [key.toUpperCase(), value]))
  };
  fs.writeFileSync(CREDENTIALS_FILE, headersToEnv(envNew));
}

export async function fetchOperaCredentials(saveToEnv: boolean): Promise<Record<string, string>> {
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
  const page = await context.newPage();

  const cookiesRaw = await captureCookiesFromBrowser(page);
  await browser.close();

  if (saveToEnv) {
    saveToEnvFile(cookiesRaw);
    createGitIgnoreIfNeeded([StoreName.Opera]);
  }

  return parse(cookiesRaw);
}
