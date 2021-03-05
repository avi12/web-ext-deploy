import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils";
import { deployToEdge } from "./edge-deploy";

export class EdgeOptions {
  /** The cookie required to login to the publisher's account, called: `.AspNet.Cookies`<br>
   * If you have a hard time obtaining it, run: `--get-cookies=edge` */
  cookie: string;

  /** The extension ID. E.g. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID` */
  extId: string;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`).<br>
   * You can use `{version}`, which will be replaced by the `version` entry from your `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /**
   * A description of the technical changes made in this version, compared to the previous one.<br>
   * This will only be seen by the Firefox Addons reviewers.<br>
   * It's recommended to use instead `--edge-dev-changelog` , so it stays up to date.
   */
  devChangelog?: string;

  /** If enabled, all the actions taken for each store will be logged to the console. */
  verbose?: boolean;

  constructor(options) {
    if (!options.extId) {
      throw new Error(getErrorMessage("No extension ID is provided, e.g. https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID"));
    }

    if (!options.cookie) {
      throw new Error(getErrorMessage(`No cookie is provided. The cookie's name is ".AspNet.Cookies". If you have a hard time obtaining it, run:
web-ext-deploy --get-cookies=edge`))
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
  return `Edge: ${message}`;
}

export async function prepareToDeployEdge(
  options: EdgeOptions
) {
  options.zip = getCorrectZip(options.zip);

  if (options.devChangelog) {
    options.devChangelog = options.devChangelog.split("\\\n").join("\n");
  }

  // Validate the options
  new EdgeOptions(options);
  return deployToEdge(options);
}

