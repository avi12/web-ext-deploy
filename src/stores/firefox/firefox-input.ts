import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils";
import deployToFirefox from "./firefox-deploy";

export class FirefoxOptions {
  /** The publisher account's email address. */
  email: string;

  /** The publisher account's password. */
  password: string;

  /** The two-factor code of the publisher account, if applicable. */
  twoFactor?: number;

  /** The extension ID. E.g. `https://addons.mozilla.org/en-US/developers/EXT_ID` */
  extId: string;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`).<br>
   * You can use `{version}` to pull the current version of the `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /**
   * If applicable, the path to the ZIP source, relative from the current working directory (`process.cwd()`).<br>
   * You can use `{version}` to pull the current version of the `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zipSource?: string;

  /**
   * A description of the changes in this version, compared to the previous one.<br>
   * It's recommended to use instead `--firefox-changelog` , so it's dynamic.
   */
  changelog?: string;

  /**
   * A description of the technical changes made in this version, compared to the previous one.<br>
   * This will only be seen by the Firefox Addons reviewers.<br>
   * It's recommended to use instead `--firefox-dev-changelog` , so it's dynamic.
   */
  devChangelog?: string;

  /** If enabled, all the actions taken for each store will be logged to the console. */
  verbose?: boolean;

  constructor({
    email,
    password,
    extId,
    zip,
    zipSource,
    changelog,
    devChangelog,
    verbose,
  }: {
    email: string;
    password: string;
    extId: string;
    zip: string;
    zipSource: string;
    changelog: string;
    devChangelog: string;
    verbose: boolean;
  }) {
    this.email = email;
    this.password = password;
    this.extId = extId;
    this.zip = zip;
    this.zipSource = zipSource;
    this.changelog = changelog;
    this.devChangelog = devChangelog;
    this.verbose = verbose;

    if (!this.email) {
      throw new Error(getErrorMessage("No email is provided"));
    }

    if (!this.password) {
      throw new Error(getErrorMessage("No password is provided"));
    }

    if (!this.extId) {
      throw new Error(getErrorMessage("No extension ID is provided"));
    }

    // Zip checking
    if (!this.zip) {
      throw new Error(getErrorMessage("No zip is provided"));
    }

    if (!getIsFileExists(this.zip)) {
      throw new Error(
        getErrorMessage(`Zip doesn't exist: ${getFullPath(this.zip)}`)
      );
    }

    if (this.zipSource && !getIsFileExists(this.zipSource)) {
      throw new Error(
        getErrorMessage(
          `Zip source doesn't exist: ${getFullPath(this.zipSource)}`
        )
      );
    }
  }
}

function getErrorMessage(message: string): string {
  return `Firefox: ${message}`;
}

export async function prepareToDeployFirefox(
  options: FirefoxOptions
): Promise<boolean | string> {
  // Validate the options
  // @ts-ignore
  new FirefoxOptions(options);

  options.zip = getCorrectZip(options.zip);
  if (options.zipSource) {
    options.zipSource = getCorrectZip(options.zipSource);
  }

  if (options.changelog) {
    options.changelog = options.changelog.split("\\\n").join("\n");
  }

  if (options.devChangelog) {
    options.devChangelog = options.devChangelog.split("\\\n").join("\n");
  }
  return deployToFirefox(options);
}

