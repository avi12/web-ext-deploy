"use strict";

import puppeteer from "puppeteer";
import urls from "./stores.json";
import dotenv from "dotenv";

dotenv.config();

const gSelectors = {
  twoFactor: ".totp-code",
  listExtensions: ".DevHub-MyAddons-list",
  buttonManageExtensions: "a.Button",
  buttonSubmit: "button[type=submit]",
  inputEmail: "input[type=email]",
  inputPassword: "input[type=password]",
  buttonVersionStatus: ".DevHub-MyAddons-VersionStatus",
  buttonUploadNewVersion: ".version-upload",
};

async function typeToField(page, selector, value) {
  await page.waitForSelector(selector);
  await page.type(selector, value);
  await page.click(gSelectors.buttonSubmit);
}

/**
 * @param {Page} page
 * @param {string|number} twoFactor
 * @returns {Promise<void>}
 */
async function handleTwoFactor(page, twoFactor) {
  const value = twoFactor;
  const {
    _remoteObject: { description },
  } = await Promise.race([
    page.waitForSelector(gSelectors.twoFactor),
    page.waitForSelector(gSelectors.listExtensions),
  ]);

  if (description.includes(gSelectors.twoFactor)) {
    await page.type(gSelectors.twoFactor, value);
    await page.click(gSelectors.buttonSubmit);
  }
}
/**
 * @param {Page} page
 * @param {string} email
 * @param {string} password
 * @param {string?} twoFactor
 * @returns {Promise<void>}
 */
async function loginToStore(page, { email, password, twoFactor }) {
  await page.click(gSelectors.buttonManageExtensions);

  await typeToField(page, gSelectors.inputEmail, email);
  await typeToField(page, gSelectors.inputPassword, password);
  await handleTwoFactor(page, twoFactor);
}

/**
 * @param {Page} page
 * @param {string} extName
 * @returns {Promise<void>}
 */
async function openRelevantExtensionPage(page, extName) {
  await page.waitForSelector(gSelectors.listExtensions);

  /**
   * @type {ElementHandle[]}
   */
  const itemNames = await page.$$eval(gSelectors.listExtensions, elItemNames =>
    elItemNames.map(elItemName =>
      elItemName.innerText.split("\n")[0].toLowerCase()
    )
  );

  const iItem = itemNames.findIndex(innerText => innerText === extName);
  const selectorVersionStatus = `${
    gSelectors.buttonVersionStatus
  }:nth-of-type(${iItem + 1})`;
  await page.click(selectorVersionStatus);
}

/**
 * @param {Page} page
 * @returns {Promise<void>}
 */
async function clickUploadNewVersion(page) {
  await page.waitForSelector(gSelectors.buttonUploadNewVersion);
  await page.click(gSelectors.buttonUploadNewVersion);
}

async function deployExtension({
  email = "",
  password = "",
  twoFactor = "",
  extName = "",
}) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  await page.goto(urls.firefox, { waitUntil: "networkidle0" });

  await loginToStore(page, {
    email,
    password,
    twoFactor,
  });

  await openRelevantExtensionPage(page, extName.toLowerCase());
  await clickUploadNewVersion(page);
}

deployExtension({
  email: process.env.EMAIL,
  password: process.env.PASSWORD,
  twoFactor: process.env.TWO_FACTOR,
  extName: process.env.EXT_NAME,
}).catch(console.error);
