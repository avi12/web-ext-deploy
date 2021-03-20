import puppeteer, { Page } from "puppeteer";
import duration from "parse-duration";
import { EdgeOptions } from "./edge-input";
import {
  disableImages,
  getExtVersion,
  getPropertyValue,
  getVerboseMessage,
  logSuccessfullyPublished
} from "../../utils";
import compareVersions from "compare-versions";

const store = "Edge";

const gSelectors = {
  extName: ".extension-name",
  inputFile: "input[type=file]",
  buttonPublishText: ".win-icon-Publish",
  textUnpublish: ".win-icon-RemoveContent",
  buttonPublish: "#publishButton",
  errorIncompleteTranslations: `[data-l10n-key="Common_Incomplete"]`,
  buttonPackageNext: "[data-l10n-key=Package_Next]",
  textCancelSubmission: "command-bar-button .win-icon-Cancel",
  buttonCancelSubmissionConfirm:
    "button[data-l10n-key=Overview_Extension_Cancel_Submission]",
  buttonSubmissionUpdate: "[data-l10n-key=Common_Text_Update]",
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
      .goto(`${getBaseDashboardUrl(extId)}/overview`)
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

async function clickButtonPublishText(page: Page, extId: string) {
  await page.goto(`${getBaseDashboardUrl(extId)}/availability`, {
    waitUntil: "networkidle0"
  });
  await page.waitForSelector(gSelectors.buttonPublishText);
  await page.click(gSelectors.buttonPublishText);
}

async function cancelReviewInProgressIfPossible({
  page,
  extId
}: {
  page: Page;
  extId: string;
}) {
  await page.waitForSelector(gSelectors.textUnpublish);
  const elTextUnpublish = await page.$(gSelectors.textUnpublish);
  const [elButtonUnpublishText] = await elTextUnpublish.$x("..");
  const isUnpublishDisabled = await getPropertyValue({
    element: elButtonUnpublishText,
    propertyName: "disabled"
  });
  const gotoPackageOverview = () =>
    page.goto(`${getBaseDashboardUrl(extId)}/packages/overview`, {
      waitUntil: "networkidle0"
    });
  if (!isUnpublishDisabled) {
    await gotoPackageOverview();
    return;
  }

  const clickCancelSubmission = async () => {
    await page.waitForSelector(gSelectors.textCancelSubmission);
    await page.$eval(
      gSelectors.textCancelSubmission,
      (elTextCancelSubmission: HTMLSpanElement) =>
        elTextCancelSubmission.click()
    );
  };

  const clickConfirm = async () => {
    await page.waitForSelector(gSelectors.buttonCancelSubmissionConfirm);
    await page.$eval(
      gSelectors.buttonCancelSubmissionConfirm,
      (elButtonCancelConfirm: HTMLButtonElement) =>
        elButtonCancelConfirm.click()
    );
  };

  await clickCancelSubmission();
  await clickConfirm();

  await gotoPackageOverview();
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
    const urlStart = `${getBaseDashboardUrl(extId)}/packages/overview`;

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

    await cancelReviewInProgressIfPossible({ page, extId });

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

    await clickButtonPublishText(page, extId);
    await addChangelogIfNeeded({ page, devChangelog, isVerbose });
    await clickButtonPublish({ page });

    await page.waitForSelector(gSelectors.buttonSubmissionUpdate, {
      timeout: duration("10m")
    });
    logSuccessfullyPublished({ extId, store, zip });

    await browser.close();

    resolve(true);
  });
}
