import { getCorrectZip, getFullPath, getIsFileExists } from "../../../utils";
import { deployToEdgePublishApi } from "./edge-deploy";

export class EdgeOptionsPublishApi {
  /**
   * The client ID.<br>
   * To obtain it, follow [these steps](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md).
   */
  clientId: string;

  /**
   * The client secret.<br>
   * To obtain it, follow [these steps](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md).
   */
  clientSecret: string;

  /**
   * The access token URL.<br>
   * To obtain it, follow [these steps](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md).
   */
  accessTokenUrl: string;

  /**
   * The access token.<br>
   * To obtain it, follow [these steps](https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md).
   */
  accessToken: string;

  /** The extension ID. E.g. `https://partner.microsoft.com/en-us/dashboard/microsoftedge/EXT_ID` */
  productId: string;

  /**
   * The path to the ZIP, relative from the current working directory (`process.cwd()`)<br>
   * You can use `{version}`, which will be replaced by the `version` entry from your `package.json`, e.g. `some-zip-v{version}.zip`
   */
  zip: string;

  /**
   * A description of the technical changes made in this version, compared to the previous one.<br>
   * This will only be seen by the Edge Extensions reviewers.<br>
   * It's recommended to use instead `--edge-dev-changelog` , so it stays up to date.
   */
  devChangelog?: string;

  /** If `true`, every step of uploading to the Edge Add-ons will be logged to the console. */
  verbose?: boolean;

  constructor(options: EdgeOptionsPublishApi) {
    if (!options.productId) {
      throw new Error(
        getErrorMessage(
          "No product ID is provided, e.g. https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID"
        )
      );
    }

    const messageObtain =
      "To obtain one, follow https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md";

    if (!options.clientId) {
      throw new Error(
        getErrorMessage(`No client ID is provided. ${messageObtain}`)
      );
    }

    if (!options.clientSecret) {
      throw new Error(
        getErrorMessage(`No client secret is provided. ${messageObtain}`)
      );
    }

    if (!options.accessTokenUrl) {
      throw new Error(
        getErrorMessage(`No access token URL is provided. ${messageObtain}`)
      );
    }

    if (!options.accessToken) {
      throw new Error(
        getErrorMessage(`No access token is provided. ${messageObtain}`)
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
  return `Edge: ${message}`;
}

export async function prepareToDeployEdgePublishApi(
  options: EdgeOptionsPublishApi
): Promise<boolean> {
  options.zip = getCorrectZip(options.zip);

  if (options.devChangelog) {
    options.devChangelog = options.devChangelog.replace(/\/\n/g, "\n");
  }

  // Validate the options
  new EdgeOptionsPublishApi(options);
  return deployToEdgePublishApi(options);
}
