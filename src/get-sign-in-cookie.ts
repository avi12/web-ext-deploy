import { config, parse } from "./dotenv.js";
import { createGitIgnoreIfNeeded, headersToEnv } from "./utils.js";
import fs from "node:fs";
import { chromium, Page } from "playwright";

function getFilename(site: string) {
  return `./${site}.env`;
}

function extractCookies(cookiesInput: string, cookiesToLogin: Array<string>) {
  return cookiesInput
    .split("; ")
    .filter(cookieName => cookieName.match(new RegExp("^(" + cookiesToLogin.join("|") + ")")))
    .map(cookieNameValuePair => {
      const [name, value] = cookieNameValuePair.split("=");
      return `${name}=${value}`;
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
}) {
  page.on("request", async data => {
    const { cookie } = await data.allHeaders();
    if (!cookie) {
      return;
    }
    const isRequiredCookiesExist = cookiesToLogin.every(cookieName => cookie.includes(` ${cookieName}=`));
    if (isRequiredCookiesExist && data.url() === urlToEnd) {
      resolve(extractCookies(cookie, cookiesToLogin));
    }
  });
}

async function saveOperaHeaders(page: Page) {
  const cookiesToLogin = ["sessionid", "csrftoken"];
  const url = "https://addons.opera.com/developer/";
  const cookiePromise = new Promise<string>(resolve => {
    void addNavigationListener({
      page,
      cookiesToLogin,
      resolve,
      urlToEnd: url
    });
  });
  await page.goto(url);
  return cookiePromise;
}

const siteFuncs: Record<string, typeof saveOperaHeaders> = { opera: saveOperaHeaders } as const;

function appendToEnv(filename: string, headers: string) {
  const { parsed: envCurrent = {} } = config({ path: filename });
  const envHeaders = parse(headers);
  const envNew = {
    ...envCurrent,
    ...envHeaders
  };
  fs.writeFileSync(filename, headersToEnv(envNew));
}

function getInvalidSite(siteNames: Array<string>) {
  return siteNames.find(site => !siteFuncs[site]);
}

export async function getSignInCookie(siteNames: Array<string>) {
  const invalidSite = getInvalidSite(siteNames);
  if (invalidSite) {
    throw new Error(`Invalid site: ${invalidSite}`);
  }

  const [width, height] = [1280, 720];
  const browser = await chromium.launch({ headless: false, args: [`--window-size=${width},${height}`] });
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
