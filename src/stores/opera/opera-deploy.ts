import { OperaOptions } from "./opera-input";
import puppeteer from "puppeteer-extra";
import { Page } from "puppeteer";

import {
  clearInput,
  disableImages,
  getExistingElementSelector,
  getFullPath,
  getVerboseMessage,
  prompt
} from "../../utils";
import mitt from "mitt";

const emitter = mitt();
const store = "Opera";

const gSelectors = {
  listExtensions: ".list-group",
  extEntryName: ".DevHub-MyAddons-item-name",
  listErrors: ".alert-danger",
  buttonManageExtensions: "a.Button",
  buttonNext: "button[type=submit]",
  buttonUploadNewVersion: `[ng-click*="upload()"]`,
  inputEmail: "input[name=email]",
  inputPassword: "input[type=password]",
  inputsTwoFactor: ".otp-input",
  twoFactorError: ".msg-error",
  twoFactorErrorAgain: "#error-tooltip-1054",
  twoFactorErrorAgainWait: "#error-tooltip-114",
  inputFile: "input[type=file]",
  inputCodePublic: `editable-field[field-value="packageVersion\\.source_url"] input`,
  inputCodePrivate: `editable-field[field-value="packageVersion\\.source_for_moderators_url"] input`,
  inputChangelog: `editable-field[field-value="translation\\.changelog"] textarea`,
  buttonSubmitChangelog: `editable-field span[ng-click="$ctrl.updateValue()"]`
};

async function handleTwoFactor(page: Page, twoFactor?: number) {
  const description = await getExistingElementSelector(page, [
    gSelectors.inputsTwoFactor,
    gSelectors.extEntryName
  ]);

  if (!description.includes(gSelectors.inputsTwoFactor)) {
    return;
  }
  const messageTwoFactor = "Enter two-factor code: ";

  return new Promise(async (resolve, reject) => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!twoFactor) {
        console.log("Opera: lock for", process.env.LOCK_FOR_TWO_FACTOR);
        if (!process.env.LOCK_FOR_TWO_FACTOR) {
          process.env.LOCK_FOR_TWO_FACTOR = "opera";
        }
        if (process.env.LOCK_FOR_TWO_FACTOR === "firefox") {
          await new Promise(resolve => {
            emitter.on("logged-out", state => {
              if (state === "firefox") {
                resolve(true);
              }
            });
          });
          process.env.LOCK_FOR_TWO_FACTOR = "opera";
        }
        if (process.env.LOCK_FOR_TWO_FACTOR === "opera") {
          twoFactor = Number(
            await prompt(
              getVerboseMessage({
                store,
                message: messageTwoFactor
              })
            )
          );
        }
      }
      let twoFactorString = twoFactor.toString();
      const description = await getExistingElementSelector(page, [
        gSelectors.twoFactorError,
        gSelectors.listExtensions
      ]);

      if (description.includes(gSelectors.listExtensions)) {
        emitter.emit("logged-out", "opera");
        resolve(true);
        return;
      }
      const isTokenInvalid = await page.$eval(
        gSelectors.twoFactorError,
        elError => elError.textContent.trim().startsWith("Token")
      );
      if (isTokenInvalid) {
        reject("invalid-token");
        return;
      }

      twoFactorString = await prompt(
        getVerboseMessage({
          store,
          message: messageTwoFactor
        })
      );
      const elInputs = await page.$$(gSelectors.inputsTwoFactor);
      for (let i = 0; i < elInputs.length; i++) {
        await clearInput(
          page,
          `${gSelectors.inputsTwoFactor}:nth-of-type(${i + 1})`
        );
        await elInputs[i].type(twoFactorString[i]);
      }
      await page.click(gSelectors.buttonNext);
      // eslint-disable-next-line no-constant-condition
    }
  });
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
  await page.waitForSelector(gSelectors.inputEmail);
  await page.type(gSelectors.inputEmail, email);
  await page.type(gSelectors.inputPassword, password);
  await page.click(gSelectors.buttonNext);

  await handleTwoFactor(page, twoFactor);
}

async function getErrorsOrNone(
  page: Page,
  packageId: number
): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    const description = await getExistingElementSelector(page, [
      gSelectors.listErrors
    ]);
    if (!description.includes(gSelectors.listErrors)) {
      resolve(true);
      return;
    }
    const errors = await page.$$eval(gSelectors.listErrors, elErrors =>
      [...elErrors]
        .map(elError => elError.querySelector(".ng-scope").textContent.trim())
        .map(error => {
          if (error.includes("already uploaded")) {
            return error.split(". ")[0];
          }
          return error;
        })
    );
    const prefixError = errors.length === 1 ? "Error" : "Errors";
    reject(
      getVerboseMessage({
        store,
        message: `${prefixError} at the upload of extension's ZIP with package ID ${packageId}:
      ${errors.join("\n")}
      `
      })
    );
  });
}

async function uploadZip({
  page,
  zip,
  packageId
}: {
  page: Page;
  zip: string;
  packageId: number;
}): Promise<boolean> {
  await page.waitForSelector(gSelectors.inputFile);
  const elInputFile = await page.$(gSelectors.inputFile);
  await elInputFile.uploadFile(zip);

  await page.$eval(gSelectors.buttonUploadNewVersion, elSubmit => {
    return new Promise(resolve => {
      // @ts-ignore
      elSubmit.click();
      resolve(true);
      new MutationObserver(() => {}).observe(elSubmit, {
        attributes: true,
        attributeFilter: ["disabled"]
      });
    });
  });

  return getErrorsOrNone(page, packageId);
}

async function openRelevantExtensionPage(page: Page, packageId: number) {
  const urlExtension = `https://addons.opera.com/developer/package/${packageId}?tab=versions`;
  return new Promise(async (resolve, reject) => {
    page.on("response", response => {
      if (
        response.url() !==
        `https://addons.opera.com/api/developer/packages/${packageId}/`
      ) {
        return;
      }

      if (response.statusText() === "Not Found") {
        reject(
          getVerboseMessage({
            store,
            message: `Extension with package ID ${packageId} does not exist`
          })
        );
        return;
      }
      resolve(true);
    });
    await page.goto(urlExtension);
  });
}

async function verifyPublicCodeExistence(page: Page) {
  await page.waitForSelector(gSelectors.inputCodePublic);

  const isSourceInputEmpty = async () => {
    const elInputPublic = await page.$(gSelectors.inputCodePublic);
    const elInputPrivate = await page.$(gSelectors.inputCodePrivate);
    // @ts-ignore
    return !elInputPublic.value || !elInputPrivate.value;
  };

  if (!(await isSourceInputEmpty())) {
    return;
  }

  const urlSource = await prompt(
    getVerboseMessage({
      store,
      message: "Enter URL of source code: "
    })
  );
  return new Promise(async (resolve, reject) => {
    if (!urlSource) {
      reject(
        getVerboseMessage({
          store,
          message: "Providing source code is required"
        })
      );
      return;
    }
    resolve(true);
  });
}

async function updateExtension({
  page,
  packageId
}: {
  page: Page;
  packageId: number;
}) {
  await page.click(gSelectors.buttonNext);

  return new Promise(async (resolve, reject) => {
    const errors = await page.$$eval(gSelectors.listErrors, elErrors =>
      [...elErrors].map(elError =>
        elError.querySelector(".ng-scope").textContent.trim()
      )
    );
    if (errors.length === 0) {
      resolve(true);
      return;
    }

    const prefixError = errors.length === 1 ? "Error" : "Errors";
    reject(
      getVerboseMessage({
        store,
        message: `${prefixError} at the upload of extension's ZIP with package ID ${packageId}:
      ${errors.join("\n")}
      `
      })
    );
  });
}

async function addChangelogIfNeeded({
  page,
  changelog
}: {
  page: Page;
  changelog?: string;
}) {
  // If the extension is available in English,
  // the changelog will be filled into the English textarea

  // If the extension is NOT available in English, the
  // extension dashboard will fall back to the first language
  // that IS supported, and its textarea will be filled instead
  await page.goto(`${page.url()}?tab=translations&language=en`);
  if (changelog) {
    await page.type(gSelectors.inputChangelog, changelog);
    await page.click(gSelectors.buttonSubmitChangelog);
  }

  const url = page.url().split("?")[0];
  await page.goto(url);
}

export default async function deployToOpera({
  email,
  password,
  twoFactor,
  packageId,
  zip,
  changelog,
  verbose: isVerbose
}: OperaOptions): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    puppeteer.use(require("puppeteer-extra-plugin-stealth")());

    const browser = await puppeteer.launch({
      // @ts-ignore
      // headless: true,
      // args: ["--window-size=1280,720", "--window-position=0,0"]
      // @ts-ignore
      defaultViewport: { width: 1280, height: 720 }
    });

    const [page] = await browser.pages();

    await disableImages(page);

    const urlStart = "https://addons.opera.com/developer";
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
      password,
      twoFactor
    });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: "Logged into the store"
        })
      );
    }
    try {
      await openRelevantExtensionPage(page, packageId);
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
      await uploadZip({
        page,
        zip: getFullPath(zip),
        packageId
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

    try {
      await verifyPublicCodeExistence(page);
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    await addChangelogIfNeeded({ page, changelog });

    try {
      await updateExtension({ page, packageId });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

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
