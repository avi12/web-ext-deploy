import { OperaOptions } from "./opera-input";
import puppeteer, { Page } from "puppeteer";

import {
  disableImages,
  getExtInfo,
  getFullPath,
  getVerboseMessage,
  logSuccessfullyPublished
} from "../../utils";

const store = "Opera";

const gSelectors = {
  listErrors: ".alert-danger",
  listPackages: "[ng-repeat*=packageVersion]",
  tabs: `[ng-click="select($event)"]`,
  buttonSubmit: "[ng-click*=submit]",
  buttonUploadNewVersion: `[ng-click*="upload()"]`,
  buttonCancel: "[ng-click*=cancel]",
  inputFile: "input[type=file]",
  inputCodePublic: `editable-field[field-value="packageVersion.source_url"] input`,
  inputCodePrivate: `editable-field[field-value="packageVersion.source_for_moderators_url"] input`,
  inputChangelog: `history-tab[param=en] editable-field[field-value="translation.changelog"] textarea`,
  buttonSubmitChangelog: `editable-field span[ng-click="$ctrl.updateValue()"]`
};

async function getErrorsOrNone({
  page,
  packageId
}: {
  page: Page;
  packageId: number;
}): Promise<boolean | number> {
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
    if (
      errors.length > 0 &&
      errors[errors.length - 1].match(/500|not a valid/)
    ) {
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
    const clickUploadWhenPossible = async () =>
      page.evaluate((selUpload: string) => {
        new Promise(resolve => {
          new MutationObserver(() => {
            const elUpload = document.querySelector(selUpload) as HTMLElement;
            if (elUpload) {
              elUpload.click();
              resolve(true);
            }
          }).observe(document.body, {
            childList: true,
            subtree: true
          });
        });
      }, gSelectors.buttonUploadNewVersion);

    clickUploadWhenPossible()
      .then(() => getErrorsOrNone({ page, packageId }))
      .then(errors => {
        const isUploadSuccessful = typeof errors === "boolean";
        if (isUploadSuccessful) {
          resolve(true);
          return;
        }

        // @ts-ignore
        resolve(uploadZip({ page, zip, packageId }));
      })
      .catch(reject);

    await page.waitForSelector(gSelectors.inputFile);
    const elInputFile = await page.$(gSelectors.inputFile);
    await elInputFile.uploadFile(zip);
  });
}

async function switchToTabVersions({ page }: { page: Page }) {
  await page.waitForSelector(gSelectors.tabs);
  const elTabs = await page.$$(gSelectors.tabs);
  const elTabVersions = elTabs[1];
  await elTabVersions.click();
}

async function openRelevantExtensionPage({
  page,
  packageId
}: {
  page: Page;
  packageId: number;
}) {
  const urlExtension = getBaseDashboardUrl(packageId);
  return new Promise(async (resolve, reject) => {
    const responseListener = response => {
      if (
        response.url() !==
        `https://addons.opera.com/api/developer/packages/${packageId}/`
      ) {
        const isCookieInvalid = response
          .url()
          .startsWith("https://auth.opera.com");
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

async function verifyPublicCodeExistence({ page }: { page: Page }) {
  await page.waitForSelector(gSelectors.inputCodePublic);

  const getInputValue = async selector =>
    page.$eval(selector, (elInput: HTMLInputElement) => elInput.value);

  const isSourceInputFull = async () => {
    const inputPublic = await getInputValue(gSelectors.inputCodePublic);
    const inputPrivate = await getInputValue(gSelectors.inputCodePrivate);
    return inputPublic || inputPrivate;
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

async function updateExtension({
  page,
  packageId
}: {
  page: Page;
  packageId: number;
}) {
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
  isVerbose
}: {
  page: Page;
  changelog?: string;
  isVerbose: boolean;
}) {
  // If the extension is available in English,
  // the changelog will be filled into the English textarea

  // If the extension is NOT available in English, the
  // extension dashboard will fall back to the first language
  // that IS supported, and its textarea will be filled instead
  await page.goto(`${page.url()}?tab=translations&language=en`);
  if (changelog) {
    await page.waitForSelector(gSelectors.inputChangelog);
    await page.type(gSelectors.inputChangelog, changelog);
    await page.click(gSelectors.buttonSubmitChangelog);

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: "Firefox",
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
  sessionid
}: {
  page: Page;
  sessionid: string;
}) {
  const domain = "addons.opera.com";
  const cookies = [
    {
      name: "sessionid",
      value: sessionid,
      domain
    },
    {
      name: "csrftoken",
      value: "8H2vyjMA91ozfeDXEIrTy3rG4VXt3ErfuaftZrLp4ssXqzY7cI9vAuSW110VYVl7",
      domain
    }
  ];

  await page.setCookie(...cookies);
}

function getBaseDashboardUrl(packageId: number) {
  return `https://addons.opera.com/developer/package/${packageId}`;
}

async function cancelUpload({ page }: { page: Page }) {
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
}) {
  const deletePackage = async () => {
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
      [...elVersions.options].some(
        elOption => elOption.textContent === version
      ),
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
    await addLoginCookie({ page, sessionid });
    const urlStart = `${getBaseDashboardUrl(packageId)}?tab=versions`;

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Launched Puppeteer session in ${urlStart}`
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
      await switchToTabVersions({ page });
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
          message: `Uploading ZIP: ${zip}`
        })
      );
    }

    await verifyPublicCodeExistence({ page });

    await addChangelogIfNeeded({ page, changelog, isVerbose });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store,
          message: "Uploaded ZIP"
        })
      );
    }

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
