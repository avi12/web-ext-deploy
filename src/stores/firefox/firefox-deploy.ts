// eslint-disable-next-line no-unused-vars
import { FirefoxOptions } from "./firefox-input";
import puppeteer from "puppeteer-extra";
import { Page } from "puppeteer";
import prompt from "prompt-promise";

import {
  clearInput,
  disableImages,
  getEvaluation,
  getFullPath,
  getVerboseMessage
} from "../../utils";

const gUrlStart = "https://addons.mozilla.org/en-US/developers";
const gSelectors = {
  inputTwoFactor: ".totp-code",
  twoFactorError: "#error-tooltip-1053",
  twoFactorErrorAgain: "#error-tooltip-1054",
  twoFactorErrorAgainWait: "#error-tooltip-114",
  extEntryName: ".DevHub-MyAddons-item-name",
  listErrors: ".errorlist",
  buttonManageExtensions: "a.Button",
  buttonSubmit: "button[type=submit]",
  inputEmail: "input[type=email]",
  inputPassword: "input[type=password]",
  inputFile: "input[type=file]",
  inputRadio: "input[type=radio]",
  inputChangelog: "textarea[name*=release_notes]",
  inputDevChangelog: "textarea[name=approval_notes]"
};

async function typeAndSubmit(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.type(selector, value);
  await page.click(gSelectors.buttonSubmit);
}

async function handleTwoFactor(page: Page, twoFactor?: number) {
  const description = await getEvaluation(page, [
    gSelectors.inputTwoFactor,
    gSelectors.extEntryName
  ]);

  if (!description.includes(gSelectors.inputTwoFactor)) {
    return;
  }

  if (!twoFactor) {
    twoFactor = await prompt(
      getVerboseMessage({
        store: "Firefox",
        message: "Enter two-factor code: "
      })
    );
  }
  await page.type(gSelectors.inputTwoFactor, `${twoFactor}`);
  await page.click(gSelectors.buttonSubmit);
  do {
    const description = await getEvaluation(page, [
      gSelectors.twoFactorError,
      gSelectors.twoFactorErrorAgain,
      gSelectors.twoFactorErrorAgainWait,
      gSelectors.extEntryName
    ]);

    if (
      !(
        description.includes(gSelectors.twoFactorErrorAgain) ||
        description.includes(gSelectors.twoFactorErrorAgainWait) ||
        description.includes(gSelectors.twoFactorError)
      )
    ) {
      break;
    }
    const message = description.includes(gSelectors.twoFactorErrorAgainWait)
      ? "wait a bit, then type the code: "
      : "Enter two-factor code: ";
    const twoFactor = await prompt(
      getVerboseMessage({
        store: "Firefox",
        message
      })
    );
    await clearInput(page, gSelectors.inputTwoFactor);
    await page.type(gSelectors.inputTwoFactor, twoFactor);
    await page.click(gSelectors.buttonSubmit);

    // eslint-disable-next-line no-constant-condition
  } while (true);
}

async function loginToStore({
  page,
  email,
  password,
  twoFactor
}: {
  page: Page;
  email: string;
  password: string;
  twoFactor?: number;
}) {
  await page.click(gSelectors.buttonManageExtensions);

  await typeAndSubmit(page, gSelectors.inputEmail, email);
  await typeAndSubmit(page, gSelectors.inputPassword, password);
  return handleTwoFactor(page, twoFactor);
}

async function openRelevantExtensionPage({
  page,
  extId
}: {
  page: Page;
  extId: string;
}): Promise<boolean> {
  const urlBase = "https://addons.mozilla.org/en-US/developers";
  const urlSubmission = `${urlBase}/addon/${extId}/versions/submit/`;

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

  await page.$eval(gSelectors.buttonSubmit, elSubmit => {
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

  const description = await getEvaluation(page, [
    gSelectors.listErrors,
    gSelectors.inputRadio
  ]);
  return new Promise(async (resolve, reject) => {
    if (!description.includes(gSelectors.listErrors)) {
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
    await page.click(gSelectors.buttonSubmit);
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

export default async function deployToFirefox({
  email,
  password,
  twoFactor,
  extId,
  zip,
  zipSource,
  changelog,
  devChangelog,
  verbose: isVerbose
}: FirefoxOptions): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    const browser = await puppeteer.launch({
      // headless: false,
      // args: ["--window-size=1280,720", "--window-position=0,0"],
      defaultViewport: { width: 1280, height: 720 }
    });

    const page = (await browser.pages())[0];

    await disableImages(page);

    await page.goto(gUrlStart, { waitUntil: "networkidle0" });
    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: "Firefox",
          message: `Launched Puppeteer session in ${gUrlStart}`
        })
      );
    }

    await loginToStore({
      page,
      email,
      password,
      twoFactor
    });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: "Firefox",
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
          store: "Firefox",
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
      browser.close().catch(() => {});
      reject(e);
      return;
    }

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: "Firefox",
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
          store: "Firefox",
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

    await page.click(gSelectors.buttonSubmit);
    console.log(
      getVerboseMessage({
        store: "Firefox",
        message: "Finished uploading"
      })
    );

    await browser.close();
    resolve(true);
  });
}
