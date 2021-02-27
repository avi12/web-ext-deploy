import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils";
import { deployToEdge } from "./edge-deploy";

export class EdgeOptions {
  /** The publisher account's email address. */
  email: string;

  /** The publisher account's password. */
  password?: string;

  /** The extension ID. E.g. `https://addons.mozilla.org/en-US/developers/EXT_ID` */
  extId: string;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`).<br>
   * You can use `{version}` to pull the current version of the `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /**
   * A description of the technical changes made in this version, compared to the previous one.<br>
   * This will only be seen by the Firefox Addons reviewers.<br>
   * It's recommended to use instead `--firefox-dev-changelog` , so it's dynamic.
   */
  devChangelog?: string;

  /** If enabled, all the actions taken for each store will be logged to the console. */
  verbose?: boolean;

  constructor(options) {
    if (!options.extId) {
      throw new Error(getErrorMessage("No extension ID is provided, e.g. https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID"));
    }

    if (!options.email) {
      throw new Error(getErrorMessage("No email is provided"));
    }

    if (options.password && options.password === "") {
      throw new Error(getErrorMessage("If your account requires a password, provide it properly"));
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
  return `Firefox: ${message}`;
}

export async function prepareToDeployEdge(
  options: EdgeOptions
) {
  options.zip = getCorrectZip(options.zip);

  if (options.devChangelog) {
    options.devChangelog = options.devChangelog.split("\\\n").join("\n");
  }

  // Validate the options
  // @ts-ignore
  new EdgeOptions(options);
  return deployToEdge(options);
}

