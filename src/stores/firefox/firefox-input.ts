import chalk from "chalk";
import deployToFirefox from "./firefox-deploy.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";

export class FirefoxOptionsSubmissionApi {
  /** Get it from `https://addons.mozilla.org/addon/EXT_ID` */
  extId: string;

  /** Get it from the [Developer Hub](https://addons.mozilla.org/developers/addon/api/key/) */
  jwtIssuer: string;

  /** Get it from the [Developer Hub](https://addons.mozilla.org/developers/addon/api/key/) */
  jwtSecret: string;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`)<br>
   * You can use `{version}`, which will be replaced by the `version` entry from your `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /**
   * If applicable, the path to the ZIP source, relative from the current working directory (`process.cwd()`)<br>
   * You can use `{version}`, which will be replaced by the `version` entry from your `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zipSource?: string;

  /**
   * A description of the changes in this version, compared to the previous one<br>
   * It's recommended to use instead `--firefox-changelog`, so it stays up to date
   */
  changelog?: string;

  /**
   * A description of the technical changes made in this version, compared to the previous one<br>
   * This will only be seen by the Firefox Addons reviewers<br>
   * It's recommended to use instead `--firefox-dev-changelog`, so it stays up to date
   */
  devChangelog?: string;

  /** Setting to `true` will result in every step of the deployment to be logged to the console */
  verbose?: boolean;

  constructor(options: FirefoxOptionsSubmissionApi) {
    if (!options.extId) {
      throw new Error(getErrorMessage("No extension ID is provided, e.g. https://addons.mozilla.org/addon/EXT_ID"));
    }

    const messageObtain = "Get it from https://addons.mozilla.org/developers/addon/api/key/";
    if (!options.jwtIssuer) {
      throw new Error(getErrorMessage(`No JWT issuer is provided. ${messageObtain}`));
    }

    if (!options.jwtSecret) {
      throw new Error(getErrorMessage(`No JWT secret is provided. ${messageObtain}`));
    }

    // Zip checking
    if (!options.zip) {
      throw new Error(getErrorMessage("No zip is provided"));
    }

    if (!getIsFileExists(options.zip)) {
      throw new Error(getErrorMessage(`Zip doesn't exist: ${getFullPath(options.zip)}`));
    }

    if (options.zipSource && !getIsFileExists(options.zipSource)) {
      throw new Error(getErrorMessage(`Zip source doesn't exist: ${getFullPath(options.zipSource)}`));
    }
  }
}

function getErrorMessage(message: string): string {
  return chalk.red(`Firefox: ${message}`);
}

export async function prepareToDeployFirefox(options: FirefoxOptionsSubmissionApi): Promise<boolean> {
  options.zip = getCorrectZip(options.zip);
  if (options.zipSource) {
    options.zipSource = getCorrectZip(options.zipSource);
  }

  if (options.changelog) {
    options.changelog = options.changelog.replace(/\/\/n/g, "\n");
  }

  if (options.devChangelog) {
    options.devChangelog = options.devChangelog.replace(/\/\/n/g, "\n");
  }

  // Validate the options
  new FirefoxOptionsSubmissionApi(options);
  return deployToFirefox(options);
}
