import { BrowserContext, chromium, Page } from "playwright";
import { getFullPath, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";
import { FirefoxOptions } from "./firefox-input.js";

const STORE = "Firefox";
const SELECTORS = {
  listErrors: ".errorlist",
  buttonSubmit: "button[type=submit]",
  inputFile: "input[type=file]",
  inputRadio: "input[type=radio]",
  inputChangelog: "textarea[name*=release_notes]",
  inputDevChangelog: "textarea[name=approval_notes]"
} as const;

async function openRelevantExtensionPage({ page, extId }: { page: Page; extId: string }): Promise<boolean> {
  const urlSubmission = `${getBaseDashboardUrl(extId)}/versions/submit/`;

  const response = await page.goto(urlSubmission);
  return new Promise((resolve, reject) => {
    if (response.statusText() === "Forbidden") {
      reject(
        getVerboseMessage({
          store: "Firefox",
          message: `Extension ID does not exist: ${extId}`,
          prefix: "Error"
        })
      );
      return;
    }
    resolve(true);
  });
}

async function uploadZip({ page, zip, extId }: { page: Page; zip: string; extId: string }): Promise<boolean> {
  const elInputFile = page.locator(SELECTORS.inputFile);
  await elInputFile.setInputFiles(zip);

  await page.$eval(SELECTORS.buttonSubmit, (elSubmit: HTMLButtonElement) => {
    return new Promise(resolve => {
      new MutationObserver(() => {
        elSubmit.click();
        resolve(true);
      }).observe(elSubmit, {
        attributes: true,
        attributeFilter: ["disabled"]
      });
    });
  });

  await page.waitForSelector(`${SELECTORS.listErrors}, ${SELECTORS.inputRadio}`);
  const selectorExisting = page.locator(SELECTORS.inputRadio) ? SELECTORS.inputRadio : SELECTORS.listErrors;

  return new Promise(async (resolve, reject) => {
    if (selectorExisting === SELECTORS.inputRadio) {
      resolve(true);
      return;
    }

    const errors = await page.evaluate(
      selListErrors => [...document.querySelector(selListErrors).children].map(elError => elError.textContent.trim()),
      SELECTORS.listErrors
    );
    const prefixError = errors.length > 1 ? "Errors " : "";
    reject(
      getVerboseMessage({
        store: "Firefox",
        prefix: prefixError,
        message: `${prefixError}at the upload of "${extId}":
      ${errors.join("\n")}
      `
      })
    );
  });
}

async function uploadZipSourceIfNeeded({ page, zipSource }: { page: Page; zipSource: string }): Promise<void> {
  const isUpload = Boolean(zipSource);
  const uploadAnswer = isUpload ? "yes" : "no";
  await page.click(`input[type=radio][name=has_source][value=${uploadAnswer}]`);

  if (isUpload) {
    const elFileInput = page.locator(SELECTORS.inputFile);
    await elFileInput.setInputFiles(getFullPath(zipSource));
  }
  await page.click(SELECTORS.buttonSubmit);
}

async function addChangelogsIfNeeded({
  page,
  changelog,
  devChangelog,
  isVerbose
}: {
  page: Page;
  changelog: string;
  devChangelog: string;
  isVerbose: boolean;
}): Promise<void> {
  if (changelog || devChangelog) {
    await page.waitForSelector(SELECTORS.inputChangelog);
  }
  if (changelog) {
    await page.type(SELECTORS.inputChangelog, changelog);
    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: "Firefox",
          message: `Added changelog: ${changelog}`
        })
      );
    }
  }

  if (devChangelog) {
    await page.type(SELECTORS.inputDevChangelog, devChangelog);
    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: "Firefox",
          message: `Added changelog for reviewers: ${devChangelog}`
        })
      );
    }
  }
}

function getBaseDashboardUrl(extId?: string): string {
  let urlBase = "https://addons.mozilla.org/en-US/developers";
  if (extId) {
    urlBase += `/addon/${extId}`;
  }
  return urlBase;
}

async function addLoginCookie({ context, sessionid }: { context: BrowserContext; sessionid: string }): Promise<void> {
  const domain = "addons.mozilla.org";
  await context.addCookies([
    {
      domain,
      path: "/",
      name: "sessionid",
      value: sessionid
    }
  ]);
}

async function verifyValidCookies({ page }: { page: Page }): Promise<true> {
  return new Promise(async (resolve, reject) => {
    if (page.url().startsWith(getBaseDashboardUrl())) {
      resolve(true);
      return;
    }
    reject(
      getVerboseMessage({
        store: STORE,
        message: "Invalid/expired cookie. Please get a new one, e.g. by running: web-ext-deploy --get-cookies=firefox",
        prefix: "Error"
      })
    );
  });
}

async function updateExtension({ page }: { page: Page }): Promise<void> {
  await page.waitForSelector(SELECTORS.buttonSubmit);
  await page.click(SELECTORS.buttonSubmit);
}

export default async function deployToFirefox({
  extId,
  zip,
  sessionid,
  zipSource = "",
  changelog = "",
  devChangelog = "",
  verbose: isVerbose
}: FirefoxOptions): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    const [width, height] = [1280, 720];
    const isDev = process.env.NODE_ENV === "development";
    const browser = await chromium.launch(
      isDev && {
        headless: false,
        args: [`--window-size=${width},${height}`] //, "--window-position=0,0"]
      }
    );
    const context = await browser.newContext(isDev && { viewport: { width, height } });

    await addLoginCookie({ context, sessionid });
    const page = await context.newPage();
    const urlStart = getBaseDashboardUrl(extId);

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Launched a Playwright session in ${urlStart}`
        })
      );
    }

    await page.goto(urlStart);

    try {
      await verifyValidCookies({ page });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: "Opened relevant extension page"
        })
      );
    }

    try {
      await openRelevantExtensionPage({ page, extId: extId.trim() });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Opened extension page of ${extId}`
        })
      );
    }

    try {
      await uploadZip({
        page,
        zip: getFullPath(zip),
        extId: extId.trim()
      });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Uploading ZIP: ${zip}`
        })
      );
    }

    await uploadZipSourceIfNeeded({ page, zipSource });

    if (isVerbose && zipSource) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Uploading source ZIP: ${zip}`
        })
      );
    }

    await addChangelogsIfNeeded({
      page,
      changelog,
      devChangelog,
      isVerbose
    });

    if (isVerbose && zipSource) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: ("Uploaded ZIP " + (zipSource ? "and source ZIP" : "")).trim()
        })
      );
    }

    await updateExtension({ page });

    logSuccessfullyPublished({ extId, store: STORE, zip });

    await browser.close();
    resolve(true);
  });
}
