import puppeteer, { Page } from "puppeteer";
import { EdgeOptions } from "./edge-input";
import { disableImages, getVerboseMessage } from "../../utils";
import compareVersions from "compare-versions";
import zipper from "zip-local";

const store = "Edge";

const gSelectors = {
  extName: ".extension-name",
  inputFile: "input[type=file]",
  buttonPublishText: ".win-icon-Publish",
  buttonPublish: "#publishButton",
  imgReview: ".win-icon-TaskStateCircleFull",
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
    page.on("response", response => {
      if (!response.url().endsWith("lastUploadedPackage")) {
        return;
      }
      const error = 400;
      const isExtIdValid = response.status() !== error;
      if (isExtIdValid) {
        return;
      }
      reject(
        getVerboseMessage({
          store,
          message: `Extension with ID "${extId}" does not exist`,
          prefix: "Error"
        })
      );
    });
    try {
      await page.goto(`${getBaseDashboardUrl(extId)}/packages/overview`);
      resolve(true);
      // eslint-disable-next-line no-empty
    } catch {}
  });
}

async function getCurrentVersion({ page }: { page: Page }): Promise<string> {
  await page.waitForSelector(gSelectors.extName);
  return page.$eval(gSelectors.extName, (elExtName: HTMLDivElement) =>
    elExtName.lastElementChild.textContent.trim()
  );
}

function getNewVersion(zip: string) {
  const unzippedFs = zipper.sync.unzip(zip).memory();
  const manifest = unzippedFs.read("manifest.json", "buffer").toString();
  const { version } = JSON.parse(manifest);
  return version;
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
  const versionNew = getNewVersion(zip);

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
async function clickButtonPublishText({ page }: { page: Page }) {
  await page.waitForSelector(gSelectors.buttonPublishText);

  await page.$eval(
    gSelectors.buttonPublishText,
    (elPublish: HTMLButtonElement) => {
      return new Promise(resolve => {
        new MutationObserver(() => resolve(true)).observe(
          elPublish.parentElement,
          {
            attributes: true,
            attributeFilter: ["disabled"]
          }
        );
      });
    }
  );

  await page.click(gSelectors.buttonPublishText);
}

async function addChangelogIfNeeded({
  page,
  devChangelog
}: {
  devChangelog: string;
  page: Page;
}) {
  await page.waitForSelector(gSelectors.inputDevChangelog);
  await page.type(gSelectors.inputDevChangelog, devChangelog);
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
    const browser = await puppeteer.launch({
      // headless: false,
      // args: [`--window-size=${width},${height}`, "--window-position=0,0"],
      defaultViewport: { width, height }
    });

    const [page] = await browser.pages();

    const urlStart = `${getBaseDashboardUrl(extId)}/overview`;

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Launched a Puppeteer session in ${urlStart}`
        })
      );

      console.log(
        getVerboseMessage({
          store,
          message: "Logged in"
        })
      );
    }

    await disableImages(page);
    await addLoginCookie({ page, cookie });
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
          message: "Uploading extension to the store"
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
          message: `Uploaded ZIP: ${zip}`
        })
      );
    }

    await clickButtonNext({ page });
    await clickButtonPublishText({ page });
    await addChangelogIfNeeded({ page, devChangelog });
    // TODO: Handle issues that prevent publishing
    await clickButtonPublish({ page });
    await page.waitForSelector(gSelectors.buttonSubmissionUpdate);
    await browser.close();
    resolve(true);
  });
}
