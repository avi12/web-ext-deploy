import { FirefoxOptions } from "./firefox-input";
import puppeteer from "puppeteer-extra";
import { Page } from "puppeteer";
import mitt from "mitt";

import {
  clearInput,
  disableImages,
  getExistingElementSelector,
  getFullPath,
  getVerboseMessage,
  prompt
} from "../../utils";

const emitter = mitt();

const gUrlStart = "https://addons.mozilla.org/en-US/developers";
const gSelectors = {
  inputTwoFactor: ".totp-code",
  twoFactorError: "#error-tooltip-1053",
  twoFactorErrorAgain: "#error-tooltip-1054",
  twoFactorErrorAgainWait: "#error-tooltip-114",
  extEntryName: ".DevHub-MyAddons-item-name",
  listErrors: ".errorlist",
  buttonManageExtensions: "a.Button",
  buttonNext: "button[type=submit]",
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
  await page.click(gSelectors.buttonNext);
}

async function handleTwoFactor(page: Page, twoFactor?: number) {
  const description = await getExistingElementSelector(page, [
    gSelectors.inputTwoFactor,
    gSelectors.extEntryName
  ]);

  if (!description.includes(gSelectors.inputTwoFactor)) {
    return;
  }

  const messageOriginal = "Enter two-factor code: ";
  let message = messageOriginal;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!twoFactor) {
      console.log("Firefox: lock for", process.env.LOCK_FOR_TWO_FACTOR);
      if (!process.env.LOCK_FOR_TWO_FACTOR) {
        process.env.LOCK_FOR_TWO_FACTOR = "firefox";
      }
      if (process.env.LOCK_FOR_TWO_FACTOR === "opera") {
        await new Promise(resolve => {
          emitter.on("logged-out", state => {
            if (state === "opera") {
              resolve(true);
            }
          });
        });
        process.env.LOCK_FOR_TWO_FACTOR = "firefox";
      }
      if (process.env.LOCK_FOR_TWO_FACTOR === "firefox") {
        twoFactor = Number(
          await prompt(
            getVerboseMessage({
              store: "Firefox",
              message
            })
          )
        );
      }
    }
    await page.type(gSelectors.inputTwoFactor, `${twoFactor}`);
    await page.click(gSelectors.buttonNext);
    const description = await getExistingElementSelector(page, [
      gSelectors.twoFactorError,
      gSelectors.twoFactorErrorAgain,
      gSelectors.twoFactorErrorAgainWait,
      gSelectors.extEntryName
    ]);

    const isTwoFactorCodeCorrect = description.includes(
      gSelectors.extEntryName
    );
    if (isTwoFactorCodeCorrect) {
      emitter.emit("logged-out", "firefox");
      break;
    }
    message = description.includes(gSelectors.twoFactorErrorAgainWait)
      ? "wait a bit, then type the code: "
      : messageOriginal;

    await clearInput(page, gSelectors.inputTwoFactor);
    // Resetting two-factor code to receive as input
    twoFactor = 0;
  }
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

  const description = await getExistingElementSelector(page, [
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
  const browser = await puppeteer.launch({
    // @ts-ignore
    headless: true,
    args: ["--window-size=1280,720", "--window-position=0,720"],
    defaultViewport: { width: 1280, height: 720 }
  });

  const [page] = await browser.pages();

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
    throw new Error(e);
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
    await browser.close();
    throw new Error(e);
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

  await page.click(gSelectors.buttonNext);
  console.log(
    getVerboseMessage({
      store: "Firefox",
      message: "Finished uploading"
    })
  );

  await browser.close();
  return true;
}
