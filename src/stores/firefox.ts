import * as puppeteer from "puppeteer";
import { Page } from "puppeteer";
import * as urls from "./stores.json";
import * as prompt from "prompt-promise";
import * as path from "path";
import { IFirefox } from "../utils";

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
  inputChangelog: `textarea[name*=release_notes]`,
  inputDevChangelog: `textarea[name=approval_notes]`
};

function getErrorFirefox(error) {
  return `Firefox: ${error}`;
}

async function typeAndSubmit(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.type(selector, value);
  await page.click(gSelectors.buttonSubmit);
}

async function getEvaluation(page: Page, selectors: string[]): Promise<string> {
  const promises = selectors.map(selector => page.waitForSelector(selector));
  const {
    _remoteObject: { description }
  } = await Promise.race(promises);
  return description;
}

async function clearInput(page: Page, selector: string) {
  const elInput = await page.$(selector);
  await elInput.click();
  await elInput.focus();
  await elInput.click({ clickCount: 3 });
  await elInput.press("Backspace");
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
    twoFactor = await prompt(`Firefox: two-factor code: `);
  }
  await page.type(gSelectors.inputTwoFactor, twoFactor.toString());
  await page.click(gSelectors.buttonSubmit);
  do {
    const description = await getEvaluation(page, [
      gSelectors.twoFactorError,
      gSelectors.twoFactorErrorAgain,
      gSelectors.twoFactorErrorAgainWait,
      gSelectors.extEntryName
    ]);

    if (
      description.includes(gSelectors.twoFactorErrorAgain) ||
      description.includes(gSelectors.twoFactorErrorAgainWait) ||
      description.includes(gSelectors.twoFactorError)
    ) {
      const message = description.includes(gSelectors.twoFactorErrorAgainWait)
        ? "wait a bit, then type the code:"
        : "two-factor code:";
      const twoFactor = await prompt(`Firefox: ${message} `);
      await clearInput(page, gSelectors.inputTwoFactor);
      await page.type(gSelectors.inputTwoFactor, twoFactor);
      await page.click(gSelectors.buttonSubmit);
    } else {
      break;
    }
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
}): Promise<string | boolean> {
  const urlBase = "https://addons.mozilla.org/en-US/developers";
  const urlSubmission = `${urlBase}/addon/${extId}/versions/submit/`;

  const response = await page.goto(urlSubmission);
  return new Promise((resolve, reject) => {
    if (response.statusText() === "Forbidden") {
      reject(getErrorFirefox(`Extension ID does not exist: ${extId}`));
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
}): Promise<string | boolean> {
  const elInputFile = await page.$(gSelectors.inputFile);
  await elInputFile.uploadFile(zip);

  await page.$eval(gSelectors.buttonSubmit, (elSubmit: HTMLButtonElement) => {
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

  const description = await getEvaluation(page, [
    gSelectors.listErrors,
    gSelectors.inputRadio
  ]);
  return new Promise(async (resolve, reject) => {
    if (!description.includes(gSelectors.listErrors)) {
      resolve(true);
      return;
    }
    const errors = await page.$eval(
      gSelectors.listErrors,
      (elErrors: HTMLUListElement) =>
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
      getErrorFirefox(`${prefixError}at the upload of "${extId}":
      ${errors.join("\n")}
      `)
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
  devChangelog
}: {
  page: Page;
  changelog: string;
  devChangelog: string;
}) {
  await page.type(gSelectors.inputChangelog, changelog);
  await page.type(gSelectors.inputDevChangelog, devChangelog);
}

export default async function deployToFirefox({
  email,
  password,
  twoFactor,
  extId,
  zip,
  zipSource,
  changelog,
  devChangelog
}: IFirefox) {
  return new Promise(async (resolve, reject) => {
    const browser = await puppeteer.launch({
      // headless: false,
      // args: ["--window-size=1280,720", "--window-position=0,0"],
      defaultViewport: { width: 1280, height: 720 }
    });

    const page = (await browser.pages())[0];
    await page.goto(urls.firefox, { waitUntil: "networkidle0" });
    await loginToStore({
      page,
      email,
      password,
      twoFactor
    });
    try {
      await openRelevantExtensionPage({ page, extId: extId.trim() });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    try {
      await uploadZip({
        page,
        zip: path.resolve(process.cwd(), zip),
        extId: extId.trim()
      });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    await uploadZipSourceIfNeeded({
      page,
      zipSource: path.resolve(process.cwd(), zipSource),
      isUpload: Boolean(zipSource)
    });

    await addChangelogsIfNeeded({
      page,
      changelog,
      devChangelog
    });

    await page.click(gSelectors.buttonSubmit);
    await browser.close();
    resolve(true);
  });
}
