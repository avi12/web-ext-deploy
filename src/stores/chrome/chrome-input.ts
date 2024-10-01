import { deployToChrome } from "./chrome-deploy.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";

export class ChromeOptions {
  /** Get it from `https://chrome.google.com/webstore/detail/EXT_ID`<br>
   * E.g. `https://chrome.google.com/webstore/detail/fcphghnknhkimeagdglkljinmpbagone` */
  extId: string;

  /** The client ID<br>
   * To obtain it, follow [this guide](https://github.com/fregante/chrome-webstore-upload-keys) */
  clientId: string;

  /** The client secret<br>
   * To obtain it, follow [this guide](https://github.com/fregante/chrome-webstore-upload-keys) */
  clientSecret: string;

  /** The refresh token<br>
   * To obtain it, follow [this guide](https://github.com/fregante/chrome-webstore-upload-keys) */
  refreshToken: string;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`)<br>
   * You can use `{version}`, which will be replaced by the `version` entry from your `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /** Setting to `true` will result in every step of the deployment to be logged to the console */
  verbose?: boolean;

  constructor(options: ChromeOptions) {
    if (!options.extId) {
      throw new Error(
        getErrorMessage("No extension ID is provided, e.g. https://chrome.google.com/webstore/detail/EXT_ID")
      );
    }

    if (!options.refreshToken) {
      throw new Error(
        getErrorMessage(
          "No refresh token is provided. To get one: https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md"
        )
      );
    }

    if (!options.clientId) {
      throw new Error(
        getErrorMessage(
          "No client ID is provided. To get one: https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md"
        )
      );
    }

    if (!options.clientSecret) {
      throw new Error(
        getErrorMessage(
          "No client secret is provided. To get one: https://github.com/DrewML/chrome-webstore-upload/blob/master/How%20to%20generate%20Google%20API%20keys.md"
        )
      );
    }

    // Zip checking
    if (!options.zip) {
      throw new Error(getErrorMessage("No zip is provided"));
    }

    if (!getIsFileExists(options.zip)) {
      throw new Error(getErrorMessage(`Zip doesn't exist: ${getFullPath(options.zip)}`));
    }
  }
}

function getErrorMessage(message: string): string {
  return `Chrome: ${message}`;
}

export async function prepareToDeployChrome(options: ChromeOptions): Promise<boolean> {
  options.zip = getCorrectZip(options.zip);

  // Validate the options
  new ChromeOptions(options);
  return deployToChrome(options);
}
