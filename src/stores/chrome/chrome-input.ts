import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils";
import { deployToChrome } from "./chrome-deploy";

export class ChromeOptions {
  /** The extension ID. E.g. `https://chrome.google.com/webstore/detail/EXT_ID` */
  extId: string;

  /** The refresh token. */
  refreshToken: string;

  /** The client ID. */
  clientId: string;

  /** The client secret. */
  clientSecret: string;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`).<br>
   * You can use `{version}` to pull the current version of the `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /** If enabled, all the actions taken for each store will be logged to the console. */
  verbose: false

  constructor(options) {
    if (!options.extId) {
      throw new Error(
        getErrorMessage(
          "No extension ID is provided, e.g. https://chrome.google.com/webstore/detail/EXT_ID"
        )
      );
    }

    // Zip checking
    if (!options.zip) {
      throw new Error(getErrorMessage("No zip is provided"));
    }

    if (!getIsFileExists(options.zip)) {
      throw new Error(
        getErrorMessage(`Zip doesn't exist: ${getFullPath(options.zip)}`)
      );
    }
  }
}

function getErrorMessage(message: string): string {
  return `Opera: ${message}`;
}

export async function prepareToDeployChrome(
  options: ChromeOptions
): Promise<boolean> {
  options.zip = getCorrectZip(options.zip);

  // Validate the options
  // @ts-ignore
  new ChromeOptions(options);

  return new Promise((resolve, reject) =>
    deployToChrome(options).then(resolve).catch(reject)
  );
}
