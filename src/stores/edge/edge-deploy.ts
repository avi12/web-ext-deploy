import puppeteer, { Page } from "puppeteer";
import { EdgeOptions } from "./edge-input";
import { disableImages, getExtVersion, getVerboseMessage } from "../../utils";
import compareVersions from "compare-versions";

const store = "Edge";

const gSelectors = {
  extName: ".extension-name",
  inputFile: "input[type=file]",
  buttonPublishText: ".win-icon-Publish",
  buttonPublish: "#publishButton",
  imgCheckmarkSecondary: ".win-color-fg-secondary",
  errorIncompleteTranslations: `[data-l10n-key="Common_Incomplete"]`,
  buttonPackageNext: "[data-l10n-key=Package_Next]",
  buttonSubmissionUpdate: "[data-l10n-key=Common_Text_Update]",
  buttonSubmissionEdit: "[data-l10n-key=Common_Text_Edit]",
  inputDevChangelog: "textarea"
};

function getBaseDashboardUrl(extId: string) {
  return `https://partner.microsoft.com/en-us/dashboard/microsoftedge/${extId}`;
}

async function openRelevantExtensionPage({
  page,
  extId
}: {
  page: Page;
  extId: any;
}) {
  return new Promise(async (resolve, reject) => {
    const responseListener = response => {
      if (!response.url().endsWith("lastUploadedPackage")) {
        const isCookieInvalid = response
          .url()
          .startsWith("https://login.microsoftonline.com");
        if (isCookieInvalid) {
          reject(
            getVerboseMessage({
              store,
              message:
                "Invalid/expired cookie. Please get a new one, e.g. by running: web-ext-deploy --get-cookies=edge",
              prefix: "Error"
            })
          );
        }
        return;
      }
      const error = 400;
      const isExtIdValid = response.status() !== error;
      if (isExtIdValid) {
        page.off("response", responseListener);
        return;
      }
      reject(
        getVerboseMessage({
          store,
          message: `Extension with ID "${extId}" does not exist`,
          prefix: "Error"
        })
      );
    };
    page.on("response", responseListener);

    page
      .goto(`${getBaseDashboardUrl(extId)}/packages/overview`)
      .then(() => resolve(true))
      .catch(() => {});
  });
}

async function getCurrentVersion({ page }: { page: Page }): Promise<string> {
  await page.waitForSelector(gSelectors.extName);
  return page.$eval(gSelectors.extName, (elExtName: HTMLDivElement) =>
    elExtName.lastElementChild.textContent.trim()
  );
}

async function uploadZip({
  page,
  zip,
  extId
}: {
  page: Page;
  zip: string;
  extId: string;
}) {
  await page.goto(`${getBaseDashboardUrl(extId)}/packages`, {
    waitUntil: "networkidle0"
  });
  const elInputFile = await page.$(gSelectors.inputFile);
  await elInputFile.uploadFile(zip);
}

async function verifyNewVersionIsGreater({
  page,
  zip
}: {
  page: Page;
  zip: string;
}) {
  const versionCurrent = await getCurrentVersion({ page });
  const versionNew = getExtVersion(zip);

  return new Promise(async (resolve, reject) => {
    // @ts-ignore
    if (compareVersions(versionNew, versionCurrent, ">")) {
      resolve(true);
      return;
    }
    reject(
      getVerboseMessage({
        store,
        message: `The new version (${versionNew}) must be greater than the current version (${versionCurrent})`,
        prefix: "Error"
      })
    );
  });
}

async function addLoginCookie({
  page,
  cookie
}: {
  page: Page;
  cookie: string;
}) {
  const domain = "partner.microsoft.com";
  const cookies = [
    {
      name: ".AspNet.Cookies",
      value: cookie,
      domain
    }
  ];
  await page.setCookie(...cookies);
}

async function clickButtonNext({ page }: { page: Page }) {
  await page.$eval(
    gSelectors.buttonPackageNext,
    (elPackageNext: HTMLButtonElement) => {
      return new Promise(resolve => {
        new MutationObserver(() => resolve(true)).observe(elPackageNext, {
          attributes: true,
          attributeFilter: ["disabled"]
        });
      });
    }
  );

  await page.click(gSelectors.buttonPackageNext);
}

async function getLanguages({ page }: { page: Page }) {
  return page.$$eval(
    gSelectors.errorIncompleteTranslations,
    (elIncompletes: HTMLDivElement[]) =>
      elIncompletes
        .map(elIncomplete =>
          elIncomplete
            .closest("tr")
            .querySelector(".action-link")
            .childNodes[0].textContent.trim()
        )
        .join(", ")
  );
}

async function verifyNoListingIssues({
  page,
  extId
}: {
  page: Page;
  extId: string;
}) {
  return new Promise(async (resolve, reject) => {
    page.once("dialog", dialog => {
      dialog.accept();
    });

    await page.goto(`${getBaseDashboardUrl(extId)}/listings`, {
      waitUntil: "networkidle0"
    });

    const languagesMissing = await getLanguages({ page });
    if (languagesMissing.length === 0) {
      resolve(true);
      return;
    }

    reject(
      getVerboseMessage({
        store,
        message: `The following languages lack their translated descriptions and/or logos: ${languagesMissing}`,
        prefix: "Error"
      })
    );
  });
}

async function addChangelogIfNeeded({
  page,
  devChangelog,
  isVerbose
}: {
  devChangelog: string;
  page: Page;
  isVerbose: boolean;
}) {
  if (devChangelog) {
    await page.waitForSelector(gSelectors.inputDevChangelog);
    await page.type(gSelectors.inputDevChangelog, devChangelog);

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Added changelog for reviewers: ${devChangelog}`
        })
      );
    }
  }
}

async function clickButtonPublish({ page }: { page: Page }) {
  await page.waitForSelector(gSelectors.buttonPublish);
  await page.$eval(gSelectors.buttonPublish, (elPublish: HTMLButtonElement) => {
    return new Promise(resolve => {
      new MutationObserver(() => resolve(true)).observe(elPublish, {
        attributes: true,
        attributeFilter: ["disabled"]
      });
    });
  });

  await page.click(gSelectors.buttonPublish);
}

export async function deployToEdge({
  cookie,
  extId,
  devChangelog = "",
  zip,
  verbose: isVerbose
}: EdgeOptions): Promise<boolean> {
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
    await addLoginCookie({ page, cookie });
    const urlStart = `${getBaseDashboardUrl(extId)}/overview`;

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Launched a Puppeteer session in ${urlStart}`
        })
      );
    }

    await page.goto(urlStart);

    try {
      await openRelevantExtensionPage({ page, extId });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: "Opened relevant extension page"
        })
      );
    }

    try {
      await verifyNewVersionIsGreater({ page, zip });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    await uploadZip({ page, zip, extId });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Uploading ZIP: ${zip}`
        })
      );
    }

    await clickButtonNext({ page });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: "Uploaded ZIP"
        })
      );
    }

    try {
      await verifyNoListingIssues({ page, extId });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    await page.click(gSelectors.buttonPublishText);

    await addChangelogIfNeeded({ page, devChangelog, isVerbose });

    await clickButtonPublish({ page });

    await page.waitForSelector(gSelectors.buttonSubmissionUpdate);

    await browser.close();
    resolve(true);
  });
}
