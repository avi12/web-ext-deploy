import puppeteer, { Page } from "puppeteer";
import {
  disableImages,
  getExistingElementSelector,
  getFullPath,
  getVerboseMessage,
  logSuccessfullyPublished
} from "../../utils.js";
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
  const elInputFile = await page.$(SELECTORS.inputFile);
  await elInputFile.uploadFile(zip);

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

  const selectorExisting = await getExistingElementSelector(page, [SELECTORS.listErrors, SELECTORS.inputRadio]);
  return new Promise(async (resolve, reject) => {
    if (!selectorExisting.includes(SELECTORS.listErrors)) {
      resolve(true);
      return;
    }
    const errors = await page.$eval(SELECTORS.listErrors, elErrors =>
      // @ts-ignore
      [...elErrors.children]
        .map(elError => elError.textContent.trim())
        .map(error => {
          if (error.includes("already exists")) {
            return error.split(". ")[0];
          }
          return error;
        })
    );
    const prefixError = errors.length > 1 ? "Errors" : "";
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

async function uploadZipSourceIfNeeded({
  page,
  zipSource,
  isUpload
}: {
  page: Page;
  zipSource: string;
  isUpload: boolean;
}): Promise<void> {
  const uploadAnswer = isUpload ? "yes" : "no";
  await page.click(`input[type=radio][name=has_source][value=${uploadAnswer}]`);

  if (isUpload) {
    const elFileInput = await page.$(SELECTORS.inputFile);
    await elFileInput.uploadFile(zipSource);
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

async function addLoginCookie({ page, sessionid }: { page: Page; sessionid: string }): Promise<void> {
  const domain = "addons.mozilla.org";
  const cookies = [
    {
      name: "sessionid",
      value: sessionid,
      domain
    }
  ];
  await page.setCookie(...cookies);
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
    const puppeteerArgs =
      process.env.NODE_ENV === "development"
        ? {
            headless: false,
            defaultViewport: { width, height },
            args: [`--window-size=${width},${height}`] //, "--window-position=0,0"]
          }
        : {};
    const browser = await puppeteer.launch(puppeteerArgs);

    const [page] = await browser.pages();
    await disableImages(page);
    await addLoginCookie({ page, sessionid });
    const urlStart = getBaseDashboardUrl(extId);

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Launched a Puppeteer session in ${urlStart}`
        })
      );
    }

    await page.goto(urlStart, { waitUntil: "networkidle0" });

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

    await uploadZipSourceIfNeeded({
      page,
      zipSource: getFullPath(zipSource),
      isUpload: Boolean(zipSource)
    });

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
