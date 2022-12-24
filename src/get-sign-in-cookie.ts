import puppeteer, { Page } from "puppeteer";
import fs from "fs";
import dotenv from "dotenv";
import { createGitIgnoreIfNeeded, headersToEnv } from "./utils";

function getFilename(site) {
  return `./${site}.env`;
}

async function saveFirefoxHeaders(page: Page): Promise<string> {
  return new Promise(async resolve => {
    const url = "https://addons.mozilla.org/en-US/developers/";
    const selLogin = "a.Button";
    const isUrlMatch = url => url.endsWith("/developers/");
    const nameCookie = "sessionid";
    const extractCookies = cookies => {
      const value = cookies
        .split("; ")
        .find(cookie => cookie.startsWith(nameCookie))
        .split("=")[1];

      return `${nameCookie}=${value}`;
    };

    const devtools = await page.target().createCDPSession();

    await devtools.send("Fetch.enable", {
      patterns: [
        {
          resourceType: "Document"
        }
      ]
    });

    devtools.on("Fetch.requestPaused", async ({ requestId, request }) => {
      const isRequiredHeadersExist = Boolean(request.headers.Cookie);

      if (isRequiredHeadersExist && isUrlMatch(request.url)) {
        resolve(extractCookies(request.headers.Cookie));
      }
      await devtools.send("Fetch.continueRequest", { requestId });
    });

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.click(selLogin);
  });
}

async function saveOperaHeaders(page: Page): Promise<string> {
  return new Promise(async resolve => {
    const url = "https://addons.opera.com/developer/";
    const cookiesToLogin = ["sessionid", "csrftoken"];
    const extractCookies = cookiesInput =>
      cookiesInput
        .split("; ")
        .filter(cookie => cookie.match(new RegExp("^(" + cookiesToLogin.join("|") + ")")))
        .join("\n");
    const devtools = await page.target().createCDPSession();

    await devtools.send("Fetch.enable", {
      patterns: [
        {
          resourceType: "Document"
        }
      ]
    });

    devtools.on("Fetch.requestPaused", async ({ requestId, request }) => {
      const isRequiredCookiesExist = cookiesToLogin.every(cookie =>
        request.headers?.Cookie?.match(new RegExp(` ${cookie}=`))
      );

      if (isRequiredCookiesExist) {
        resolve(extractCookies(request.headers.Cookie));
      }

      await devtools.send("Fetch.continueRequest", { requestId });
    });

    await page.goto(url);
  });
}

const siteFuncs = {
  firefox: saveFirefoxHeaders,
  opera: saveOperaHeaders
} as const;

function appendToEnv(filename: string, headers: string) {
  const { parsed: envCurrent = {} } = dotenv.config({ path: filename });
  const envHeaders = dotenv.parse(headers);
  const envNew = { ...envCurrent, ...envHeaders };
  fs.writeFileSync(filename, headersToEnv(envNew));
}

function getInvalidSIte(siteNames: string[]) {
  return siteNames.find(site => !siteFuncs[site]);
}

export async function getSignInCookie(siteNames: string[]) {
  const invalidSIte = getInvalidSIte(siteNames);
  if (invalidSIte) {
    throw new Error(`Invalid site: ${invalidSIte}`);
  }

  const [width, height] = [1280, 720];
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width, height },
    args: [`--window-size=${width},${height}`] //, "--window-position=0,0"]
  });

  for (let i = 0; i < siteNames.length; i++) {
    const siteName = siteNames[i];
    let [page] = await browser.pages();
    if (page.url() !== "about:blank") {
      page = await browser.newPage();
    }

    const pagesCurrent = await browser.pages();
    if (pagesCurrent.length > 1) {
      await pagesCurrent[0].close();
    }
    const headersTotal = await siteFuncs[siteName](page);
    appendToEnv(getFilename(siteName), headersTotal);
  }

  await browser.close();

  createGitIgnoreIfNeeded(siteNames);

  console.log(`Info: Saved the login cookies of: ${siteNames}`);
}
