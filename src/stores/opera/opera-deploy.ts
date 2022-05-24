import { OperaOptions } from "./opera-input";
import puppeteer, { Page, WrapElementHandle } from "puppeteer";

import { disableImages, getExtInfo, getFullPath, getVerboseMessage, logSuccessfullyPublished } from "../../utils";

const store = "Opera";

const gSelectors = {
  listErrors: ".alert-danger",
  listPackages: "[ng-repeat*=packageVersion]",
  tabs: `.nav-tabs [ng-bind-html="tab.name"]`,
  tabsLanguages: `.nav-stacked [ng-bind-html="tab.name"]`,
  buttonSubmit: "[ng-click*=submit]",
  buttonUploadNewVersion: `[ng-click*="upload()"]`,
  buttonCancel: "[ng-click*=cancel]",
  inputFile: "input[type=file]",
  inputCodePublic: `editable-field[field-value="packageVersion.source_url"] input`,
  inputCodePrivate: `editable-field[field-value="packageVersion.source_for_moderators_url"] input`,
  inputChangelog: `history-tab[param=en] editable-field[field-value="translation.changelog"] textarea`,
  buttonSubmitChangelog: `editable-field span[ng-click="$ctrl.updateValue()"]`
};

async function getErrorsOrNone({ page, packageId }: { page: Page; packageId: number }): Promise<boolean | number> {
  return new Promise(async (resolve, reject) => {
    await Promise.race([
      page.waitForSelector(gSelectors.listErrors),
      page.waitForNavigation({ waitUntil: "networkidle0" })
    ]);

    const errors = await page.$$eval(gSelectors.listErrors, elErrors =>
      [...elErrors]
        .map(elError => elError.children[1].textContent.trim())
        .map(error => {
          if (error.includes("already uploaded")) {
            return error.split(". ")[0];
          }
          return error;
        })
    );
    if (page.url().match(/(\d|\?tab=conversation)$/) || errors.length === 0) {
      resolve(true);
      return;
    }
    if (errors.length > 0 && errors[errors.length - 1].match(/500|not a valid/)) {
      resolve(500);
    }
    const prefixError = errors.length === 1 ? "Error" : "Errors";
    reject(
      getVerboseMessage({
        store,
        message: `${prefixError} at the upload of extension's ZIP with package ID ${packageId}:
      ${errors.join("\n")}
      `,
        prefix: "Error"
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
}): Promise<boolean | number> {
  return new Promise(async (resolve, reject) => {
    const clickUploadWhenPossible = async (): Promise<void> => {
      await page.waitForSelector(gSelectors.buttonUploadNewVersion);
      return page.click(gSelectors.buttonUploadNewVersion);
    };

    clickUploadWhenPossible()
      .then(() => getErrorsOrNone({ page, packageId }))
      .then(errors => {
        const isUploadSuccessful = typeof errors === "boolean";
        if (isUploadSuccessful) {
          resolve(true);
          return;
        }

        resolve(uploadZip({ page, zip, packageId }));
      })
      .catch(reject);

    await page.waitForSelector(gSelectors.inputFile);
    const elInputFile = await page.$(gSelectors.inputFile);
    await elInputFile.uploadFile(zip);
  });
}

async function switchToTabVersions({ page }: { page: Page }): Promise<void> {
  await page.waitForSelector(gSelectors.tabs);
  const elTabs = await page.$$(gSelectors.tabs);
  const elTabVersions = elTabs[1];
  await elTabVersions.click();
}

async function openRelevantExtensionPage({ page, packageId }: { page: Page; packageId: number }): Promise<unknown> {
  const urlExtension = getBaseDashboardUrl(packageId);
  return new Promise(async (resolve, reject) => {
    const responseListener = (response: puppeteer.HTTPResponse): void => {
      if (response.url() !== `https://addons.opera.com/api/developer/packages/${packageId}/`) {
        const isCookieInvalid = response.url().startsWith("https://auth.opera.com");
        if (isCookieInvalid) {
          reject(
            getVerboseMessage({
              store,
              message:
                "Invalid/expired authentication cookie. Please get a new one, e.g. by running: web-ext-deploy --get-cookies=opera",
              prefix: "Error"
            })
          );
        }
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
      page.off("response", responseListener);
      switchToTabVersions({ page }).then(() => resolve(true));
    };
    page.on("response", responseListener);

    page.goto(urlExtension).catch(() => {});
  });
}

async function verifyPublicCodeExistence({ page }: { page: Page }): Promise<void> {
  await page.waitForSelector(gSelectors.inputCodePublic);

  const getInputValue = async (selector: string): Promise<WrapElementHandle<string>> =>
    page.$eval(selector, (elInput: HTMLInputElement) => elInput.value);

  const isSourceInputFull = async (): Promise<boolean> => {
    const inputPublic = await getInputValue(gSelectors.inputCodePublic);
    const inputPrivate = await getInputValue(gSelectors.inputCodePrivate);
    return Boolean(inputPublic || inputPrivate);
  };

  if (await isSourceInputFull()) {
    return;
  }

  const urlCurrent = page.url();

  console.log(
    getVerboseMessage({
      store,
      message: `You must provide a link to your extension's source code. ${urlCurrent}`,
      prefix: "Error"
    })
  );
}

async function updateExtension({ page, packageId }: { page: Page; packageId: number }): Promise<true> {
  await page.click(gSelectors.buttonSubmit);

  return new Promise(async (resolve, reject) => {
    const errors = await page.$$eval(gSelectors.listErrors, elErrors =>
      [...elErrors].map(elError => elError.querySelector(".ng-scope").textContent.trim())
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
      `,
        prefix: "Error"
      })
    );
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
    const tabs = await page.$$(gSelectors.tabs);
    await tabs[2].click();
  };

  const switchToEnglishMetadata = async (): Promise<void> => {
    await page.$$eval(
      gSelectors.tabsLanguages,
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

    await page.waitForSelector(gSelectors.inputChangelog);
    await page.$eval(gSelectors.inputChangelog, (elInput: HTMLInputElement) => {
      elInput.value = "";
    });
    await page.type(gSelectors.inputChangelog, changelog);
    await page.click(gSelectors.buttonSubmitChangelog);

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Added changelog: ${changelog}`
        })
      );
    }
  }

  const url = page.url().split("?")[0];
  await page.goto(url, { waitUntil: "networkidle0" });
}

async function addLoginCookie({
  page,
  sessionid,
  csrftoken
}: {
  page: Page;
  sessionid: string;
  csrftoken: string;
}): Promise<void> {
  const domain = "addons.opera.com";
  const cookies = [
    {
      name: "sessionid",
      value: sessionid,
      domain
    },
    {
      name: "csrftoken",
      value: csrftoken,
      domain
    }
  ];

  await page.setCookie(...cookies);
}

function getBaseDashboardUrl(packageId: number): string {
  return `https://addons.opera.com/developer/package/${packageId}`;
}

async function cancelUpload({ page }: { page: Page }): Promise<void> {
  await page.goto(page.url().split("?")[0], { waitUntil: "networkidle0" });
  await page.click(gSelectors.buttonCancel);
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
    await page.waitForSelector(gSelectors.buttonCancel);
    await page.click(gSelectors.buttonCancel);

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
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
      // @ts-ignore
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
    const puppeteerArgs =
      process.env.NODE_ENV === "development"
        ? {
            headless: false,
            defaultViewport: { width, height },
            args: [`--window-size=${width},${height}`] //, "--window-position=0,0"],
          }
        : {};
    const browser = await puppeteer.launch(puppeteerArgs);

    const [page] = await browser.pages();
    await disableImages(page);
    await addLoginCookie({ page, sessionid, csrftoken });
    const urlStart = `${getBaseDashboardUrl(packageId)}?tab=versions`;

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Launched a Puppeteer session in ${urlStart}`
        })
      );
    }

    try {
      await openRelevantExtensionPage({ page, packageId });
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

    await switchToTabVersions({ page });

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

    await verifyPublicCodeExistence({ page });
    await addChangelogIfNeeded({ page, changelog, isVerbose, zip });

    try {
      await updateExtension({ page, packageId });
    } catch (e) {
      await cancelUpload({ page });
      await browser.close();
      reject(e);
      return;
    }

    logSuccessfullyPublished({ extId: packageId, store, zip });

    await browser.close();
    resolve(true);
  });
}
