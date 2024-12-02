import chalk from "chalk";
import dotenv from "dotenv";

import { chromium, Page } from "playwright";
import { SupportedGetCookies } from "./types.js";
import { createGitIgnoreIfNeeded, headersToEnv } from "./utils.js";
import fs from "fs";

function getFilename(site: SupportedGetCookies): string {
  return `./${site}.env`;
}

function extractCookies({
  cookiesInput,
  cookiesToLogin
}: {
  cookiesInput: string;
  cookiesToLogin: Array<string>;
}): string {
  return cookiesInput
    .split("; ")
    .filter(cookieName => cookieName.match(new RegExp("^(" + cookiesToLogin.join("|") + ")")))
    .map(cookieNameValuePair => {
      const [name, value] = cookieNameValuePair.split("=");
      return `${name.toUpperCase()}=${value}`;
    })
    .join("\n");
}

async function addNavigationListener({
  page,
  cookiesToLogin,
  urlToEnd,
  resolve
}: {
  page: Page;
  cookiesToLogin: Array<string>;
  urlToEnd: string;
  resolve: (value: PromiseLike<unknown> | unknown) => void;
}): Promise<void> {
  page.on("request", async data => {
    const { cookie } = await data.allHeaders();
    if (!cookie) {
      return;
    }
    const isRequiredCookiesExist = cookiesToLogin.every(cookieName => cookie.includes(` ${cookieName}=`));
    if (isRequiredCookiesExist && data.url() === urlToEnd) {
      resolve(extractCookies({ cookiesInput: cookie, cookiesToLogin }));
    }
  });
}

async function saveOperaHeaders(page: Page): Promise<string> {
  return new Promise(async resolve => {
    const cookiesToLogin = ["sessionid", "csrftoken"];
    const url = "https://addons.opera.com/developer/";
    await addNavigationListener({ page, cookiesToLogin, resolve, urlToEnd: url });
    await page.goto(url);
  });
}

const siteFuncs: Record<SupportedGetCookies, typeof saveOperaHeaders> = {
  opera: saveOperaHeaders
} as const;

function appendToEnv(filename: string, headers: string): void {
  const { parsed: envCurrent = {} } = dotenv.config({ path: filename });
  const envHeaders = dotenv.parse(headers);
  const envNew = { ...envCurrent, ...envHeaders };
  fs.writeFileSync(filename, headersToEnv(envNew));
}

function getInvalidSIte(siteNames: Array<SupportedGetCookies>): string {
  return siteNames.find(site => !siteFuncs[site]);
}

export async function getSignInCookie(siteNames: Array<SupportedGetCookies>): Promise<void> {
  const invalidSIte = getInvalidSIte(siteNames);
  if (invalidSIte) {
    throw new Error(`Invalid site: ${invalidSIte}`);
  }

  const [width, height] = [1280, 720];
  const browser = await chromium.launch({
    headless: false,
    args: [`--window-size=${width},${height}`] //, "--window-position=0,0"]
  });
  const context = await browser.newContext({
    viewport: { width, height }
  });

  for (const siteName of siteNames) {
    const page = await context.newPage();
    const pagesCurrent = context.pages();
    if (pagesCurrent.length > 1) {
      await pagesCurrent[0].close();
    }
    const headersTotal = await siteFuncs[siteName](page);
    appendToEnv(getFilename(siteName), headersTotal);
  }

  createGitIgnoreIfNeeded(siteNames);

  console.log(chalk.blue(`Info: Saved the login cookies of: ${siteNames.join(", ")}`));
}
