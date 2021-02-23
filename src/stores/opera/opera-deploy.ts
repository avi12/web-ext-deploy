import { OperaOptions } from "./opera-input";
import puppeteer from "puppeteer-extra";
import pluginReCaptcha from "puppeteer-extra-plugin-recaptcha";
import { Page } from "puppeteer";
import prompt from "prompt-promise";
import { disableImages, getFullPath } from "../../utils";

const gSelectors = {
  listExtensions: ".list-group",
  inputsTwoFactor: ".otp-input",
  twoFactorError: ".msg-error",
  twoFactorErrorAgain: "#error-tooltip-1054",
  twoFactorErrorAgainWait: "#error-tooltip-114",
  extEntryName: ".DevHub-MyAddons-item-name",
  listErrors: ".alert-danger",
  buttonManageExtensions: "a.Button",
  buttonSubmit: "button[type=submit]",
  buttonUploadNewVersion: `[ng-click*="upload()"]`,
  inputEmail: "input[name=email]",
  inputPassword: "input[type=password]",
  inputFile: "input[type=file]",
  inputCodePublic: `editable-field[field-value="packageVersion\\.source_url"] input`,
  inputCodePrivate: `editable-field[field-value="packageVersion\\.source_for_moderators_url"] input`,
  inputChangelog: `editable-field[field-value="translation\\.changelog"] textarea`
};

async function getEvaluation(page: Page, selectors: string[]): Promise<string> {
  const promises = selectors.map(selector => page.waitForSelector(selector));
  const {
    // @ts-ignore
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
    gSelectors.inputsTwoFactor,
    gSelectors.extEntryName
  ]);

  if (!description.includes(gSelectors.inputsTwoFactor)) {
    return;
  }
  const messageTwoFactor = "Enter two-factor code: ";

  if (!twoFactor) {
    twoFactor = await prompt(getVerboseMessage(messageTwoFactor));
  }
  const twoFactorString = twoFactor.toString();
  const elInputs = await page.$$(gSelectors.inputsTwoFactor);
  for (let i = 0; i < elInputs.length; i++) {
    await elInputs[i].type(twoFactorString[i]);
  }
  await page.click(gSelectors.buttonSubmit);
  return new Promise(async (resolve, reject) => {
    do {
      const description = await getEvaluation(page, [
        gSelectors.twoFactorError,
        gSelectors.listExtensions
      ]);

      if (!description.includes(gSelectors.twoFactorError)) {
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

      const twoFactor = await prompt(getVerboseMessage(messageTwoFactor));
      const elInputs = await page.$$(gSelectors.inputsTwoFactor);
      for (let i = 0; i < elInputs.length; i++) {
        await clearInput(
          page,
          `${gSelectors.inputsTwoFactor}:nth-of-type(${i + 1})`
        );
        await elInputs[i].type(twoFactor[i]);
      }
      await page.click(gSelectors.buttonSubmit);
      // eslint-disable-next-line no-constant-condition
    } while (true);
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
  await page.click(gSelectors.buttonSubmit);

  return new Promise(async (resolve, reject) => {
    const { error } = await page.solveRecaptchas();
    if (error) {
      // If failed to solve the reCAPTCHA v2 on Opera's login,
      // simply restart the Puppeteer browser
      reject("invalid-token");
      return;
    }

    await handleTwoFactor(page, twoFactor);
    resolve(true);
  });
}

async function getErrorsOrNone(
  page: Page,
  packageId: number
): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    const description = await getEvaluation(page, [gSelectors.listErrors]);
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
      getVerboseMessage(
        `${prefixError} at the upload of extension's ZIP with package ID ${packageId}:
      ${errors.join("\n")}
      `,
        ""
      )
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

function getVerboseMessage(message: string, prefix = "Info"): string {
  const msg = `${prefix} Opera: ${message}`;
  if (prefix === "") {
    return msg.trim();
  }
  return msg;
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
          getVerboseMessage(
            `Extension with package ID ${packageId} does not exist`,
            "Error:"
          )
        );
        return;
      }
      resolve(true);
    });
    await page.goto(urlExtension);
  });
}

function getError(e: string): string {
  const errorParts = e.split("\n")[0].split("Opera");
  if (errorParts.length === 1) {
    return e;
  }
  return "Opera" + errorParts[1];
}

async function verifyPublicCodeExistence(page: Page) {
  await page.waitForSelector(gSelectors.inputCodePublic);

  const isSourceInputEmpty = (async () => {
    const elInputPublic = await page.$(gSelectors.inputCodePublic);
    const elInputPrivate = await page.$(gSelectors.inputCodePrivate);
    // @ts-ignore
    return !elInputPublic.value || !elInputPrivate.value;
  })();

  if (!isSourceInputEmpty) {
    return;
  }

  const urlSource = await prompt(
    getVerboseMessage("Enter URL of source code: ")
  );
  return new Promise(async (resolve, reject) => {
    if (!urlSource) {
      reject(getVerboseMessage("Providing source code is required", "Error:"));
      return;
    }
    resolve(true);
  });
}

async function updateExtension(page: Page, packageId: number) {
  await page.click(gSelectors.buttonSubmit);

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
      getVerboseMessage(
        `${prefixError} at the upload of extension's ZIP with package ID ${packageId}:
      ${errors.join("\n")}
      `,
        ""
      )
    );
  });
}

async function addChangelogIfNeeded(page: Page, changelog: string) {
  await page.goto(`${page.url()}?tab=translations&language=en`);
  await page.type(gSelectors.inputChangelog, changelog);

  const url = page.url().split("?")[0];
  await page.goto(url);
}

export default async function deployToOpera(options: OperaOptions) {
  const {
    email,
    password,
    twoFactor,
    packageId,
    zip,
    changelog,
    reCaptchaSolver,
    reCaptchaApiKey,
    verbose: isVerbose
  } = options;
  puppeteer.use(
    pluginReCaptcha({
      provider: {
        id: reCaptchaSolver,
        token: reCaptchaApiKey
      }
    })
  );

  const browser = await puppeteer.launch({
    headless: false,
    args: ["--window-size=1280,720", "--window-position=0,0"],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = (await browser.pages())[0];

  await disableImages(page);

  const urlStart = "https://addons.opera.com/developer";
  await page.goto(urlStart, { waitUntil: "networkidle0" });
  if (isVerbose) {
    console.log(getVerboseMessage(`Launched Puppeteer session in ${urlStart}`));
    console.log(getVerboseMessage("Logging in"));
  }

  try {
    await loginToStore({
      page,
      email,
      password,
      twoFactor
    });
  } catch (e) {
    await browser.close();
    if (e === "invalid-token") {
      await deployToOpera(options);
    } else {
      throw new Error(e);
    }
  }

  if (isVerbose) {
    console.log(getVerboseMessage("Logged into the store"));
  }

  try {
    await openRelevantExtensionPage(page, packageId);
  } catch (e) {
    await browser.close();
    throw new Error(getError(e));
  }

  if (isVerbose) {
    console.log(getVerboseMessage("Opened relevant extension page"));
  }

  try {
    await uploadZip({
      page,
      zip: getFullPath(zip),
      packageId
    });
  } catch (e) {
    await browser.close();
    throw new Error(e);
  }

  if (isVerbose) {
    console.log(getVerboseMessage(`Uploaded ZIP: ${zip}`));
  }

  try {
    await verifyPublicCodeExistence(page);
  } catch (e) {
    await browser.close();
    throw new Error(getError(e));
  }

  await addChangelogIfNeeded(page, changelog);

  try {
    await updateExtension(page, packageId);
  } catch (e) {
    await browser.close();
    throw new Error(e);
  }


  console.log(getVerboseMessage("Finished uploading"));

  await browser.close();
  return true;
}
