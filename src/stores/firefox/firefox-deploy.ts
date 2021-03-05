import { FirefoxOptions } from "./firefox-input";
import puppeteer, { Page } from "puppeteer";

import {
  disableImages,
  getExistingElementSelector,
  getFullPath,
  getVerboseMessage
} from "../../utils";

const store = "Firefox";
const gSelectors = {
  listErrors: ".errorlist",
  buttonNext: "button[type=submit]",
  inputFile: "input[type=file]",
  inputRadio: "input[type=radio]",
  inputChangelog: "textarea[name*=release_notes]",
  inputDevChangelog: "textarea[name=approval_notes]"
};

async function openRelevantExtensionPage({
  page,
  extId
}: {
  page: Page;
  extId: string;
}): Promise<boolean> {
  const urlSubmission = `${getBaseDashboardUrl(extId)}/versions/submit/`;

  const response = await page.goto(urlSubmission);
  return new Promise((resolve, reject) => {
    if (response.statusText() === "Forbidden") {
      reject(
        getVerboseMessage({
          store: "Firefox",
          prefix: "Error",
          message: `Extension ID does not exist: ${extId}`
        })
      );
      return;
    }
    resolve(true);
  });
}

async function uploadZip({
  page,
  zip,
  extId
}: {
  page: Page;
  zip: string;
  extId: string;
}): Promise<boolean> {
  const elInputFile = await page.$(gSelectors.inputFile);
  await elInputFile.uploadFile(zip);

  await page.$eval(gSelectors.buttonNext, elSubmit => {
    return new Promise(resolve => {
      new MutationObserver(() => {
        // @ts-ignore
        elSubmit.click();
        resolve(true);
      }).observe(elSubmit, {
        attributes: true,
        attributeFilter: ["disabled"]
      });
    });
  });

  const selectorExisting = await getExistingElementSelector(page, [
    gSelectors.listErrors,
    gSelectors.inputRadio
  ]);
  return new Promise(async (resolve, reject) => {
    if (!selectorExisting.includes(gSelectors.listErrors)) {
      resolve(true);
      return;
    }
    const errors = await page.$eval(gSelectors.listErrors, elErrors =>
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
}) {
  const uploadAnswer = isUpload ? "yes" : "no";
  await page.click(`input[type=radio][name=has_source][value=${uploadAnswer}]`);

  if (isUpload) {
    const elFileInput = await page.$(gSelectors.inputFile);
    await elFileInput.uploadFile(zipSource);
    await page.click(gSelectors.buttonNext);
  }
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
}) {
  await page.type(gSelectors.inputChangelog, changelog);

  if (isVerbose && changelog) {
    console.log(
      getVerboseMessage({
        store: "Firefox",
        message: `Added changelog: ${changelog}`
      })
    );
  }

  await page.type(gSelectors.inputDevChangelog, devChangelog);

  if (isVerbose && devChangelog) {
    console.log(
      getVerboseMessage({
        store: "Firefox",
        message: `Added changelog for reviewers: ${devChangelog}`
      })
    );
  }
}

function getBaseDashboardUrl(extId?: string) {
  let urlBase = "https://addons.mozilla.org/en-US/developers";
  if (extId) {
    urlBase += `/addon/${extId}`;
  }
  return urlBase;
}

async function addLoginCookie({
  page,
  sessionid
}: {
  page: Page;
  sessionid: string;
}) {
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

export default async function deployToFirefox({
  extId,
  zip,
  sessionid,
  zipSource,
  changelog,
  devChangelog,
  verbose: isVerbose
}: FirefoxOptions): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    const [width, height] = [1280, 720];
    const browser = await puppeteer.launch({
      // headless: false,
      // args: [`--window-size=${width},${height}`], //, "--window-position=0,0"],
      defaultViewport: { width, height }
    });

    const [page] = await browser.pages();

    const urlStart = getBaseDashboardUrl();

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Launched Puppeteer session in ${urlStart}`
        })
      );
    }

    await disableImages(page);
    await addLoginCookie({ page, sessionid });
    await page.goto(urlStart, { waitUntil: "networkidle0" });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: "Logged into the store"
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
          store,
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
          store,
          message: `Uploaded ZIP: ${zip}`
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
          store,
          message: `Uploaded source ZIP: ${zip}`
        })
      );
    }

    await addChangelogsIfNeeded({
      page,
      changelog,
      devChangelog,
      isVerbose
    });

    await page.click(gSelectors.buttonNext);
    console.log(
      getVerboseMessage({
        store,
        message: "Finished uploading"
      })
    );

    await browser.close();
    resolve(true);
  });
}
