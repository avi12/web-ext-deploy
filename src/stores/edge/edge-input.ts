import { z } from "zod";
import { deployToEdgePublishApi } from "./edge-deploy.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";

const messageObtain = "To obtain one, follow https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md";

const EdgeOptionsPublishApiSchema = z.object({
  clientId: z.string({
    required_error: getErrorMessage(`No client ID is provided. ${messageObtain}`)
  }),
  clientSecret: z.string({
    required_error: getErrorMessage(`No client secret is provided. ${messageObtain}`)
  }),
  accessTokenUrl: z.string({
    required_error: getErrorMessage(`No access token URL is provided. ${messageObtain}`)
  }),
  accessToken: z.string({
    required_error: getErrorMessage(`No access token is provided. ${messageObtain}`)
  }),
  productId: z.string({
    required_error: getErrorMessage(
      "No product ID is provided, e.g. https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID"
    )
  }),
  zip: z
    .string({
      required_error: getErrorMessage("No zip is provided")
    })
    .transform(getCorrectZip)
    .superRefine((val, ctx) => {
      if (!getIsFileExists(val)) {
        ctx.addIssue({
          message: getErrorMessage(`Zip doesn't exist: ${getFullPath(val)}`),
          code: z.ZodIssueCode.custom
        });
      }
    }),
  devChangelog: z
    .string()
    .transform(cl => cl.replace(/\/\n/g, "\n"))
    .optional(),
  verbose: z.boolean().optional()
});

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
    Object.assign(this, EdgeOptionsPublishApiSchema.parse(options));
  }
}

function getErrorMessage(message: string): string {
  return `Edge: ${message}`;
}

export async function prepareToDeployEdgePublishApi(options: EdgeOptionsPublishApi): Promise<boolean> {
  return deployToEdgePublishApi(new EdgeOptionsPublishApi(options));
}
