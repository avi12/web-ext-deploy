import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils";
import deployToOpera from "./opera-deploy";

export class OperaOptions {
  /** The publisher account's email address. */
  email: string;

  /** The publisher account's password. */
  password: string;

  /** The two-factor code of the publisher account, if applicable. */
  twoFactor?: number;

  /** The reCaptcha service to attempt to bypass the login screen. */
  reCaptchaSolver: "2captcha";

  /**
   * The reCaptcha API key to attempt to bypass the login screen.<br>
   * [Get your 2Captcha API key here](https://2captcha.com?from=11267395)
   */
  reCaptchaApiKey: string;

  /** The extension ID. E.g. `https://addons.opera.com/en/extensions/details/EXT_ID` */
  packageId: number;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`).<br>
   * You can use `{version}` to pull the current version of the `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /**
   * A description of the changes in this version, compared to the previous one.<br>
   * It's recommended to use instead `--opera-changelog` , so it's dynamic.
   */
  changelog?: string;

  /** If enabled, all the actions taken for each store will be logged to the console. */
  verbose?: boolean;

  constructor(options) {
    if (!options.packageId) {
      throw new Error(
        getErrorMessage(
          "No package ID is provided, e.g. https://addons.opera.com/developer/package/PACKAGE_ID"
        )
      );
    }

    if (!options.email) {
      throw new Error(getErrorMessage("No email is provided"));
    }

    if (!options.password) {
      throw new Error(getErrorMessage("No password is provided"));
    }

    // reCaptcha verification
    if (!options.reCaptchaSolver) {
      throw new Error(getErrorMessage("No reCaptcha solver is provided"));
    }

    const reCaptchaServices = ["2captcha"];
    if (!reCaptchaServices.includes(options.reCaptchaSolver)) {
      throw new Error(getErrorMessage("Unsupported reCaptcha solver"));
    }

    if (!options.reCaptchaApiKey) {
      throw new Error(
        getErrorMessage(`No API key provided for ${options.reCaptchaSolver}`)
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

export async function prepareToDeployOpera(
  options: OperaOptions
): Promise<boolean> {
  options.zip = getCorrectZip(options.zip);

  if (options.changelog) {
    options.changelog = options.changelog.split("\\\n").join("\n");
  }

  // Validate the options
  new OperaOptions(options);
  return deployToOpera(options);
}
