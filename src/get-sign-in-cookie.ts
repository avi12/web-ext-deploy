import puppeteer, { Page } from "puppeteer";
import fs from "fs";
import dotenv from "dotenv";

export class SitesLogin {
  /** The site to retrieve the publisher account's login cookie. */
  siteName: "firefox" | "edge" | "opera";

  private urls = {
    firefox: "https://addons.mozilla.org/en-US/developers/",
    edge:
      "https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview",
    opera: "https://addons.opera.com/developer"
  };

  private selectors = {
    firefox: "a.Button"
  };

  private urlWatchers = {
    firefox: "/developers/"
  };

  private headers = {
    firefox: ["Sec-Fetch-Site", "Cookie"]
  };

  constructor(siteName: string) {
    // @ts-ignore
    this.siteName = siteName;

    if (!this.url) {
      const stores = Object.keys(this.urls);
      throw new Error(`Supported sites: ${stores.join(", ")}`);
    }
  }

  get url() {
    return this.urls[this.siteName];
  }

  get selectorToWait() {
    return this.selectors[this.siteName];
  }

  get urlWatch() {
    return this.urlWatchers[this.siteName];
  }

  get getHeaders() {
    return this.headers[this.siteName];
  }

  extractHeaders(headers) {
    return Object.entries(headers)
      .filter(([header]) => this.getHeaders.includes(header))
      .reduce((obj, [header, value]) => ({ ...obj, [header]: value }));
  }
}

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
    const isUrlMatch = url => url.endsWith("/developer/");
    const regexCookies = /sessionid|csrftoken/;
    const extractCookies = cookies =>
      cookies
        .split("; ")
        .filter(cookie =>
          cookie.match(new RegExp("^(" + regexCookies.source + ")"))
        )
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
      const isRequiredCookiesExist = request.headers?.Cookie?.match(
        regexCookies
      );

      if (isRequiredCookiesExist && isUrlMatch(request.url)) {
        resolve(extractCookies(request.headers.Cookie));
      }

      await devtools.send("Fetch.continueRequest", { requestId });
    });

    await page.goto(url);
  });
}
async function saveEdgeHeaders(page: Page): Promise<string> {
  return new Promise(async resolve => {
    const url =
      "https://partner.microsoft.com/dashboard/microsoftedge/overview";
    const isUrlMatch = url => url.endsWith("/overview");
    const nameCookie = ".AspNet.Cookies";
    const extractCookies = cookies => {
      const value = cookies
        .split("; ")
        .find(cookie => cookie.startsWith(nameCookie))
        .split("=")[1];

      return `cookie=${value}`;
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
      const isRequiredCookiesExist = request.headers?.Cookie?.includes(
        nameCookie
      );

      if (isRequiredCookiesExist && isUrlMatch(request.url)) {
        resolve(extractCookies(request.headers.Cookie));
      }

      await devtools.send("Fetch.continueRequest", { requestId });
    });

    await page.goto(url);
  });
}

const siteFuncs = {
  firefox: saveFirefoxHeaders,
  opera: saveOperaHeaders,
  edge: saveEdgeHeaders
};

function headersToEnv(headersTotal: object) {
  return Object.entries(headersTotal)
    .map(([header, value]) => `${header}="${value}"`)
    .join("\n");
}

function appendToEnv(filename: string, headers: string) {
  const { parsed: envCurrent = {} } = dotenv.config({ path: filename });
  const envHeaders = dotenv.parse(headers);
  const envNew = { ...envCurrent, ...envHeaders };
  fs.writeFileSync(filename, headersToEnv(envNew));
}

function getInvalidSIte(siteNames: string[]) {
  return siteNames.find(site => !siteFuncs[site]);
}

function createGitIgnoreIfNeeded(stores: string[]) {
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
