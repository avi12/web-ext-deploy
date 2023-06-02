import { Browser, BrowserContext, chromium, Page, Response } from "playwright";
import { OperaOptions } from "./opera-input.js";
import { getExtInfo, getFullPath, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";

const STORE = "Opera";
enum SELECTORS {
  listErrors = ".alert-danger",
  tabs = `.nav-tabs [ng-bind-html="tab.name"]`,
  tabsLanguages = `.nav-stacked [ng-bind-html="tab.name"]`,
  buttonSubmit = "[ng-click='submitForModeration()']",
  buttonUploadNewVersion = `[ng-click*="upload"]`,
  buttonCancel = "[ng-click*=cancel]",
  inputFile = "input[type=file]",
  inputCodePublic = `editable-field[field-value="packageVersion.source_url"] input`,
  inputCodePrivate = `editable-field[field-value="packageVersion.source_for_moderators_url"] input`,
  inputChangelog = `history-tab[param=en] editable-field[field-value="translation.changelog"] textarea`,
  buttonSubmitChangelog = `editable-field span[ng-click="$ctrl.updateValue()"]`
}

async function verifyUploadIsValid({
  page,
  packageId
}: {
  page: Page;
  packageId: number;
}): Promise<{ errors: boolean; message?: string }> {
  await Promise.race([page.waitForSelector(SELECTORS.listErrors), page.waitForLoadState("networkidle")]);

  const errors = await page.$$eval(SELECTORS.listErrors, (elErrors: HTMLElement[]) =>
    [...elErrors].map(elError => elError.children[1].textContent.trim())
  );
  if (page.url().match(/(\d|\?tab=conversation)$/) || errors.length === 0) {
    return { errors: false };
  }
  if (errors.length > 0 && errors[errors.length - 1].match(/500|not a valid/)) {
    return { errors: false };
  }
  const prefixError = errors.length === 1 ? "Error" : "Errors";
  return {
    errors: true,
    message: getVerboseMessage({
      store: STORE,
      message: `${prefixError} at the upload of extension's ZIP with package ID ${packageId}:
      ${errors.join("\n")}
      `,
      prefix: "Error"
    })
  };
}

async function uploadZip({ page, zip, packageId }: { page: Page; zip: string; packageId: number }): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    await page.setInputFiles(SELECTORS.inputFile, zip);
    await page.click(SELECTORS.buttonUploadNewVersion);

    const { errors, message } = await verifyUploadIsValid({ page, packageId });
    if (errors) {
      reject({ error: message, failType: "upload" });
      return;
    }
    resolve(true);
  });
}

async function switchToTabVersions({ page }: { page: Page }): Promise<void> {
  await page.waitForSelector(SELECTORS.tabs);
  const [, elTabVersions] = await page.$$(SELECTORS.tabs);
  await elTabVersions.click();
}

async function openRelevantExtensionPage({
  page,
  packageId,
  urlStart
}: {
  page: Page;
  packageId: number;
  urlStart: string;
}): Promise<void> {
  await new Promise(async (resolve, reject) => {
    const listener = async (response: Response): Promise<void> => {
      if (response.url() !== `https://addons.opera.com/api/developer/packages/${packageId}/`) {
        const isCookieInvalid = response.url().startsWith("https://auth.opera.com");
        if (isCookieInvalid) {
          reject(
            getVerboseMessage({
              store: STORE,
              message:
                "Invalid/expired authentication cookie. Please get a new one, e.g. by running: web-ext-deploy --get-cookies=opera",
              prefix: "Error"
            })
          );
        }
        return;
      }

      if (response.statusText() === "Not Found") {
        page.off("response", listener);
        reject(
          getVerboseMessage({
            store: STORE,
            message: `Extension with package ID ${packageId} does not exist`
          })
        );
        return;
      }
      await switchToTabVersions({ page });
      page.off("response", listener);
      resolve(true);
    };
    page.on("response", listener);

    await page.goto(urlStart);
  });
}

async function verifyPublicCodeExistence({ page }: { page: Page }): Promise<void> {
  await page.waitForSelector(SELECTORS.inputCodePublic);

  const getInputValue = async (selector: string): Promise<string> =>
    page.$eval(selector, (elInput: HTMLInputElement) => elInput.value);

  const isSourceInputFull = async (): Promise<boolean> => {
    const inputPublic = await getInputValue(SELECTORS.inputCodePublic);
    const inputPrivate = await getInputValue(SELECTORS.inputCodePrivate);
    return Boolean(inputPublic || inputPrivate);
  };

  if (await isSourceInputFull()) {
    return;
  }

  const urlCurrent = page.url();

  console.log(
    getVerboseMessage({
      store: STORE,
      message: `You must provide a link to your extension's source code. ${urlCurrent}`,
      prefix: "Error"
    })
  );
}

async function updateExtension({ page, packageId }: { page: Page; packageId: number }): Promise<true> {
  await page.click(SELECTORS.buttonSubmit);

  return new Promise(async (resolve, reject) => {
    const errors = await page.$$eval(SELECTORS.listErrors, elErrors =>
      [...elErrors].map(elError => elError.querySelector(".ng-scope").textContent.trim())
    );
    if (errors.length === 0) {
      resolve(true);
      return;
    }

    const prefixError = errors.length === 1 ? "Error" : "Errors";
    reject({
      error: getVerboseMessage({
        store: STORE,
        message: `${prefixError} at the upload of extension's ZIP with package ID ${packageId}:
      ${errors.join("\n")}
      `,
        prefix: "Error"
      }),
      failType: "update"
    });
  });
}

async function addChangelogIfNeeded({
  page,
  changelog,
  isVerbose,
  zip
}: {
  page: Page;
  changelog?: string;
  isVerbose: boolean;
  zip: string;
}): Promise<void> {
  const switchToTabTranslations = async (): Promise<void> => {
    const tabs = await page.$$(SELECTORS.tabs);
    await tabs[2].click();
  };

  const switchToEnglishMetadata = async (): Promise<void> => {
    await page.$$eval(
      SELECTORS.tabsLanguages,
      (elLanguages: HTMLSpanElement[], default_locale: string) => {
        const elTabEnglish = elLanguages.find(elLanguage =>
          elLanguage.textContent.includes(`(${default_locale})`)
        ) as HTMLSpanElement;
        elTabEnglish.click();
      },
      getExtInfo(zip, "default_locale") || "en"
    );
  };

  if (changelog) {
    await switchToTabTranslations();
    await switchToEnglishMetadata();

    await page.waitForSelector(SELECTORS.inputChangelog);
    await page.evaluate(SELECTORS.inputChangelog, (elInput: HTMLInputElement) => {
      elInput.value = "";
    });
    await page.type(SELECTORS.inputChangelog, changelog);
    await page.click(SELECTORS.buttonSubmitChangelog);

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Added changelog: ${changelog}`
        })
      );
    }
  }

  await page.goto(page.url().split("?")[0]);
}

async function addLoginCookie({
  context,
  sessionid,
  csrftoken
}: {
  context: BrowserContext;
  sessionid: string;
  csrftoken: string;
}): Promise<void> {
  const domain = "addons.opera.com";
  await context.addCookies([
    {
      name: "sessionid",
      value: sessionid,
      domain,
      path: "/"
    },
    {
      name: "csrftoken",
      value: csrftoken,
      domain,
      path: "/"
    }
  ]);
}

function getBaseDashboardUrl(packageId: number): string {
  return `https://addons.opera.com/developer/package/${packageId}`;
}

async function cancelUpload({ page }: { page: Page }): Promise<void> {
  await page.goto(page.url().split("?")[0]);
  await page.click(SELECTORS.buttonCancel);
}

async function deleteCurrentVersionIfAlreadyExists({
  page,
  packageId,
  zip,
  isVerbose
}: {
  page: Page;
  packageId: number;
  zip: string;
  isVerbose: boolean;
}): Promise<boolean> {
  const deletePackage = async (): Promise<void> => {
    await page.waitForSelector(SELECTORS.buttonCancel);
    const { error } = await page.$eval<{ error: null | string }>(
      SELECTORS.buttonCancel,
      (elButton: HTMLButtonElement) => {
        return new Promise(resolve => {
          if (elButton.disabled) {
            resolve({ error: "Version is already deployed" });
            return;
          }
          elButton.click();
          resolve({ error: null });
        });
      }
    );
    if (error) {
      throw new Error(
        getVerboseMessage({
          store: STORE,
          message: error,
          prefix: "Error"
        })
      );
    }

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Deleted existing package version ${version}`
        })
      );
    }
  };

  const version = getExtInfo(zip, "version");

  const selVersions = "[ng-model=selectedVersion]";
  await page.waitForSelector(selVersions);
  const isExists = await page.$eval(
    selVersions,
    (elVersions: HTMLSelectElement, version) =>
      [...elVersions.options].some(elOption => elOption.textContent === version),
    version
  );

  if (isExists) {
    await page.goto(`${getBaseDashboardUrl(packageId)}/version/${version}`);
    await deletePackage();
    return true;
  }

  return false;
}

async function prepareToDeploy({
  browser,
  page,
  packageId,
  zip,
  isVerbose,
  urlStart,
  changelog
}: {
  browser: Browser;
  page: Page;
  packageId: number;
  zip: string;
  isVerbose: boolean;
  urlStart: string;
  changelog?: string;
}): Promise<{ error?: string }> {
  return new Promise(async resolve => {
    const isDeleted = await deleteCurrentVersionIfAlreadyExists({
      page,
      packageId,
      zip,
      isVerbose
    });
    if (isDeleted) {
      await page.reload();
      await page.goto(urlStart);
    }

    return switchToTabVersions({ page })
      .then(() =>
        uploadZip({
          page,
          zip: getFullPath(zip),
          packageId
        })
      )
      .then(() => {
        if (isVerbose) {
          console.log(
            getVerboseMessage({
              store: STORE,
              message: `Uploaded ZIP: ${zip}`
            })
          );
        }
      })
      .then(() => verifyPublicCodeExistence({ page }))
      .then(() => addChangelogIfNeeded({ page, changelog, isVerbose, zip }))
      .then(() => updateExtension({ page, packageId }))
      .then(() => resolve({ error: "" }))
      .catch(async ({ error, failType }) => {
        if (failType === "upload") {
          await cancelUpload({ page });
        }
        await browser.close();
        resolve({ error });
      });
  });
}

export default async function deployToOpera({
  sessionid,
  csrftoken,
  packageId,
  zip,
  changelog = "",
  verbose: isVerbose
}: OperaOptions): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    const [width, height] = [1280, 720];
    const isDev = process.env.NODE_ENV === "development";
    const browser = await chromium.launch(
      isDev && {
        headless: false,
        args: [`--window-size=${width},${height}`] //, "--window-position=0,0"]
      }
    );
    const context = await browser.newContext(isDev && { viewport: { width, height } });

    await addLoginCookie({ context, sessionid, csrftoken });
    const page = await context.newPage();
    const urlStart = `${getBaseDashboardUrl(packageId)}?tab=versions`;

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Launched a Playwright session in ${urlStart}`
        })
      );
    }

    try {
      await openRelevantExtensionPage({ page, packageId, urlStart });
    } catch (e) {
      await browser.close();
      reject(e);
      return;
    }

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: "Opened relevant extension page"
        })
      );
    }

    let error;
    do {
      ({ error } = await prepareToDeploy({ browser, page, packageId, zip, isVerbose, urlStart, changelog }));
    } while (error?.includes("400"));

    logSuccessfullyPublished({ extId: packageId, store: STORE, zip });
    await browser.close();
    resolve(true);
  });
}
