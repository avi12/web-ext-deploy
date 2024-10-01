import { deployToEdgePublishApi } from "./edge-deploy.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";

export class EdgeOptionsPublishApi {
  /** Get it from `https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID`<br>
 * E.g. `https://microsoftedge.microsoft.com/addons/detail/ggnepcoiimddpmjaoejhdfppjbcnfaom` */
  productId: string;

  /**
   * The client ID<br>
   * To obtain it, follow [this guide](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md)
   */
  clientId: string;

  /**
   * The API key<br>
   * To obtain it, follow [this guide](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md)
   */
  apiKey: string;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`)<br>
   * You can use `{version}`, which will be replaced by the `version` entry from your `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /**
   * A description of the technical changes made in this version, compared to the previous one<br>
   * This will only be seen by the Edge Extensions reviewers<br>
   * It's recommended to use instead `--edge-dev-changelog`, so it stays up to date
   */
  devChangelog?: string;

  /** Setting to `true` will result in every step of the deployment to be logged to the console */
  verbose?: boolean;

  constructor(options: EdgeOptionsPublishApi) {
    if (!options.productId) {
      throw new Error(
        getErrorMessage(
          "No product ID is provided, e.g. https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID"
        )
      );
    }

    const messageObtain = "To obtain one, follow https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md";

    if (!options.clientId) {
      throw new Error(getErrorMessage(`No client ID is provided. ${messageObtain}`));
    }

    if (!options.apiKey) {
      throw new Error(getErrorMessage(`No API key is provided. ${messageObtain}`));
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
  return `Edge: ${message}`;
}

export async function prepareToDeployEdgePublishApi(options: EdgeOptionsPublishApi): Promise<boolean> {
  options.zip = getCorrectZip(options.zip);

  if (options.devChangelog) {
    options.devChangelog = options.devChangelog.replace(/\/\n/g, "\n");
  }

  // Validate the options
  new EdgeOptionsPublishApi(options);
  return deployToEdgePublishApi(options);
}
