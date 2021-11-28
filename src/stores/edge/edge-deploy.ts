import puppeteer, { Page } from "puppeteer";
import duration from "parse-duration";
import { EdgeOptions } from "./edge-input";
import {
  disableImages,
  getExistingElementSelector,
  getExtInfo,
  getVerboseMessage,
  logSuccessfullyPublished
} from "../../utils";
import compareVersions from "compare-versions";

const store = "Edge";

const gSelectors = {
  extName: ".extension-name",
  inputFile: "input[type=file]",
  buttonPublishText: ".win-icon-Publish",
  buttonPublish: "#publishButton",
  buttonPublishOverview: "button[data-l10n-key=Common_Publish]",
  buttonEditOverview: "button[data-l10n-key=Common_Text_Edit]",
  buttonUpdateOverview: "button[data-l10n-key=Common_Text_Update]",
  statusInReview: "[data-l10n-key=Overview_Extension_Status_InReview]",
  errorIncompleteTranslations: `[data-l10n-key="Common_Incomplete"]`,
  buttonPackageNext: "[data-l10n-key=Package_Next]",
  buttonSubmissionUpdate: "[data-l10n-key=Common_Text_Update]",
  buttonCancelOverview: "[data-l10n-key=Common_Text_Cancel]",
  buttonConfirm: "[data-l10n-key=Common_Text_Confirm]",
  inputDevChangelog: `textarea[name="certificationNotes"]`
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
      .goto(`${getBaseDashboardUrl(extId)}/packages/dashboard`)
      .then(() => resolve(true))
      .catch(() => {});
  });
}

async function getCurrentVersion({ page }: { page: Page }): Promise<string> {
  await page.waitForSelector(gSelectors.extName);
  const elNameVersionContainers = await page.$$(gSelectors.extName);
  const elNameVersionContainer =
    elNameVersionContainers[elNameVersionContainers.length - 1];

  const [elVersion] = await elNameVersionContainer.$x("span[3]");
  return elVersion.evaluate((elVersion: HTMLSpanElement) =>
    elVersion.textContent.trim()
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
  const versionNew = getExtInfo(zip, "version");

  return new Promise(async (resolve, reject) => {
    // @ts-ignore
    if (compareVersions(versionNew, versionCurrent, ">")) {
      resolve(true);
      return;
    }
    reject(
      getVerboseMessage({
        store,
        message: `${getExtInfo(
          zip,
          "name"
        )}'s new version (${versionNew}) must be greater than the current version (${versionCurrent})`,
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
  if (!devChangelog) {
    return;
  }
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

async function clickButtonPublishText(page: Page, extId: string) {
  await page.goto(`${getBaseDashboardUrl(extId)}/availability`, {
    waitUntil: "networkidle0"
  });
  await page.waitForSelector(gSelectors.buttonPublishText);
  await page.click(gSelectors.buttonPublishText);
}

async function clickPublishInOverview({
  page,
  extId
}: {
  page: Page;
  extId: string;
}) {
  const urlOverview = `${getBaseDashboardUrl(extId)}/packages/dashboard`;
  await page.goto(urlOverview, { waitUntil: "networkidle0" });
  await page.waitForSelector(gSelectors.buttonPublishOverview);
  await page.click(gSelectors.buttonPublishOverview);
}

async function clickCancelWhenPossible({ page }: { page: Page }) {
  const timeToWait = duration("65s");
  // noinspection UnnecessaryLocalVariableJS
  const isCanceled = await page.$eval(
    gSelectors.buttonCancelOverview,
    (elButtonCancel: HTMLButtonElement, timeToWait: number) =>
      new Promise(resolve => {
        // If the extension had been reviewed
        // and then its review process was canceled,
        // the Cancel button will become clickable
        // after a minute

        setTimeout(() => resolve(false), timeToWait);

        // Otherwise, if it hasn't just been canceled,
        // the button will start as disabled and become
        // enabled after a moment
        new MutationObserver(() => {
          elButtonCancel.click();
          resolve(true);
        }).observe(elButtonCancel, {
          attributes: true,
          attributeFilter: ["disabled"]
        });
      }),
    timeToWait
  );

  return isCanceled;
}

async function confirmCancelWhenPossible({ page }: { page: Page }) {
  await page.waitForSelector(gSelectors.buttonConfirm);
  await page.$eval(gSelectors.buttonConfirm, (elConfirm: HTMLButtonElement) =>
    elConfirm.click()
  );
}

async function cancelVersionInReviewIfNeeded({
  page,
  isVerbose,
  zip
}: {
  page: Page;
  isVerbose: boolean;
  zip: string;
}) {
  // Scenario 1: It's live in the store (Update & Unpublish are available)
  // Scenario 2: It's in draft form (Edit, Publish & Unpublish are available)
  // Scenario 3: It's being reviewed (Update, Cancel & Unpublish are available)
  // Scenario 4: The review was canceled, but it's not yet a draft (Update, Cancel (disabled) & Unpublish are available)

  const selectorExisting = await getExistingElementSelector(page, [
    gSelectors.buttonEditOverview,
    gSelectors.buttonUpdateOverview
  ]);

  const isInStore = !(await page.$(gSelectors.buttonCancelOverview));
  const isDraft = selectorExisting.includes(gSelectors.buttonEditOverview);
  if (isInStore || isDraft) {
    return;
  }

  const isScenario4 = !(await clickCancelWhenPossible({ page }));
  if (isScenario4) {
    return;
  }
  await confirmCancelWhenPossible({ page });

  if (isVerbose) {
    const extName = getExtInfo(zip, "name");
    console.log(
      getVerboseMessage({
        store,
        message: `Canceling current being-reviewed version. It will take about a minute until the new version of ${extName} can be uploaded`
      })
    );
  }

  await new Promise(resolve =>
    setTimeout(() => resolve(true), duration("65s"))
  );
}

async function getIsInStore({ page }: { page: Page }) {
  // In-store: Update & Unpublish are available
  // In-draft: Edit, Publish & Unpublish are available
  // In-review: Update, Cancel (initially disabled) & Unpublish are available
  return (
    (await page.$(gSelectors.buttonUpdateOverview)) &&
    !(await page.$(gSelectors.buttonCancelOverview))
  );
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
    const urlStart = `${getBaseDashboardUrl(extId)}/packages/dashboard`;

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

    await cancelVersionInReviewIfNeeded({ page, isVerbose, zip });

    try {
      if (await getIsInStore({ page })) {
        await verifyNewVersionIsGreater({ page, zip });
      }
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

    await clickButtonPublishText(page, extId);
    await addChangelogIfNeeded({ page, devChangelog, isVerbose });
    await clickButtonPublish({ page });

    const minutesToWait = 10;
    const timeout = duration(`${minutesToWait}m`);
    try {
      await page.waitForSelector(gSelectors.buttonSubmissionUpdate, {
        timeout
      });
    } catch {
      await clickPublishInOverview({ page, extId });
      await page.waitForSelector(gSelectors.statusInReview, {
        timeout
      });
    }
    logSuccessfullyPublished({ extId, store, zip });

    await browser.close();

    resolve(true);
  });
}
