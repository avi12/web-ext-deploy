import puppeteer from "puppeteer-extra";
import { EdgeOptions } from "./edge-input";
import { getExistingElementSelector, getVerboseMessage } from "../../utils";
import { Browser, Page } from "puppeteer";
import duration from "parse-duration";
import compareVersions from "compare-versions";
import zipper from "zip-local";

const store = "Edge";

const gSelectors = {
  inputEmail: "input[type=email]",
  inputPhone: "input[type=tel]",
  inputPassword: "#i0118",
  inputFile: "input[type=file]",
  inputTwoFactor: "#idTxtBx_SAOTCC_OTC",
  errorTwoFactorIncorrect: "#idSpan_SAOTCC_Error_OTC",
  errorTwoFactorTryResend: "#idSpan_SAOTCS_Error_OTC",
  instructionVerifyPhone: "#idDiv_SAOTCS_ProofConfirmationDesc",
  buttonNoThanks: "#iCancel",
  buttonPublish: ".win-icon-Publish",
  profileName: ".css-383",
  buttonSubmit: "input[type=submit]",
  buttonNext: "#idSIButton9",
  buttonPackageNext: "[data-i18n-key=Package_Next]",
  twoFactorChoices: ".tile-img[role=presentation]",
  containerNumberAuthApp: "#idRemoteNGC_DisplaySign"
};

async function typeAndSubmit(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.type(selector, value);
  await page.click(gSelectors.buttonSubmit);
}

async function loginToStore({
  page,
  email,
  password
}: {
  page: Page;
  email: string;
  password?: string;
}) {
  return new Promise(async resolve => {
    // @ts-ignore
    await page.maximize();
    await typeAndSubmit(page, gSelectors.inputEmail, email);
    await page.waitForNavigation();

    const selectorExisting = await getExistingElementSelector(page, [
      gSelectors.inputPassword,
      gSelectors.instructionVerifyPhone,
      gSelectors.buttonNext,
      gSelectors.profileName
    ]);

    if (selectorExisting.includes(gSelectors.profileName)) {
      resolve(true);
      return;
    }
    if (selectorExisting.includes(gSelectors.inputPassword) && password) {
      await page.waitForSelector(gSelectors.inputPassword);
      await page.type(gSelectors.inputPassword, password);
      await page.click(gSelectors.buttonSubmit);
    }
    console.log(
      getVerboseMessage({
        store,
        message:
          "Launching the Puppeteer instance so you handle the two-factor authentication"
      })
    );

    // @ts-ignore
    await page.maximize();

    const timeToWait = "10m";
    try {
      await page.waitForResponse(
        "https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview",
        { timeout: duration(timeToWait) }
      );
      resolve(true);
    } catch {
      console.log(
        getVerboseMessage({
          store,
          message: `The timeout of ${timeToWait} has exceeded. Restart the "web-ext-deploy" instance`
        })
      );
      process.exit(1);
    }
  });
}

function getBaseDashboardUrl(extId) {
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
      await page.goto(`${getBaseDashboardUrl(extId)}/overview`);
      resolve(true);
      // eslint-disable-next-line no-empty
    } catch {}
  });
}

async function getCurrentVersion({
  page,
  browser
}: {
  page: Page;
  browser: Browser;
}): Promise<string> {
  const selectorExtUrl = `a[href*="addons/detail/"]`;
  await page.waitForSelector(selectorExtUrl);
  const urlExtension = await page.$eval(
    selectorExtUrl,
    (elA: HTMLAnchorElement) => elA.href
  );

  const pageStore = await browser.newPage();
  await pageStore.goto(urlExtension, { waitUntil: "networkidle0" });
  const versionCurrent = await pageStore.$eval(
    "#versionLabel",
    elVersion => elVersion.textContent.split(" ")[1]
  );
  await pageStore.close();
  return versionCurrent;
}

function getNewVersion(zip: string) {
  const unzippedFs = zipper.sync.unzip(zip).memory();
  const manifest = unzippedFs.read("manifest.json", "buffer").toString();
  const { version } = JSON.parse(manifest);
  return version;
}

async function uploadZip({ page, zip }: { page: Page; zip: string }) {
  const elInputFile = await page.$(gSelectors.inputFile);
  await elInputFile.uploadFile(zip);
}

async function verifyNewVersionIsGreater({
  browser,
  page,
  zip
}: {
  page: Page;
  browser: Browser;
  zip: string;
}) {
  const versionCurrent = await getCurrentVersion({ page, browser });
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

export async function deployToEdge({
  email,
  password,
  extId,
  zip,
  verbose: isVerbose
}: EdgeOptions) {
  return new Promise(async (resolve, reject) => {
    puppeteer.use(require("puppeteer-extra-plugin-minmax")());

    const browser = await puppeteer.launch({
      // @ts-ignore
      headless: false,
      // devtools: true,
      args: ["--window-size=1280,720", "--window-position=0,0"],
      defaultViewport: { width: 1280, height: 720 }
    });

    // Opening a new page instead of using the first page
    // because otherwise the minmax plugin won't work
    const page = await browser.newPage();

    browser.pages().then(([page]) => page.close());

    // @ts-ignore
    await page.minimize();

    const urlStart =
      "https://partner.microsoft.com/en-us/dashboard/microsoftedge/overview";
    await page.goto(urlStart, { waitUntil: "networkidle0" });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Launched Puppeteer session in ${urlStart}`
        })
      );

      console.log(
        getVerboseMessage({
          store,
          message: "Logging in"
        })
      );
    }

    await loginToStore({
      page,
      email,
      password
    });

    // After logging in, no need to keep the
    // Puppeteer window visible, so minimizing
    // @ts-ignore
    await page.minimize();

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
      await verifyNewVersionIsGreater({ page, browser, zip });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    await uploadZip({ page, zip });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Uploaded ZIP: ${zip}`
        })
      );
    }

    await page.click(gSelectors.buttonPublish);
    // TODO: Handle issues that prevent publishing

    await browser.close();

    resolve(true);
  });
}
